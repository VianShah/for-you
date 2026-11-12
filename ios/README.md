# Us ♥ — the iPhone app

The diary as an iPhone app, plus home-screen and lock-screen widgets. Built with
[xtool](https://github.com/xtool-org/xtool), so no Mac is needed: it builds on Linux or
Windows (WSL) and installs straight onto a plugged-in iPhone with a free Apple ID.

## What's in it

- **The app** (`Sources/OurDiary/`): our diary (`https://vianshah.github.io/for-you/diary/`)
  full screen, no browser bars. It remembers the secret word and whose phone it is, uses the
  camera and microphone, opens FaceTime for calls, turns downloads into the share sheet,
  shows the diary's confirm/prompt boxes, pull down to refresh, swipe back to close popups.
- **Its own notifications, with reply** (`Notifications.swift`): while the app is closed, iOS
  wakes it now and then (usually every 15 minutes to an hour, more often the more it's used)
  to look at the diary. New pages, replies, dares, flowers, gifts and surprises from the other
  one become notifications that show what was written. **Reply** and **❤️** work right from the
  lock screen (Face ID first); tapping opens that page. Also: "⏳ −50 in 30 minutes", and
  "😢 Goldiee is crying". The ntfy app stays as the instant backup.
- **Face ID** (`DiaryViewController.swift`): the diary opens with Face ID (or the passcode), and
  again after 5 minutes away. It's also hidden in the app switcher.
- **Long-press the app icon**: ✍️ Write a page, 📸 Camera, 📹 FaceTime, 🔔 Ping.
- **Widgets** (`Sources/OurDiaryWidget/`):
  - **Goldies** — small, medium and lock screen: both scores, days together, a live
    countdown to your next −50, today's call time. The medium one has 🔔 ping, ❤️ and ✍️
    buttons (each opens the app for a moment and does it there).
  - **Latest from them** — small and lock screen: what the other one last did, and when.
  - **A picture of us** — small, medium, large: one of the diary's pictures, decrypted on the
    phone, a new one every 3 hours. Tap it to open that page.
- **DiaryKit** (`Sources/DiaryKit/`): what the app and widgets share: reading the diary from
  GitHub, opening it with the key, writing a reply or ❤️ back (with the GitHub key kept inside
  the diary's vault), telling the other one (through the diary's notify workflow, or ntfy),
  and the goldies, worked out by the diary's own `goldies.js` so they always agree.

The app gives the widgets and notifications the diary key the first time you type the secret
word in it; the key stays on that iPhone (App Group storage).

### Siri and the Shortcuts app

The app answers these links, so a Shortcut can do anything the long-press menu does:

| Link | Does |
|---|---|
| `ourdiary://ping` | 🔔 ping the other one to come and check |
| `ourdiary://heart` | ❤️ "thinking of you" |
| `ourdiary://new` | ✍️ write a page |
| `ourdiary://camera` | 📸 the camera |
| `ourdiary://call` | 📹 FaceTime them |

To use one with Siri: **Shortcuts** app → **+** → **Add Action** → **Open URLs** → type the link
→ name the shortcut (e.g. "Ping Jovena"). Then say "Hey Siri, Ping Jovena". The same shortcut
can go on the Action button, in Control Center, or in an automation (e.g. "when I get home").

(Siri phrases built into the app, without making a Shortcut, need Xcode's App Intents build
step, which xtool doesn't do yet.)

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
3. Open **Us ♥**, type the secret word, pick whose phone it is, and **Allow** notifications
   when it asks. (Settings → General → Background App Refresh must be on for Us ♥.)
4. Widgets: hold the home screen → **+** (or **Edit → Add Widget**) → **Us ♥**. For the lock
   screen: hold the lock screen → **Customize** → **Lock Screen** → add a widget.

Do the same with the other iPhone plugged in.

## Free Apple ID limits

- An install lasts **7 days**: run `xtool dev` again to renew it (nothing in the diary is lost).
- Up to 3 of your own apps on a phone at once, and 10 new app IDs a week (the app and the
  widget use one each, plus one App Group).
- No instant (push) notifications: the app's own notifications come when iOS lets it check,
  which is usually within the hour, and the ntfy app stays as the instant backup. A paid
  account would make them instant.

## Settings worth knowing

- `xtool.yml`: bundle ID `com.vianshah.ourdiary`, the widget extension, icon, plists, entitlements.
- `Support/*.entitlements`: the App Group `group.com.vianshah.ourdiary` the app and widgets share.
  If Apple says that group name is taken, change it in both files and in
  `DiaryKit.appGroup` (Sources/DiaryKit/DiaryKit.swift).
- `Resources/AppIcon.png`: the app icon (1024×1024, no transparency).
