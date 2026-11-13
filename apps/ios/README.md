# DoStotinka for iPhone

The iPhone app shows your own DoStotinka server full-screen – like the [Android app](../android/README.md):

- **Your server, no browser bars.** On the first start it asks for the address of your server
  (plain `http://` works: home network, Tailscale, VPN).
- **Offline entry.** The app keeps a copy of the web app. Away from home (server not reachable) it
  still opens, records can be added and are sent when the server is back.
- **Card payments by themselves.** iOS does not let apps read the notifications of other apps.
  Instead the app adds the Shortcuts action **“Add payment to DoStotinka”**. The Wallet
  **Transaction** automation of the Shortcuts app (iOS 17 and newer) runs it after every Apple Pay
  payment, with amount, merchant and card – the payment lands in the inbox. Payments that cannot
  be sent wait on the iPhone.
- Downloads (CSV export, backups) open the share sheet; bank pages open in Safari.

Requires iOS 16 (the Wallet automation needs iOS 17).

## Install

Apple only allows apps on iPhones that are signed. There are three ways:

1. **AltStore or SideStore** (free, with your Apple ID): download `dostotinka-<version>-unsigned.ipa`
   from the [latest release](https://github.com/MrNechev/DoStotinka/releases/latest) and open it in
   [AltStore](https://altstore.io) or [SideStore](https://sidestore.io). They sign it with your Apple
   ID. With a free Apple ID the app has to be refreshed every 7 days (AltStore / SideStore do that
   automatically).
2. **Xcode on a Mac** (free Apple ID or paid developer account): see *Build* below, choose your
   team under *Signing & Capabilities* and run it on your iPhone.
3. **TestFlight / App Store**: needs a paid Apple developer account (99 USD per year). Not offered
   yet.

## Set up

1. Open the app and enter the address of your server, e.g. `http://192.168.1.10:8742`.
2. Log in.
3. For card payments: **Settings → Automatic import**, switch on *Phone notifications* and tap
   **Use this iPhone**. Then in the **Shortcuts** app: *Automation → New automation →
   Transaction*, choose your cards, *Run immediately*, add the action **Add payment to
   DoStotinka** and set *Amount*, *Merchant* and *Card* from the *Shortcut Input*.
4. Each card appears as its own app in *Automatic import* (“Apple Wallet · Revolut” …) – choose the
   account it belongs to.

## Build

The Xcode project is generated from [`project.yml`](project.yml) with
[XcodeGen](https://github.com/yonaskolb/XcodeGen):

```sh
brew install xcodegen
cd apps/ios
xcodegen generate
open DoStotinka.xcodeproj
```

The logic that needs neither UIKit nor WebKit (server address, offline files, payments) is in the
Swift package [`Core`](Core) and is tested on macOS and Linux:

```sh
cd apps/ios/Core
swift test
```

The [iOS workflow](../../.github/workflows/ios.yml) builds the app on every change and attaches the
unsigned `.ipa` to releases.

## How it works

- The web app is loaded from `dostotinka://app/`. A `WKURLSchemeHandler` forwards every request
  to your server with `URLSession` (which keeps the login cookie) and saves the files of the web
  app (never data) in *Application Support*. When the server cannot be reached the saved files are
  used; API calls fail and the web app keeps new records on the device until the server is back.
- `window.DoStotinkaApp` is the same bridge as in the Android app (`getInfo`, `connect`,
  `disconnect`, `changeServer` …) with `platform: "ios"`.
- The Shortcuts action posts to `/api/ingest/notification` with the phone token (kept in the
  keychain).
