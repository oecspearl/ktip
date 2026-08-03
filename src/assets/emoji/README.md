# Reaction emoji

Six PNGs, 256×256, from **[Fluent Emoji](https://github.com/microsoft/fluentui-emoji)**
by Microsoft — the **3D** style. Licensed **MIT**, so they can ship in the bundle
with no attribution requirement and no per-seat cost. The copyright notice below
is kept anyway because MIT asks for it to travel with the copies.

They exist because a bare emoji character is drawn by whatever font the reader's
operating system happens to have: Segoe UI Emoji on Windows, Apple Color Emoji on
a Mac, Noto on Android. One reaction, three different pictures, and the flattest
of the three is the one most of this audience sees. These are the same on every
screen.

| File | Emoji | Source |
|---|---|---|
| `clap.png` | 👏 | `assets/Clapping hands/Default/3D/clapping_hands_3d_default.png` |
| `fire.png` | 🔥 | `assets/Fire/3D/fire_3d.png` |
| `heart.png` | ❤️ | `assets/Red heart/3D/red_heart_3d.png` |
| `joy.png` | 😂 | `assets/Face with tears of joy/3D/face_with_tears_of_joy_3d.png` |
| `party.png` | 🎉 | `assets/Party popper/3D/party_popper_3d.png` |
| `thinking.png` | 🤔 | `assets/Thinking face/3D/thinking_face_3d.png` |

## The PNGs are masters, not what ships

`reaction-emoji.ts` imports the `.webp` beside each PNG, not the PNG. The chips
render at 24–26 CSS px, so a 256px PNG was shipping roughly ten times the pixels
anyone sees — 218 KB across the set, against 19 KB for the WebP.

The PNGs stay because they are the source the WebP is generated from:

```
node scripts/optimize-brand-assets.mjs
```

That script resizes every `*.png` here to a 96px `*.webp` sibling (96 covers a
24px chip at DPR 4). Deleting the masters would leave the script with nothing to
read — which is exactly how the previous conversion script rotted into being
unrunnable. They are never imported, so they add nothing to the bundle.

Mapped to characters in `src/lib/reaction-emoji.ts`. The character — not the file
— is what travels on the broadcast channel and what `ROOM_REACTIONS` validates,
so adding a reaction means adding it there first and a file here second.

**Adding one:** take it from the same repo, same 3D style, save the PNG here at
256px, run the script above to emit the WebP, and add the row to `REACTION_ART`.
Skin-toned emoji live under a `Default/` folder; everything else does not.

---

Copyright (c) Microsoft Corporation. Licensed under the MIT License.
