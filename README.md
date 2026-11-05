# t3code-focus-testflight

Builds the [T3 Code](https://github.com/pingdotgg/t3code) iOS app from the
[`focus-mode`](https://github.com/u9g/t3code/tree/focus-mode) branch of
[u9g/t3code](https://github.com/u9g/t3code) and uploads it to TestFlight whenever that branch
gets new commits. This repo is not affiliated with T3 Tools.

## How it works

[`testflight.yml`](.github/workflows/testflight.yml) runs every 30 minutes:

1. **check** (Ubuntu) reads the head of `focus-mode`. If a release tagged `focus-<sha>` already
   exists here, that commit is on TestFlight and the run stops.
2. **ios** (GitHub's free macOS runner for public repos) checks out that commit and:
   - registers the bundle IDs `com.u9g.t3code`, `.widgets` and `.sharing` if they're missing, and
     checks that an App Store Connect app exists ([`scripts/asc.mjs`](scripts/asc.mjs));
   - re-targets the production app from T3's team and bundle ID to team `M39T7MP49D` and
     `com.u9g.t3code`, with build number `<run>.<attempt>`
     ([`scripts/patch-app-config.mjs`](scripts/patch-app-config.mjs)). The widget and share
     extensions, the App Group (`group.com.u9g.t3code`), push and Sign in with Apple all follow
     the new bundle ID;
   - runs `expo prebuild`, archives unsigned, ad-hoc signs the app and each extension with its
     entitlements ([`scripts/sign-archive.mjs`](scripts/sign-archive.mjs)), then exports with
     automatic signing and uploads. This is the same flow as
     `mc-chat-app/wishblock`'s TestFlight job;
   - creates a release `focus-<sha>` linking the commit it built.

Expo OTA updates are turned off (`T3CODE_MOBILE_UPDATES_ENABLED=0`), because upstream's update
channel serves T3's own JS bundles.

Run it by hand from **Actions → testflight → Run workflow**. Tick *force* to rebuild a commit
that's already uploaded.

## Setup

1. Add the App Store Connect API key secrets (the same values as `mc-chat-app/wishblock`). The key
   needs the Admin role so Xcode can register capabilities and use cloud-managed signing:

   ```sh
   gh secret set APP_STORE_CONNECT_KEY_ID     -R u9g/t3code-focus-testflight
   gh secret set APP_STORE_CONNECT_ISSUER_ID  -R u9g/t3code-focus-testflight
   gh secret set APP_STORE_CONNECT_API_KEY    -R u9g/t3code-focus-testflight < AuthKey_XXXXXXXXXX.p8
   ```

2. Run the workflow once. It registers `com.u9g.t3code` and then stops with an error, because
   Apple's API can't create App Store Connect apps.
3. In [App Store Connect](https://appstoreconnect.apple.com/apps), choose **+ → New App** (iOS, any
   free name such as "T3 Code", bundle ID `com.u9g.t3code`, any SKU), then run the workflow again.

## Caveats

- Sign-in through T3's Clerk instance (`clerk.t3.codes`) and its universal links are tied to T3's
  bundle IDs, so expect those to fail. Pairing with your own environments doesn't depend on them.
- GitHub disables scheduled workflows in a public repo after 60 days without commits. Re-enable
  it from the Actions tab, or push any commit.
- If upstream rewrites the lines of `apps/mobile/app.config.ts` that the patch script matches,
  the build stops at "Point the app at your team" with a message saying which line moved.
