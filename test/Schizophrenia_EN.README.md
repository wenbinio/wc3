# test/Schizophrenia_EN.w3x

English translation of **Шизофрения 1.23.21c "Эпизод 1"** by **roehDU**
(RU) — a 1–3 player *interactive film*. Players are the Müller family,
schizophrenics outside Füssen in 1930s Bavaria; the loop is
cinematic → **attack a circle to choose**, across 85+ decision points
with per-choice global statistics ("19% of players chose this").

**The standout mechanic**: every NPC line carries a colour code and the
COLOUR IS THE RELATIONSHIP METER — turquoise adored, green friendly,
yellow indifferent, brown contempt, red hated. There is no UI for it.
This is why the script ships duplicate lines: the same sentence exists
2–3 times with different colour prefixes, and the trigger picks the
variant matching current attitude. Colour parity was therefore verified
as gameplay, not decoration: **0 mismatches** across all four surfaces.

50,509 Cyrillic characters translated (366 unique script literals, 107
wts entries, 319 object-data fields, 152 skin lines). Content warning:
mental illness is the premise, played as horror, and the story includes
cannibalism, sexual violence and religious execution. Not sanitised;
four softenings are individually flagged in the glossary, including one
slur kept because the scene is about a fanatic using it.

Gameplay byte-identical: 205 of 215 members content-identical including
all 196 anonymous imports; every one of 319 edited object-data fields
re-read field-by-field with 0 mismatches; validate-map parity.
Disclosed: the protector stored an invalid dwHeaderSize forcing
read-only, so one dword at offset 516 was repaired to the only legal
MPQ v1 value.

Author fields credit "roehDU, translated by Serendipity". **Episode 2
does not exist** — verified against the author's page and resource
history; it survives only as an in-map promise.

**Status**: owner-directed translation set (2026-08-09) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from all toolkit doctrine).
