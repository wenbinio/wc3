# test/BuildWallsWithAnimals_EN.w3x

English translation of **동물과 벽 짓고 살아남기 1.13d** by
**loveisanswer / 도필연**, patched by **UrbanSoul** (KR) — the **#13
most-hosted map in the world** (4,392 games/month). 1–8 player co-op
ranch/wall survival: four species produce goods (Pig→Herb, Deer→Antler,
Goat→Wool, Hen→Egg), which fund 14 wall tiers, ~60 tower families and a
50-round hold against a 10-stage co-op boss ladder.

**The market is real**: base price 100 won, and at every round end each
species independently rerolls a 0.50–2.01 multiplier, so a good sells
for 50–200 won, quoted with your own research/trade bonus. An Aging Vat
converts goods to aged goods worth a multiple; Festival Tickets pin one
species to a band; "Shake the Market" rerolls all four. Six difficulties
(Baby 100% → Blazing Hell 870%) pay graded persistent ranks through a
save code.

The largest pass in this set: **11,571 object-data fields** (215,636 of
the map's ~220,400 hangul characters) — a surface that was INVISIBLE to
our tooling until this session's objects-v2 trailer fix — plus 85 wts
entries, 231 script literal occurrences, and the full w3i including the
loading screen.

**Critical catch**: the save-code checksum literals feed NameToInteger
in both the save and load paths, and one changed byte would void every
save code in circulation AND break interop with the author's other map.
All five asserted byte-identical. The author publishes this map under
eight different English titles; none was used — the title is a direct
rendering of the Korean.

Gameplay byte-identical: 1,557 untouched members identical by content
hash, 8 spliced members byte-exact; 54,002 object-data fields
structurally re-read with 0 problems; markup parity 0 mismatches across
27,340 strings; validate-map parity. Disclosed: the protector wrote a
decoy MPQ header at 512 and a real header with a negative block-table
offset; the copy's block table was relocated and a well-formed v1
header written, proven content-neutral across all 1,565 members.

Author fields credit "loveisanswer (korea/m16), translated by
Serendipity", with UrbanSoul's patch credit and the save-engine thanks
preserved.

**Status**: owner-directed translation set (2026-08-09) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from all toolkit doctrine).
