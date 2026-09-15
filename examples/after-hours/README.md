# After Hours: Emergency Lighting R2

An original 1–4 player Warcraft III escape prototype by **Serendipity**.
The first delivery failed the user's model/animation check. R2 repairs
inspectable asset defects; a retail-client retest is still required.

Collect three fuses in a looped corridor maze, restore maintenance power,
and bring the remaining workers to the exit. The Custodian follows issued
movement orders; quiet walking reduces hearing range. Reception is safe.
Three captures exhaust a worker; the shift ends after ten minutes.

Right-click to move. **E** interacts, **Q** toggles quiet walking, **R**
sprints. Chat fallbacks: `-use`, `-quiet`, `-sprint`, `-help`, `-status`.
Gold shows team fuses; lumber shows stamina. Choose **After Hours: Emergency
Lighting R2** in the map picker.

## Reproduce

From the toolkit root, with Node 24 and locked dependencies:

```sh
npm run build:after-hours -- _build/after-hours-r2-new
```

The output directory must be new. The command generates original assets,
source and a real `.w3x`, checks the packed model bytes, runs archive validation,
sixteen mechanics/static-path-grid tests, and preflight. Reports remain with
the artifact. Gameplay tests use mocked natives, not observed engine traversal.

## Asset repair and checks

See `ASSET-REPAIR.md`. All seven models have explicit colour flags with neutral
white tint, actual coloured BLP1 textures and checked bounds. Putting RGB colour
in texture pixels removes an observed red/blue mismatch in static-tint conversion.
The Custodian has a seven-part jointed rig with Stand, Walk, Walk Fast, Attack,
Death and Portrait sequences. It is simple geometric prototype art, not a
polished character.

`asset-checks.cjs` checks actual packed files: texture closure and full mip
pixel decoding, visibility, finite poses, bounds, and changing arm/leg matrices.
Nine regressions include deliberately broken variants. A sequence name alone
is not accepted as animation.

CI additionally invokes `render-assets.py` with Playwright 1.62.0 and the
independent mdx-m3-viewer-th WebGL renderer. It requires visible pixels for all
seven models, the actual authored yellow wall colour, and changing locomotion
frames from a fixed camera, retaining actual PNGs, GIFs and asset hashes.
No missing-texture image substitution is allowed. These are asset previews,
NOT Warcraft screenshots or client acceptance.

## Remaining uncertainty

The authorized Warcraft computer was offline. R2 stock-worker animation,
retail rendering, audio, Channel buttons, engine pathfinding and multiplayer
remain unverified. The earlier user-reported failure must not be marked
resolved just because automated structural or independent-renderer tests pass.

## Asset provenance

Geometry starts with the Northreach helper; an independent MDLX writer emits
final R2 bytes with explicit tint flags and animation tracks. Textures, icons
and composed electrical hum are original generated work, MIT with attribution
to Serendipity / wc3-map-toolkit. No game API files or Blizzard assets are
redistributed. The worker references the stock Peasant already in the game.
