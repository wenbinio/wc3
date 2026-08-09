# test/BuySkillsAndBlock_EN.w3x

English translation of **스킬사서막기 노멀 2.99 12차 (Buy Skills and
Block)** — a 12-player co-op round defence over 100 rounds whose whole
idea is that **every skill is an item that teaches it**: 96 "Learn X"
items across 27 skill-shop wisps covering the Blizzard hero roster,
plus 5 hidden and 5 "extreme" characters. Normal skills stack to 3,
auras to 10. Enemies tier up at rounds 8/21/40. 12,718 hangul → 0:
681 object-data string values, 391 script literal occurrences, 27 wts
entries, 2 UI overrides. Skill names mapped to canonical Warcraft III
English, cross-checked against each item's icon path. Gameplay
byte-identical: 16 of 25 members untouched, object data verified
field-by-field across 4,421 modification records with 0 problems;
validate-map parity; War3Net third opinion PASS on both.

**Corrections to the brief**: the map is NOT GUI-open — its wtg/wct are
a protector's signature stubs (W3M Map Utilities), so it is script-only,
and two members stay anonymous including a 1.1 MB mp3, which is why it
was spliced rather than repacked. The author's own kick-command labels
are mislabelled; English names follow the slot each trigger actually
kicks.

Author fields credit "Is, translated by Serendipity"; the loading
screen's "modified by dk…" credit is preserved. Honest limit: the
loading screen and minimap carry the Korean title as PIXELS and were
left untouched.

**Status**: owner-directed translation set (2026-08-09) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from all toolkit doctrine).
