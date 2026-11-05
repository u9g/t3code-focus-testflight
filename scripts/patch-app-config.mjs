// Re-targets T3 Code's production iOS app at your Apple team and bundle ID.
// Usage: node patch-app-config.mjs <path to apps/mobile/app.config.ts>
// Env: BUNDLE_ID, TEAM_ID, BUILD_NUMBER.
// Every replacement must match exactly once, so an upstream refactor fails here
// instead of quietly building an app signed as T3's.
import { readFileSync, writeFileSync } from "node:fs";

const [path] = process.argv.slice(2);
const { BUNDLE_ID, TEAM_ID, BUILD_NUMBER } = process.env;
if (!path || !BUNDLE_ID || !TEAM_ID || !BUILD_NUMBER) {
  console.error("usage: BUNDLE_ID=… TEAM_ID=… BUILD_NUMBER=… node patch-app-config.mjs <app.config.ts>");
  process.exit(2);
}

let source = readFileSync(path, "utf8");

const replacements = [
  // The production variant's bundle ID. Extensions, the App Group and the
  // keychain group are all derived from it.
  [`iosBundleIdentifier: "com.t3tools.t3code",`, `iosBundleIdentifier: ${JSON.stringify(BUNDLE_ID)},`],
  [`appleTeamId: "ARK85ZXQ4Z",`, `appleTeamId: ${JSON.stringify(TEAM_ID)},`],
  // EAS normally supplies the build number; TestFlight needs a new one per upload.
  [
    `bundleIdentifier: iosBundleIdentifier,`,
    `bundleIdentifier: iosBundleIdentifier,\n    buildNumber: ${JSON.stringify(BUILD_NUMBER)},`,
  ],
];

for (const [from, to] of replacements) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    console.error(`::error::Expected exactly one \`${from}\` in ${path}, found ${count}. Upstream changed app.config.ts; update scripts/patch-app-config.mjs.`);
    process.exit(1);
  }
  source = source.replace(from, to);
}

writeFileSync(path, source);
console.log(`Patched ${path}: bundle ${BUNDLE_ID}, team ${TEAM_ID}, build ${BUILD_NUMBER}.`);
