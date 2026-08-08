# test/TownOfShadows_EN.w3x

English translation of **小镇暗斗 1.6.1.8 (Town of Shadows)** by
**邪魔ご木衍 (Xiemo Gomuyan)** (QQ group 563246359) — the heaviest pass
in this set: 6,749 wts entries rewritten from 2,921 unique Chinese
source strings (~49,200 characters).

**It is not a Town-of-Salem voting game** (the scouting brief guessed
wrong): there is no phase clock and no vote. 1–8 players start as
Villagers in a shared town and the entire game is **class change at
energy circles on the ground** — ~45 classes across four ladders
(town civil: Villager→Militia→Footman→Captain→General, Priest→Bishop,
Jailer→Warden, Mayor, Magistrate, Executioner; martial: Samurai,
Ranger, Templar, Musketeer, Brewmaster; arcane: Apprentice→Fire/Frost/
Arcane Mage, Necromancer, Death Mage; and monstrous defector: Zombie
King, Ghost King, Vampire Count, Worgen, Headless Horseman, Meng Po).
Your remaining FOOD is your remaining lives. The social spine is the
wanted system: killing a villager carries a 7% warrant chance, a public
official 14%, and being wanted turns the town's *officials* hostile
rather than its people — so murder is survivable if you manage the
paperwork. Win by surviving, by restoring order with an army, by
defecting (Blackwater Pirates, Venture Company, Scarlet Crusade,
Burning Legion) and sacking the town, or by becoming Mayor and writing
the rules. Scripted threats run in parallel, including a Qiraji wave
boss chain where killing the Mayor loses the game for everyone.

**Chat and comparison audit** (305 chat registrations, 19 phrases; no
GetEventPlayerChatString, no byte-offset parsing): the one meaningful
comparison in 1.9MB of JASS is a player-name guard against the literal
"城镇" (Town), whose value is written from nine different TRIGSTR
entries — translating those without the literal would have made the
guard permanently true. Swapped in lockstep. Left byte-identical on
purpose: the seven Blizzard cheat codes (they are an ANTI-CHEAT TRAP
that force-defeats the typist — translating them would disarm it), the
CJK easter eggs and dev backdoor (kept verbatim inside its translated
instruction line so the instruction stays true), and 37 Battle.net
account names used as a VIP whitelist.

Gameplay byte-identical: only the wts and script members were spliced
(StormLib remove-then-add on a copy, never REPLACEEXISTING); 67
members byte-identical by content hash and the 49 anonymous members
were never enumerated or re-added. No header repair was needed — the
ERR:1004 that blocked earlier tooling comes from two protector-trap
stubs during extraction, not from a malformed header. pjass output
identical line-for-line (38,906 errors both sides); validate-map 37/43
with 6 pre-existing protector FAILs on both. Author fields credit
"邪魔ご木衍 (Xiemo Gomuyan) — QQ group 563246359, translated by
Serendipity" (the w3i author field originally read 未知, "Unknown";
the real credit lives on the loading screen and is preserved).

**Honest ceiling**: structure-verified only, never loaded in game, and
the two trap stubs mean validate-map cannot fully parse this map on
either side — the FAIL parity is the strongest signal available.

**Status**: owner-directed translation set (2026-08-08) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from all toolkit doctrine).
