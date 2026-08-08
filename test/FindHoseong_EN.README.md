# test/FindHoseong_EN.w3x

English translation of **호성을 찾아라 클래식 +13.5 (Find Hoseong
Classic)** by **youding** (Clan Hs/hss; canonical M16 build, patched
through late 2024) — a 5–12 player Korean social-deduction survival
map: one player is secretly Hoseong, human by day, bat-swinging killer
by night, atop a ~40-role ecology (Hoseong's team with night-
transforming variants, ~30 citizen roles from Profiler to Jigsaw, a
recruiting Neutral faction with its own win condition, solo winners).
Team/ghost chats, memo system, gold economy, faction draft, host mode
select, and a role-guess assassination mechanic where typing a role
name in chat kills. 2,978 wts entries (~74K KR chars) + 813 script
literal occurrences translated; 6 chat commands remapped with all 9
SubString byte offsets corrected (-vision/-memo/-memo+/-minimap/
-morph/-unstuck); 51 role-guess literals swapped consistently with
their stored-role variables so guess==store equivalence holds.
Gameplay byte-identical: 302 of 304 members untouched (incl. all 284
protected imports), only wts + script differ; pjass finding lists
string-identical original vs EN; validation verdict parity (5 FAILs
are the protector's own artifacts). The PG protector's stomped MPQ
header fields were repaired to true v1 values to permit the splice
(game-neutral). Author fields credit "youding, translated by
Serendipity".

**Status**: owner-directed translation set (2026-08-08) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from all toolkit doctrine).
