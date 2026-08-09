# Translation-candidate scenes survey — KR/CN + RU/EU/JP/VN (2026-08-08; second wave appended same day)

Two-agent sweep for NON-RPG, CONCEPT-FORWARD maps worth a full English
translation pass (the School Ghost Story pipeline: full player-facing
translation, gameplay byte-identical, credits preserved). Evidence
classes: [M] measured (downloads/hosting/structured fields), [W]
wiki-documented (namu/baike/zh.wikipedia), [F] folklore, [U] unverified.
Full agent reports were session-context; this dossier is the durable
synthesis. Related: docs/reference/wc3-canon-invariants.md.

## 학교괴담 version verdict (the map already translated)

**1.4z is the terminal public version with high confidence** [M]:
wc3maps version-group marks it latest (no newer sibling, hosted 294
times, last 2026-08-06); no Korean source references >1.4; author Eri's
Naver cafe (cafe.naver.com/gghot22) is DELETED (verified via cafe page
+ Naver API) — the authoritative channel no longer exists. The mirrored
copy reached the West via China's U9 platform (the U9_ filename stamp).

## Merged top-5 translation candidates

1. **达尔文进化岛 — Darwin Evolution Island** (CN) [M/W] — eat-to-evolve
   FFA: diet determines your species down a branching tree; level 11
   flips the map into no-respawn death mode. Thin text, on the official
   Netease platform (dz.blizzard.cn id 13035) + 3DM, no EN build
   exists. Best novelty-per-translation-hour of the whole sweep.
2. **Симулятор Гомеля — Gomel Simulator** (RU) [M, download-verified] —
   8-player co-op CITY-SIM of the real Gomel as deadpan state satire
   (ministers balancing Population/Food/Mood/Jobs). A genre WC3
   essentially doesn't have. Unprotected, WE-open, 352KB wts (heavy but
   mechanical for our pipeline). xgm.guru/p/wc3/GomelSimulator.
3. **Маги против орка — MagesMustDie** (RU) [M, download-verified] —
   PROP-HUNT: mages hide inside furniture (search/rotate/teleport it),
   one orc smashes the academy. Highest concept-novelty per byte
   (1.7KB wts + 47 Cyrillic script lines). Protected but script
   extracts; one crude ability wants renaming in EN.
4. **忍者村大战 — Ninja Village Wars** (CN) [W] — genuine THREE-WAY
   3v3v3 village AoS with mission objectives braided in; the format
   died in the West. v2.2/3.x on CN mirrors; moderate text;
   licensed-anime caveat (private translation fine).
5. **Dead By Nightlight** (RU) [M, download-verified] — Dead-by-Daylight
   demake with real objective design (anti-camp 5th generator, portal
   hatch). THE most tractable artifact found: unprotected, all text in
   a 36KB wts, zero Cyrillic in script. Novelty adaptive, not inventive.

Runners-up: 金字塔大逃亡 v3.5 (CN 34-minigame co-op gauntlet, still
shipping levels in 2026; foreign-origin ancestor caveat), 문명대전 (KR
civilizations auto-battler; obtainability weak — M16/cafes), WarCard
(RU Hearthstone-like CCG in WC3, alpha), 파오캐 (KR arena+CTF anime
crossover; version-fork ecology needs care), Les Loups-Garous de
Thiercelieux (FR deduction lineage, 7 hosted versions).

Blocked-on-sourcing: KR mafia/deduction maps (마피아/데스노트/호성을
찾아라 — concept ceiling of the KR scene, Among-Us-shaped years before
Among Us [F], but cafe-distributed with no canonical build found; if a
clean M16 copy surfaces, promote immediately). Excluded: CHAOS (Hive
translation project exists), all RPG lineages per the criterion,
Жизнь на заводе (requires UjAPI runtime — outside vanilla).

## Decomposition-study candidates (design research, not translation)

1. **真三国无双 3.9d** — AoS + logistics (granary/troop dispatch/morale)
   that beat DotA in CN netcafes; extends the canon-invariants work.
2. **神之墓地 2.6d** — hidden-mechanics density benchmark; three
   authorial dynasties; protected-pipeline exercise.
3. **원랜디 lineage** — living random-defense grammar (canon study's
   best-fit-per-effort genre), incl. its copyright-death-and-
   resurrection arc.

## Scene notes (durable)

- xgm.guru (RU) is automatable end-to-end (anon /download, structured
  fields) — the richest non-CJK source; RU scene's strength is
  asymmetric/social/simulation oddities.
