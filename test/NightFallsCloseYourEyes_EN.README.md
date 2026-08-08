# test/NightFallsCloseYourEyes_EN.w3x

English translation of **天黑請閉眼 v2.9A (Night Falls, Close Your
Eyes)** by **jimmybow** (TW) — the CJK-native werewolf/Mafia
social-deduction lineage, 4–12 players, whose standout feature is **AI
players that fill empty slots**. Night (Killers murder, Police
investigate) alternates with day (discussion, then a vote to execute),
played as a best-of-N series; interaction is chat-numbers and dialog
buttons. 342 wts entries + all 1,997 Chinese script literals + skin
and object-data values translated — zero untranslated strings.

**Role vocabulary note**: the source does NOT use the standard werewolf
set (no 狼人/預言家/女巫). jimmybow wrote a civic/crime dialect, so it
is translated as such — Killer, Police Officer, Civilian — while roles
that ARE standard Mafia archetypes take their standard English names
(Godfather, Bodyguard, Cupid, Coroner, Doctor, Spy, Mayor).

**Two findings worth recording**: (1) roles are stored as INTEGERS, so
role names are display-only — established three independent ways
(literal tokenisation, a scan of all 1,408 equality operators, and
enumeration of every string variable; the whole 517KB script contains
exactly three string comparisons, all ASCII). That is the opposite of
the Find Hoseong case and is what made translating every role name
safe. (2) ASCII apostrophes BREAK the JASS parse — `'...'` is rawcode
syntax and the lexer does not treat quoted strings as opaque. The
first build injected 91 apostrophes across 17 literals and would have
shipped an unloadable map that still passed byte and markup checks;
caught by pjass, all 17 rephrased, and the build now hard-fails on any
recurrence.

Gameplay byte-identical: 16 of 21 members byte-identical (all 7
anonymous members included), only the intended text members differ;
pjass error lists identical line-for-line; validate-map verdict parity
(same 2 pre-existing FAILs). Markup machine-check across 2,354 string
pairs: 0 failures. The protector's mangled MPQ headerSize dword was
repaired to the standard value to permit the splice — every other
header field was already self-consistent, proving the mangling was one
field (game-neutral, disclosed). Author fields credit "jimmybow,
translated by Serendipity"; all original credit surfaces kept verbatim.

**Status**: owner-directed translation set (2026-08-08) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from all toolkit doctrine).
