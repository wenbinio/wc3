# After Hours R2 — model and animation repair

The user reported that all models and animation in the original delivery did
not work. The prior green parsing/logic results did not establish rendering.

## Confirmed from the original delivered archive

All seven custom MDX files and their named texture were present. The final
MDX geoset-animation records contained colour values but flags=0, missing the
static-colour-enable bit. The Custodian had only Stand and Death sequences;
it had no locomotion tracks or articulated limbs. Those defects are directly
inspectable. They do not establish the complete cause of every in-game symptom.

## Repair

- Final classic-MDX writer explicitly preserves the colour flag with neutral white tint.
- Material colours are opaque 64x64 BLP1 pixels with full mip chains.
  The first independent renders exposed a red/blue disagreement in the static
  tint path. Colour-in-texture removes that ambiguous conversion; a pixel-level
  regression requires the actual wall render to contain its authored yellow.
- A seven-part Custodian rig faces +X, has opposite arm/leg swings for Walk
  and Walk Fast, and actual Stand, Attack, Death and Portrait motion. Live
  sequences have explicit alpha endpoints; sampled posed geometry fits bounds.
- Button icons use BLP1 and the real CommandButtons / CommandButtonsDisabled
  naming convention, instead of arbitrary disabled-image names.
- Scenery has stationary movement type and is explicitly positioned after
  disabling unit pathing. This avoids relying on mobile Footman placement for
  walls already occupying blocked pathing cells. Relocation was not reproduced
  in an accessible retail client, so this is a robustness change, not a proven
  explanation of the user's report. Existing gameplay/layout are unchanged.

## New checks

Packed-asset checks inspect texture closure, full decoding, tint flags,
finite poses, visibility, bounds and genuinely changing limb matrices. Nine
regressions include deliberately broken variants; they are not game telemetry.
The original packed map now fails the colour-flag check.

A separate Playwright/WebGL render check requires non-blank images and changing
locomotion frames using only extracted archive bytes; missing textures fail.
Its report and actual PNG/GIF output are independent-renderer evidence only.
An unavailable renderer must fail, never create a substituted image.

The authorized Warcraft computer is offline. Retail-client model rendering,
stock worker animation, audio, button behavior, pathing and multiplayer remain
unverified for R2. Do not mark the user-reported client failure resolved until
the replacement is actually checked in Warcraft.
