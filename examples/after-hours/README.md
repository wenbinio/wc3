# After Hours: Emergency Lighting

An original 1–4 player Warcraft III escape-map prototype by **Serendipity**.
This is a buildable game, not an engine-tested release.

Collect three fuses in a looped corridor maze, restore the maintenance
cabinet, and bring the remaining workers to the exit. A Custodian follows
corridor paths, hears normal movement farther away than quiet movement,
and speeds up during blackouts and the final escape. Reception is safe.
The third capture exhausts a worker; the team loses when nobody remains or
the ten-minute shift expires. Recovered fuses are shared and retained.

Right-click to move. **E** interacts; **Q** toggles quiet walking;
**R** spends 50 stamina for a four-second sprint with a ten-second cooldown.
Chat equivalents are `-use`, `-quiet`, `-sprint`; `-help`, `-status`, and
`-credits` are also available. Gold displays team fuses; lumber is stamina.
Use the in-game map name **After Hours: Emergency Lighting** in the picker.

## Build and test

From the toolkit root, with Node 24, locked dependencies and an MPQ backend:

```sh
node examples/after-hours/build.cjs _build/after-hours-new
```

The destination must be new. The command generates source and original
assets, builds a `.w3x`, validates the actual archive, runs sixteen rule and
path-grid tests, and runs preflight. It retains JSON reports and test logs.
The generated `source/` directory is ordinary editable toolkit map source.
For a source bundle outside the checkout, set `WC3_TOOLKIT_ROOT` before
running `source/tests/after-hours.test.js`.

The maze seed is fixed for reproducibility. Terrain, scenery and the WPM
walkability raster come from the same layout; a test checks objective
connectivity after adding a conservative 32-unit wall clearance. The
Custodian receives real movement orders, not frame-by-frame teleports.
Capture-to-reception is an intentional game rule, not a pathing workaround.

## Evidence limits

Passing rule tests means those rules executed under the toolkit's mocked
natives. Position fixtures in those tests are not real-client traversal.
Static WPM connectivity does not establish the engine's collision, pathing,
or movement behavior. `GetLocalPlayer` is confined to camera/selection;
that does not constitute a multiplayer desynchronization test.

The 3.0 Windows client and editor were unavailable for this build. Actual
map loading, visual appearance, sound, Channel button behavior, player
movement, multiplayer and human difficulty remain **NOT TESTED**. The
map uses existing supported formats, not newly certified 3.0 features.
The custom figure is deliberately a simple unrigged geometric prototype.

## Assets and credits

Seven original generated MDX models, original tiny UI graphics, and a
mathematically composed electrical hum are included. Model generation uses
the toolkit's Northreach MDL helper. No Blizzard model, texture, sound,
API file, or third-party map is redistributed. Worker art is referenced by
its stock in-game path. All supplied generated assets may be reused under
the MIT licence with attribution to Serendipity / wc3-map-toolkit.
