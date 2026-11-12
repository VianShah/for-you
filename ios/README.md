# Us ♥ — the iPhone app

The diary as an iPhone app, plus home-screen and lock-screen widgets. Built with
[xtool](https://github.com/xtool-org/xtool), so no Mac is needed: it builds on Linux or
Windows (WSL) and installs straight onto a plugged-in iPhone with a free Apple ID.

## What's in it

- **The app** (`Sources/OurDiary/`): our diary (`https://vianshah.github.io/for-you/diary/`)
  full screen, no browser bars. It remembers the secret word and whose phone it is, uses the
  camera and microphone, opens FaceTime for calls, turns downloads into the share sheet,
  shows the diary's confirm/prompt boxes, pull down to refresh, swipe back to close popups.
- **Widgets** (`Sources/OurDiaryWidget/`):
  - **Goldies** — small, medium and lock screen: both scores, days together, a live
    countdown to your next −50, today's call time.
  - **Latest from them** — small and lock screen: what the other one last did, and when.

  The widgets read the encrypted diary from GitHub themselves and use the diary's own
  `goldies.js` rules, so they always agree with it. They refresh about every 15 minutes
  (iOS decides the exact moment). The app gives them the key the first time you type the
  secret word in it; the key stays on that iPhone (App Group storage).

Notifications still come from the ntfy app: the app's own notifications need a paid
Apple developer account.

## Build and install

You need, on the computer the iPhone plugs into (see xtool's
[Linux guide](https://xtool.sh/documentation/xtooldocs/installation-linux)):

1. **Swift 6.4** for Linux, **usbmuxd**, and **xtool** itself (the `xtool.AppImage` release,
   or build the cloned repo with `swift build -c release` and put `.build/release/xtool` on your `PATH`).
2. **Xcode 27.1** (`Xcode.xip`) downloaded from <https://developer.apple.com/download/all/?q=Xcode>
   with your Apple ID. xtool turns it into the iOS SDK.
3. Run `xtool setup` once: sign in with your (free) Apple ID and give it the path to `Xcode.xip`.

Then, with the iPhone plugged in and unlocked:

```bash
cd ios
xtool devices     # the iPhone should be listed; tap "Trust" on the phone if it asks
xtool dev         # builds the app and the widgets, signs them and installs them
```

The first time, on the iPhone:

1. **Settings → Privacy & Security → Developer Mode → On** (the phone restarts).
2. **Settings → General → VPN & Device Management** → your Apple ID → **Trust**.
3. Open **Us ♥**, type the secret word, pick whose phone it is.
4. Widgets: hold the home screen → **+** (or **Edit → Add Widget**) → **Us ♥**. For the lock
   screen: hold the lock screen → **Customize** → **Lock Screen** → add a widget.

Do the same with the other iPhone plugged in.

## Free Apple ID limits

- An install lasts **7 days**: run `xtool dev` again to renew it (nothing in the diary is lost).
- Up to 3 of your own apps on a phone at once, and 10 new app IDs a week (the app and the
  widget use one each, plus one App Group).
- No native push notifications (see above).

## Settings worth knowing

- `xtool.yml`: bundle ID `com.vianshah.ourdiary`, the widget extension, icon, plists, entitlements.
- `Support/*.entitlements`: the App Group `group.com.vianshah.ourdiary` the app and widgets share.
  If Apple says that group name is taken, change it in both files and in
  `Diary.appGroup` / `DiaryData.appGroup`.
- `Resources/AppIcon.png`: the app icon (1024×1024, no transparency).
