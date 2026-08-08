# test/NameTagRip_EN.w3x

English translation of **撕名牌 0.4 (Name Tag Rip)** by **明龙影 (Ming
Longying)**, Feb 2015 — a WC3 adaptation of the name-tag-ripping
elimination game from 奔跑吧兄弟 (*Hurry Up, Brother*, the Chinese
*Running Man*). 10 players, red vs blue.

Positional PvP: the rip ability only lands from BEHIND your target, on
a 1.5s cooldown. The stamina economy inverts normal WC3 instincts —
standing still COSTS hit points and earns nothing; only running
regenerates and only running earns gold, so camping is punished by the
physics rather than by a timer. Billboards restore stamina. Side
systems: energy generators with stealable crystals (8s channel, breaks
on move), a Forge Master who combines items, a four-stage quest chain,
optional night zombies, and Kim Jong-kook as an island boss. Win by
50 team points or by killing the King of Rip Kings and holding the
title unripped for 300 seconds. Player 2 alone may type `-2D` in the
first minute to swap the 3D chase camera for a normal top-down view.

364 strings translated across object data (351 values), script
literals (256 sites), TRIGSTR entries and the UI skin — exact
coverage, no misses. Cast kept as the real people (Deng Chao, Li Chen,
Angelababy, Chen He...); Jin Yong martial-arts moves use their
canonical English names; in-jokes preserved rather than sanded off.
Three CJK quest chat commands remapped with their hint lines so the
string you are told to type matches the one registered; the ASCII
commands are byte-identical.

Verification: object-data round-trip proven byte-identical on all 10
translatable members BEFORE any edit (the gate that protects a
nameless archive); 69 of 78 members byte-identical including all 6
whose names are unrecoverable — which is exactly why this was a splice
and not a repack; validate-map 30/80/2 identical both sides; pjass
output byte-identical. The protector-mangled MPQ header dword at
offset 516 was repaired to the mandatory value 32 — one dword, every
other field already self-consistent (game-neutral). Author fields
credit "明龙影 (Ming Longying), translated by Serendipity", with his
own credits, version dates, contact details and sponsor thanks intact.

**Caveat**: the multiboard/record titles double as YDWE gamecache
keys. They are translated consistently so key and title agree, but any
player records previously stored under the Chinese keys read as zero
in this build.

**Status**: owner-directed translation set (2026-08-08) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from all toolkit doctrine).
