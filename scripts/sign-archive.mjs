// Ad-hoc signs an archive built with CODE_SIGNING_ALLOWED=NO, giving the app and every
// extension its entitlements, so `xcodebuild -exportArchive` can re-sign it for the App Store
// with cloud-managed certificates. Same approach as mc-chat-app/wishblock's TestFlight job,
// extended to the widget and share extensions.
// Usage: node sign-archive.mjs <archive> <build-settings.json> <team id>
//   build-settings.json: `xcodebuild -showBuildSettings -json` output for the scheme.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

const [archive, settingsPath, teamId] = process.argv.slice(2);
if (!archive || !settingsPath || !teamId) {
  console.error("usage: node sign-archive.mjs <archive> <build-settings.json> <team id>");
  process.exit(2);
}

const sign = (path, entitlements) => {
  const args = ["--force", "--sign", "-", "--timestamp=none"];
  if (entitlements) args.push("--entitlements", entitlements);
  execFileSync("codesign", [...args, path], { stdio: "inherit" });
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(path);
      walk(path, out);
    }
  }
  return out;
}

const [app] = readdirSync(join(archive, "Products/Applications")).filter((n) => n.endsWith(".app"));
if (!app) throw new Error(`No .app in ${archive}/Products/Applications`);
const appPath = join(archive, "Products/Applications", app);
const bundles = walk(appPath);

const tmp = mkdtempSync(join(tmpdir(), "entitlements-"));
const signed = new Map();
for (const { target, buildSettings: s } of JSON.parse(readFileSync(settingsPath, "utf8"))) {
  if (!["app", "appex"].includes(s.WRAPPER_EXTENSION) || !s.CODE_SIGN_ENTITLEMENTS) continue;
  const product = s.FULL_PRODUCT_NAME;
  const path = product === app ? appPath : bundles.find((b) => basename(b) === product);
  if (!path) {
    console.log(`${target}: ${product} is not in the archive; skipping.`);
    continue;
  }
  const file = isAbsolute(s.CODE_SIGN_ENTITLEMENTS) ? s.CODE_SIGN_ENTITLEMENTS : join(s.PROJECT_DIR, s.CODE_SIGN_ENTITLEMENTS);
  const vars = { ...s, AppIdentifierPrefix: `${teamId}.`, TeamIdentifierPrefix: `${teamId}.` };
  const expanded = readFileSync(file, "utf8").replace(/\$[({](\w+)(?::\w+)?[)}]/g, (m, name) => {
    if (vars[name] === undefined) throw new Error(`${file}: unknown build setting ${m}`);
    return vars[name];
  });
  const out = join(tmp, `${target}.entitlements`);
  writeFileSync(out, expanded);
  signed.set(path, out);
  console.log(`${target}: ${product} gets ${s.CODE_SIGN_ENTITLEMENTS}`);
}
if (!signed.has(appPath)) throw new Error(`No entitlements found for ${app}`);

// Inside out: nested frameworks and dylibs, then extensions, then the app itself.
for (const fw of bundles.filter((b) => b.endsWith(".framework")).reverse()) sign(fw);
for (const dir of [appPath, ...bundles.filter((b) => b.endsWith(".appex"))]) {
  for (const sub of ["Frameworks"]) {
    try {
      for (const n of readdirSync(join(dir, sub)).filter((n) => n.endsWith(".dylib"))) sign(join(dir, sub, n));
    } catch {}
  }
}
for (const appex of bundles.filter((b) => b.endsWith(".appex"))) {
  if (!signed.has(appex)) console.log(`::warning::${basename(appex)} has no entitlements; signing it bare.`);
  sign(appex, signed.get(appex));
}
sign(appPath, signed.get(appPath));

for (const [path] of signed) {
  console.log(`--- ${basename(path)}`);
  execFileSync("codesign", ["-d", "--entitlements", "-", "--xml", path], { stdio: ["ignore", "inherit", "inherit"] });
  console.log();
}
