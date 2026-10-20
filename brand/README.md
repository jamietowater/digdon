# Don & Mortar

A pixel-art series about a bricklayer who just wants to finish the job, and the raccoon who won't let him.
The name puns on *brick-and-mortar*: Don builds, Mortar wrecks, and they're stuck with each other.

| | |
| --- | --- |
| Universe | **Don & Mortar** |
| First game | **Don & Mortar: Trowelblazer** |
| Head-to-head mode / sequel title | *Don vs. Mortar* |
| Merch hook | Pick a side: **Team Don** or **Team Mortar** |

## The cast

| Character | Who they are | Files |
| --- | --- | --- |
| **Don** | Bricklayer in a yellow hard hat and orange safety vest, ginger beard, never without his trowel. | `don`, `don-portrait` |
| **Junior** | Don's son: orange hard hat over red hair, always climbing something he shouldn't. | `junior` |
| **Mortar** | The villain. A masked trash-panda bandit who flings soda cans at Don's building sites. He hates the stuff he's named after, so he sabotages every build. | `mortar` |
| **Chili** | A grinning chili pepper who wanders onto the road. | `chili` |
| **Cactus Pal** | A friendly flowering cactus who waves from the roadside. | `cactus-pal` |
| **Luchador** | A masked wrestler who leaps between lanes. | `luchador` |
| **The Burglar** | A cartoon cat burglar with a loot sack. | `burglar` |
| **The creatures** | Llama, Lobster, Bigfoot, Snake, Dragon, T-Rex, Skull, Alien and Devil: the critters Don seals in mortar. | `llama`, `lobster`, … |

## Colours

| Swatch | Hex | Use |
| --- | --- | --- |
| Hard-hat yellow | `#FFD21F` | Logo, Don's hat |
| Safety orange | `#FF6A10` | Don's vest, accents |
| Brick teal | `#1F7A8C` | Icon background |
| Mortar teal | `#2B91A5` | Icon brick lines |
| Ink | `#2A1610` | Outlines |

## Files

- `icon/icon-1024.png`: the app icon (Don close up on a teal brick wall). `icon/icon.svg` is the vector version.
- `characters/<name>.svg`: vector art. Use these for print: they stay sharp at any size, from a pin to a poster.
- `characters/<name>.png`: 2048 px on a transparent background.
- `characters/<name>-sticker.png`: with a white die-cut border, ready for sticker printers.

Everything here is generated from the game's sprites. After changing art in `src/data/spriteOverrides.ts`, run
`npm run brand` to rebuild this folder, the iOS app icon, and the web icons.

Before printing or filing anything, run a trademark search on "Don & Mortar" and "Trowelblazer".
