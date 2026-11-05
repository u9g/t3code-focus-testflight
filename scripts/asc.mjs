// App Store Connect preflight.
// Usage: node asc.mjs <bundle id> [extension bundle id …]
// Env: KEY_PATH, KEY_ID, ISSUER_ID.
// Registers any missing bundle IDs, then checks that an App Store Connect app exists for the
// first one. Apple's API cannot create that app record, so the first run stops here with
// instructions instead of failing at upload after a 40-minute build.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const [appBundleId, ...extensionBundleIds] = process.argv.slice(2);
const { KEY_PATH, KEY_ID, ISSUER_ID, GITHUB_OUTPUT } = process.env;

function token() {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" })}.${b64({ iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" })}`;
  const signature = createSign("SHA256")
    .update(unsigned)
    .sign({ key: readFileSync(KEY_PATH), dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return `${unsigned}.${signature}`;
}

const auth = `Bearer ${token()}`;
async function asc(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { authorization: auth, "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
  return json;
}

for (const identifier of [appBundleId, ...extensionBundleIds]) {
  const found = await asc("GET", `/v1/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}&filter[platform]=IOS`);
  // filter[identifier] is a prefix match.
  if (found.data.some((b) => b.attributes.identifier === identifier)) {
    console.log(`Bundle ID ${identifier} is registered.`);
    continue;
  }
  await asc("POST", "/v1/bundleIds", {
    data: {
      type: "bundleIds",
      attributes: { identifier, name: `T3 Code ${identifier.replaceAll(".", " ")}`, platform: "IOS" },
    },
  });
  console.log(`Registered bundle ID ${identifier}.`);
}

const apps = await asc("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(appBundleId)}`);
const app = apps.data.find((a) => a.attributes.bundleId === appBundleId);
if (!app) {
  console.log(
    `::error::No App Store Connect app uses ${appBundleId} yet. Create it once at https://appstoreconnect.apple.com/apps ` +
      `(+ → New App, platform iOS, name "T3 Code" or any free name, bundle ID ${appBundleId}, any SKU), then re-run this workflow.`,
  );
  process.exit(1);
}
console.log(`App Store Connect app: ${app.attributes.name} (${app.id}).`);
if (GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(GITHUB_OUTPUT, `app_id=${app.id}\n`);
}
