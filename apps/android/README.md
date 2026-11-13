# DoStotinka for Android

A small native app that shows **your own** DoStotinka server full-screen (no browser bars) and can
forward the payment notifications of your banking apps, Google Wallet or SMS to it – the
[automatic import](../../docs/USER_GUIDE.md#automatic-import) without any extra automation app.

- On the first start the app asks for the address of your server (`http://192.168.1.10:8742`,
  `https://money.example.com`, a Tailscale address …). Plain `http://` works.
- Everything else – logging in, choosing which apps to forward, notification access – happens in
  **Settings → Automatic import** inside the app.
- Only the notifications of the apps you choose are sent, and only to your server. Of all other
  notifications the app keeps nothing but the app's name (so you can pick it from a list).
- Notifications that cannot be sent right away (offline, server down) are retried automatically.

## How it works

| Part | File |
| --- | --- |
| WebView with the server, file uploads, downloads with the login cookie, external links in the browser | `MainActivity.kt` |
| `window.DoStotinkaApp` – status, connect/disconnect, chosen apps, opening Android settings | `AppBridge.kt` |
| Reads notifications (after the user granted notification access) | `NotificationService.kt` |
| Posts them to `POST /api/ingest/notification` with the phone token, with retries | `SendWorker.kt` |

The web app creates a notification source (“phone”) for the device and hands its token to the app
through the bridge. The bridge only answers pages of the configured server; the WebView never shows
other sites.

## Building

Requirements: JDK 17 or newer and the Android SDK (platform 35, build tools 35.0.0).

```bash
cd apps/android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew lintDebug            # Android lint (warnings are errors)
```

Without a local SDK, the `ghcr.io/cirruslabs/android-sdk:35` image works:

```bash
docker run --rm -v "$PWD":/project -w /project ghcr.io/cirruslabs/android-sdk:35 ./gradlew assembleDebug
```

## Release builds and signing

Android installs updates only when they are signed with the same key as the installed app. Release
builds are signed with a key that is **not** part of the repository:

- locally: create `apps/android/keystore.properties` (git-ignored) with `storeFile`,
  `storePassword`, `keyAlias` and `keyPassword`, then `./gradlew assembleRelease`;
- on GitHub: add the repository secrets `ANDROID_KEYSTORE_BASE64` (the keystore file, base64),
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. The *Android app*
  workflow then attaches `dostotinka-<version>.apk` to every release.

## Notification access on Android 13+

Apps installed from a downloaded APK may need one extra step before they can get notification
access: **App info → ⋮ → Allow restricted settings**. The app links there when needed.
