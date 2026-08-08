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