- KR: Naver-cafe distribution is FRAGILE (학교괴담's cafe is gone);
  M16 (m16.me) is the living host, unreachable from this sandbox.
- CN: dz.blizzard.cn (official Netease platform) hosts living maps;
  KK平台 pairs maps with walkthrough communities; U9 (uuu9.com)
  collapsed post-Reforged but its stamps mark mirrored files.
- Auditable nothing-found: DE (only Werwolf 10.0 ger; ingame.de dead),
  ES/LatAm (arenas + localizations only), JP (no original surfaced,
  low confidence any exists), VN (originals are derivative formats;
  the scene's distinctive craft is its OWN localization pipeline),
  PL/TR (nothing).
- Corrections vs. common folklore: 동물철권 is Bloody Roar 2's Korean
  nickname, not a WC3 map; 파오캐 = Fight of Characters, not Pokemon.

Four RU artifacts are already download-verified in the session
scratchpad (Gomel, MagesMustDie, DeadByNightlight, WarCard) — a
translation pass on any of them can start without re-acquisition
(scratchpad is ephemeral: re-download via the recorded URLs if gone).

---

# Second wave (same day, deeper scout)

Status shift first: **Gomel Simulator, Dead By Nightlight and Pyramid
Escape (v4.4, newer than the briefed v3.5; jdrts.com mirror — Netease
geo-blocked) are TRANSLATED and shipped** in test/. Everything below is
download-verified AND extracted with tools/w3x-extract.js unless noted.

## Sourcing unblocks (durable — worth more than any single map)

- **M16 moved: m16.me → m16.gg**, which is DNS-level geo-fenced (apex
  unresolvable, wildcard → 127.0.0.1) — but sister site **m16tool.xyz
  is reachable and cdn.m16tool.xyz serves canonical map builds**. This
  is the KR unblock path.
- **xgm карты browser is automatable by genre attribute**:
  `/p/wc3/resources?category=18&attr[3]=<genre-id>` (MiniGame 2188,
  Tag 2186, Puzzle 2613, Horror 2536, Survival 2600, Battleroyale
  2357; protection attrs 2174/2175). Caveat vs first wave: anonymous
  `/download` holds for OPEN projects only — closed projects (Соль и
  Сахар) are login-walled; hunt EpicWar mirrors instead.
- **EpicWar was rebuilt as a Next.js app — server-side search is
  GONE** (client-only); locate by ID-interpolated page-scan (listing
  pages embed structured metadata).
- **32r.com works end-to-end for CN** (api.32r.com/down/<id>/1) where
  dz.blizzard.cn TCP-resets; 3DM's dl CDN (dl1.wsyhn.com) reachable.

## Promotions and verdicts on first-wave threads

- **호성을 찾아라 클래식 +13.5 — ACQUIRED** (the "blocked-on-sourcing"
  KR deduction ceiling): cdn.m16tool.xyz/PG_whoisca13.5.w3x, 43MB,
  canonical + patched through late 2024 (spy/detective/traitor
  reworks, ghost chat, disguises; 12-player social deduction).
  Protected (fake listfile; all war3map.* recovered), JASS. Text is
  well-architected: 3,339 wts entries carry nearly everything (object
  data has ZERO hangul) + 813 KR script literals. 학교괴담-class
  heavy but mechanical.
- **达尔文进化岛 v4.2.71 — acquisition-VERIFIED** (32r.com id 11337;
  internal name 达尔文进化岛427正式版). YDWE JASS, w3i v25, wts
  nearly empty; 348 CJK script literals + ~27K CJK chars in object
  data (mostly item/ability tooltips). Entirely within the pipeline.
- **마피아/데스노트 KR builds: still unsourced** (Daum/Naver cafes
  login-walled: cafe.daum.net/UsemapData, cafe.naver.com/w3umf; new
  lead for a future pass: 라이어게임/Liar Game). The concept slot is
  covered from the RU side (Death Note v0.4b below).
- **Пропхант is NOT a WC3 artifact** — a genre name-check on MMD's
  page; MMD itself is the RU prop hunt. **Мафия v1.60 rus is a RU
  translation of Dark.Revenant's ENGLISH Mafia** (EpicWar 141431) —
  fails the criterion, do not shortlist.
- **Соль и Сахар Beta 0.5 — unblocked** via EpicWar 246766 (xgm copy
  login-walled). Protected but extracts; light text.

## New finds (all download-verified)

- **Akaka的躲猫猫 v2.4.1** (CN prop hunt, 恶魔の妹; alive on the
  official Netease platform, id 3369) — props transform across 2
  modes × 12 arenas, wrong-hit HP cost, killed props defect, taunt
  audio. FULLY OPEN (74/74 named, wtg present), tiny text (~4.7KB CJK
  script + 429 wts entries). Best tractability-per-concept of the
  wave. (Zip says 2.41, embedded header 2.34 — pin at hunt time.)
- **Кто чужой? v4.4f** (RU The-Thing impostor deduction, 7Roman7,
  11p) — protected-but-extracts; moderate text (9.2KB script + 7KB
  wts + ~19.7K obj-data Cyrillic).
- **Death Note v0.4b** (RU, Archangel; 10p hidden-role Kira-vs-L) —
  light text; covers the KR 데스노트 concept slot.
- **РКН БАНИТ v4.0a** (Logni89; Roskomnadzor-censorship satire
  survival, 8p) — fully open, wts-centric (~19K Cyrillic). Natural
  satire pairing with Gomel.
- **Маньяк с пилой 1.7d** (F.S.B; the MMD-cited pre-DBD RU slasher) —
  open, wts-centric; overlaps Dead By Nightlight.
- **Прятки в лесу 2.4** (ents hide as trees — proto-prop-hunt) and
  **Пять ночей у пуджа 3.0r** (FNAF demake: cameras + door timing;
  solo, licensed-derivative caveat) — charming, below the shortlist.

## Ranked next-5 (shipped maps excluded)

1. 호성을 찾아라 클래식 +13.5 — KR deduction ceiling, in hand.
2. 达尔文进化岛 v4.2.71 — first wave's #1, now verified.
3. Akaka的躲猫猫 v2.4.1 — smallest text, fully open, CN prop hunt.
4. Кто чужой? v4.4f — strongest new RU concept.
5. РКН БАНИТ v4.0a — untranslatable-anywhere-else satire.

Runners-up: Death Note v0.4b, Соль и Сахар, Маньяк с пилой, FNAP.
Re-download URLs for every item are recorded in the second-wave scout
report (session context) and inline above; artifacts live in the
ephemeral scratchpad (`scout2/`).

---

# Third wave — CN deep sweep (2026-08-08, dedicated CN researcher)

Shipped since wave 2: РКН БАНИТ, Кто чужой?, Death Note v0.4b all
translated into test/ (whoisc in flight). Everything below is
download-verified + extracted unless marked otherwise.

## CN sourcing map (corrections to prior waves)

- **jdrts.com is the MVP**: TW/HK WordPress archive, 300+-entry
  其他地圖 (concept/misc) category, per-map mediafire links that serve
  raw .w3x to plain `curl -L`, WP search (`/?s=`), huge walkthrough
  base. Ten artifacts pulled end-to-end this wave.
- **wc3maps.com search API**: `/api/search?query=<CJK>` (param is
  `query`, NOT `q`) → structured JSON incl. hosted_total/hosted_month
  (aliveness). BUT downloads are bot-walled (storagebox Cloudflare
  challenge disguised as nginx 404) — metadata/discovery only.
- **KK平台 is NOT fully geo-blocked** (prior-wave error): kkdzpt.com
  web catalog + forum + developer portal reachable; only the game
  network is walled. ra216.com (魔兽基地, alive 2026-07) reachable but
  downloads route to pan.baidu (codes recorded in scout report).
  war3.uuu9.com is dead DNS (U9 apex is a shell). s.32r.com search is
  proxy-blocked (32r usable by known ID only). curl+browser-UA works
  where WebFetch 403s on CN sites.
- **汉化 trap**: CN archives interleave originals and translations of
  WESTERN maps with no marking — 痛苦的聚会 = Arohk's (DE) Party of
  Pain; 电锯惊魂8 = Purparisien's (FR) SAW VIII; 模擬人生/捉迷藏
  v.Proto likewise. CHECK THE AUTHOR FIELD before shortlisting
  anything CN-labeled.

## CN ranked shortlist (all w3i v25 classic, JASS)

1. **天黑請閉眼 v2.9A** (jimmybow, TW) — werewolf/Mafia deduction,
   the CJK-native lineage, supports AI werewolf players. 342 wts +
   14.4K CJK script chars. Translate the base first; its CN
   **扩展版 fork bolts a full economy on** (stock market with
   crash-to-waste-paper, wandering merchants; 1,565 wts) — phase 2.
2. **阿瓦隆 1.4d** — The Resistance: Avalon in WC3, dedicated
   role/vote-card art, WE-open, tiny text (274 wts). No EN equivalent
   exists (audited). Top tractability-per-novelty.
3. **魔兽模拟主题公园 测版13** ("WC3 Theme Park", author "L") —
   competitive Bullfrog-style park-management sim (visitor archetypes,
   satisfaction curves, rival parks). The CN Gomel. 303 wts, WE-open.
4. **小镇暗斗 1.6.1.8** (邪魔ご木衍) — Town-of-Salem-scale hidden-role
   town (roles incl. a venture-capital firm); live 开黑 community on
   bilibili 2025. HEAVY: 6,979 wts / 132.7K CJK (학교괴담-class++);
   protected (smpq extracted where stormlib errored). Decompose now,
   translate only with a dedicated budget.
5. **誰是兇手? 1.08** (721220war & RPGMAGIC, TW) — killer-among-
   friends castle deduction. 79 wts, 4 CJK chars in script — the most
   tractable artifact in three waves; a weekend pass.
6. **撕名牌 0.4** — Running Man name-tag battle: rip the tag off an
   opponent's BACK (positional PvP), stamina drain, run-to-heal
   anti-camping, 3D camera with -2D fallback. Early-stage; concept >
   polish; translate-or-steal borderline.
7. **小鸡-斗地主** — real Dou Dizhu in WC3 with card textures (a 2018
   bilibili WC3-DouDizhu showcase pulled 197K plays).
8. **大富豪·艾泽拉斯之旅** — compact Monopoly-like. The deeper line is
   富甲天下 (Monopoly×Three-Kingdoms, forks actively updated 2025-08)
   — acquisition currently blocked, walkthroughs on jdrts.
9. **全員逃走中 1.5** — Run-for-Money TV format (caught = prize
   resets). Tiny; licensed-format caveat.
10. **密室惊魂** (乐哥出塞) — CN-original escape-room deduction: ONLY
    ONE may escape and one player is the traitor. Download blocked
    (wc3maps 204135) — promote the moment a mirror surfaces.

## CN scene ideas (Stream B — decompose / steal / note)

- **Platform persistence made maps live-service** [M]: Netease cloud
  saves + per-map account levels → maps ship BATTLE PASSES (刀圈TD
  seasonal pass) and daily-activity systems; low-save players get
  lobby-kicked. Demand-side evidence for our deferred save-code
  capability (ambitious-maps §6).
- **KK平台 is a mini-Steam** [M]: studio authors, pre-registration,
  experimental shelf, revenue-share co-creation, esports arm. CN
  professionalized; explains maps-as-franchises.
- **挂机图**: an idle-lobby GENRE created purely by platform XP
  incentives. **无CD/BT cheat-fork ecology** [M]: ra216 has whole
  categories of cracked no-cooldown editions + injection tools — a
  provenance hazard: top-hosted copies are often the cheat fork.
- **隐藏英雄密码 culture** [M]: secret chat-codes as first-class
  community content (password catalogs, viewer tools). Cheap,
  sim-testable, drives walkthrough engagement — steal for an original.
- **Werewolf×economy hybridization** (扩展版's market), **TV-variety
  formats** (tag-rip positional PvP is click-native and sim-testable),
  **university-series maps** (华理TD thief-TD: creeps that STEAL
  towers, not leak — decompose 小偷疯狂科技), **viral-mobile demakes**
  (Flappy Bird/2048/Piano Tiles), **board-game depth** (Chinese chess,
  Sudoku, Minesweeper, 麻将TD tile-logic towers, an MTG map),
  **打字競賽** (typing-race: chat AS the verb, on purpose), **80平台**
  as a third, nostalgia-segmented platform.
- **三国杀 does NOT exist in WC3** [audited zero] — the license holder
  litigates; an original role+equip+judgement-card design would have
  no incumbent. 狼人杀-branded maps also absent (the slot is held by
  天黑请闭眼/小镇暗斗/密室惊魂 lineages).

## CN re-download index (scratchpad is ephemeral)

jdrts→mediafire (curl -L works): 天黑請閉眼 v2.9A
mediafire.com/file/2jnxhl2tr5ums15; 扩展版 /yl6jgbmv7mkqsxi; 阿瓦隆
/yzmek755r6n0zrg; 主題公園 /yr3i866d71sdb5z; 小鎮暗鬥 /w6zsk622hmjah89;
誰是兇手 /c5726w59hpj6tz8; 撕名牌 /di7u8v1n4okqq2q; 鬥地主
/v06379glrh8f1g1; 大富豪 /1bd7bvn031mi1ap; 全員逃走中 /x9gglbviwh8kc84.
Blocked-but-located wc3maps IDs: 密室惊魂 204135, 富甲天下英雄集结
342999 / 貳繁體 118868, 疯狂小偷 264831, 麻将TD 241883, 自走棋 101687,
農場大亨 267089, 警察抓小偷 262419. ra216 pan.baidu codes in the
wave-3 scout report (session context).

---

# Fourth wave — KR/RU/other scenes deep sweep (2026-08-08, Opus researcher)

Shipped since wave 3: Find Hoseong (whoisc) landed; nine CN passes in
flight. All items below download-verified + extracted; text volumes
toolkit-measured via map-to-json (NOT raw byte scans — see corrections).

## Sourcing corrections (the biggest yield of the wave)

- **wc3maps.com search param is `query=`** — `q=`/`search=`/`name=`/
  `term=` are silently ignored and return the same generic 24-map list,
  which reads exactly like "no KR results". This mistake is why waves
  1–2 thought the KR scene was unsourceable. Downloads:
  `storagebox.wc3maps.com/maps/<id>/<path>` where <path> comes from the
  viewer link's `path=` param (`/api/download/<id>` 302s to a WRONG URL).
- **xgm pagination is path-based** (`/p/wc3/resources/<page>?...`, not
  `?page=`): wave 2 swept page 1 only — MiniGame is 86 items not 34;
  the 232-item Other bucket (attr 2191) was never opened. Language
  attr exists (attr[1086]) but uploaders don't use it (all ~0). Runtime
  attr[1378] distinguishes нет/JN Loader/dzApi/UjAPI.
- namu.wiki fully blocked (curl AND WebFetch 403; mirrors dead).
  dcinside readable but list bodies are JS-only. Naver/Daum cafes still
  login-walled; KR TRPG hubs identified: 4rum.co.kr, cafe.naver.com/
  w3trpg, /m16trpg. m16tool.xyz portals confirmed live; slugs found
  via search engines, not the GameList.

## Ranked shortlist (wave 4)

1. **Культисты 3.5** (RU, xgm DetectiveWarcraft3) — Murder-family
   social deduction where SECONDARY ROLES ARE EARNED MID-ROUND by
   completing hidden tasks (Lawyer/Spy/Ambassador/Double Agent, each
   with stated difficulty + concrete power); the Cult Leader is the
   only player allowed to TYPE during the investigation day and keeps
   helping after death; mana = action currency. ~34.4K Cyrillic,
   object-data-heavy. Best concept-per-byte of the wave. TRANSLATE.
2. **아파트 1.45a** (KR, 스티치, wc3maps 83252) — THE KR-original
   deduction map waves 1–2 hunted: serial killer in your apartment
   block, alarm locks front doors 00:00–06:00, evidence is PHYSICAL
   AND DESTRUCTIBLE (burn a paper to read it — once). 55.7K hangul,
   96% in wts (ideal shape). TRANSLATE.
3. **Шизофрения 1.23.21c** (RU) — "interactive film": 1–3p branching
   story, 85+ decision points, NPC attitude encoded in dialogue text
   COLOR. ~48.5K Cyr. Medium priority; mental-illness-as-horror
   content warning; check for later episodes.
4. **Взлом Системы v1.1** (RU) — knowledge-deduction race: the
   password is a WC3 hero, question the Scientist (who can FAIL to
   remember; re-asking can jog him). Wordle-by-lore. ~23.3K Cyr;
   needs the RU hero-name answer set remapped to EN spellings.
   Deliberately typing-driven BY DESIGN (gotcha-33 exception).
5. **Сила слова** (RU, 2008) — Typing of the Dead in WC3: kill undead
   by typing the word over their heads. ~665 Cyrillic chars TOTAL —
   the cheapest artifact in four waves. EN word pool = balance
   decision (word length is the difficulty curve).
6. **데스노트 0.7ver** (KR, AngelDragon+크레아, wc3maps 108673) — the
   KR-original Death Note, unprotected, <6K hangul (20× cheaper than
   the RU one we shipped). Higher build 3.21fix7 is indexed but its
   file 404s server-side.
7. **Мутация V:0:05** (RU) — 87K Cyr all-wts, unprotected; shape
   ideal, concept unverified. Cheap to re-open.
8. **Monopoly v1.01 AI** (RU) — trivial (~6.7K); pipeline warm-up tier.

DECOMPOSE-not-translate: **Челябинск r12fix3** (Lord_Tomat — same
author as Gomel; open-world life-sim roguelike of the real city;
magazine-capacity-IS-mana guns with jamming, reputation triangle,
learn-by-doing skills, NPCs that live while you're away; >250K Cyr,
86MB, plus an ethnic-slur faction name that is unshippable in EN
without content changes). **Тараканья схватка 3: Metal Gear Insectus**
(cockroach stealth trilogy; UNPROTECTED WITH WTG — the best RU
trigger-architecture study via war3net --dump-triggers; 222K Cyr).
Passed: 주식게임 Q (thin), 너의 대학은? (joke is 수능-literate,
untranslatable culturally), 연상 퀴즈 (word-association DB — the
content IS the language), Игра в кальмара (ships official EN since
v1.1 — fails criterion).

## Scene ideas (Stream B)

- **M16 per-map portals are a GOVERNANCE layer** [M]: admin, clan
  channel, ban list, patch feed, walkthrough board, and a WHITELIST of
  accepted map builds (one map: 24 exact filenames, 5 versions in ten
  weeks). Version control lives in the HOST. Canon-invariants
  material: franchise-with-phases + host-side build whitelisting.
- **KR TRPG genre: human dungeon masters as player slots** [M]: "6 PC
  & 3 DM" declared in player config; 24+ sibling maps; fork genealogy
  credited per-ROLE (author/porter/balance-patcher). STEAL: an
  asymmetric GM slot (one player with authoring powers) — sim-testable,
  nothing in our fleet has it. Decompose TRPG S05_BH (unprotected+wtg).
- **눈치 ("reading the room") is a native KR genre** [M], 7+ maps:
  your own units are AMMUNITION fed into a shared destructible "life"
  (feeding your own included), upgrade-by-tile-drop at 70% odds,
  combine recipes WITHHELD as clan-rank knowledge (social gating of
  game information), losers ejected from the session. STEALS: (a)
  army-as-ammo objective, (b) secret-recipe economy where knowledge is
  the socially-distributed resource. Both coinstead-shaped.
- **호성 is a scene-wide shared character** across four unrelated
  authors (find-him maps ×3 maintainers, a 289-room escape maze,
  freeze-tag). Caution: our +13.5 build is one branch of a version
  FOREST, not a linear history.
- **Творцы Миров: the .w3x as a play-by-post board** [M]: 306-square
  grid, forum queue, terrain-only turns, +1 version per move, 3-day
  shot clock; 75 versions, 62% done. STEAL: maps perfectly onto our
  git pipeline (turn = commit).
- **LLM NPCs via file bridge** [M]: xgm "deepseek" project — Python
  writes situation.txt, map reads via MemoryHack, executes
  commands.txt back; demo is a murder mystery with LLM interrogation.
  Outside vanilla (MemoryHack+API key); note the two-file poll
  protocol; first artifact that is un-simulatable by lib/sim by
  construction.
- **FRAMETRIS**: tetris rendered on Reforged FRAME UI, not units —
  the one rendering surface we've never used. XGM 72-hour Map Jams +
  the Mini-Game Contest drive the RU board-game shelf (backgammon,
  chess, roulette, Mario-Party, Flappy Bird, hockey...).
- **VN scene identity = deprotection-and-republication**, advertised
  in map titles ("Deprotect by Luu Them"). "Protected" is a soft
  state in practice.

## Folklore corrections (wave 4)

1. **The KR mafia/killer-deduction "concept ceiling" claim is CLOSED
   NEGATIVE**: KR 마피아 1.570a and 위상의 살인마 both carry
   Dark.Revenant in their w3i author fields — they're localizations
   of his EN Mafia/Phase Killer, the same lineage excluded on the RU
   side in wave 2. The genuinely KR-original deduction maps are 호성을
   찾아라, 아파트, and 데스노트 — all now sourced.
2. **Darwin Evolution Island's mechanic is convergent, not
   CN-invented**: RU Эволюция 1.4 (2006) has the same loop INCLUDING
   the level-11 no-respawn flip; EN Natural Selection (Callex) is the
   visible ancestor. Downgrade "best novelty-per-hour" accordingly.
3. **Encoding hazard for the translation pipeline**: 아파트, 위상의
   살인마, TRPG S05_BH, Тараканья 3, Поймай вампира all ship wts
   files that are UTF-8 WITH 1–43 INVALID BYTES — strict utf-8 decode
   throws; naive cp949/cp1251 fallback produces silent mojibake (and
   fake "Cyrillic in a KR map" counts). lib/wts.js gotcha-16 path
   assumes clean UTF-8: any pass on these needs a lossy-decode +
   byte-preserving strategy. ALSO: never byte-scan object-data
   binaries for text volume — binary noise decodes as plausible
   CJK/Cyrillic; route through map-to-json.
4. xgm titles can mislie: Лавка "Старьёвщик" is actually Выжить в
   пустыне in its header. Check the header, not the listing.

## Wave-4 re-download index

xgm (anonymous /p/wc3/<slug>/download): DetectiveWarcraft3,
schizophrenia (direct: xgm.guru/files/100/219108/Schizophrenia_
1.23.21c.w3x), vzlomsys, Sila-Slova-c4k, chelyabinsk,
Tarakanya-skhvatka-3-...-chast-1 (и -2), monopolywc3, Mutatsia-E4s,
Evolyutsiya-14-tOg, tvorcy-mirov-igra-dlya-landshafterov, deepseek,
Uther-Party-Ultima-V-OoQ (CLOSED — 55-byte JSON; hunt EpicWar).
wc3maps (storagebox.wc3maps.com/maps/<id>/<path>): 아파트 83252/
Apartment_1.45a.w3x; 데스노트 108673/0.7ver.w3x; TRPG S05_BH 407813;
눈치보며 강퇴하기 318740; 호성 sibling builds 209715/294136/90354;
호성의 미궁 178978. m16tool CDN verified live for AHKSS1FIX194.2.w3x
and PG_whoisca13.5.w3x. Artifacts (26 maps, 705MB) in ephemeral
scratchpad kr-ru-scout/.

---

# Fifth wave — BLIND-SPOT scout (2026-08-08)

Briefed against our METHOD, not another region: waves 1–4 all browsed a
known host, keyword-searched, and ranked what surfaced. This wave
attacked what that procedure cannot see. Fifteen maps shipped by now.

## The unblock: wc3maps' FULL search contract [M]

Prior waves knew `?query=`. The site's own JS bundle exposes the rest:
`/api/search?page=&order=<hosted_month|hosted_total|downloads|id>
&desc=true&query=&author=&script=<0 JASS|1 Lua|2 TS|3 C#>&min_players=
&max_players=&groups=<""|false>&count=<-1|0>` — 24/page; `count=0`
returns ONLY a total (69,803 latest-version groups) with zero rows,
which is why a naive sweep looks empty; `groups=false` gives every
point-version. Also live: `/api/lobbies`, `/api/lobbies?map_id=`,
`/api/map/<id>`, `/api/map/<id>/history`, `/api/activity?range=`,
`/api/stats`. The `saves` field = w3i editor save-count, a free
authoring-effort metric. **`order=hosted_month` + page-walk ranks the
ENTIRE live hosted canon** (bottoms out at 1,199 maps hosted in the
last month).

## The headline measurement [M]

Of those 1,199 live maps: Latin-script 926 maps / 301,541 games (79.5%),
**Korean 211 maps / 71,219 games (18.8%)**, Chinese 51 / 6,200 (1.6%),
Russian 11 / 438 (0.1%). 126 non-Latin maps host ≥100 games/month.
**Nearly one in five games of WC3 played in public bot lobbies right now
is on a Korean-language map** — a scene wc3-canon-invariants.md does not
model at all (it was built from EpicWar downloads + w3reforged +
wc3tracker, all Latin-facing).

## Hosted-but-undocumented (played, but nobody wrote about them)

1. **윷놀이얌 v.라** (id 359876) — authentic Korean Yut Nori board game
   (도/개/걸/윷/모 + 빽도, capture, stacking, team modes). Open archive,
   **~365 non-ASCII chars TOTAL** — the cheapest artifact in five waves
   (beats Сила слова). Zero English footprint anywhere. TRANSLATE.
2. **턴제카드깸 v.차** (262966, 226/mo) — 5p turn-based card duel; ~1.2K
   chars. Procedurally generates Korean personal names from surname +
   syllable tables (in EN that table is a DESIGN decision, not a
   translation). Zero EN footprint. TRANSLATE.
3. **뿔레전쟁 v.리버스** (447336, **3,351/mo — #22 in the live canon**)
   — 2.28MB/48K-line JASS, 31 versions, 16,958 editor saves, save-code
   persistence, skill mastery tree, boss damage meters. The author
   shipped his OWN English builds; both are dead at 0–9 hosted.
   RE-SYNC candidate, ~63K chars.
4. **동물과 벽 짓고 살아남기 1.13d** (343184, **4,392/mo — #13**) —
   ranch/wall survival with a real MARKET (daily price ticks, aging,
   per-species herb pricing), 6 difficulty tiers paying graded rewards,
   and save-code persistence INTEROPERABLE with the author's other map.
   ~218K chars. DECOMPOSE-first (market + reward-grade design is
   coinstead-adjacent).
5. **건물 지어 막기 3.1 Plus** (106624, 937/mo) — CAUTION: the
   top-hosted build is the CHEAT FORK (40+ `@`-commands behind a
   치트팩 gate). Confirms wave 3's CN cheat-fork ecology on the KR side.
6. **문재앙디펜스** (117848) — political-satire zombie defense, 96% of
   text in wts, **wtg present** → a war3net --dump-triggers study target.
   Obvious content warning.
7. **우한 폐렴에서 살아남기 3.2** (96357, 621/mo) — protected; a
   trap-stub w3r (8 bytes declaring 1.26bn regions) fired gotcha 26
   correctly; needs --recover-names before judging.
Unopenable: **닭 농장 2.3C** (286852) — header-size mangled to
0x6f725053, archive size overshoots by 1.95GB, nothing extracted.
Rejected by provenance: 쥬라기서바이벌 G20 (KR fork of an EN map),
수건돌리기 (=Hungry Hungry Felhounds KR line; still a good wtg/wct
study), 심해온라인 RE (already translated).

**New provenance heuristic [M]**: extend wave 3's "check the author
field" to **"check the `path` field"** — the internal filename survives
localization and is a provenance oracle (`HHF2021`, `meandyou_survival`,
`DeepSeaOnline..._translated1`, `PumpkinTD_v1.12-ENG`). Four of twelve
candidates were disqualified by path alone, before download.

## Author-graph traversal (`author=` is a first-class API param)

- **king50 — 91 maps.** A one-man traditional-and-party-games studio
  who single-handedly occupies six genre rows: Yut Nori, Tuho,
  Blue-Marble/Monopoly, auction defense ×2, street-vendor tycoon ×2,
  pretend-play house, hide-and-seek, dodge ×4, a card game themed on a
  Korean YouTuber. Also authors **호박숲디펜스 = the ORIGIN of Pumpkin
  TD** (see correction 1). And `捉迷藏 v.Proto`, which wave 3 flagged
  under the 汉化 trap, is HIS — Korean, not Chinese.
- **loveisanswer — 43 maps.** Explains why keyword search fails: ONE
  map is published by its own author under **eight different English
  titles** plus 繁體/简体/Vietnamese. No stable English name ⇒ no
  English community ⇒ invisible to search. KR line 17,942 hosted; every
  EN/CN/VN build 0–935. Catalog is a coherent shop/farm-management
  family (plant farm, animal farm, blacksmith, potion shop, factory
  tycoon), six still live in the top 300.
- **z1z1z1 — 72 maps.** Platformers and escape rooms in WC3 (Platform
  Escape series, BOUND, Death Maze, World's Hardest Game), plus
  **캐치마인드 = Korean Pictionary** and a dating map. Self-translates
  into EN/繁/简/RU. Wave 4 credited him with one quiz map.
- **navia2 — 8 maps**: same shape as loveisanswer (own EN builds, dead).

**The structural finding [M]**: **KR authors DO ship their own English
builds, and the English builds die.** The one that didn't — Pumpkin TD
— is the one a separate WESTERN MAINTAINER took over (own domain,
Patreon, Discord savecode escrow) and then dropped the original author
from the byline. The bottleneck is not translation, it is
**maintainership**. The deliverable that has ever worked in this scene
is a maintained fork, not a translated file.

## Video-first + the dead layer

- Video-first thesis CONFIRMED measurably: of 7 CN maps visible in
  bilibili gameplay video, **6 are absent from wc3maps' 69,803-group
  index** (《一座岛》 — a TD where land itself is the budgeted resource;
  《生死苍茫》; 《大王派俺去巡山》; 《谜窟求生记》; 《源世界》;
  《百万小狗》). The CN long tail lives entirely outside indexed hosts.
  **Exists-but-unobtainable**: distribution is QQ group numbers in video
  descriptions + bilibili `opus` posts, which return `code:-352` (risk
  control) with a JS-shell fallback. No headless path exists.
- **`archive.org` is NOT blocked — only `web.archive.org` is** [M].
  `advancedsearch.php?...&output=json`, `/metadata/<id>`, and
  `curl -sL /download/<id>/<file>` all work. This is a permanent
  capability, not a one-off. Found: **`epicwar_map_and_meta_dump`**
  (121.5GB — EVERY map ever uploaded to EpicWar through 2021, with
  per-map meta.json AND the original HTML page); **`wc3_maps_2002`**
  (1.76GB, 26,824 files, PER-FILE downloadable — 5,359 maps each with a
  pre-parsed .txt sidecar carrying name/author/full description/save
  count, so **the pre-2010 dead layer is grep-able without downloading a
  single map**); `wc3_maps_2003`; MakeMeHost's rescued archive; Gamefront's
  collection; and mirrors of four DEAD RU hosts (wc3-maps.ru,
  wc3.3dn.ru, warcraft3ft.clan.su, war3-team.ucoz.ru).
- 2002 filename scan: 674 novel-genre matches. Confirmed early
  occupancy of genres the modern canon ABANDONED — Mario Kart, Monopoly
  (6 versions), Musical Chairs (5 versions), Stealth Operations,
  Inferno's Weapons Factory. The genre diversity existed and DIED:
  stronger evidence for canon-invariants' era-divergence thesis than
  anything currently in that dossier.

## Genre negative space (measured against the 69,803-group index)

AUDITED ABSENT (zero results across all terms tried) — these are design
openings with NO incumbent:
- **Programming / automation (Factorio-shaped)** — the largest untouched
  genre found. Nearest relatives are a 2002 weapons factory and one
  KR "factory random defense".
- **Co-op puzzle requiring literal simultaneous cooperation** — nothing
  under puzzle/maze/escape terms. Violates the canon's "parallel
  solitaire" caveat in a good way.
- **Courtroom / trial** (재판/법정: 0) — a verdict-vote loop is exactly
  our multiboard + alliance surface.
- **Deckbuilding as a RUN STRUCTURE** (덱빌딩: 0) — card maps exist, but
  none is a roguelike deckbuilder. Strongest opening in the table:
  vaults-of-ash's seeded PRNG + Poker Strike's proven 1,173/mo demand.
- **Elections / voting-as-government** (선거/투표: 0 — diplomacy maps
  exist and are alive at 71/mo, but nobody votes).
- **Train/logistics puzzles** (기차/지하철: 0; Microtrain is a
  micro-drill, not logistics) — coinstead's `-link` routing is 80% of
  the engine already.
- **Karaoke** (노래방: 0), **golf** (골프: 0).
Thin-but-occupied openings: rhythm (2 maps, ≤21 hosted — timing windows
are click-native and sim-testable), cooking/restaurant (1 map, 3
hosted), city planning (1 KR SimCity, 6 hosted), incremental/idle
(CN platform-driven only), drawing/Pictionary (one dead artifact; and
inherently typing-at-tempo, gotcha 33).
Occupied, don't bother: farming/shop (the loveisanswer family),
asymmetric 1-vs-many (Kodo Tag 4,591/mo, Troll & Elves 1,877/mo),
survival-crafting, diplomacy, racing (occupied but hosted-dead),
physics toys (occupied, dead), sports (soccer real at 133/mo).
**Correction to wave 4**: quiz/trivia is not "one KR case" — Korea runs
a whole quiz shelf with at least six independent maintainers (anime-title,
dubbed-song, BGM, K-pop, game-name). Content-IS-the-language ⇒
untranslatable; steal the format.

## Wave-5 re-download index

API as documented above. Artifacts:
`storagebox.wc3maps.com/maps/<id>/<urlencoded path>` — 343184/
`meandyou_survival_1.13d.w3x`; 447336/`BbulleReversev.16987.w3x`;
262966/`(K)턴제카드깸v.차.w3x`; 359876/`(K)윷놀이얌v.라.w3x`;
106624/`asdfwq.w3x`; 96357/`320.w3x`; 117848/`_1.0.w3x`;
207090/`HHF2021.w3x`; 286852/`chickenfarm_2.3c.w3x` (unopenable).
Author re-runs: `&author=king50` (91) / `loveisanswer` (43) /
`z1z1z1` (72) / `navia2` (8). Pumpkin lineage: 429910 (EN current),
363950+146151 (king50's own EN), 279453+182342 (KR), 331209+445331
(리버스), 440919 (Z). archive.org: `/metadata/{epicwar_map_and_meta_
dump, wc3_maps_2002, wc3_maps_2003, warcraft3-map-archive, ...}`.
Bilibili: `api.bilibili.com/x/web-interface/search/all/v2?keyword=`
(parse result_type=="video"); `/x/web-interface/view?bvid=`.

---

# Wave 6a — CN/RU/other canon + THE VERSION-FOREST STUDY (2026-08-08)

One of five parallel agents. **Read the instrument correction first — it
revises wave 5's headline numbers.**

## Instrument correction (affects every wave-5 count) [M]

With `groups=""`, `order=hosted_month` sorts by `group_hosted_month` but
returns the **latest row of each lineage**, whose own `hosted_month` is
often near zero. Wave 5 measured the canon through that lens. Walking
BOTH modes:

| instrument | rows | sum hosted_month |
|---|---|---|
| `groups=""` (latest per lineage) | 3,192 | 402,283 |
| `groups=false` (every point-version) | 9,600 | 3,048,463 |

The grouped view sees ~13% of live hosting mass. **Wave 5's map counts
are 3–8× undercounts** (canon 1,199 → 3,192 lineages / 9,600+ builds;
CN 51 → 614 live builds / 29,034 games; RU 11 → 90 / 2,090). Its
language SHARES broadly survive under sensitivity analysis, but **KR is
23–30%, not 18.8%** — one build carrying 1.16M (38% of all mass, with
hosted_month == hosted_total) distorts the raw split, and 63% of mass
sits in builds where those two fields are equal, so `hosted_month` is
not a clean 30-day window for recently-first-seen builds. Report the
capped/established variants, never the raw one. Also: `/api/stats` is
STALE (series ends 2024-11) and cannot cross-validate.

## THE VERSION-FOREST STUDY (the durable methodology of this wave)

Topology over the canon's top 80 lineages [M]: 22,167 versions ever,
**1,271 concurrently live builds**; median lineage = **93 versions ever,
11 live simultaneously**; extremes 원피스랜덤디펜스R 2,520 versions /
190 live, War of Races 1,441, The World RPG 1,103. The top build holds
a median 70% of its lineage's hosting — and in 16 of 70 lineages, under
50%. **`latest=1` is a poor guide** (Otaku Defense's latest hosts 1,379
while the previous build hosts 6,273).

**The dominant fork mode is NOT renaming — it is identical version
strings on different binaries.** "3.1 Plus" is six distinct map ids in
one group; Direct Strike "6.4.23" is two ids, same author, same
filename, 217,088 bytes apart.

### Canonical-build heuristic — `saves` is an ancestry clock [M, 5/5]

The w3i editor save-counter increases monotonically with genuine
authorial releases. Anything sharing a `saves` value with a sibling but
differing in `size` was modified **outside the World Editor** — i.e. by
a patcher/injector, since a WE edit would have bumped the counter.

1. `/api/map/<id>/history` → enumerate the lineage.
2. Fetch `size` + `saves` per member.
3. Partition into `saves` cohorts = real authorial generations.
4. **Within a cohort, the smallest downloadable build is the author's;
   larger siblings are injections.**
5. Rank by `hosted_month` from the `groups=false` walk to find the
   PLAYED build (usually not `latest=1`).

Validated on 건물 지어 막기 across both cohorts by counting `@`-command
literals in war3map.j: cohort 315 → 46216 (512KB, 0 cmds, **2,205/mo —
the real one**) vs 162126 (547KB, 3 cmds); cohort 326 → 98158 (475KB, 0
cmds, author patch) vs 147103 (554KB, 88 cmds) and 106624 (722KB, **96
cmds**, `latest=1`, 938/mo). Three cheat forks in one lineage, not the
one wave 5 found.

### Cheat-fork detection before downloading

- **The site's `cheats` field is unreliable BOTH ways**: it flags
  464/9,600 builds incl. mainstream maps with legitimate debug commands
  (Direct Strike, Castle Fight DE, Green Circle TD, Burbenog), and it
  MISSED the 96-command fork. A prompt to inspect, never a verdict.
- **Size inflation vs a same-version sibling is the strongest
  pre-download signal** (+41% archive / +183% script in the KR case).
  Two known cheat payloads land near +210KB (+210,175 KR; +217,088
  Direct Strike) — suggestive of a common injected pack, not proof.
- Post-download confirmation is decisive and cheap: count `"@..."`
  literals in war3map.j (clean = 0; forks = 88–96, plus 치트팩 발동
  "cheat pack activated" banners).
- **Unauthorized re-upload has its own signature**: Burbenog TD vs
  "Kerbenog TD" — identical author, identical `saves=1241`, identical
  version string, DIFFERENT wc3maps groups, sizes spanning 2.2×.

**Implication for the translation program**: a translated file lands in
a FOREST, not a slot — ship into a lineage running 11 concurrent builds
and it is one leaf among eleven, invisible unless a host adopts it.
That is the measurable mechanism behind wave 5's "the English builds
die". The pre-work (3 API calls: history → saves cohorts → smallest in
cohort → hosting rank) is now mandatory; in this wave alone it caught
three cheat forks, one Blizzard map, two already-English maps and one
KR→CN localization.

## Finds (12 downloaded + extracted + measured)

1. **殭屍逃亡與生存 v4.0** (TW, suaohoward; 161765, 106/mo) — build-and-
   survive zombie co-op: pick difficulty, build defenses, kill the
   zombie lord, zombies respawn mid-map. 13p, w3i v31, **UNPROTECTED
   with wtg present**, 4,215 wts entries, **66,485 CJK — 100% in wts,
   zero in script, zero in object data**: the ideal translation shape,
   and **the closest live analogue to maps/last-train phase 2B in the
   entire canon**. TRANSLATE *and* DECOMPOSE. Its victory text names
   巴哈姆特 (gamer.com.tw) — a TW community channel absent from this
   dossier and unprobed.
2. **24 Игрока — Кто выживет?** (RU, 314046) — 24-player survival, wtg
   present, **530 Cyrillic chars total, 0 in script**: second-cheapest
   artifact in six waves. Hosting marginal, tractability extreme.
3. 從前有座練功房 (338819, 87/mo) — 40,503-line JASS but most script CJK
   is YDWE/雪月 editor boilerplate, not player text.
4. 惡魔遊戲 (197091, 63/mo) — 12,500 CJK, mostly object data.
5. 新神偷海盗加勒比海盗 (328334, 79/mo) — 6,159 CJK, cheap.
6. 尸虐人生 3.8 (444654) — script CJK is a shipped memory-leak detector.

DECOMPOSE-ONLY: **綠色循環圈外傳 8.6.0** (431334, 197/mo) — 187,776 CJK
of which 186,699 is in SCRIPT LITERALS with only 2 wts entries. The
inverse of 학교괴담's shape and the worst translation target measured.

REJECTED by measurement: 天災來臨3.5 (357899 — see the engsub trap
below), 华理TD (wave 3's thief-TD lead: only 1,800 CJK and its wts is
ALREADY ENGLISH — keep as a 60KB decomposition target with wtg, drop as
translation), Охотники (path = renamed Blizzard WarChasers), Королевская
Зарубка (Blizzard-derivative), 隨機技能坦克防守 Cn (KR map localized to
CN), TestIQ (content-is-the-language).

## Scene shapes [M]

- **CN**: 510 lineages; mass is TD/defense, wuxia-xianxia ARPG, anime-IP.
  Top lineage is **Otaku Defense** (漂流瓶) at 12,682/mo across 13
  concurrent builds = 44% of all CN hosting — and it is
  **English-authored**, localized TO Chinese (`..._CN.w3x`, same
  `saves`, different group, hosted 0). Explicit localization markers
  (汉化/漢化/改編/原作者) appear on 5.1% of CN hosting as a measured
  lower bound. Latin-script author handles are NOT a usable proxy for
  origin (suaohoward, EXCEED0116 are Chinese handles).
- **RU is not a live-hosted scene on this network** — 68 lineages, 2,090
  games/mo total, less than a single mid-tier KR map, 46% of it one
  arena-RPG lineage. Its value is archival (xgm), already mined. Stop
  spending hosted-ranking effort there.
- **Thai / Arabic / Japanese-kana: 0 results each** against the full
  69,803-group index — the hosted instrument AGREES with waves 1/4.

## Corrections + new traps

1. Wave 5's counts (above). Shares survive; KR is 23–30%.
2. **NEW TRAP — the "engsub inversion"**: wave 3's 汉化 trap was
   CN-labeled maps that are translated Western maps; the REVERSE is
   costlier — **a fully English build keeping its Chinese title**.
   天災來臨3.5正式版, the top CJK-titled map in the live CN canon, has
   6,621 wts entries and ZERO CJK. Title-based scouting ranks it #1;
   the work is already done. The `path` field (`wow3.5.engsub.w3x`)
   catches it for free.
3. The 汉化 trap runs in BOTH directions and across CJK/KR: a Korean map
   shipped in Chinese (`DRDR311_ch_fix.w3x`, author fods1030 (M16)),
   another authored by 동동주, and loveisanswer's KR map live as a
   Traditional-Chinese build — confirming wave 5's
   multi-language-publishing finding from the CN side.
4. **Script-literal CJK counts OVERSTATE translation cost** (sibling
   rule to wave 4's never-byte-scan-binaries): CN maps embed YDWE editor
   boilerplate and shipped leak-detector strings. Sample the literals
   before costing.
5. JP absence re-confirmed, with a corrected reason: naive Unicode
   classification manufactures false JP hits because **の/な are CN
   decoration** in handles like 守望な云, 魔兽の神.
6. **Vietnamese is invisible to script classification** — VN titles are
   typed without diacritics (`Hong Hoang Dai Luc V2.2`). Unicode found
   3; a `Việt`/`Sinh Tồn` query found 6 live. Magnitude tiny, but the
   reason the instrument misses VN differs from waves 1/4's assumption.

## Toolkit-gap intel (first-class)

**8 of 13 maps failed `war3map.doo` translation** with the classic-.doo
past-end overread (`offset out of range … Received N+2..N+8`) — i.e.
`docs/upstream/` draft (a). This is not an edge case: **doodads are
raw-copy-only for the MAJORITY of the live CN canon**, which upgrades
that upstream issue from "classic-format nicety" to a live-canon
blocker. Separately, 161765 failed `war3map.imp` in BOTH the translator
("memory outside buffer bounds") and the viewer fallback. The new
trailing-zero-dword object-data codec threw nothing across all 13 — that
fix held.

## Wave-6a re-download index

`https://storagebox.wc3maps.com/maps/<id>/<urlencoded path>` (browser UA
+ `Referer: https://wc3maps.com/`): 161765/`v4.0.w3x`;
314046/`(24)Who Will Survive.w3x`; 338819/`000從前有座練功房test0.2.6.w3x`;
197091/`Demon039s Game OB v0.8r.w3x`; 328334/`000新神偷海盗加勒比海盗 2.3.w3x`;
444654/`24.尸虐人生3.8.w3x`; 431334/`000綠色循環圈外傳8.6.0.w3x`;
394524/`000華理TD[小偷-英雄]天堂版.w3x`; 357899/`wow3.5.engsub.w3x`.
Fork exemplars: 46216/98158 (clean) vs 106624/147103/162126 (forks);
Direct Strike 446806 vs 446799; Burbenog 263 / 8825 / 371733; Otaku
Defense 437696 (EN) vs 445620 (CN). Author re-run: `&author=漂流瓶`.
Path-oracle patterns to add: `_CN`/`_ch_` (derived localization + its
DIRECTION), `engsub` (already translated), `000`-prefix (host-list sort
hack), `(4)`/`(16)`/`(24)` (melee-template ancestry), bare hashes
(provenance destroyed by a file host).

---

# Wave 6b — Latin-script mid-tail (100–1,500 hosted/mo)

## Instrument correction #2 [M]

**`order=hosted_month` page-walking does NOT enumerate the canon.** Pages
1–60 yield 1,440 rows; a bounded scan of pages 61–100 surfaced **19 more
maps at ≥100/mo that pages 1–60 never returned**. Ordering is not a
stable total order across paginated queries — every count in waves 5/6
is a FLOOR. Floor measurement here: 984 Latin maps / 328,631 games/mo.
The 100–1,500 band = **396 maps / 124,534 games/mo = 38% of all
Latin-script play, in maps nobody has written about.**

## Shape of the mid-tail [M]

Blizzard's own ladder melee = 74 maps / 22,079 games (any Latin canon
claim must exclude them or it measures W3Champions). ORPG 34, licensed-IP
27, Green-Circle-TD forks 28, send-and-defend 10, zombie survival 14,
X Hero Siege 7, Enfo/Footmen 8, Burbenog 6, Legion TD 3 — and 185 maps /
57,030 games in "everything else". **Fork-swarm is the dominant mode of
life**: Green Circle TD has 28 simultaneously-hosted point-forks by 28
editors, none dominant. **Format-wise the mid-tail is OLD**: of 331
profiled, w3i v25=144 / v31=91 / v33=92, and **133 (40%) were last saved
by a pre-1.32 editor**. It is a classic-format population, not a
Reforged one.

## Finds

1. **Tower Survivors v1.90** (430170, 352/mo) — **a Vampire-Survivors-
   shaped map with no WC3 ancestor**: one tower, between-round shop with
   **rerolls at escalating cost**, legible multiplicative scaling
   (+1% dmg per 1000 max HP, diminishing per purchase), crit overflow
   past 100%, timed challenges — and information warfare: **spy on a
   rival's tower to see their weapons and DPS**. Fully open, 256/256
   named, vJASS with `BigNum` + `FileIO`. The closest canon analogue to
   vaults-of-ash but lobby-shaped. DECOMPOSE + steal the reroll curve.
2. **Assault the Throne 2.3.3** (271256, 1,345/mo) — a faithful **SC2
   Co-op Commanders** port: 9 commander factions, **prestige levels**,
   per-commander tech unlocks, and a **mutator system with in-lobby
   voting** where stacked mutators raise difficulty AND reward
   ("3 Mutators: Very Hard, +75% XP"). 92.9MB, 773/773 named,
   **C#→Lua**, 96k lines, codeless `.pld` save/sync. Answers a question
   our fleet keeps hitting: how a co-op PvE map keeps players across
   sessions with no save-code UI.
3. **War of Races 1.16c** (445814, 1,200/mo) — 13p race-vs-race; its Lua
   prints its own **C# package manifest** (WCSharp.*); frame-UI **lobby
   mode selector** (Ranked/AllRandom/AllPick/Draft/Sandbox) with
   **per-mode save slots** and 69 W3MMD calls reporting to hosting bots.
   125 BlzCreateFrame — heaviest frame UI measured.
4. **Risk Europe 4.10** (436962, 1,245/mo) — Risk as a **23-player** map
   with an **in-map ELO ladder rendered in frames**, account codes,
   TypeScriptToLua. Note for the canon study: **Risk IS elimination**,
   at 1,245/mo.
5. **Sprout TD 2.3** (428641, 190/mo) — **the most stealable mechanic of
   the wave**: "a mazing TD without a builder — you SPROUT new towers off
   existing towers." Branch tiers, full refund on blocked sprouts; the
   maze and the tech tree are the same object. Click-native, sim-testable,
   337KB, wtg+wct open.
6. **Life of a Peasant Ascension** (407835, 227/mo) — **CANON
   CORRECTION**: 24p social sandbox with full/part-time jobs (Doctor,
   Miner, Cook with real ingredient→fire→Cook chains, Soldier rank-ups
   granting permanent auto-income), gangs, arena ladder, school
   scenarios with lawsuits. Alive at 227/mo, and not alone (Uther Party
   Ultima-X 272, Are you a Lucker? 123, Canned Bread 104, Banjoball 135).
7. **Random Ability Tank Defense** (342054, 137/mo) — path says
   `..._translated.w3x` (KR original). Its **reroll economy** is the
   grammar to copy for random-defense: spend lumber to re-draw, shown 3
   same-grade alternatives EXCLUDING your current type, one is forced,
   **no cancel**.
8. **Divine Roguelike** (441516, 174/mo) and **Just Another Roguelike**
   (443279, 230/mo) — the two live roguelikes players actually chose;
   **neither is in docs/reference/roguelike-comparison.md**, which
   compared three maps chosen by reputation.
9. **Mansion Murderer** (20596, 132/mo) — the Latin-side deduction
   incumbent nobody profiled: form-switching, hidden mansion key, and
   design that assumes real darkness ("Q: I can't see anything! A: Turn
   off the lights in your room").
Also: **Power Towers** (2120, 255/mo, from 2011) — "a TD where you must
provide POWER to your towers", the closest canon thing to coinstead's
`-link` logistics, with **192 W3MMD calls in a 2011 map**; **Monster
Defense** (445766, 999/mo) — 24p race-pick base-builder survival, i.e.
coinstead's genre at scale; **Farmer vs Hunter X** — role reversal as a
scheduled beat; a live **WoW-timeline grand-strategy shelf** of ~10 maps
(LORDAERON TA/TF/GENESIS 1,887/mo combined) the canon dossier ignores.

## Technical frontier [M]

- **C# is a first-class WC3 language in the live canon**: `transpiler:2`
  = CSharpLua (Assault the Throne 1,345/mo, Spectrum TD 1,228, War of
  Races 1,200, Warcraft Legacies, RKR Remastered); `transpiler:1` =
  TypeScriptToLua (Risk Europe, Monster Defense, Hero Strife TD, the
  W3Champions melee shelf). ~5,900 games/mo transpiled in this band alone.
  **Decompiled C# is LEGIBLE** — namespaces, dispatch tables and enum
  comments survive into the shipped Lua, making a C# map *easier* to
  decompose than a JASS one.
- **Codeless persistence is standard equipment**: the same
  PreloadGen/Preload + BlzSendSyncData triad everywhere, with two
  reusable libraries in the wild — **WCSharp.SaveLoad** (C#, `.pld`) and
  **FileIO** (vJASS). This is ambitious-maps-analysis §6's deferred
  save-code capability, solved twice.
- **Frame UI is mainstream in the mid-tail** (War of Races 125 frames,
  Risk Europe 69, Divine Roguelike 61) and is used for the META layer —
  mode pickers, ELO boards, prestige buttons, mutator votes — not combat
  HUDs. **W3MMD spans eras** (a 2011 map has 192 calls).
- Authoring effort is free via `saves`: Line Tower Wars Reforged 40,711
  editor saves, Millenium RPG 40,004, Warlock 35,639.

## Negative space re-audited IN ENGLISH [M]

Zero live maps for: incremental, automation, logistics, conveyor,
courtroom, election, rhythm, deckbuild; chess/tycoon/colony/extraction ≤1
map at ≤5 hosted. **Wave 5's negative space holds in English** — it is a
genuine genre gap, not a search-language artifact.

---

# Wave 6c — THE ARCHIVE DEAD LAYER, MINED

## Corrections to the wave-5 archive picture [M]

- **`wc3_maps_2003` is a STUB** (8 files, 58KB, one jpg — the uploader
  never populated it). The 2002→2003 instrument does not exist;
  substituted below.
- **The 121.5GB EpicWar dump IS per-file addressable over HTTP** —
  `…/epicwar_maps.zip/maps%2F<id>%2Fmeta.json` returns ~495 bytes in ~1s.
  **Hard limit**: IA's cached central directory covers the first 106,045
  entries = epicwar ids 1→~117,529 = **2005-02-24 to 2009-12-03**; higher
  ids return HTTP 400, so the 2010–2021 tail genuinely needs the full
  121GB. Fully exploiting the accessible head ≈ 53MB of meta.json, ~3
  hours — yielding category, submission date, **rating (good/bad)** and
  **download count** for every EpicWar map of 2005–2009, strictly better
  than canon-invariants' current top-200-scrape evidence base.
- **`wc3_maps_2002` has two unused instruments**: a complete pre-parsed
  index as one 3.9MB HTML file (derplayer.neocities.org/repo/wc3maps/2002)
  and — the big one — **`/download/<item>/<map>.zip/<member>` serves any
  file INSIDE a per-map zip**, so `war3map.j` for all 5,359 maps is
  greppable over HTTP **with no MPQ backend at all**.
- **NEW corpus nobody has listed**: `warcraft-3-map-archive_202307`,
  1.07GB, **1,442 per-file maps** — "all maps I had on my old hard drive
  from 2009", i.e. a PLAYED/KEPT sample rather than an upload sample.
  Most dead-RU-host mirrors are monolithic .rar/.7z; only three
  (`anime-fight-star-v-2.8` 291, `20479-arrafrro` 153,
  `underground-chronicles-final` 65) are per-file.

Corpus profile from all 5,358 sidecars: **w3i v18 = 99.8%** (v25 = 13
maps), median 225 editor saves, 12-slot maps 40.5%, **1–2 player maps
4.6%**, 2,032 distinct authors, 1.38M chars of loading-screen text.

## THE FIND: an English social-deduction franchise, 2002

`bHawk` authored *Murder at the Graveyard* / *Murder at the Mansion*;
forked and continued by **Cyde**, **KILLTHEGAYS**, **Garaak** (credits
bHawk in-map), **ze-Falcon** (*Murder in the City!* — an explicit
narrative sequel), **Rain Of Terror** — **six authors, 20+ point-versions,
58 sidecar rows**. Mechanics, read from the artifacts:
- **physical voting**: "step into the circle that corresponds with who
  you think is the killer" — click-native voting, zero typing, in 2002
  (exactly gotcha 33's ideal);
- **the killer has a kill QUOTA on a timer** — victims win if he
  under-delivers (an anti-passive constraint modern hidden-role games
  mostly lack);
- **discovery does not end the game**: "Your identity has been
  uncovered!! Get to the gates to escape!" — an escape phase after reveal;
- **`killspeak`** — an anonymous/spoofed voice for the killer, i.e. an
  anonymous-messaging primitive, 2002.
Waves 1–4 spent three passes hunting deduction in CN/KR/RU. It was here,
in English, twenty-four years ago.

**Methodological bonus**: the `saves` counter reconstructs GENEALOGY
where no changelog exists — bHawk's builds run 336→414 while Cyde's forks
sit at 432→441 and KILLTHEGAYS' at 404→426, i.e. the forkers inherited a
bHawk file and kept saving. (Complements wave 6a's saves-as-ancestry-clock
finding, independently derived.)

## Other dead mechanics with no living incumbent

- **Stealth Operations v1.1** (234KB, 12p, wtg+wct, unprotected) — a
  fully-realised asymmetric heist: 4 attacker vs 4 defender classes (the
  Spy makes illusory doubles of himself AND of others); **defenders are
  locked inside the base until all items are stolen, then released**; a
  **security-camera room** only defenders can use, and cameras can be
  disabled; trainable watch dogs; jails with team-rescue AND self-escape;
  sentry guns that respawn with you; and three MacGuffins with
  **distinct asymmetric penalties** (one disables shadowmeld, one
  debuffs move speed, one buffs attacker damage).
- **Curse of the Werewolf** — hidden role welded to an RTS economy:
  **infection spreads by attacking villagers**, infected turn into
  werewolves **at night under the werewolf's control and die at day**;
  a no-attack tower whose only function is seeing the invisible.
  The closest structural ancestor to Last Train's defection mechanic
  found anywhere.
- **Dog Eat Dog** — a Survivor-format elimination game with a
  **reciprocity-gated secret ballot** ("you can only vote for players who
  voted for you first" — the ballot is a physical, dynamically-edited
  object) and a **redeem-from-elimination trivia round where the ACTIVE
  players choose who gets asked**.
- **CityCraft! v1.8** — competitive SimCity with gold upkeep every 5s, an
  **attraction score gating whether a citizen fills a slot**, citizens as
  the SUPPLY buildings consume, and a budget-overrun bailout costing 250
  of future gains. Systemically richer than the live KR incumbent.
- **Neo Warcraft Gladiators** (859 saves) — a 17-mode meta-shell with a
  **jailer-reputation economy** (earn reputation → allowed out to spend
  winnings → fail to return before the next fight → reputation drops).
- Also: **Preschool Showdown** ("you receive money for NOT building" — an
  inverted economy paying restraint), **Taxation** (governance-vs-governed
  asymmetry), **Multiplication Madness** (unkilled creeps MULTIPLY, so a
  leak compounds), **DrAwInG ContEsT** (the minimap as a drawing canvas
  with a judge role) by an author who also shipped Red Light-Green Light
  in 2002, **The Gambler's Game** (2p hidden-information shell game),
  full **Monopoly** (mortgages, property groups, 3-doubles-to-jail — and
  the map itself prints "Monopoly is copyright Hasbro"), **WarChess**
  (castling, Hold-Position pawn promotion), **Musical Chairs** (with
  disconnect handling and AI), and an entirely vanished sports/vehicle
  shelf (Sheep Ball, Mutant League Hockey, Demolition Derby, Steam Tank
  Racing, Lordaeron Rally, WarCART Racing).

## Diversity: what actually collapsed, and when [M]

2002 corpus (n=5,359) vs the 2009 kept-on-a-hard-drive sample (n=1,442),
filename match: TD/defense 22.6%→35.6% (1.57×), survival 3.7×, AoS 3.6×,
RPG 3.1× — while escape/maze 0.35×, arena 0.52×, tag 0.45×, **deduction
0.26×**, and race/vehicle, stealth, sim/tycoon all → **0.00%**.

Description-text match, 2002 vs an EpicWar 2005–09 sample (n=4,500):
sandbox 0.12×, karaoke/rhythm 0.24×, stealth 0.40×, and racing, survivor
shows, drawing, golf, projectile-physics all → **0**. BUT
social-deduction 1.08×, board-game 0.88×, city-sim 0.95× — **flat**.

**This corrects wave 5's framing.** It was not a uniform collapse of
"genre diversity". Deduction, board games and city-sim HELD their share
from 2002 into 2005–09; what died in that window is the **party /
novelty / physical-experiment shelf** (sandbox, racing, elimination
shows, drawing, physics-aim, golf) plus escape/maze and arena, while
TD/RPG/AoS/survival tripled. A SECOND collapse (2009→2026) then took the
rest, and deduction migrated wholesale into the KR/CN/RU scenes waves
1–4 documented.

**Two rows have NEVER been occupied in any era measured**:
**courtroom/trial** and **automation/logistics**. Wave 5 called them
openings against the 2026 index; they are openings against the entire
24-year record.

**Canon-invariant I1 falsified for the classic era**: 4.6% of the 2002
corpus declares 1–2 player slots (9.2% of index rows). "No solo maps" is
a property of the modern HOSTED canon, not of WC3 custom maps.

## Toolkit gaps, now backed by a 5,341-map corpus [M]

Random sample of 40 maps, 39 extracted+translated:
terrain 39/39, regions 39/39, strings 39/39, objects-units 35/39 —
but **info.json 0/39** (w3i **v18**, and v18 is **99.8% of the corpus**),
**units.json 0/39** (`war3mapUnits.doo` v7 sub-9, no codec), doodads 0/39
(known), sounds 0/39 (w3s v1), imports 0/39 (imp v0), cameras 24/39
(w3c v0 over-reads 1–4 bytes per record, cumulative).

**The practical statement**: our capability matrix says classic TFT is
fully read+write. The 2002 layer is **RoC, not TFT** — so **the entire
pre-TFT era is read-only for the two things that matter most: map info
(players/forces/flags/name) and preplaced units.** No CreateAllUnits can
be generated, no lobby reconfigured, no unit moved.

**But repacking is lossless by passthrough** — a full round-trip on
Stealth Operations (extract → map-to-json → json-to-map → w3x-pack →
validate-map) gives **25/31 checks passed, 0 FAILs**, and the viewer
independently parses all 17 members; w3x-pack correctly derived the HM3W
header from the packed w3i.

Ranked fix list, cheapest first: (1) **w3c v0 camera codec** — one field,
38.5% of the sample; (2) **`war3mapUnits.doo` v7.9 reader** — unlocks
preplaced units for the whole classic era, same family as the doodad
`.doo` bug already written up in docs/upstream/; (3) **w3i v18 codec** —
unlocks the lobby layer for 99.8% of the 2002 corpus, and v18→v25 is a
smaller delta than the v25↔v31↔v33 chain w3i31.js already covers;
(4) w3s v1 / imp v0 — trivial, low value. Plus: **the 2002 corpus is a
free source of listfile-grade stock-art PATH facts** for
lib/data/stock-art.json (its asset zips were scanned against an ~80MB
listfile), and 2002 maps use dozens of paths not yet in our table.

---

# Wave 6d — THE KOREAN CANON (and the metric that hid it)

## The headline: Korean is the MAJORITY of live WC3, not a seam [M]

Wave 5 said 18.8%; wave 6a said 23–30%. Both summed the **per-row
`hosted_month`** field, which is CORRUPT for high-volume Korean lines
(id 437213 reports `hosted_total == hosted_month == 1,164,168` — an
all-time count leaking into the month field). **`group_hosted_month` is
the sound metric** (ORDR: group_total 15,360,569 / group_month 169,133 ≈
1.1%, consistent with a ~9-year life). Over 3,089 live groups:

| | groups | group_hosted_month | share |
|---|---|---|---|
| **Korean** | 527 | **207,000** | **58.3%** |
| Latin | 2,280 | 143,316 | 40.3% |
| Chinese | 223 | 4,656 | 1.3% |
| Russian | 59 | 390 | 0.1% |

Confirmed twice more, neither map-language-based: **`/api/activity`
(28h live): 64,429 games, 39,989 from the `kr` gateway = 62.1%**, peak
76.6%; **`/api/lobbies`: 28 of 69 open lobbies on `kr`**. And
`/api/stats` (series ends 2024-11) already showed kr at 27–35% of all
hosting since 2020 — nobody read the field. **Carry forward: Korean maps
are the majority of public bot-lobby WC3.**

## The canon is one map [M]

**원피스랜덤디펜스R (ORDR) = 169,133 group-hosted/month = 47.6% of every
game on the network**, 5.8× the #2 map worldwide (Legion TD OZE 29,217).
Zombie Defense — which our canon dossier calls #1–2 — is **#8 globally**
at 3,533; that snapshot is a *Latin*-canon statement.

Concentration differs structurally: Korean top-1 share **81.7%** (top-20
93.9%) vs Latin top-1 19.7% (top-20 57.2%). **The Latin canon is a
distribution; the Korean canon is one franchise plus a 500-map
graveyard** — 471 of 527 KR groups host <100/month.

Genre census by hosting: **random-defense 23 groups = 83.8%** of Korean
play; then defense/TD 114 groups (8,763), RPG **142 groups but only
6,739** (~47 each), hero-arena 19, AoS 8, survival 24, sim/tycoon 19,
**board/party 9 groups = 39 games/month**. Korea *plays* one genre and
*authors* another — king50's whole party/board shelf is hosted-dead.

## Structural profile of all 527 KR groups [M]

**Script: 523 JASS / 4 Lua, zero transpilers** — the Latin canon's
Lua/TS/C# migration has NOT happened here. **Format: 481 of 527 are w3i
v25 (classic TFT)**, 22 v31, 23 v33, 1 v18 — the Korean canon is a
CLASSIC-format canon, so our v25 codecs are the load-bearing ones, not
the Reforged path. wtg present on only 63/527. **Median editor saves
2,876, max 37,303** — the strongest per-map authoring-effort signal
available anywhere, free in the API.

**Text shape has NO dominant form** (unlike CN/RU's "it's all in the
wts"): 호박숲리버스 ships **no wts file at all** with 31,106 hangul in
object data; ORDR is the inverse (282,717 in wts, 109 in object data);
디지몬 splits 11,943 script / 1,410 wts / 58,459 object data. **A KR
pass must measure per map.**

**The KR runtime-extension stack (new)**: Korea runs CN's **DzAPI plus
its own JN API** — frame UI, raw keyboard, direct process memory
(`DzFrameSetTexture`, `JNMemoryGetInteger`, `JNGetModuleHandle`);
m16tool.xyz hosts a `/JNAPI/Index` developer portal. Those maps are
outside vanilla and **un-simulatable by lib/sim by construction**.
Screen for `Dz*`/`JN*` natives before shortlisting any KR map.

## Translate candidates — and an honest exhaustion note

After wave 5 took 윷놀이얌 and 턴제카드깸, **the cheap-and-original seam
is nearly exhausted**; what remains is huge, IP-bound, or a localization.
1. **영웅 밀어 떨어뜨리기 2.25** (68445, 0.59MB, wtg present, ~17K
   hangul) — the whole combat model is **displacement, not damage**:
   stats are Movement / Knockback Power / Knockback Resistance, tooltips
   literally typed "type: laws of physics", armor converts to % knockback
   reduction. Sumo-in-WC3 with a designed stat economy. Click-native,
   sim-testable, no incumbent. **A weekend.**
2. **스킬사서막기 2.99** (8735, wtg+wct — the only fully GUI-open map
   measured, ~13.2K hangul) — 100 rounds; **every skill is an item that
   teaches it**; 5 hidden + 5 "extreme" characters.
3. **2005 TD Special 3** (382696, 155/mo) — **the only genuinely alive
   small KR map left**; 41,715 hangul, 100% in wts, clean UTF-8, nothing
   in object data. A 20-year lineage still maintained by ≥3 authors.
4. 언덕왕 외전 (7509, 3,083 saves on a 350KB map) — verify it isn't a
   localization first. 5. 외길인생 (25844) — KR-original, author grants
   redistribution explicitly.
REJECTED after measurement: **테트리스 0.8** (466 hangul total — the
cheapest artifact ever found, and unshippable: DzAPI+JN memory hooks);
**겨울나기 HARDCORE** (a KR localization of a 2004 EN map — caught only
by an English changelog inside its own wts); 토끼 vs 양 (localization);
90분의1 (a StarCraft UMS port + defamation of a named politician).

## Decompose: ORDR — the most-played WC3 map on earth, never opened

134.6MB, **65,533 archive entries** (65,513 anonymous; the count is
2^16−3, consistent with **hash-table stuffing** to defeat name probing),
91,080 lines of JASS, group lifetime **15.36M hosted games**. Steals:

1. **A machine-readable tooltip SCHEMA across ~2,300 abilities** — every
   one uses the same field set (◎기본효과/◎추가효과/◎발동조건/◎범위/
   ◎데미지/◎쿨타임/◎코스트/◎지속시간…). A 90k-line map stays legible
   because the tooltip grammar is a schema, not prose — and schemas are
   LINTABLE. Cheap, high-leverage adoption for our fleet.
2. **Timed side-objectives that pay into the roll economy and punish
   with RESOURCE DENIAL**: "stop Wapol within 60s → +1 wisp, +1 lumber…
   on failure you receive no random wisp for 2 rounds; rounds 21–30
   only." Optional, windowed, self-balancing — and denying a future roll
   beats our wave-bonus designs.
3. **A shared boss HP pool that side-objectives chip**, granting +1
   gamble charge at rounds 6 and 9 — roll charges as a boss-clear reward.
4. **Six declared difficulties × orthogonal modes**, voted in lobby —
   difficulty as a first-class object, not a hidden multiplier.
5. **`-기여도` (contribution) — a permanent per-player metric inside a
   co-op team.** Our maps score the team; this scores YOU within it, an
   anti-freeloader surface for 4-player co-op.
6. **Verb census: ZERO combat-tempo typing** — all 16 chat commands are
   meta (reroll/story/scoreboard/vision/treasure/door/offline).
   **Gotcha 33 holds in the world's most-played WC3 map** — cite it there.

## Wave 5's deckbuilding "opening" — refined, not refuted

Wave 5 audited `덱빌딩: 0` and called seeded deckbuilding the strongest
opening. The **draft loop already exists** in Korean random-defense:
RATankD's own text — "spend 100 gold to draw a lowest-tier ability…
**three random abilities are offered and you choose one**", 300/600g
tiers, 500 lumber to ascend, abilities specified in engine terms; your
tank is **rebuilt after 10s** rather than dying. The genuinely open slot
is narrower and better: **draft-pick exists; a SEEDED draft does not.**
"Same offers, played better" (two lobbies, one Park-Miller seed) remains
ours alone. Bonus: that map's own description says it is a **hosted
regression-test map for the author's trigger engine** (overload /
diversity / stability tests) — our preflight doctrine, shipped as a
playable artifact.

## The maintainership finding — re-measured, with a correction [M]

Wave 5: KR authors ship EN builds and they die. Confirmed, worse than
reported: fods1030's KR line 2,547/mo vs his own EN build **3** (849×);
nsaworker 369 vs **1** (369×). **But KR→CN localization WORKS**: 20
CJK-titled groups in the live canon are Korean-authored and retain ~10%
of their KR line (escaco's tank defense: 29/mo CN vs 286 KR).
**The Korean scene has one working export channel and it points EAST**
— roughly 100× more effective than westward. Any "translate a KR map to
English" plan should carry that prior explicitly: ~0.1% retention unless
a Western MAINTAINER (not translator) adopts it — the Pumpkin TD pattern.

## Provenance hazards (KR-specific)

- **The `cheats` API field is unreliable and the cheat fork can BE the
  canonical build**: FOC Another (435984), **#5 Korean map at 2,480/mo**,
  has `path = "Cheat_FOCS Another…"`, `cheats = 0`, and a full `@`
  command set in its script (give gold, level up, duplicate, kick,
  delete replay). Meanwhile `cheats=1` fires on six maps with clean
  paths. Check BOTH.
- **`Cht` ≠ cheat** — it is 繁體中文 (`PlantFarm_0.53Cht.w3x` is a
  Traditional Chinese build).
- **The path oracle FAILS on KR localizations.** Three localizations in
  the sample were invisible to metadata; only the wts caught them. **New
  cheap oracle: grep the extracted wts for 한글화 / 한글판 / 번역 /
  원작자 / 한글패치 and for ASCII-English changelog blocks.** Only
  30/527 declare it in name/author/description.
- **The author field is spoofed**: live KR maps carry authors "Blizzard
  Entertainment" (×3), "알려지지 않음" (unknown, ×5), "developer",
  "TRIGSTR_004", "null", "未知". Wave 3's check-the-author rule degrades
  badly here.
- **ORDR fork ecology**: one group, four live path variants (base, `_EZ`
  easy-mode, `_RT` re-tune, `_solvit_v2` = the current #1 row), 168
  point-versions under one name spelling. **The map you download and the
  map the lobbies run are usually different files.** And storagebox
  **404s the hottest rows** (447715, 447696) — fall back down the list.

## Other steals

- **Hidden roster entries as advertised community content** — Soldier
  TD: "40 builders — 34 normal, **6 hidden** — 82 rounds, 202 towers";
  스킬사서막기: "hidden five, extreme five". The KR analogue of CN's
  隱藏英雄密碼 culture, *declared on the loading screen* to advertise
  the unknown. Cheap, sim-testable, drives walkthrough engagement.
- **컴까기 ("beat the comp") is a KR genre with no Western equivalent** —
  24 groups of co-op melee vs enhanced AI. S.Wizard's 33-map catalog
  ships w3i v33, 0.7MB, wtg present, AMAI 3.2.2 and near-zero custom
  content: **the map IS the AI script.** Nothing in our fleet has an AI
  opponent, and these are the cheapest artifacts to study.
- **Shared franchises across unrelated authors** (돈타워, 2005TD), like
  호성 — fork genealogy here is a forest with shared roots, never a line.

## Audited absent in Korean

Zero results for 재판 (trial), 사다리, 알바, 지하철, 심리, 방탈출,
경영, and 무궁화/달고나/오징어 (**the KR scene never made a Squid Game
map**). Hosted-DEAD (ghm=0): 술래잡기/얼음땡 (7), 경매 (3), 낚시 (7),
요리, 야구 (3), 축구 (3), 가위바위보, 숨바꼭질, 감옥 (3). The
Korean-life-simulator genre I expected by analogy to RU's Gomel/
Chelyabinsk **does not exist**. Also: m16tool.xyz is NOT a canon portal
(its GameList is 15 anime-RPGs); `/api/activity?range=month` 502s, only
24h works; `group=` is not a real search param.

## Toolkit findings

- **T1 — `lib/wts.js` SILENTLY CORRUPTS invalid-UTF-8 wts files.** Wave
  4 predicted a throw; it does not throw — it substitutes U+FFFD with no
  warning. 3 of 14 KR files affected; 무한맵 컴까기 loses **665**
  sequences, ORDR 5, FOC 1. **Root cause found**: every corruption sits
  inside a WE auto-generated trigger comment, where the editor truncates
  long Korean comments at a BYTE limit, cutting a UTF-8 sequence
  mid-character. A round-trip through our pipeline destroys those bytes
  permanently. Real data loss, not cosmetic — it will silently corrupt
  any KR translation pass. Fix shape: byte-preserving escape (the
  `_dialect` sidecar contract) + a WARN with a count. **QUEUED.**
- **T2 — backend divergence on a real map**: 빙판박치기 (166786, w3i
  v18) fails stormlib `ERR:1004` but **smpq extracts it fine**. A
  concrete reason the smpq fallback stays wired.
- **T3 — a protection technique neither backend beats**: 랜덤능력타워
  디펜스 II ships a **DECOY listfile** — plausible, real-looking paths
  whose files cannot be opened. Distinct from wave 1's 2-entry fake
  listfile; a candidate for lib/recover.js (hash-probe the union anyway
  rather than trusting listfile entries that fail to open).
- **T4 — hash-table stuffing** (hypothesis): ORDR's 65,533 = 2^16−3
  entries, 65,513 anonymous, in a 134MB archive.
- **T5 — no object-data failures**: the trailing-zero-dword codec parsed
  every v1/v2 file in this wave, including maps with 58,459 hangul in
  object data and one with no wts at all.
