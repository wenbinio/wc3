# test/Avalon_EN.w3x

English translation of **阿瓦隆 1.4d** by **lllIdontknowl** — a
Traditional-Chinese WC3 implementation of the board game *The
Resistance: Avalon*, for 5–10 players (the map ends itself below
five). Faithful to tabletop, verified against the script's own tables
rather than its help text: canonical side sizes and quest team sizes
including the two-Fail rule on Quest 4 at 7+, the full role set
(Merlin, Percival, Assassin, Morgana, Mordred, Oberon, loyal servants
and minions), plus BOTH optional modules — Lady of the Lake (passes to
whoever you inspect; used holders can't be inspected) and the Lancelot
variant (five swap cards drawn without replacement from round 3).
House adaptations: five consecutive vote-downs = Evil win, a
click-driven Ready phase instead of a narrator, private whispers
disabled via the skin file to stop collusion, host force-commands to
unstick a lobby, and an interactive in-map tutorial replacing the
rulebook. 230 wts entries + 101 script-literal occurrences translated;
w3i and object data needed no edits (fully TRIGSTR-indirected). 26
sentence-concatenation sites were translated as units with the
assembled output machine-asserted — shared fragments (the same
character prefixes three different quest lines) would have corrupted
silently under a substring pass. Zero SubString sites exist; 11 ASCII
chat commands untouched, one CJK easter-egg command remapped
(unreachable in EN without an IME). Gameplay byte-identical: 51 of 53
members byte-identical; validate-map 31/12/6 identical both sides;
pjass clean both. Author fields credit "lllIdontknowl, translated by
Serendipity"; the credits screen keeps the original author, testers
and model sources verbatim.

**Known author bug, translated faithfully rather than fixed**: the F9
suggested-setup table contradicts the engine at 7 and 8 players (text
says 5 and 6 good players; the engine enforces 4 and 5).

**Status**: owner-directed translation set (2026-08-08) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from all toolkit doctrine).
