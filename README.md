# BlumMods

BlumMods makes your games react to your TikTok LIVE. Gifts, follows, shares, like goals, chat commands and viewers joining can each press keys in your game, send commands to a game mod, show an alert, or play a sound.

## Setup (one time)

1. Unzip the `BlumMods` folder somewhere it can stay, for example `C:\BlumMods`. Don't run it from inside the zip.
2. Open the folder and double-click **BlumMods.exe**.
   - Windows may show "Windows protected your PC". This happens because the app isn't signed. Click **More info**, then **Run anyway**. You only have to do this once.
3. While it's open, right-click the BlumMods icon on your taskbar and choose **Pin to taskbar**.

## Using it

1. **Games**: click **+ Add game** and pick the game's `.exe` file. A Steam shortcut or `.url` file works too. BlumMods tells you whether the game is Unity and how easy it will be to mod.
2. **Triggers**: choose what happens. For example, "Rose → press Space" or "every 500 likes → show an alert." Click **Add example triggers** if you want a starting point.
3. **Gifts**: a grid of every TikTok gift with its picture and coin price. It fills itself from TikTok when the app opens, with no need to go live (**Load from TikTok** refreshes it). Click any gift to make a trigger for it. The list is saved, so it's there next time.
4. **Live & Test**: click the buttons to fake gifts, follows and likes, so you can test everything without going live. Leave "wait 3 seconds" checked, then click into your game.
5. When you go live on TikTok, type your username at the top and click **Go Live**. If you aren't live yet, it keeps checking every 30 seconds.

The game you launch from BlumMods becomes the **active game**, and its triggers switch on. Triggers set to "All games" always run.

## Games that already support TikFinity

Some games have TikTok LIVE support built in and look for TikFinity on your PC. BlumMods can stand in for TikFinity: keep **Settings → Game feed** on, close TikFinity, and press the game's own connect button. The game then gets your gifts, likes, follows, shares and chat straight from BlumMods, including the fake ones from **Live & Test**. SHRED A BILLION works this way (in the game: CONNECT, then set up its GIFT TABLE).

## Mods

On a Unity game's card, **Set up mods** installs the BepInEx mod loader into that game's folder (about 40 MB from the official BepInEx site). Launch the game once afterwards and let it reach the main menu; the first launch can take a few minutes while the loader prepares the game. To undo it, open the game's edit screen and click **Remove mod loader**. Only use mods in solo play.

For games that have a BlumMods plugin (SHRED A BILLION so far), the app installs the plugin by itself once the mod loader is in, and keeps it updated. Launch the game from BlumMods; when the feed says the game connected, triggers can use **Game action**, a dropdown of things the plugin can do in that game (jail the player, add or remove money, money multiplier, launch).

## Updates

BlumMods checks for a new version when it opens. If there is one, a banner drops down from the top: click **Update now** and it downloads, installs and restarts. Your games and triggers are kept. You can also check by hand in **Settings → Check for updates**. Keep the BlumMods folder somewhere normal like `C:\BlumMods` (not Program Files), so the app is allowed to update itself.

## Good to know

- **Key presses go to the focused window.** Your game needs to be the window in front, which it normally is while you stream.
- **Alerts on stream:** in Settings, copy the overlay link. Add it as a Link/Browser source in TikTok LIVE Studio or OBS.
- **If Go Live can't connect:** BlumMods reads your LIVE through a free service called Euler Stream. If connecting gets rate-limited, get a free key from eulerstream.com and paste it into Settings. This isn't an official TikTok API, so a TikTok update can occasionally break it until the library is updated.
- **Single-player games only.** Don't mod online games with anti-cheat.
- Your setup saves automatically. Use **Settings → Back up setup** to keep a copy.

## For game mods (BepInEx plugins)

Mods connect to `ws://127.0.0.1:21777/mods`. When a mod connects, it should send:

```json
{ "type": "hello", "game": "Lethal Company" }
```

Each **Mod command** action sends this to every connected mod:

```json
{ "type": "command", "command": "spawn_enemy", "args": "Bob", "event": "gift",
  "user": "bob123", "nickname": "Bob", "gift": "Galaxy", "count": 1, "coins": 1000, "comment": "" }
```

A mod can write to the BlumMods feed by sending `{ "type": "log", "text": "Spawned a Bracken!" }`.
