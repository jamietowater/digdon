# Dig Don Web

Play at https://jamietowater.github.io/digdon/.

The web port includes the six Unreal arenas in their original order. PLAY rotates through them;
the individual level buttons repeat the selected level with increasing difficulty.

| Level | Objective |
| --- | --- |
| 1. Dig Don | Clear the dirt or defeat the creatures. |
| 2. Bricklayer | Seal creatures into small pockets; weapons cannot finish the last creature. |
| 3. Conga Line | Break the marching chains. Leaders wear hard hats and pay a bonus. |
| 4. Invasion | Defeat the descending formation using upward throws and brick cover. |
| 5. Scaffold | As Don Jr., climb past Can Slinger and rescue Don. |
| 6. Summit | Smash through floors, avoid the repair lobsters and dragon, and reach the UFO. |

## Controls

- Movement: arrow keys, gamepad D-pad/left stick, or the on-screen pad.
- Dig, Bricklayer and Conga: Space/J sprays mortar, S throws, A boosts movement, D lays bricks where enabled.
- Invasion: Space/S throws upward; D builds cover.
- Scaffold and Summit: Space/J jumps, S throws. Scaffold ladders use Up/Down; mallets prevent climbing until they expire.
- Summit co-op: enable the menu checkbox. Player 2 uses A/D to move, W to jump, F to throw.
	Player 2 uses the shared keyboard, not a second touch pad or gamepad.
- Q pauses; touch screens have a pause button.

## Development

```sh
npm ci
npm run dev
npm test
npm run build
```

`npm run export-data` regenerates sprite data and all six layouts from the sibling Unreal project.
`npm run build` produces the SDK-free web build in `dist/`. Pushes to `main` run tests and deploy it via GitHub Pages.
Facebook builds use `npm run build:fb` or `npm run bundle`; deploying Pages does not upload a Facebook bundle.