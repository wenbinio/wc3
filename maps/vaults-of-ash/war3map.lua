-- =========================================================================
-- The Vaults of Ash — war3map.lua (phase 3)
-- =========================================================================
-- A seeded one-session co-op roguelike for 1-3 players. The last
-- torchbearers of a burned monastic order descend the vault the order died
-- sealing: a hub and four floors of cliff-walled islands hanging in dark
-- void. Travel is trigger teleport only.
--
-- The run:
--   * HEROES (phase 3): three playable torchbearer kits — the Torchbearer
--     (default), the Ashblade (glass cannon with the innate Cinder Step
--     blink) and the Chorister (support with the trigger-driven Kindled
--     Chorus heal) — picked at the hub HERO PEDESTALS before the first
--     door (the covenant-altar pattern). Identity = hero x covenant x
--     sigil path (IdentityCount = 60).
--   * FLOOR GUARDIANS (phase 3; Ulfsire's Guardian promotion +
--     exit-from-corpse, credited): every room entered through a real door
--     is warded by a Guardian from a seeded 6-pool (no replacement across
--     the run), affixed, floor/party-scaled, each with one scripted
--     signature behavior. The descent door SPAWNS AT ITS CORPSE.
--   * INTERIOR VARIANTS (phase 3): each of the 20 templates carries 3
--     authored interior variants (obstacle arrangements from a 6-key
--     library, seeded jitter) — 60 interiors; two seeds provably differ.
--   * COVENANTS: before the first door each player may swear ONE covenant
--     at the hub altars — an explicit reward and an explicit price, both
--     printed on selection (Cinders / Stillness / Sealed; the fourth altar,
--     the Unbound, opens only to a vow phrase earned by mastery — a
--     knowledge code in the Roguelike 2.6 tradition, credit DeathdruidX).
--   * FLOORS 1-3: each floor deals 3 of its authored room TEMPLATES (20
--     across the run, seeded without replacement) onto 3 of its 4 islands.
--     The Omen Obelisks read each door: danger, reward — and with Insight,
--     exact creep counts and reward previews. Rooms run LOCKED -> ACTIVE ->
--     CLEARED with three objective kinds: kill-all, survive, guarded
--     reliquary. Clearing pays Embers (40/60/80 by danger).
--   * TRIAL DOORS (adapted from Just Another Roguelike's risk contracts,
--     credit PortusM): on 1-2 seeded floors a fourth door opens — a Trial
--     with an announced debuff for that room and a permanent party buff
--     (plus +1 Insight) on clear. Decline by simply taking a normal door.
--   * BOONS: a boon reward deals sigil-marked boons onto the hub pedestals
--     (3-take-1; 30 boons, 3 rarities, 6 build-around epics). Every boon
--     carries one of 5 SIGILS (Ash/Storm/Blood/Void/Light); holding 2/3 of
--     a sigil grants an ANNOUNCED set bonus — every tooltip states the
--     sigil and both thresholds, and -sigils prints the party's counts
--     (adapted from Ulfsire's Roguelike's build-grid, with its opacity
--     fixed: LEGIBLE synergy is the differentiator). Pity is structural:
--     drafts never offer boons the party already holds, and every deal
--     guarantees at least one never-yet-offered boon while any remain.
--   * WRATH (adapted from Roguelike 2.6's Sin ambush, credit DeathdruidX,
--     telegraphed): fast clears build Wrath, announced at 50/75/100%. At
--     100% an Ash Revenant ambushes at the NEXT room — announced one room
--     ahead, so the party can slow down or embrace it. Slaying the
--     Revenant always pays a rare boon (epic with Emberlord's Covenant).
--   * CAMPFIRE: after every 3rd cleared room the Ashen Shrine lights.
--     Rune plates: heal, boon reroll, fortify, and REKINDLE (revive the
--     fallen at once). Purchases are TRIGGER-owned (embers deducted by
--     SetPlayerState, effects applied by natives) so the exact same code
--     path runs in the game and in lib/sim. Insight 3+ improves the stock.
--   * DEATH: a fallen torchbearer is rekindled at 50% life when the party
--     clears its next landing (the escape-revive pattern from Ulfsire's
--     Roguelike, credited) — or immediately via the shrine's Rekindle
--     plate. Only a FULL party wipe ends the run, and defeat is always
--     handled with a summary.
--   * VAULT'S BREATH: every 90s all uncleared content gains +2% damage
--     (stacking, announced with sound).
--   * BOSS: the Vault Heart, 3 phases, with one of 2 seeded add-patterns
--     (announced on entry). At its final phase it FEEDS ON HOARDED EMBERS:
--     bonus damage scaled by the party's unspent pool, announced at phase
--     start and inscribed on the hub door frames (the shopkeeper-greed
--     pattern from Roguelike 2.6, credited, telegraphed). Boss dead =
--     victory; a flawless (or wrath-embracing) victory whispers the vow
--     phrase that unlocks the fourth altar in ANY future run.
--   * SEED: ALL randomness flows through one Park-Miller PRNG seeded by
--     '-seed N' (before any covenant or door) or DEFAULT_SEED.
--     math.random / GetRandomInt are never used, so the game and the
--     headless sim replay identically.
--
-- Object types, regions and sounds are referenced through the GENERATED
-- named constants (UNIT_*/ITEM_*/ABIL_*/REGION_*/SOUND_*) that build-map
-- prepends to the packed script from the map-source JSON — never hand-typed
-- FourCC literals (CLAUDE.md gotcha 27; index: constants.json).
--
-- Chat commands: -help, -sigils, -vow <word>, -seed N (before any covenant
-- or door); '-test' toggles debug gating: -floor N, -room <obj> [danger],
-- -embers N, -boon, -clear, -boss, -god, -ff, -runlog, -wrath N,
-- -insight N, -grant <boonkey>, -covenant <key>, -trial.
--
-- info.json has scriptLanguage = 1 (Lua); the game calls config() in the
-- lobby and main() on map start.
-- =========================================================================

-- ------------------------------------------------------------------ tuning
local MAX_PLAYERS      = 3
local DEFAULT_SEED     = 20260711 -- lobby-visible: printed in the map description
local START_STR        = 18
local START_AGI        = 14
local START_INT        = 16
local BASE_MS          = 320     -- Torchbearer umvs (object data)
local EMBER_BASE       = 20      -- clear pay = EMBER_BASE + 20 * danger (40/60/80)
local EMBER_PER_DANGER = 20
local REWARD_EMBERS    = 40      -- the 'embers' reward bonus
local COST_HEAL        = 60
local COST_REROLL      = 40
local COST_FORTIFY     = 75
local COST_REKINDLE    = 120
local FORTIFY_HP       = 100
local CAMPFIRE_EVERY   = 3       -- shrine lights after every 3rd cleared room
local BREATH_PERIOD    = 90.0    -- Vault's Breath cadence
local BREATH_PCT       = 2       -- +2% damage per stack
local SURVIVE_TIME     = 60      -- survive-objective duration (seconds)
local TRICKLE_EVERY    = 20      -- survive-objective reinforcement cadence
local SCALE_PER_EXTRA  = 1.6     -- spawn counts x1.6 per extra player (ceil)
local BOSS_PHASE2_AT   = 0.80    -- health ratios
local BOSS_PHASE3_AT   = 0.40
local FF_SCALE         = 4       -- -ff clock multiplier
local WRATH_FAST       = 45      -- clear in <= this many seconds: fast
local WRATH_SLOW       = 75      -- clear in <= this: measured; beyond: slow
local WRATH_GAIN       = { fast = 40, mid = 20, slow = 5, survive = 15 }
local TRIAL_CHANCE     = 0.45    -- per-floor trial-door roll (1-2 guaranteed)
local FEAST_PER_EMBERS = 10      -- boss phase 3: +1 damage per 10 unspent embers
local VOW_PHRASE       = "emberoath" -- the knowledge code (earned in-game)
local CHORUS_PERIOD    = 10      -- Kindled Chorus (Chorister innate) cadence
local CHORUS_HEAL      = 20      -- ... heal per tick
local CHORUS_RANGE     = 700     -- ... radius around the Chorister
local GUARDIAN_SIPHON  = 15      -- Void Curator: embers curated per pulse
local GUARDIAN_DRAIN   = 20      -- Blood Provost: life tithed per hero per pulse
local GUARDIAN_PULSE   = 25      -- Gale Matriarch: life torn per hero per shriek

-- -------------------------------------------------------------- game state
local DOOR_LETTERS = { "A", "B", "C" }

local users        = {}    -- seated human pids, in slot order
local numPlayers   = 1
local heroes       = {}    -- pid -> the player's hero (any of the 3 kinds)
local heroKindOf   = {}    -- pid -> hero kind key ("torch" default)
local testMode     = {}    -- pid -> bool
local clockScale   = 1
local gameOver     = false
local firstDoor    = false -- true once any door has been entered
local covenantSworn = false -- true once any covenant is chosen (-seed lock)

local floorNum     = 1     -- current floor (1..3, then 4 = Vault Gate)
local roomsCleared = 0
local embersPool   = 0
local embersEarned = 0
local boonsTaken   = {}    -- list of boon names, in take order

local doorsArmed   = false
local doorDeal     = nil   -- door idx -> {island, template, danger, reward, offer?, relic?}
local doorTags     = {}    -- door idx (1..3, 4 = trial) -> texttag handle
local lastIslandOrder = nil
local lastTemplateOrder = nil

local roomState    = "idle"   -- idle | active
local activeRoom   = nil      -- {floor, island, template, danger, reward, region, trial?}
local activeUnits  = {}       -- array of spawned unit handles
local activeSet    = {}       -- unit handle -> per-unit spec clone
local remaining    = 0
local surviveLeft  = 0
local trickleLeft  = 0
local roomClock    = 0        -- seconds the current room has been active

local draftActive  = false
local draftOffer   = nil   -- array of BOON_TABLE entries on the pedestals
local draftItems   = {}    -- plate idx -> item handle
local draftFloorRarity = nil -- rarity floor of the ACTIVE draft (reroll keeps it)
local pendingDrafts = {}   -- queue of {offer=stored entries|nil, floor=rarity|nil}
local boonTaken    = {}    -- boon key -> true once claimed
local boonSeen     = {}    -- boon key -> true once ever OFFERED (pity pool)

local shrineLit    = false
local shrineUsed   = {}    -- plate key -> true once bought this lighting

local breathLeft   = BREATH_PERIOD
local breathStacks = 0

local wrath        = 0     -- 0..100
local wrathPeak    = 0
local revenantArmed = false
local revenantUnit = nil
local revenantSlain = false

local insight      = 0
local trialOffer   = nil   -- {floor, island, template, contract}
local trialsOffered = 0
local trialsCleared = 0

local covenantOf   = {}    -- pid -> covenant key
local unboundUnlocked = false

local deaths       = 0     -- hero deaths this run
local pendingRevive = {}   -- pid -> true (rekindled on next cleared landing)

local sigilApplied = {}    -- "ash2" etc -> true once the set bonus landed
local epicFlags    = {}    -- flag key -> true (build-around epics)
local partyMs      = 0     -- party-wide move-speed bonus
local heroMs       = {}    -- pid -> personal move-speed bonus

local bossActive   = false
local bossUnit     = nil
local bossPhase    = 0
local bossPattern  = nil
local bossFeast    = 0
local gateArmed    = false

local chorusLeft   = CHORUS_PERIOD -- Kindled Chorus tick countdown
local guardianOrder = nil  -- seeded shuffle of the 6-guardian pool (lazy)
local guardian     = nil   -- active Floor Guardian bookkeeping
local guardiansSlain = 0
local obstacles    = {}    -- interior-variant obstacle units (per room)

-- exposed for the headless sim / -runlog (plain globals, sim.global reads them)
RUNLOG = ""
RunSeed = DEFAULT_SEED
VaultBreathStacks = 0
WrathMeter = 0
InsightLevel = 0
TrialsCleared = 0
DeathsCount = 0
TemplateIndex = "" -- built at load: every template key, per floor
VariantIndex = ""  -- built at load: every template's 3 interior-variant keys
IdentityCount = 0  -- built at load: hero kinds x covenants x sigil paths
GuardiansSlain = 0

-- sounds (created in InitSounds from the same paths sounds.json declares)
local sndSealChime, sndBreathHorn, sndVictoryHorn = nil, nil, nil

-- ---------------------------------------------------------------- the PRNG
-- Park-Miller "minimal standard" LCG (Lehmer, via Schrage's algorithm):
-- the ONLY source of randomness in this map, seeded by -seed N or
-- DEFAULT_SEED. Schrage keeps every intermediate below 2^31, so the
-- sequence is bit-identical under the game's 64-bit Lua integers AND
-- fengari's 32-bit integers (the headless sim) — bitwise xorshift is NOT
-- portable across those widths, this is.
local rngState = 1

function SeedRNG(n)
  rngState = (n % 2147483646) + 1 -- [1, 2147483646]
end

function NextRand() -- (0, 1)
  local hi = rngState // 127773
  local lo = rngState % 127773
  rngState = 16807 * lo - 2836 * hi
  if rngState <= 0 then rngState = rngState + 2147483647 end
  return rngState / 2147483647.0
end

function RandInt(lo, hi) -- inclusive
  return lo + math.floor(NextRand() * (hi - lo + 1))
end

function ShuffledIndices(n) -- seeded Fisher-Yates over 1..n
  local a = {}
  for i = 1, n do a[i] = i end
  for i = n, 2, -1 do
    local j = RandInt(1, i)
    a[i], a[j] = a[j], a[i]
  end
  return a
end

-- ----------------------------------------------------------------- helpers

function LogRun(line)
  RUNLOG = RUNLOG .. line .. "\n"
end

function PlayingUser(pid)
  local p = Player(pid)
  return GetPlayerSlotState(p) == PLAYER_SLOT_STATE_PLAYING
    and GetPlayerController(p) == MAP_CONTROL_USER
end

function AnnounceAll(msg)
  for _, pid in ipairs(users) do
    DisplayTextToPlayer(Player(pid), 0, 0, msg)
  end
end

function AnnounceTimedAll(dur, msg)
  for _, pid in ipairs(users) do
    DisplayTimedTextToPlayer(Player(pid), 0, 0, dur, msg)
  end
end

function Tell(pid, msg)
  DisplayTimedTextToPlayer(Player(pid), 0, 0, 8.0, msg)
end

function After(delay, fn)
  local t = CreateTimer()
  TimerStart(t, delay, false, function()
    DestroyTimer(t)
    fn()
  end)
end

function Alive(u)
  return u ~= nil and GetWidgetLife(u) > 0.405
end

function RegionCenter(R)
  return (R.minX + R.maxX) / 2.0, (R.minY + R.maxY) / 2.0
end

-- embers: one SHARED party pool, mirrored into every seated player's gold
function SyncEmbers()
  for _, pid in ipairs(users) do
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, embersPool)
  end
end

function AddEmbers(n)
  embersPool = embersPool + n
  if n > 0 then embersEarned = embersEarned + n end
  SyncEmbers()
end

function SpendEmbers(n)
  if embersPool < n then return false end
  embersPool = embersPool - n
  SyncEmbers()
  return true
end

function ForEachHero(fn)
  for _, pid in ipairs(users) do
    if heroes[pid] ~= nil then fn(heroes[pid], pid) end
  end
end

function AnyHeroAlive()
  local found = false
  ForEachHero(function(h) if Alive(h) then found = true end end)
  return found
end

function HeroPid(u)
  for _, pid in ipairs(users) do
    if heroes[pid] == u then return pid end
  end
  return nil
end

function TeleportParty(x, y)
  local i = 0
  ForEachHero(function(h)
    if Alive(h) then
      SetUnitPosition(h, x + (i - 1) * 128.0, y)
      i = i + 1
    end
  end)
end

-- spawn counts: x1.6 per extra player, rounded up
function ScaleCount(base)
  return math.ceil(base * (SCALE_PER_EXTRA ^ (numPlayers - 1)))
end

-- party-wide stat helpers (sigil sets, relics, covenants, epics)
function PartyStats(str, agi, int)
  ForEachHero(function(h)
    if str ~= 0 then SetHeroStr(h, GetHeroStr(h, false) + str, true) end
    if agi ~= 0 then SetHeroAgi(h, GetHeroAgi(h, false) + agi, true) end
    if int ~= 0 then SetHeroInt(h, GetHeroInt(h, false) + int, true) end
  end)
end

function PartyMaxLife(n)
  ForEachHero(function(h)
    SetUnitState(h, UNIT_STATE_MAX_LIFE, GetUnitState(h, UNIT_STATE_MAX_LIFE) + n)
    SetUnitState(h, UNIT_STATE_LIFE, GetUnitState(h, UNIT_STATE_LIFE) + n)
  end)
end

function PartyHealPct(pct)
  ForEachHero(function(h)
    if Alive(h) then
      local maxhp = GetUnitState(h, UNIT_STATE_MAX_LIFE)
      SetUnitState(h, UNIT_STATE_LIFE, GetUnitState(h, UNIT_STATE_LIFE) + maxhp * pct)
    end
  end)
end

function ReapplyMoveSpeed()
  ForEachHero(function(h, pid)
    SetUnitMoveSpeed(h, HeroBaseMs(pid) + partyMs + (heroMs[pid] or 0))
  end)
end

function AddPartyMs(n)
  partyMs = partyMs + n
  ReapplyMoveSpeed()
end

-- per-room entry camera beat
function CameraBeat(x, y)
  for _, pid in ipairs(users) do
    local p = Player(pid)
    PanCameraToTimedForPlayer(p, x, y, 0.0)
    SetCameraFieldForPlayer(p, CAMERA_FIELD_TARGET_DISTANCE, 3600.0, 0.5)
    SetCameraFieldForPlayer(p, CAMERA_FIELD_ANGLE_OF_ATTACK, 325.0, 0.5)
  end
  After(2.2, function()
    if gameOver then return end
    for _, pid in ipairs(users) do
      ResetToGameCameraForPlayer(Player(pid), 1.0)
    end
  end)
end

-- ----------------------------------------------------- data: rooms & creeps
-- built at load time from the generated constants (the block build-map
-- prepends sits above this script, so the globals already exist here)

-- the three playable torchbearer kits (phase 3): distinct object-data kits,
-- chosen at the hub hero pedestals BEFORE the first door (same pattern as
-- the covenant altars); the party defaults to the Torchbearer. Run identity
-- = hero kind x covenant x sigil path (IdentityCount, below).
local HERO_KINDS = {
  torch = { type = UNIT_TORCHBEARER, name = "Torchbearer", ms = BASE_MS,
    str = START_STR, agi = START_AGI, int = START_INT,
    kit = "the steady flame -- balanced arms, 650 life" },
  ashblade = { type = UNIT_ASHBLADE, name = "Ashblade", ms = 350,
    str = 14, agi = 22, int = 12,
    kit = "the glass cannon -- faster and far deadlier, only 520 life; innate CINDER STEP (a 600-range blink, 9s cooldown)" },
  chorister = { type = UNIT_CHORISTER, name = "Chorister", ms = 300,
    str = 16, agi = 10, int = 22,
    kit = "the choir's last voice -- 780 life but weak in arms; innate KINDLED CHORUS (mends every torchbearer within "
      .. CHORUS_RANGE .. " range for " .. CHORUS_HEAL .. " life every " .. CHORUS_PERIOD .. "s, announced)" },
}
local HERO_ORDER = { "torch", "ashblade", "chorister" }

function HeroBaseMs(pid)
  return HERO_KINDS[heroKindOf[pid] or "torch"].ms
end

local ROOMS = {
  { REGION_ROOM_F1_A, REGION_ROOM_F1_B, REGION_ROOM_F1_C, REGION_ROOM_F1_D },
  { REGION_ROOM_F2_A, REGION_ROOM_F2_B, REGION_ROOM_F2_C, REGION_ROOM_F2_D },
  { REGION_ROOM_F3_A, REGION_ROOM_F3_B, REGION_ROOM_F3_C, REGION_ROOM_F3_D },
}
local ROOM_KEYS = {
  { "F1A", "F1B", "F1C", "F1D" },
  { "F2A", "F2B", "F2C", "F2D" },
  { "F3A", "F3B", "F3C", "F3D" },
}

-- the enemy roster: 20 creep types in three floor tiers; dmg feeds Vault's
-- Breath scaling (base damage is assigned at spawn via BlzSetUnitBaseDamage)
local TIER_CREEPS = {
  { -- floor 1 (6)
    { type = UNIT_ASHSPAWN_ACOLYTE, name = "Ashspawn Acolyte", dmg = 11 },
    { type = UNIT_VAULT_KOBOLD, name = "Vault Kobold", dmg = 9 },
    { type = UNIT_KINDLING_WHELP, name = "Kindling Whelp", dmg = 8 },
    { type = UNIT_SOOTFANG_PUP, name = "Sootfang Pup", dmg = 10 },
    { type = UNIT_CINDER_ZEALOT, name = "Cinder Zealot", dmg = 12 },
    { type = UNIT_VAULTBONE_ARCHER, name = "Vaultbone Archer", dmg = 12 },
  },
  { -- floor 2 (7)
    { type = UNIT_CINDER_BRUTE, name = "Cinder Brute", dmg = 19 },
    { type = UNIT_ASH_TIDE_CRAWLER, name = "Ash Tide Crawler", dmg = 15 },
    { type = UNIT_EMBERBOUND_MARAUDER, name = "Emberbound Marauder", dmg = 17 },
    { type = UNIT_VAULT_GEOMANCER, name = "Vault Geomancer", dmg = 16 },
    { type = UNIT_SOOTVEIL_STALKER, name = "Sootveil Stalker", dmg = 18 },
    { type = UNIT_CHAINED_HOWLER, name = "Chained Howler", dmg = 17 },
    { type = UNIT_GRAVE_WARDEN, name = "Grave Warden", dmg = 20 },
  },
  { -- floor 3 (7)
    { type = UNIT_VAULTBOUND_OGRE, name = "Vaultbound Ogre", dmg = 26 },
    { type = UNIT_EMBERFANG_ALPHA, name = "Emberfang Alpha", dmg = 22 },
    { type = UNIT_PYREBLADE_ENFORCER, name = "Pyreblade Enforcer", dmg = 24 },
    { type = UNIT_VAULT_HEXER, name = "Vault Hexer", dmg = 21 },
    { type = UNIT_CINDERWING_HARPY, name = "Cinderwing Harpy", dmg = 20 },
    { type = UNIT_DEEP_VAULT_MAULER, name = "Deep Vault Mauler", dmg = 28 },
    { type = UNIT_TWICE_BURNED_ZEALOT, name = "Twice-Burned Zealot", dmg = 23 },
  },
}
-- elites: two per tier, spawned behind three-skull doors with a seeded affix
local TIER_ELITES = {
  { { type = UNIT_PYRE_WARDEN, name = "Pyre Warden", dmg = 32 },
    { type = UNIT_KINDLED_OVERSEER, name = "Kindled Overseer", dmg = 28 } },
  { { type = UNIT_ASHEN_CHAMPION, name = "Ashen Champion", dmg = 30 },
    { type = UNIT_SOOTBLADE_ASSASSIN, name = "Sootblade Assassin", dmg = 33 } },
  { { type = UNIT_EMBERLORD_MAULER, name = "Emberlord Mauler", dmg = 42 },
    { type = UNIT_DOOMCINDER_BERSERKER, name = "Doomcinder Berserker", dmg = 38 } },
}
-- FLOOR GUARDIANS (phase 3; adapted from Ulfsire's Roguelike's Guardian
-- promotion + exit-from-corpse, credited): a 6-pool of themed mid-bosses,
-- one per creep tier pair. Every room entered through a REAL door is warded
-- by the floor's Guardian — seeded from the pool without replacement, always
-- carrying a seeded affix, stats scaled by floor and party size, one
-- scripted signature behavior each. The floor's descent door SPAWNS AT THE
-- GUARDIAN'S CORPSE. (Debug '-room' chambers stay bare test rooms.)
local GUARDIANS = {
  { key = "bone", name = "Bone Warden", type = UNIT_BONE_WARDEN, dmg = 30, sig = "summon",
    sigDesc = "at half life it calls 2 vault-born from the ossuary" },
  { key = "gale", name = "Gale Matriarch", type = UNIT_GALE_MATRIARCH, dmg = 26, sig = "pulse",
    sigDesc = "every 15s her shriek tears " .. GUARDIAN_PULSE .. " life from every torchbearer in the room (never below 1)" },
  { key = "blood", name = "Blood Provost", type = UNIT_BLOOD_PROVOST, dmg = 28, sig = "drain",
    sigDesc = "every 20s it tithes " .. GUARDIAN_DRAIN .. " life from each torchbearer and drinks the sum" },
  { key = "void", name = "Void Curator", type = UNIT_VOID_CURATOR, dmg = 25, sig = "siphon",
    sigDesc = "every 20s it curates " .. GUARDIAN_SIPHON .. " Embers out of the party pool" },
  { key = "pyre", name = "Pyre Sentinel", type = UNIT_PYRE_SENTINEL, dmg = 32, sig = "enrage",
    sigDesc = "below a quarter life it ignites: +60% damage" },
  { key = "hollow", name = "Hollow King", type = UNIT_HOLLOW_KING, dmg = 34, sig = "mantle",
    sigDesc = "at half life it dons the wrathfire mantle (a heavier slam) and knits a quarter of its wounds" },
}

local REVENANT_SPEC = { type = UNIT_ASH_REVENANT, name = "Ash Revenant", dmg = 45 }
local BOSS_SPEC = { type = UNIT_VAULT_HEART, name = "Vault Heart", dmg = 55 }
local ADD_SPECS = {
  spark = { type = UNIT_HEART_SPARK, name = "Heart Spark", dmg = 7 },
  shard = { type = UNIT_MOLTEN_SHARD, name = "Molten Shard", dmg = 12 },
}

-- elite affixes (adapted from Ulfsire's Roguelike's prime modifiers,
-- credited): seeded, one per elite, announced by full name on spawn
local AFFIXES = {
  { key = "burning", name = "Burning", desc = "+25% damage", dmgMult = 1.25 },
  { key = "shielded", name = "Shielded", desc = "+40% life", hpMult = 1.4 },
  { key = "swift", name = "Swift", desc = "+60 move speed", ms = 60 },
  { key = "volatile", name = "Volatile", desc = "bursts on death: 2 vault-born erupt from the corpse" },
  { key = "vampiric", name = "Vampiric", desc = "drinks 8% life whenever another vault-born dies" },
  { key = "ashveiled", name = "Ashveiled", desc = "evasion" },
}

-- boss add-patterns: one of two, seeded and ANNOUNCED at the gate
local BOSS_PATTERNS = {
  { name = "Spark Swarm", p2 = { ref = "spark", n = 3, pat = "scatter" },
    p3 = { ref = "shard", n = 2, pat = "scatter" } },
  { name = "Shard Ring", p2 = { ref = "spark", n = 2, pat = "scatter" },
    p3 = { ref = "shard", n = 4, pat = "ring" } },
}

-- ------------------------------------------------- data: 20 room templates
-- Authored prefab rooms. comp: {c=creep index in TIER_CREEPS[floor],
-- base, per} -> ScaleCount(base + per*(danger-1)) spawns per entry.
-- trickle: creep indices cycled by survive reinforcements.
-- pattern: scatter | ring | corners | line | packs (seeded placement).
-- variants: each template's 3 seeded INTERIOR VARIANTS (phase 3) — keys
-- into ARRANGEMENTS below; one is drawn per real-door room and its
-- obstacle layout spawned with seeded jitter (2 runs on different seeds
-- provably differ). 20 templates x 3 variants = 60 authored interiors.
local TEMPLATES = {
  { -- floor 1 (7)
    { key = "KILN", name = "The Cold Kiln", obj = "killall", pattern = "scatter",
      variants = { "colonnade", "rubble", "braziers" },
      comp = { { c = 1, base = 2, per = 1 }, { c = 2, base = 2, per = 1 } } },
    { key = "WARREN", name = "Kobold Warren", obj = "killall", pattern = "packs",
      variants = { "cairns", "rubble", "walls" },
      comp = { { c = 2, base = 3, per = 1 }, { c = 3, base = 2, per = 1 } } },
    { key = "PROCESSION", name = "Ashen Procession", obj = "killall", pattern = "line",
      variants = { "braziers", "colonnade", "walls" },
      comp = { { c = 1, base = 3, per = 1 }, { c = 5, base = 1, per = 1 } } },
    { key = "HOWLPIT", name = "The Howlpit", obj = "survive", pattern = "scatter",
      variants = { "cairns", "ossuary", "rubble" },
      comp = { { c = 4, base = 2, per = 1 } }, trickle = { 4, 3 } },
    { key = "BONEGALLERY", name = "Bone Gallery", obj = "killall", pattern = "ring",
      variants = { "ossuary", "colonnade", "cairns" },
      comp = { { c = 6, base = 2, per = 1 }, { c = 2, base = 2, per = 0 } } },
    { key = "RELICNICHE", name = "Reliquary Niche", obj = "reliquary", pattern = "corners",
      variants = { "braziers", "walls", "ossuary" },
      comp = { { c = 1, base = 2, per = 1 }, { c = 5, base = 1, per = 1 } } },
    { key = "EMBERCRECHE", name = "Ember Creche", obj = "survive", pattern = "corners",
      variants = { "rubble", "braziers", "cairns" },
      comp = { { c = 3, base = 3, per = 1 } }, trickle = { 5, 3 } },
  },
  { -- floor 2 (7)
    { key = "BRUTEHALL", name = "Brutehall", obj = "killall", pattern = "scatter",
      variants = { "walls", "colonnade", "rubble" },
      comp = { { c = 1, base = 2, per = 1 }, { c = 2, base = 2, per = 1 } } },
    { key = "TOLLROAD", name = "The Toll Road", obj = "killall", pattern = "line",
      variants = { "braziers", "walls", "cairns" },
      comp = { { c = 3, base = 2, per = 1 }, { c = 5, base = 2, per = 0 } } },
    { key = "GEOMANCY", name = "Geomancer Circle", obj = "killall", pattern = "ring",
      variants = { "colonnade", "ossuary", "braziers" },
      comp = { { c = 4, base = 2, per = 1 }, { c = 1, base = 1, per = 1 } } },
    { key = "HOWLINGDARK", name = "The Howling Dark", obj = "survive", pattern = "scatter",
      variants = { "rubble", "cairns", "ossuary" },
      comp = { { c = 6, base = 2, per = 1 } }, trickle = { 6, 5 } },
    { key = "GRAVEWATCH", name = "Gravewatch", obj = "reliquary", pattern = "corners",
      variants = { "ossuary", "walls", "colonnade" },
      comp = { { c = 7, base = 2, per = 1 }, { c = 2, base = 2, per = 0 } } },
    { key = "SMUGGLERS", name = "Smugglers Cache", obj = "reliquary", pattern = "corners",
      variants = { "cairns", "rubble", "walls" },
      comp = { { c = 3, base = 3, per = 1 } } },
    { key = "TIDEWALK", name = "Ash Tide Walk", obj = "survive", pattern = "scatter",
      variants = { "walls", "braziers", "rubble" },
      comp = { { c = 2, base = 3, per = 1 } }, trickle = { 2, 1 } },
  },
  { -- floor 3 (6)
    { key = "OGREDEPTHS", name = "Ogre Depths", obj = "killall", pattern = "scatter",
      variants = { "cairns", "walls", "ossuary" },
      comp = { { c = 1, base = 2, per = 1 }, { c = 6, base = 1, per = 1 } } },
    { key = "PYREGUARD", name = "The Pyre Guard", obj = "killall", pattern = "line",
      variants = { "braziers", "colonnade", "rubble" },
      comp = { { c = 3, base = 2, per = 1 }, { c = 7, base = 2, per = 0 } } },
    { key = "HEXGALLERY", name = "Hex Gallery", obj = "killall", pattern = "ring",
      variants = { "colonnade", "braziers", "ossuary" },
      comp = { { c = 4, base = 2, per = 1 }, { c = 5, base = 2, per = 1 } } },
    { key = "LASTHUNT", name = "The Last Hunt", obj = "survive", pattern = "scatter",
      variants = { "rubble", "ossuary", "cairns" },
      comp = { { c = 2, base = 3, per = 1 } }, trickle = { 5, 2 } },
    { key = "SEALVAULT", name = "The Sealed Vault", obj = "reliquary", pattern = "corners",
      variants = { "walls", "ossuary", "braziers" },
      comp = { { c = 7, base = 2, per = 1 }, { c = 1, base = 1, per = 1 } } },
    { key = "CINDERSTORM", name = "Cinderstorm", obj = "survive", pattern = "corners",
      variants = { "rubble", "colonnade", "cairns" },
      comp = { { c = 5, base = 2, per = 1 }, { c = 3, base = 1, per = 1 } }, trickle = { 3 } },
  },
}

-- the interior-arrangement library the template variants draw from: each
-- key is an obstacle/decor layout spawned at room activation with seeded
-- jitter (braziers use the Ember Brazier prop, everything else Vault Rubble)
local ARRANGEMENTS = {
  colonnade = { n = 4, desc = "A shattered colonnade rings the fight" },
  cairns    = { n = 2, desc = "Twin rubble cairns split the floor" },
  braziers  = { n = 3, desc = "A line of cold braziers crosses the room" },
  rubble    = { n = 6, desc = "A rubble field chokes the approaches" },
  walls     = { n = 4, desc = "Two fallen walls funnel the fight" },
  ossuary   = { n = 5, desc = "Bone-heap mounds crowd the seal" },
}

do
  local parts = {}
  for f = 1, 3 do
    local keys = {}
    for _, t in ipairs(TEMPLATES[f]) do keys[#keys + 1] = t.key end
    parts[f] = "F" .. f .. ":" .. table.concat(keys, ",")
  end
  TemplateIndex = table.concat(parts, ";")
  local vparts = {}
  for f = 1, 3 do
    for _, t in ipairs(TEMPLATES[f]) do
      vparts[#vparts + 1] = t.key .. "=" .. table.concat(t.variants, ",")
    end
  end
  VariantIndex = table.concat(vparts, ";")
end

-- ------------------------------------------------------ data: the boon table
-- 30 boons, 3 rarities (14 common / 10 rare / 6 build-around epics), each
-- carrying one of the 5 sigils. effects is a list; kinds: stat/maxhp/
-- allstats/ability/ms/insight/embers/healpct/flag. Tooltips in
-- objects-items.json state rarity + sigil + BOTH set thresholds.
local BOON_TABLE = {
  -- ASH (6)
  { key = "str", name = "Ember Sinew", item = ITEM_EMBER_SINEW, rarity = "common", sigil = "Ash",
    effects = { { kind = "stat", stat = "str", amount = 6 } } },
  { key = "soothide", name = "Sootward Hide", item = ITEM_SOOTWARD_HIDE, rarity = "common", sigil = "Ash",
    effects = { { kind = "maxhp", amount = 120 } } },
  { key = "evasion", name = "Cinderguard", item = ITEM_CINDERGUARD, rarity = "rare", sigil = "Ash",
    effects = { { kind = "ability", abil = ABIL_CINDERGUARD_EVASION } } },
  { key = "bash", name = "Ashbreaker", item = ITEM_ASHBREAKER, rarity = "rare", sigil = "Ash",
    effects = { { kind = "ability", abil = ABIL_ASHBREAKER_BASH } } },
  { key = "ashbrand", name = "Ashfather's Brand", item = ITEM_ASHFATHER_S_BRAND, rarity = "epic", sigil = "Ash",
    effects = { { kind = "flag", flag = "ashbrand" } } },
  { key = "embercov", name = "Emberlord's Covenant", item = ITEM_EMBERLORD_S_COVENANT, rarity = "epic", sigil = "Ash",
    effects = { { kind = "flag", flag = "embercov" } } },
  -- STORM (6)
  { key = "agi", name = "Ashen Grace", item = ITEM_ASHEN_GRACE, rarity = "common", sigil = "Storm",
    effects = { { kind = "stat", stat = "agi", amount = 6 } } },
  { key = "stormstep", name = "Stormstep", item = ITEM_STORMSTEP, rarity = "common", sigil = "Storm",
    effects = { { kind = "ms", amount = 25 } } },
  { key = "skyreflex", name = "Skyward Reflex", item = ITEM_SKYWARD_REFLEX, rarity = "common", sigil = "Storm",
    effects = { { kind = "stat", stat = "agi", amount = 4 }, { kind = "ms", amount = 10 } } },
  { key = "crit", name = "Emberedge", item = ITEM_EMBEREDGE, rarity = "rare", sigil = "Storm",
    effects = { { kind = "ability", abil = ABIL_EMBEREDGE_STRIKE } } },
  { key = "tempest", name = "Tempest Brand", item = ITEM_TEMPEST_BRAND, rarity = "rare", sigil = "Storm",
    effects = { { kind = "stat", stat = "agi", amount = 8 }, { kind = "stat", stat = "int", amount = 4 } } },
  { key = "stormcore", name = "Stormheart Core", item = ITEM_STORMHEART_CORE, rarity = "epic", sigil = "Storm",
    effects = { { kind = "flag", flag = "stormcore" } } },
  -- BLOOD (6)
  { key = "hp", name = "Torchbearer Vigor", item = ITEM_TORCHBEARER_VIGOR, rarity = "common", sigil = "Blood",
    effects = { { kind = "maxhp", amount = 150 } } },
  { key = "bloodwarmth", name = "Bloodwarmth", item = ITEM_BLOODWARMTH, rarity = "common", sigil = "Blood",
    effects = { { kind = "maxhp", amount = 80 }, { kind = "stat", stat = "str", amount = 3 } } },
  { key = "redvigil", name = "Red Vigil", item = ITEM_RED_VIGIL, rarity = "common", sigil = "Blood",
    effects = { { kind = "stat", stat = "str", amount = 5 }, { kind = "healpct", pct = 0.5 } } },
  { key = "butcher", name = "Butcher's Rhythm", item = ITEM_BUTCHER_S_RHYTHM, rarity = "rare", sigil = "Blood",
    effects = { { kind = "stat", stat = "str", amount = 10 } } },
  { key = "vein", name = "Vein of the Vault", item = ITEM_VEIN_OF_THE_VAULT, rarity = "rare", sigil = "Blood",
    effects = { { kind = "maxhp", amount = 250 } } },
  { key = "bloodpact", name = "Bloodtithe Pact", item = ITEM_BLOODTITHE_PACT, rarity = "epic", sigil = "Blood",
    effects = { { kind = "flag", flag = "bloodpact" } } },
  -- VOID (6)
  { key = "omeneye", name = "Omen Eye", item = ITEM_OMEN_EYE, rarity = "common", sigil = "Void",
    effects = { { kind = "insight", amount = 1 } } },
  { key = "voidtithe", name = "Void Tithe", item = ITEM_VOID_TITHE, rarity = "common", sigil = "Void",
    effects = { { kind = "embers", amount = 50 } } },
  { key = "quietstep", name = "Quiet Step", item = ITEM_QUIET_STEP, rarity = "common", sigil = "Void",
    effects = { { kind = "stat", stat = "agi", amount = 3 }, { kind = "ms", amount = 15 } } },
  { key = "deepsight", name = "Deep Sight", item = ITEM_DEEP_SIGHT, rarity = "rare", sigil = "Void",
    effects = { { kind = "insight", amount = 1 }, { kind = "stat", stat = "int", amount = 6 } } },
  { key = "nullward", name = "Nullward Shell", item = ITEM_NULLWARD_SHELL, rarity = "rare", sigil = "Void",
    effects = { { kind = "maxhp", amount = 120 }, { kind = "stat", stat = "int", amount = 4 } } },
  { key = "diadem", name = "Seer's Diadem", item = ITEM_SEER_S_DIADEM, rarity = "epic", sigil = "Void",
    effects = { { kind = "insight", amount = 2 }, { kind = "flag", flag = "diadem" } } },
  -- LIGHT (6)
  { key = "int", name = "Kindled Mind", item = ITEM_KINDLED_MIND, rarity = "common", sigil = "Light",
    effects = { { kind = "stat", stat = "int", amount = 6 } } },
  { key = "dawnflame", name = "Dawnward Flame", item = ITEM_DAWNWARD_FLAME, rarity = "common", sigil = "Light",
    effects = { { kind = "stat", stat = "int", amount = 4 }, { kind = "maxhp", amount = 60 } } },
  { key = "beacon", name = "Beacon of the Order", item = ITEM_BEACON_OF_THE_ORDER, rarity = "common", sigil = "Light",
    effects = { { kind = "allstats", amount = 2 } } },
  { key = "allstats", name = "Pyre Ward", item = ITEM_PYRE_WARD, rarity = "rare", sigil = "Light",
    effects = { { kind = "allstats", amount = 4 } } },
  { key = "radiant", name = "Radiant Edge", item = ITEM_RADIANT_EDGE, rarity = "rare", sigil = "Light",
    effects = { { kind = "ability", abil = ABIL_RADIANT_STRIKE } } },
  { key = "lightoath", name = "Lightwarden's Oath", item = ITEM_LIGHTWARDEN_S_OATH, rarity = "epic", sigil = "Light",
    effects = { { kind = "flag", flag = "lightoath" } } },
}
local RARITY_RANK = { common = 1, rare = 2, epic = 3 }
local RARITY_LABEL = { common = "COMMON", rare = "RARE", epic = "EPIC" }

-- sigil set bonuses: announced at activation; the SAME text every boon
-- tooltip carries (objects-items.json) — legibility is the differentiator
local SIGIL_ORDER = { "Ash", "Storm", "Blood", "Void", "Light" }
local SIGIL_SETS = {
  Ash = { two = "party +4 Strength", three = "room clears pay +10 Embers" },
  Storm = { two = "party +20 move speed", three = "party +6 Agility" },
  Blood = { two = "party +100 max life", three = "party heals 25% on every room clear" },
  Void = { two = "party +1 Insight", three = "campfire prices -15 Embers" },
  Light = { two = "party +4 Intelligence", three = "every boon claim: party +1 all stats" },
}

-- relics: six reliquary exclusives, drawn seeded WITHOUT replacement
local RELIC_TABLE = {
  { key = "monastic", name = "Monastic Relic", item = ITEM_MONASTIC_RELIC,
    desc = "+2 to all attributes of every torchbearer",
    apply = function() PartyStats(2, 2, 2) end },
  { key = "chalice", name = "Ember Chalice", item = ITEM_EMBER_CHALICE,
    desc = "+75 maximum life to every torchbearer",
    apply = function() PartyMaxLife(75) end },
  { key = "codex", name = "Ashen Codex", item = ITEM_ASHEN_CODEX,
    desc = "+1 Insight to the party", apply = nil }, -- insight applied by caller
  { key = "stormidol", name = "Storm Idol", item = ITEM_STORM_IDOL,
    desc = "+20 move speed to every torchbearer",
    apply = function() AddPartyMs(20) end },
  { key = "bloodicon", name = "Bloodward Icon", item = ITEM_BLOODWARD_ICON,
    desc = "+3 Strength to every torchbearer",
    apply = function() PartyStats(3, 0, 0) end },
  { key = "lantern", name = "Lantern of the Order", item = ITEM_LANTERN_OF_THE_ORDER,
    desc = "+3 Agility and +3 Intelligence to every torchbearer",
    apply = function() PartyStats(0, 3, 3) end },
}
local relicDrawn = {} -- relic key -> true once claimed

local ELITE_DROPS = { ITEM_EMBER_DRAUGHT, ITEM_TORCH_OIL, ITEM_WARDFLAME_SALVE,
  ITEM_STORMFLASK, ITEM_CINDERSHIELD_PHIAL }

-- trials (adapted from Just Another Roguelike's risk contracts, credited):
-- announced debuff for ONE room, permanent party buff + 1 Insight on clear
local TRIALS = {
  { key = "cinders", name = "Trial of Cinders",
    debuff = "every torchbearer fights at -40% maximum life inside",
    payoutText = "+2 to all attributes of every torchbearer, permanently",
    payout = function() PartyStats(2, 2, 2) end },
  { key = "gale", name = "Trial of the Gale",
    debuff = "the Vault breathes every 30 seconds inside",
    payoutText = "+20 move speed to every torchbearer, permanently",
    payout = function() AddPartyMs(20) end },
  { key = "legion", name = "Trial of the Legion",
    debuff = "half again as many vault-born (x1.5 spawns)",
    payoutText = "+100 maximum life to every torchbearer, permanently",
    payout = function() PartyMaxLife(100) end },
}
local trialCuts = {} -- pid -> max-life cut of the cinders trial (restored after)

-- covenants (adapted from Ulfsire's Roguelike's god pacts, credited —
-- with the terms printed in full): one per player per run, sworn at the
-- hub altars BEFORE the first door. The fourth needs the earned vow.
local COVENANTS = {
  cinders = { name = "Covenant of Cinders",
    gain = "every fast clear (under " .. WRATH_FAST .. "s) pays you +20 bonus Embers",
    price = "the shrine HEAL costs you double" },
  stillness = { name = "Covenant of Stillness",
    gain = "every slow clear (over " .. WRATH_SLOW .. "s) grants the party +1 Insight",
    price = "Wrath builds half again as fast" },
  sealed = { name = "Covenant of the Sealed",
    gain = "you begin with a free EPIC boon (seeded)",
    price = "boon drafts offer only 2 choices" },
  unbound = { name = "Covenant of the Unbound",
    gain = "the party gains +1 to all attributes on every room clear",
    price = "no price -- this pact is earned, not paid" },
}

function AnyCovenant(key)
  for _, pid in ipairs(users) do
    if covenantOf[pid] == key then return true end
  end
  return false
end

local BOON_PLATE_REGIONS = { REGION_BOON_PLATE_A, REGION_BOON_PLATE_B, REGION_BOON_PLATE_C }
local DOOR_REGIONS = { REGION_DOOR_A, REGION_DOOR_B, REGION_DOOR_C }
local ALTAR_REGIONS = {
  { region = REGION_ALTAR_CINDERS, key = "cinders" },
  { region = REGION_ALTAR_STILLNESS, key = "stillness" },
  { region = REGION_ALTAR_SEALED, key = "sealed" },
  { region = REGION_ALTAR_UNBOUND, key = "unbound" },
}
local PEDESTAL_REGIONS = {
  { region = REGION_PEDESTAL_TORCHBEARER, key = "torch" },
  { region = REGION_PEDESTAL_ASHBLADE, key = "ashblade" },
  { region = REGION_PEDESTAL_CHORISTER, key = "chorister" },
}

-- run identities: hero kinds x covenants x sigil paths (the matrix math)
do
  local hk, cv = 0, 0
  for _ in pairs(HERO_KINDS) do hk = hk + 1 end
  for _ in pairs(COVENANTS) do cv = cv + 1 end
  IdentityCount = hk * cv * #SIGIL_ORDER
end

-- ------------------------------------------------------------ hero kinds

function SpawnHero(pid, kindKey, x, y, facing)
  local k = HERO_KINDS[kindKey]
  local h = CreateUnit(Player(pid), k.type, x, y, facing or 90.0)
  SetHeroStr(h, k.str, true)
  SetHeroAgi(h, k.agi, true)
  SetHeroInt(h, k.int, true)
  heroes[pid] = h
  heroKindOf[pid] = kindKey
  if kindKey == "ashblade" then
    UnitAddAbility(h, ABIL_CINDER_STEP) -- the innate blink, granted by trigger
  end
  ReapplyMoveSpeed()
  return h
end

function PickHero(pid, kindKey)
  if gameOver then return end
  if firstDoor then
    Tell(pid, "|cffaaaaaaThe pedestals answer only before the first door.|r")
    return
  end
  if (heroKindOf[pid] or "torch") == kindKey then
    Tell(pid, "|cffaaaaaaYou already carry the " .. HERO_KINDS[kindKey].name .. "'s torch.|r")
    return
  end
  local old = heroes[pid]
  local x, y = GetUnitX(old), GetUnitY(old)
  RemoveUnit(old)
  local k = HERO_KINDS[kindKey]
  SpawnHero(pid, kindKey, x, y)
  StartSound(sndSealChime)
  AnnounceAll("|cffffcc88" .. GetPlayerName(Player(pid)) .. " takes up the " .. k.name
    .. ": " .. k.kit .. ".|r")
  LogRun("hero|pid=" .. pid .. "|" .. kindKey)
end

function HeroSummary()
  local parts = {}
  for _, pid in ipairs(users) do
    parts[#parts + 1] = GetPlayerName(Player(pid)) .. ": "
      .. HERO_KINDS[heroKindOf[pid] or "torch"].name
  end
  return table.concat(parts, ", ")
end

-- Kindled Chorus (the Chorister's innate): every CHORUS_PERIOD seconds each
-- living Chorister mends every living torchbearer within CHORUS_RANGE
-- (itself included) for CHORUS_HEAL life — real trigger heal math, announced
function ChorusTick()
  ForEachHero(function(c, cpid)
    if heroKindOf[cpid] == "chorister" and Alive(c) then
      local cx, cy = GetUnitX(c), GetUnitY(c)
      local healed = 0
      ForEachHero(function(h)
        if Alive(h) then
          local dx, dy = GetUnitX(h) - cx, GetUnitY(h) - cy
          if dx * dx + dy * dy <= CHORUS_RANGE * CHORUS_RANGE then
            local maxhp = GetUnitState(h, UNIT_STATE_MAX_LIFE)
            local life = GetUnitState(h, UNIT_STATE_LIFE)
            if life < maxhp then
              SetUnitState(h, UNIT_STATE_LIFE, math.min(maxhp, life + CHORUS_HEAL))
              healed = healed + 1
            end
          end
        end
      end)
      if healed > 0 then
        AnnounceTimedAll(4.0, "|cff88ffaaKindled Chorus: the Chorister's song mends "
          .. healed .. " torchbearer" .. (healed == 1 and "" or "s")
          .. " (+" .. CHORUS_HEAL .. " life).|r")
        LogRun("chorus|healed=" .. healed)
      end
    end
  end)
end

-- --------------------------------------------------------- insight & sigils

function AddInsight(n, why)
  if n == 0 then return end
  local before = insight
  insight = insight + n
  InsightLevel = insight
  LogRun("insight|=" .. insight .. "|" .. why)
  local msg = "|cffaa88ffInsight " .. before .. " -> " .. insight .. " (" .. why .. ")."
  if before < 1 and insight >= 1 then
    msg = msg .. " Omens now count the vault-born behind each door."
  end
  if before < 2 and insight >= 2 then
    msg = msg .. " Omens now preview each door's reward in detail."
  end
  if before < 3 and insight >= 3 then
    msg = msg .. " The campfire now carries finer stock (heal 75%, fortify +150)."
  end
  AnnounceAll(msg .. "|r")
end

function SigilCount(sigil)
  local n = 0
  for _, b in ipairs(BOON_TABLE) do
    if b.sigil == sigil and boonTaken[b.key] then n = n + 1 end
  end
  return n
end

local sigilBonusFns -- forward declared (Void 2pc calls AddInsight)
sigilBonusFns = {
  Ash2 = function() PartyStats(4, 0, 0) end,
  Storm2 = function() AddPartyMs(20) end,
  Blood2 = function() PartyMaxLife(100) end,
  Void2 = function() AddInsight(1, "Void sigil 2pc") end,
  Light2 = function() PartyStats(0, 0, 4) end,
  Ash3 = function() end,   -- consulted in ClearRoom (clears pay +10)
  Storm3 = function() PartyStats(0, 6, 0) end,
  Blood3 = function() end, -- consulted in ClearRoom (heal 25% per clear)
  Void3 = function() end,  -- consulted in ShrinePurchase (prices -15)
  Light3 = function() end, -- consulted in TakeBoon (claims: party +1 all)
}

function SigilActive(sigil, pieces)
  return sigilApplied[sigil .. pieces] == true
end

function RecountSigils()
  for _, sigil in ipairs(SIGIL_ORDER) do
    local n = SigilCount(sigil)
    for _, pieces in ipairs({ 2, 3 }) do
      local tag = sigil .. pieces
      if n >= pieces and not sigilApplied[tag] then
        sigilApplied[tag] = true
        sigilBonusFns[tag]()
        local text = pieces == 2 and SIGIL_SETS[sigil].two or SIGIL_SETS[sigil].three
        StartSound(sndSealChime)
        AnnounceAll("|cffffd700SIGIL SET -- " .. string.upper(sigil) .. " x" .. pieces
          .. " active: " .. text .. ".|r")
        LogRun("sigil|" .. string.lower(sigil) .. "|" .. pieces)
      end
    end
  end
end

function SigilSummary()
  local parts = {}
  for _, sigil in ipairs(SIGIL_ORDER) do
    local n = SigilCount(sigil)
    if n > 0 then
      local mark = SigilActive(sigil, 3) and " (3pc)" or (SigilActive(sigil, 2) and " (2pc)" or "")
      parts[#parts + 1] = sigil .. " x" .. n .. mark
    end
  end
  return #parts > 0 and table.concat(parts, ", ") or "none"
end

function ShowSigils(pid)
  Tell(pid, "|cffffd700Sigils held -- set bonuses land at 2 and 3 boons of a sigil:|r")
  for _, sigil in ipairs(SIGIL_ORDER) do
    local n = SigilCount(sigil)
    local s = SIGIL_SETS[sigil]
    local state = SigilActive(sigil, 3) and "BOTH ACTIVE"
      or (SigilActive(sigil, 2) and "2pc ACTIVE" or "inactive")
    Tell(pid, "|cffffd700" .. sigil .. " x" .. n .. " [" .. state .. "]|r |cff888888(2: "
      .. s.two .. " / 3: " .. s.three .. ")|r")
  end
end

-- --------------------------------------------------------- breath & spawning

function BreathFactor()
  return 1.0 + (BREATH_PCT / 100.0) * breathStacks
end

function SpawnHostile(spec, x, y)
  local u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), spec.type, x, y, 270.0)
  BlzSetUnitBaseDamage(u, math.floor(spec.dmg * BreathFactor() + 0.5), 0)
  return u
end

function ApplyBreathTick()
  breathStacks = breathStacks + 1
  VaultBreathStacks = breathStacks
  for _, u in ipairs(activeUnits) do
    if Alive(u) and activeSet[u] ~= nil then
      BlzSetUnitBaseDamage(u, math.floor(activeSet[u].dmg * BreathFactor() + 0.5), 0)
    end
  end
  if bossActive and Alive(bossUnit) then
    BlzSetUnitBaseDamage(bossUnit, math.floor((BOSS_SPEC.dmg + bossFeast) * BreathFactor() + 0.5), 0)
  end
  StartSound(sndBreathHorn)
  AnnounceTimedAll(8.0, "|cffff6644The Vault breathes. Everything still stirring below hits "
    .. (BREATH_PCT * breathStacks) .. "% harder.|r")
  LogRun("breath|stacks=" .. breathStacks)
  if epicFlags.ashbrand then
    PartyStats(1, 1, 1)
    AnnounceAll("|cffff8844Ashfather's Brand: the breath tempers the party (+1 all stats).|r")
    LogRun("ashbrand|+1")
  end
end

-- seeded positions per authored pattern; ctx carries per-room anchors
function PatternPos(pattern, R, i, total, ctx)
  local cx, cy = RegionCenter(R)
  if pattern == "ring" then
    local ang = ctx.ring0 + (2 * math.pi) * (i - 1) / math.max(total, 1)
    return math.floor(cx + math.cos(ang) * 704), math.floor(cy + math.sin(ang) * 512)
  elseif pattern == "corners" then
    local corners = { { -768, 576 }, { 768, 576 }, { -768, -320 }, { 768, -320 } }
    local c = corners[1 + ((i - 1) % 4)]
    return math.floor(cx + c[1] + NextRand() * 192 - 96), math.floor(cy + c[2] + NextRand() * 192 - 96)
  elseif pattern == "line" then
    local span = 1536
    local x = cx - span / 2 + span * ((i - 1) / math.max(total - 1, 1))
    return math.floor(x), math.floor(cy + 448 + NextRand() * 128 - 64)
  elseif pattern == "packs" then
    local a = ctx.packs[1 + ((i - 1) % 2)]
    return math.floor(a.x + NextRand() * 320 - 160), math.floor(a.y + NextRand() * 320 - 160)
  end
  -- scatter (default)
  local x = math.floor(R.minX + 448 + NextRand() * (R.maxX - R.minX - 896))
  local y = math.floor(R.minY + 448 + NextRand() * (R.maxY - R.minY - 1088))
  return x, y
end

function NewPatternCtx(pattern, R)
  local ctx = {}
  if pattern == "ring" then
    ctx.ring0 = NextRand() * 2 * math.pi
  elseif pattern == "packs" then
    local cx, cy = RegionCenter(R)
    ctx.packs = {}
    for k = 1, 2 do
      ctx.packs[k] = { x = cx + NextRand() * 1280 - 640, y = cy + NextRand() * 768 - 256 }
    end
  end
  return ctx
end

-- register one spawned hostile into the active room bookkeeping
function TrackRoomUnit(u, spec)
  activeUnits[#activeUnits + 1] = u
  activeSet[u] = spec
  remaining = remaining + 1
end

-- spawn one room creep at a seeded patterned position; stores a PER-UNIT
-- spec clone so affixes never mutate the shared tier tables
function SpawnRoomCreep(spec, R, pattern, i, total, ctx)
  local x, y = PatternPos(pattern or "scatter", R, i or 1, total or 1, ctx or {})
  local mine = { type = spec.type, name = spec.name, dmg = spec.dmg }
  local u = SpawnHostile(mine, x, y)
  TrackRoomUnit(u, mine)
  LogRun("spawn|" .. mine.name .. "|x=" .. x .. "|y=" .. y)
  return u
end

-- spawn counts for a template at a danger level — the SAME function feeds
-- the omen creep counts (Insight 1+) and the actual spawns, so the omen
-- can never lie. Elite (+1) appears behind three-skull doors; withGuardian
-- (+1) counts the Floor Guardian every real door hides; a Wrath ambush is
-- announced separately and is never part of the omen count.
function CompCount(entry, danger, legion)
  local n = ScaleCount(entry.base + entry.per * (danger - 1))
  if legion then n = math.ceil(n * 1.5) end
  return n
end

function CountSpawns(template, danger, legion, withGuardian)
  local total = 0
  for _, entry in ipairs(template.comp) do
    total = total + CompCount(entry, danger, legion)
  end
  if danger >= 3 then total = total + 1 end -- the elite
  if withGuardian then total = total + 1 end -- the Floor Guardian
  return total
end

-- elites: seeded pick from the tier pair + a seeded affix, announced
function SpawnElite(floor, R, pattern, ctx)
  local spec = TIER_ELITES[floor][RandInt(1, 2)]
  local affix = AFFIXES[RandInt(1, #AFFIXES)]
  local mine = { type = spec.type, name = affix.name .. " " .. spec.name,
    dmg = math.floor(spec.dmg * (affix.dmgMult or 1) + 0.5), elite = true, affix = affix.key }
  local x, y = PatternPos(pattern or "scatter", R, 1, 1, ctx or {})
  local u = SpawnHostile(mine, x, y)
  BlzSetUnitName(u, mine.name)
  if affix.hpMult then
    local hp = GetUnitState(u, UNIT_STATE_MAX_LIFE) * affix.hpMult
    SetUnitState(u, UNIT_STATE_MAX_LIFE, hp)
    SetUnitState(u, UNIT_STATE_LIFE, hp)
  end
  if affix.ms then SetUnitMoveSpeed(u, GetUnitMoveSpeed(u) + affix.ms) end
  if affix.key == "ashveiled" then UnitAddAbility(u, ABIL_CINDERGUARD_EVASION) end
  TrackRoomUnit(u, mine)
  AnnounceTimedAll(10.0, "|cffff66ffElite -- " .. mine.name .. ": " .. affix.desc .. ".|r")
  LogRun("elite|" .. mine.name .. "|x=" .. math.floor(x) .. "|y=" .. math.floor(y))
  return u
end

-- the Wrath ambusher (announced one room ahead; also gets a seeded affix)
function SpawnRevenant(x, y, inRoom)
  local affix = AFFIXES[RandInt(1, #AFFIXES)]
  local mine = { type = REVENANT_SPEC.type, name = affix.name .. " " .. REVENANT_SPEC.name,
    dmg = math.floor(REVENANT_SPEC.dmg * (affix.dmgMult or 1) + 0.5), revenant = true, affix = affix.key }
  local u = SpawnHostile(mine, x, y)
  BlzSetUnitName(u, mine.name)
  if affix.hpMult then
    local hp = GetUnitState(u, UNIT_STATE_MAX_LIFE) * affix.hpMult
    SetUnitState(u, UNIT_STATE_MAX_LIFE, hp)
    SetUnitState(u, UNIT_STATE_LIFE, hp)
  end
  if affix.ms then SetUnitMoveSpeed(u, GetUnitMoveSpeed(u) + affix.ms) end
  if affix.key == "ashveiled" then UnitAddAbility(u, ABIL_CINDERGUARD_EVASION) end
  if inRoom then TrackRoomUnit(u, mine) end
  revenantUnit = u
  revenantArmed = false
  wrath = 0
  WrathMeter = 0
  StartSound(sndBreathHorn)
  AnnounceTimedAll(12.0, "|cffff2222THE VAULT'S WRATH TAKES SHAPE -- " .. mine.name
    .. " (" .. affix.desc .. ") ambushes the party! Slay it for a guaranteed "
    .. (epicFlags.embercov and "EPIC" or "rare") .. " boon.|r")
  LogRun("revenant|ambush|" .. mine.name)
  return u
end

-- ----------------------------------------------- floor guardians & variants

-- seeded interior variant: one of the template's 3 authored arrangements,
-- obstacle positions jittered by the run PRNG. Obstacles are inert neutral
-- props (removed on clear) — the variation is provably seeded (run log).
function VariantPositions(key, cx, cy, n)
  local pts = {}
  if key == "colonnade" then
    local a0 = NextRand() * 2 * math.pi
    for i = 1, n do
      local ang = a0 + (2 * math.pi) * (i - 1) / n
      pts[i] = { x = cx + math.cos(ang) * 620, y = cy + math.sin(ang) * 460 }
    end
  elseif key == "cairns" then
    for i = 1, n do
      local side = (i % 2 == 0) and 1 or -1
      pts[i] = { x = cx + side * (420 + NextRand() * 160), y = cy + NextRand() * 384 - 192 }
    end
  elseif key == "braziers" then
    for i = 1, n do
      pts[i] = { x = cx - 448 + (i - 1) * 448, y = cy + 96 + NextRand() * 128 - 64 }
    end
  elseif key == "walls" then
    for i = 1, n do
      local side = (i <= n / 2) and -1 or 1
      pts[i] = { x = cx + side * 384, y = cy + ((i % 2 == 0) and 288 or -288) + NextRand() * 96 - 48 }
    end
  elseif key == "ossuary" then
    for i = 1, n do
      pts[i] = { x = cx + NextRand() * 768 - 384, y = cy + 256 + NextRand() * 256 }
    end
  else -- rubble
    for i = 1, n do
      pts[i] = { x = cx + NextRand() * 1400 - 700, y = cy + NextRand() * 1000 - 500 }
    end
  end
  for _, p in ipairs(pts) do
    p.x = math.floor(p.x)
    p.y = math.floor(p.y)
  end
  return pts
end

function ApplyInteriorVariant(tmpl, R)
  local vIdx = RandInt(1, 3)
  local key = tmpl.variants[vIdx]
  local a = ARRANGEMENTS[key]
  local cx, cy = RegionCenter(R)
  for _, p in ipairs(VariantPositions(key, cx, cy, a.n)) do
    local utype = (key == "braziers") and UNIT_EMBER_BRAZIER or UNIT_VAULT_RUBBLE
    local o = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), utype, p.x, p.y, 270.0)
    SetUnitInvulnerable(o, true)
    obstacles[#obstacles + 1] = o
  end
  AnnounceTimedAll(6.0, "|cff888888" .. a.desc .. ".|r")
  LogRun("variant|" .. tmpl.key .. "|v" .. vIdx .. "|" .. key)
end

function ClearObstacles()
  for _, o in ipairs(obstacles) do
    RemoveUnit(o)
  end
  obstacles = {}
end

-- the Floor Guardian (Ulfsire's Guardian promotion, credited): seeded from
-- the 6-pool without replacement across the run's floors, affixed, stats
-- scaled by floor and party size, one signature behavior (GuardianWatch)
function SpawnGuardian(f, R)
  if guardianOrder == nil then guardianOrder = ShuffledIndices(#GUARDIANS) end
  local spec = GUARDIANS[guardianOrder[((f - 1) % #GUARDIANS) + 1]]
  local affix = AFFIXES[RandInt(1, #AFFIXES)]
  local mine = { type = spec.type, name = affix.name .. " " .. spec.name,
    dmg = math.floor(spec.dmg * (1 + 0.3 * (f - 1)) * (affix.dmgMult or 1) + 0.5),
    guardian = true, affix = affix.key }
  local cx, cy = RegionCenter(R)
  local u = SpawnHostile(mine, cx, cy + 320.0)
  BlzSetUnitName(u, mine.name)
  local hp = GetUnitState(u, UNIT_STATE_MAX_LIFE)
    * (1 + 0.35 * (f - 1) + 0.25 * (numPlayers - 1)) * (affix.hpMult or 1)
  SetUnitState(u, UNIT_STATE_MAX_LIFE, hp)
  SetUnitState(u, UNIT_STATE_LIFE, hp)
  if affix.ms then SetUnitMoveSpeed(u, GetUnitMoveSpeed(u) + affix.ms) end
  if affix.key == "ashveiled" then UnitAddAbility(u, ABIL_CINDERGUARD_EVASION) end
  TrackRoomUnit(u, mine)
  guardian = { unit = u, spec = spec, name = mine.name, affixKey = affix.key,
    slain = false, sigDone = false,
    pulseLeft = (spec.sig == "pulse") and 15 or 20 }
  AnnounceTimedAll(12.0, "|cffff66ffFLOOR GUARDIAN -- " .. mine.name .. " (" .. affix.desc
    .. ") wards this floor's final room: " .. spec.sigDesc
    .. ". The way down opens at its corpse.|r")
  LogRun("guardian|" .. mine.name .. "|floor=" .. f .. "|sig=" .. spec.sig)
  return u
end

-- the exit-from-corpse beat (Ulfsire's, credited): the descent door rises
-- exactly where the Guardian fell
function GuardianFell(u, spec)
  guardian.slain = true
  guardiansSlain = guardiansSlain + 1
  GuardiansSlain = guardiansSlain
  local x, y = GetUnitX(u), GetUnitY(u)
  guardian.corpseX, guardian.corpseY = math.floor(x), math.floor(y)
  local door = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), UNIT_SEALSTONE_DOOR, x, y, 270.0)
  SetUnitInvulnerable(door, true)
  obstacles[#obstacles + 1] = door -- swept with the room props on clear
  StartSound(sndSealChime)
  AnnounceTimedAll(10.0, "|cff88ff88The Guardian falls -- the descent door TEARS OPEN AT ITS CORPSE"
    .. " where " .. spec.name .. " fell.|r")
  LogRun("guardian|slain|" .. spec.name .. "|x=" .. guardian.corpseX .. "|y=" .. guardian.corpseY)
end

-- crumble every non-guardian hostile of the active room (survive standoff);
-- untracked before the kill so no drops/burst/clear bookkeeping fires
function CrumbleTrash()
  for _, u in ipairs(activeUnits) do
    local s = activeSet[u]
    if s ~= nil and not s.guardian and Alive(u) then
      activeSet[u] = nil
      remaining = remaining - 1
      KillUnit(u)
    end
  end
end

-- signature behaviors, one per guardian, driven by the master clock:
-- summon (Bone Warden, once at 50%), pulse (Gale Matriarch, 15s),
-- drain (Blood Provost, 20s), siphon (Void Curator, 20s),
-- enrage (Pyre Sentinel, once below 25%), mantle (Hollow King, once at 50%)
function GuardianWatch()
  if guardian == nil or guardian.slain or roomState ~= "active" then return end
  local u = guardian.unit
  if not Alive(u) then return end
  local spec = guardian.spec
  local ratio = GetWidgetLife(u) / GetUnitState(u, UNIT_STATE_MAX_LIFE)
  if spec.sig == "summon" then
    if not guardian.sigDone and ratio <= 0.5 then
      guardian.sigDone = true
      local fodder = TIER_CREEPS[activeRoom.floor][1]
      for k = 1, 2 do
        local mine = { type = fodder.type, name = fodder.name, dmg = fodder.dmg }
        TrackRoomUnit(SpawnHostile(mine, GetUnitX(u) + (k * 256 - 384), GetUnitY(u)), mine)
      end
      AnnounceAll("|cffff66ff" .. guardian.name .. " calls the ossuary: 2 vault-born claw free!|r")
      LogRun("guardiansig|summon")
    end
  elseif spec.sig == "enrage" then
    if not guardian.sigDone and ratio <= 0.25 then
      guardian.sigDone = true
      local s = activeSet[u]
      s.dmg = math.floor(s.dmg * 1.6 + 0.5)
      BlzSetUnitBaseDamage(u, math.floor(s.dmg * BreathFactor() + 0.5), 0)
      AnnounceAll("|cffff2222" .. guardian.name .. " IGNITES: +60% damage!|r")
      LogRun("guardiansig|enrage")
    end
  elseif spec.sig == "mantle" then
    if not guardian.sigDone and ratio <= 0.5 then
      guardian.sigDone = true
      UnitAddAbility(u, ABIL_WRATHFIRE_SLAM)
      SetUnitState(u, UNIT_STATE_LIFE, math.min(GetUnitState(u, UNIT_STATE_MAX_LIFE),
        GetWidgetLife(u) + GetUnitState(u, UNIT_STATE_MAX_LIFE) * 0.25))
      AnnounceAll("|cffff66ff" .. guardian.name
        .. " dons the wrathfire mantle and knits a quarter of its wounds!|r")
      LogRun("guardiansig|mantle")
    end
  else -- the periodic signatures
    guardian.pulseLeft = guardian.pulseLeft - clockScale
    while guardian.pulseLeft <= 0 do
      guardian.pulseLeft = guardian.pulseLeft + ((spec.sig == "pulse") and 15 or 20)
      if spec.sig == "pulse" then
        local n = 0
        ForEachHero(function(h)
          if Alive(h) then
            SetUnitState(h, UNIT_STATE_LIFE,
              math.max(1, GetUnitState(h, UNIT_STATE_LIFE) - GUARDIAN_PULSE))
            n = n + 1
          end
        end)
        AnnounceAll("|cffff8866" .. guardian.name .. " shrieks: " .. GUARDIAN_PULSE
          .. " life torn from " .. n .. " torchbearer" .. (n == 1 and "" or "s") .. ".|r")
        LogRun("guardiansig|pulse|" .. n)
      elseif spec.sig == "drain" then
        local total = 0
        ForEachHero(function(h)
          if Alive(h) then
            local take = math.min(GUARDIAN_DRAIN,
              math.max(0, math.floor(GetUnitState(h, UNIT_STATE_LIFE)) - 1))
            SetUnitState(h, UNIT_STATE_LIFE, GetUnitState(h, UNIT_STATE_LIFE) - take)
            total = total + take
          end
        end)
        SetUnitState(u, UNIT_STATE_LIFE, math.min(GetUnitState(u, UNIT_STATE_MAX_LIFE),
          GetWidgetLife(u) + total))
        AnnounceAll("|cffff8866" .. guardian.name .. " tithes " .. total
          .. " life from the party and drinks it.|r")
        LogRun("guardiansig|drain|" .. total)
      else -- siphon
        local take = math.min(GUARDIAN_SIPHON, embersPool)
        if take > 0 then
          embersPool = embersPool - take
          SyncEmbers()
          AnnounceAll("|cffff8866" .. guardian.name .. " curates " .. take
            .. " Embers out of the party's pool.|r")
          LogRun("guardiansig|siphon|-" .. take)
        end
      end
    end
  end
end

-- --------------------------------------------------------------------- wrath

function AddWrath(n, why)
  if n <= 0 or revenantArmed then return end
  local before = wrath
  local mult = 1.0
  if AnyCovenant("stillness") then mult = mult * 1.5 end
  if epicFlags.embercov then mult = mult * 2 end
  n = math.floor(n * mult)
  wrath = math.min(100, wrath + n)
  WrathMeter = wrath
  if wrath > wrathPeak then wrathPeak = wrath end
  LogRun("wrath|=" .. wrath .. "|" .. why)
  if wrath >= 100 then
    revenantArmed = true
    AnnounceTimedAll(12.0, "|cffff2222WRATH 100% -- the vault marks your haste. An ASH REVENANT"
      .. " will ambush the party at the NEXT room you enter (it hoards a guaranteed "
      .. (epicFlags.embercov and "EPIC" or "rare") .. " boon). Slow down... or embrace it.|r")
    LogRun("wrath|full")
  elseif before < 75 and wrath >= 75 then
    AnnounceAll("|cffff6644Wrath at " .. wrath .. "% -- the vault stirs at your pace. At 100% an Ash Revenant ambushes the next room.|r")
  elseif before < 50 and wrath >= 50 then
    AnnounceAll("|cffffaa66Wrath at " .. wrath .. "% -- fast clears feed the vault's wrath (announced again at 75% and 100%).|r")
  end
end

-- ------------------------------------------------------------ omens & deal

local OBJ_LABEL = {
  killall = "extinguish every vault-born",
  survive = "survive the onslaught for " .. SURVIVE_TIME .. " seconds",
  reliquary = "slay the reliquary guards and break the seal",
}
local REWARD_LABEL = { embers = "Embers", boon = "a Boon draft", relic = "a Relic" }

function OfferBestRarity(offer)
  local best = "common"
  for _, b in ipairs(offer or {}) do
    if RARITY_RANK[b.rarity] > RARITY_RANK[best] then best = b.rarity end
  end
  return RARITY_LABEL[best]
end

-- omen detail scales with Insight: 0 = danger+reward kind; 1+ = exact creep
-- count; 2+ = reward preview (exact embers / relic name / best draft rarity)
function OmenText(d)
  local s = "danger " .. string.rep("!", d.danger) .. " / reward: " .. REWARD_LABEL[d.reward]
  if insight >= 1 then
    s = s .. " / " .. CountSpawns(d.template, d.danger, false, true) .. " vault-born"
  end
  if insight >= 2 then
    if d.reward == "embers" then
      s = s .. " / preview: +" .. REWARD_EMBERS .. " bonus Embers"
    elseif d.reward == "relic" and d.relic then
      s = s .. " / preview: " .. d.relic.name
    elseif d.reward == "boon" then
      s = s .. " / preview: best boon " .. OfferBestRarity(d.offer)
    end
  end
  return s
end

function ClearDoorTags()
  for k = 1, 4 do
    if doorTags[k] ~= nil then
      DestroyTextTag(doorTags[k])
      doorTags[k] = nil
    end
  end
end

function ShowDoorOmens()
  for i = 1, 3 do
    local d = doorDeal[i]
    local cx, cy = RegionCenter(DOOR_REGIONS[i])
    if doorTags[i] ~= nil then DestroyTextTag(doorTags[i]) end
    local tag = CreateTextTag()
    SetTextTagText(tag, "Door " .. DOOR_LETTERS[i] .. ": " .. OmenText(d), 0.023)
    SetTextTagPos(tag, cx - 256.0, cy - 192.0, 96.0)
    SetTextTagPermanent(tag, true)
    SetTextTagVisibility(tag, true)
    doorTags[i] = tag
    AnnounceAll("|cffffcc66Omen -- Door " .. DOOR_LETTERS[i] .. ": " .. OmenText(d)
      .. "|r |cff888888(" .. OBJ_LABEL[d.template.obj] .. ")|r")
  end
  if trialOffer ~= nil and trialOffer.floor == floorNum then
    local c = trialOffer.contract
    local cx, cy = RegionCenter(REGION_TRIAL_DOOR)
    local tag = CreateTextTag()
    SetTextTagText(tag, "TRIAL: " .. c.name, 0.023)
    SetTextTagPos(tag, cx - 128.0, cy - 192.0, 96.0)
    SetTextTagPermanent(tag, true)
    SetTextTagVisibility(tag, true)
    doorTags[4] = tag
    AnnounceAll("|cffffff66A fourth door stands open -- " .. c.name .. ": " .. c.debuff
      .. ". Clear it for " .. c.payoutText .. " (+1 Insight). Decline by taking any normal door.|r")
  end
end

-- pity-aware boon offer selection. floorRarity: minimum rarity ("rare"/
-- "epic") when enough such boons remain untaken. Guarantees: never offers a
-- held boon (structural — the pool excludes them), and while never-offered
-- boons remain, every deal contains at least one.
function ComputeBoonOffer(floorRarity, size)
  local pool = {}
  for _, b in ipairs(BOON_TABLE) do
    if not boonTaken[b.key] then pool[#pool + 1] = b end
  end
  if floorRarity ~= nil then
    local rich = {}
    for _, b in ipairs(pool) do
      if RARITY_RANK[b.rarity] >= RARITY_RANK[floorRarity] then rich[#rich + 1] = b end
    end
    if #rich > 0 then pool = rich end
  end
  if #pool == 0 then return {} end
  local order = ShuffledIndices(#pool)
  local offer = {}
  for i = 1, math.min(size, #pool) do offer[i] = pool[order[i]] end
  -- reroll/deal pity: at least one never-yet-offered boon while any remain
  local anyUnseenInOffer, firstUnseenInPool = false, nil
  for _, b in ipairs(offer) do
    if not boonSeen[b.key] then anyUnseenInOffer = true end
  end
  for i = 1, #pool do
    local b = pool[order[i]]
    if firstUnseenInPool == nil and not boonSeen[b.key] then firstUnseenInPool = b end
  end
  if not anyUnseenInOffer and firstUnseenInPool ~= nil then
    offer[#offer] = firstUnseenInPool
  end
  return offer
end

function DraftSize()
  return AnyCovenant("sealed") and 2 or 3
end

-- seeded, without replacement: 3 of the floor's 20-template deck land on 3
-- of its 4 islands; boon doors PRE-DEAL their draft (so Insight 2 previews
-- are honest) and relic doors pre-assign a relic from the undrawn deck
function DealFloor(f)
  local deck = TEMPLATES[f]
  local islandOrder = ShuffledIndices(4)
  local templateOrder = ShuffledIndices(#deck)
  lastIslandOrder = islandOrder
  lastTemplateOrder = templateOrder
  trialOffer = nil
  doorDeal = {}
  local anyBoon = false
  for i = 1, 3 do
    local danger = RandInt(1, 3)
    local roll = NextRand()
    local reward = (roll < 0.4 and "embers") or (roll < 0.8 and "boon") or "relic"
    if reward == "boon" then anyBoon = true end
    doorDeal[i] = { island = islandOrder[i], template = deck[templateOrder[i]],
      danger = danger, reward = reward }
  end
  if not anyBoon then
    -- a run with no boons is a dead run: the most dangerous door always
    -- hides one (deterministic: first-highest danger wins)
    local best = 1
    for i = 2, 3 do
      if doorDeal[i].danger > doorDeal[best].danger then best = i end
    end
    doorDeal[best].reward = "boon"
  end
  -- pre-assign rewards (consumes seeded draws in door order)
  local assigned = {}
  for i = 1, 3 do
    local d = doorDeal[i]
    if d.reward == "boon" then
      d.offer = ComputeBoonOffer(nil, DraftSize())
    elseif d.reward == "relic" then
      local pool = {}
      for _, r in ipairs(RELIC_TABLE) do
        if not relicDrawn[r.key] and not assigned[r.key] then pool[#pool + 1] = r end
      end
      if #pool > 0 then
        d.relic = pool[RandInt(1, #pool)]
        assigned[d.relic.key] = true
      end
    end
  end
  -- the trial door: 1-2 per run, seeded; floor 3 forced when none yet
  if trialsOffered < 2 then
    local offer = false
    if f == 3 and trialsOffered == 0 then
      offer = true
    else
      offer = NextRand() < TRIAL_CHANCE
    end
    if offer then
      trialOffer = { floor = f, island = islandOrder[4],
        template = deck[templateOrder[4]], contract = TRIALS[RandInt(1, #TRIALS)] }
      trialsOffered = trialsOffered + 1
    end
  end
  doorsArmed = true
  local parts = {}
  for i = 1, 3 do
    local d = doorDeal[i]
    parts[i] = DOOR_LETTERS[i] .. "=" .. ROOM_KEYS[f][d.island] .. ":" .. d.template.key
      .. ":" .. d.template.obj .. ":d" .. d.danger .. ":" .. d.reward
  end
  LogRun("deal|floor=" .. f .. "|" .. table.concat(parts, "|"))
  if trialOffer ~= nil then
    LogRun("trial|offer|floor=" .. f .. "|" .. trialOffer.contract.key .. "|"
      .. ROOM_KEYS[f][trialOffer.island] .. ":" .. trialOffer.template.key)
  end
  AnnounceTimedAll(10.0, "|cffaaddffFloor " .. f .. ". Three doors stand unsealed -- read the omens, pick one, step onto its plate.|r")
  ShowDoorOmens()
end

-- --------------------------------------------------------------- boon draft

function ClearDraftItems()
  for i = 1, 3 do
    if draftItems[i] ~= nil then
      RemoveItem(draftItems[i])
      draftItems[i] = nil
    end
  end
end

function ProceedAfterDraft()
  if floorNum <= 3 then DealFloor(floorNum) end
end

function BoonLabel(b)
  return b.name .. " [" .. RARITY_LABEL[b.rarity] .. "/" .. b.sigil .. "]"
end

-- entry: {offer = stored pre-dealt entries | nil, floor = rarity floor | nil}
function DealBoons(entry)
  entry = entry or {}
  local offer = {}
  -- a stored offer may contain boons taken since it was dealt: filter them
  for _, b in ipairs(entry.offer or {}) do
    if not boonTaken[b.key] and #offer < DraftSize() then offer[#offer + 1] = b end
  end
  if #offer == 0 then
    offer = ComputeBoonOffer(entry.floor, DraftSize())
  end
  if #offer == 0 then
    AnnounceAll("|cffaaaaaaEvery boon of the order has already been claimed.|r")
    draftActive = false
    ProceedAfterDraft()
    return
  end
  draftOffer = offer
  draftFloorRarity = entry.floor
  local names = {}
  for i, b in ipairs(offer) do
    boonSeen[b.key] = true
    names[i] = BoonLabel(b)
  end
  ClearDraftItems()
  for i = 1, #offer do
    local cx, cy = RegionCenter(BOON_PLATE_REGIONS[i])
    draftItems[i] = CreateItem(offer[i].item, cx, cy + 96.0)
  end
  draftActive = true
  StartSound(sndSealChime)
  AnnounceTimedAll(12.0, "|cff88ff88A boon draft: " .. table.concat(names, ", ")
    .. ". Step one torchbearer onto a pedestal plate to claim ITS boon -- the others crumble."
    .. " Drafts never repeat a boon you hold.|r")
  LogRun("boonoffer|" .. table.concat(names, "|"))
end

function ApplyBoonEffects(boon, hero, pid)
  for _, e in ipairs(boon.effects) do
    if e.kind == "stat" then
      if e.stat == "str" then SetHeroStr(hero, GetHeroStr(hero, false) + e.amount, true)
      elseif e.stat == "agi" then SetHeroAgi(hero, GetHeroAgi(hero, false) + e.amount, true)
      else SetHeroInt(hero, GetHeroInt(hero, false) + e.amount, true) end
    elseif e.kind == "allstats" then
      SetHeroStr(hero, GetHeroStr(hero, false) + e.amount, true)
      SetHeroAgi(hero, GetHeroAgi(hero, false) + e.amount, true)
      SetHeroInt(hero, GetHeroInt(hero, false) + e.amount, true)
    elseif e.kind == "maxhp" then
      SetUnitState(hero, UNIT_STATE_MAX_LIFE, GetUnitState(hero, UNIT_STATE_MAX_LIFE) + e.amount)
      SetUnitState(hero, UNIT_STATE_LIFE, GetUnitState(hero, UNIT_STATE_LIFE) + e.amount)
    elseif e.kind == "ability" then
      UnitAddAbility(hero, e.abil)
    elseif e.kind == "ms" then
      heroMs[pid] = (heroMs[pid] or 0) + e.amount
      ReapplyMoveSpeed()
    elseif e.kind == "insight" then
      AddInsight(e.amount, boon.name)
    elseif e.kind == "embers" then
      AddEmbers(e.amount)
      AnnounceAll("|cffffcc00" .. boon.name .. " pays " .. e.amount .. " Embers into the pool.|r")
    elseif e.kind == "healpct" then
      local maxhp = GetUnitState(hero, UNIT_STATE_MAX_LIFE)
      SetUnitState(hero, UNIT_STATE_LIFE, GetUnitState(hero, UNIT_STATE_LIFE) + maxhp * e.pct)
    elseif e.kind == "flag" then
      epicFlags[e.flag] = true
    end
  end
end

-- Light 3pc: EVERY boon claim (drafted or granted) kindles the party
function LightThreeOnClaim()
  if SigilActive("Light", 3) then
    PartyStats(1, 1, 1)
    AnnounceAll("|cffffd700Light 3pc: the claim kindles the whole party (+1 all stats).|r")
  end
end

-- grant a boon outside a draft (Sealed covenant, Revenant bounty, -grant)
function GrantBoon(boon, hero, pid, how)
  boonTaken[boon.key] = true
  boonSeen[boon.key] = true
  boonsTaken[#boonsTaken + 1] = boon.name
  ApplyBoonEffects(boon, hero, pid)
  Tell(pid, "|cff88ff88Boon claimed: " .. BoonLabel(boon) .. ".|r")
  LogRun(how .. "|" .. boon.name)
  RecountSigils()
  LightThreeOnClaim()
end

function TakeBoon(plateIdx, hero, pid)
  local boon = draftOffer[plateIdx]
  if boon == nil then return end
  draftActive = false
  draftFloorRarity = nil
  boonTaken[boon.key] = true
  boonsTaken[#boonsTaken + 1] = boon.name
  ClearDraftItems()
  ApplyBoonEffects(boon, hero, pid)
  Tell(pid, "|cff88ff88Boon claimed: " .. BoonLabel(boon) .. ".|r")
  AnnounceAll("|cff88ff88" .. GetPlayerName(Player(pid)) .. " claims " .. BoonLabel(boon)
    .. "; the unclaimed boons crumble to ash.|r")
  LogRun("boontake|pid=" .. pid .. "|" .. boon.name)
  RecountSigils()
  LightThreeOnClaim()
  if #pendingDrafts > 0 then
    DealBoons(table.remove(pendingDrafts, 1))
  else
    ProceedAfterDraft()
  end
end

-- ---------------------------------------------------------------- campfire

function ShrineCost(kind, pid)
  local cost = (kind == "heal" and COST_HEAL) or (kind == "reroll" and COST_REROLL)
    or (kind == "rekindle" and COST_REKINDLE) or COST_FORTIFY
  if kind == "heal" and covenantOf[pid] == "cinders" then cost = cost * 2 end
  if SigilActive("Void", 3) then cost = math.max(5, cost - 15) end
  if kind == "reroll" and epicFlags.diadem then cost = 0 end
  return cost
end

function LightShrine()
  shrineLit = true
  shrineUsed = {}
  StartSound(sndSealChime)
  local fine = insight >= 3
  AnnounceTimedAll(12.0, "|cffffaa44The Ashen Shrine flares to life. Rune plates: HEAL "
    .. (fine and "75%" or "half") .. " of your wounds (" .. COST_HEAL
    .. "), REROLL a pending boon draft (" .. COST_REROLL .. "), FORTIFY +"
    .. (fine and FORTIFY_HP + 50 or FORTIFY_HP) .. " max life (" .. COST_FORTIFY
    .. "), REKINDLE the fallen at once (" .. COST_REKINDLE .. "). Embers: " .. embersPool
    .. (fine and ". Insight sharpens the stock." or ".") .. "|r")
  LogRun("campfire|lit")
end

function ReviveFallen(where)
  local hx, hy = RegionCenter(REGION_HUB_RETURN)
  for _, pid in ipairs(users) do
    if pendingRevive[pid] and heroes[pid] ~= nil then
      pendingRevive[pid] = nil
      local h = heroes[pid]
      ReviveHero(h, hx, hy, true)
      SetUnitState(h, UNIT_STATE_LIFE, GetUnitState(h, UNIT_STATE_MAX_LIFE) * 0.5)
      ReapplyMoveSpeed()
      AnnounceAll("|cff88ff88The torch of " .. GetPlayerName(Player(pid))
        .. " is rekindled at half life (" .. where .. ").|r")
      LogRun("revive|pid=" .. pid .. "|" .. where)
    end
  end
end

function AnyFallen()
  for _, pid in ipairs(users) do
    if pendingRevive[pid] then return true end
  end
  return false
end

function ShrinePurchase(kind, pid)
  if not shrineLit then
    Tell(pid, "|cffaaaaaaThe shrine is cold. It lights after every " .. CAMPFIRE_EVERY .. "rd cleared room.|r")
    return
  end
  if shrineUsed[kind] then
    Tell(pid, "|cffaaaaaaThat rune plate has already been spent at this lighting.|r")
    return
  end
  if kind == "reroll" and not draftActive then
    Tell(pid, "|cffaaaaaaNo boon draft is pending -- nothing to reroll.|r")
    return
  end
  if kind == "rekindle" and not AnyFallen() then
    Tell(pid, "|cffaaaaaaNo torch is out -- nothing to rekindle.|r")
    return
  end
  local cost = ShrineCost(kind, pid)
  if not SpendEmbers(cost) then
    Tell(pid, "|cffaaaaaaNot enough Embers (" .. cost .. " needed, " .. embersPool .. " held).|r")
    return
  end
  shrineUsed[kind] = true
  if kind == "heal" then
    local pct = insight >= 3 and 0.75 or 0.5
    PartyHealPct(pct)
    AnnounceAll("|cffffaa44The shrine knits the party's wounds (" .. math.floor(pct * 100)
      .. "% of maximum life restored).|r")
  elseif kind == "fortify" then
    local hp = insight >= 3 and FORTIFY_HP + 50 or FORTIFY_HP
    PartyMaxLife(hp)
    AnnounceAll("|cffffaa44The shrine tempers the party: +" .. hp .. " maximum life.|r")
  elseif kind == "rekindle" then
    ReviveFallen("shrine")
    AnnounceAll("|cffffaa44The shrine breathes the fallen torches back to flame.|r")
  else
    AnnounceAll("|cffffaa44The shrine stirs the ashes -- the boon draft is redealt.|r")
    LogRun("reroll")
    DealBoons({ floor = draftFloorRarity })
  end
  LogRun("campfire|" .. kind .. "|-" .. cost)
end

-- ------------------------------------------------------------- run summary

function CovenantSummary()
  local parts = {}
  for _, pid in ipairs(users) do
    if covenantOf[pid] then
      parts[#parts + 1] = GetPlayerName(Player(pid)) .. ": " .. COVENANTS[covenantOf[pid]].name
    end
  end
  return #parts > 0 and table.concat(parts, ", ") or "none sworn"
end

function BuildSummary(verdict)
  local boons = (#boonsTaken > 0) and table.concat(boonsTaken, ", ") or "none"
  return "THE VAULTS OF ASH -- " .. verdict .. ". Torchbearers: " .. HeroSummary()
    .. ". Floor reached: " .. floorNum
    .. "/4. Rooms cleared: " .. roomsCleared .. ". Guardians slain: " .. guardiansSlain
    .. ". Embers earned: " .. embersEarned
    .. ". Boons: " .. boons .. ". Sigils: " .. SigilSummary()
    .. ". Wrath peak: " .. wrathPeak .. "%. Trials cleared: " .. trialsCleared
    .. ". Insight: " .. insight .. ". Deaths: " .. deaths
    .. ". Covenants: " .. CovenantSummary() .. ". Seed: " .. RunSeed .. "."
end

function ShowSummary(verdict)
  local text = BuildSummary(verdict)
  AnnounceAll("|cffffcc00" .. text .. "|r")
  AnnounceAll("|cff888888Replay this exact dungeon with -seed " .. RunSeed .. " before the first door.|r")
  local q = CreateQuest()
  QuestSetTitle(q, "Run Summary -- " .. verdict)
  QuestSetDescription(q, text)
  QuestSetIconPath(q, "ReplaceableTextures\\CommandButtons\\BTNTome.blp")
  QuestSetDiscovered(q, true)
  LogRun("summary|" .. verdict)
end

function DefeatRun()
  if gameOver then return end
  gameOver = true
  AnnounceAll("|cffff4444The last torch gutters out. The vault keeps its dead.|r")
  ShowSummary("DEFEAT")
  LogRun("defeat")
  After(2.0, function()
    for _, pid in ipairs(users) do
      CustomDefeatBJ(Player(pid), "The last torch has gone out.")
    end
  end)
end

function VictoryRun()
  if gameOver then return end
  gameOver = true
  StartSound(sndVictoryHorn)
  AnnounceAll("|cff88ff88The Vault Heart shatters. The seal your order died for holds at last.|r")
  -- the knowledge code (Roguelike 2.6 tradition, credit DeathdruidX):
  -- a flawless run, or one that embraced and broke the Wrath, earns the
  -- vow that opens the fourth altar in ANY future run — meta-progression
  -- that no save wipe can take away
  if deaths == 0 or revenantSlain then
    AnnounceAll("|cffffd700The vault whispers a vow"
      .. (deaths == 0 and " (a flawless descent)" or " (its own wrath, broken)")
      .. ": speak '-vow " .. VOW_PHRASE .. "' before the first door of any future descent"
      .. " to open the fourth altar.|r")
    LogRun("vow|earned")
  end
  ShowSummary("VICTORY")
  LogRun("victory")
  After(5.0, function()
    for _, pid in ipairs(users) do
      CustomVictoryBJ(Player(pid), true, true)
    end
  end)
end

-- ------------------------------------------------------- room state machine

function ReturnToHub()
  if gameOver then return end
  local cx, cy = RegionCenter(REGION_HUB_RETURN)
  TeleportParty(cx, cy)
  for _, pid in ipairs(users) do
    PanCameraToTimedForPlayer(Player(pid), cx, cy, 0.0)
  end
  if roomsCleared > 0 and roomsCleared % CAMPFIRE_EVERY == 0 then
    LightShrine()
  end
  if #pendingDrafts > 0 then
    DealBoons(table.remove(pendingDrafts, 1))
  elseif floorNum <= 3 then
    DealFloor(floorNum)
  end
  if floorNum > 3 and not gateArmed then
    gateArmed = true
    StartSound(sndSealChime)
    AnnounceTimedAll(12.0, "|cffff6666Three rooms lie silent. The VAULT GATE stands unsealed -- step onto its plate when you are ready."
      .. " Heed the inscription: THE HEART FEEDS ON HOARDED EMBERS (+1 damage per "
      .. FEAST_PER_EMBERS .. " unspent at its final phase) -- spend before you descend.|r")
    LogRun("gate|unsealed")
  end
end

function GrantRelic(relic, x, y)
  if x == nil then
    x, y = RegionCenter(REGION_HUB_RETURN)
    x = x + 256.0
  end
  if relic == nil then
    -- deck exhausted: the vault pays embers instead (announced)
    AddEmbers(60)
    AnnounceAll("|cffffcc00The relic niches stand empty; the vault pays 60 Embers instead.|r")
    LogRun("relic|exhausted|+60")
    return
  end
  relicDrawn[relic.key] = true
  CreateItem(relic.item, x, y)
  if relic.apply ~= nil then relic.apply() end
  if relic.key == "codex" then AddInsight(1, "Ashen Codex") end
  AnnounceAll("|cffffcc00Relic recovered: " .. relic.name .. " -- " .. relic.desc .. ".|r")
  LogRun("relic|" .. relic.name)
end

function DrawRelicFromDeck()
  local pool = {}
  for _, r in ipairs(RELIC_TABLE) do
    if not relicDrawn[r.key] then pool[#pool + 1] = r end
  end
  if #pool == 0 then return nil end
  return pool[RandInt(1, #pool)]
end

function ClearRoom()
  if activeRoom == nil or roomState ~= "active" then return end
  roomState = "idle"
  local room = activeRoom
  activeRoom = nil
  revenantUnit = nil
  -- survivors of a survive-room crumble with the seal (no drops, no log)
  local leftovers = activeUnits
  activeUnits = {}
  activeSet = {}
  remaining = 0
  for _, u in ipairs(leftovers) do
    if Alive(u) then KillUnit(u) end
  end
  local clearTime = roomClock
  local pay = EMBER_BASE + EMBER_PER_DANGER * room.danger
  if SigilActive("Ash", 3) then pay = pay + 10 end
  AddEmbers(pay)
  StartSound(sndSealChime)
  AnnounceTimedAll(10.0, "|cff88ff88Room cleared in " .. clearTime .. "s! +" .. pay
    .. " Embers (danger " .. string.rep("!", room.danger)
    .. (SigilActive("Ash", 3) and ", Ash 3pc +10" or "") .. "). Party Embers: " .. embersPool .. ".|r")
  LogRun("clear|room=" .. ROOM_KEYS[room.floor][room.island] .. "|t=" .. clearTime
    .. "|embers=" .. pay .. "|total=" .. embersPool)
  -- the exit-from-corpse beat: the party descends through the door that rose
  -- where the Guardian fell (Ulfsire's Roguelike, credited)
  if guardian ~= nil and guardian.slain then
    AnnounceAll("|cffaaddffThe party takes the descent door at the Guardian's corpse;"
      .. " it seals behind them.|r")
    LogRun("descend|corpse|x=" .. guardian.corpseX .. "|y=" .. guardian.corpseY)
  end
  guardian = nil
  ClearObstacles()
  roomsCleared = roomsCleared + 1
  floorNum = roomsCleared + 1

  -- rewards: trial payout replaces the door reward
  if room.trial ~= nil then
    local c = room.trial
    -- lift the trial debuff
    if c.key == "cinders" then
      ForEachHero(function(h, pid)
        local cut = trialCuts[pid]
        if cut then
          trialCuts[pid] = nil
          SetUnitState(h, UNIT_STATE_MAX_LIFE, GetUnitState(h, UNIT_STATE_MAX_LIFE) + cut)
        end
      end)
    end
    trialsCleared = trialsCleared + 1
    TrialsCleared = trialsCleared
    c.payout()
    AddInsight(1, c.name)
    AnnounceAll("|cffffff66" .. c.name .. " CLEARED: " .. c.payoutText .. ".|r")
    LogRun("trial|clear|" .. c.key)
  elseif room.reward == "embers" then
    AddEmbers(REWARD_EMBERS)
    AnnounceAll("|cffffcc00The room's cache spills " .. REWARD_EMBERS .. " bonus Embers.|r")
    LogRun("reward|embers|+" .. REWARD_EMBERS)
  elseif room.reward == "boon" then
    pendingDrafts[#pendingDrafts + 1] = { offer = room.offer }
    AnnounceAll("|cff88ff88The order's blessing lingers here -- a boon draft awaits at the hub pedestals.|r")
    LogRun("reward|boon")
  else
    GrantRelic(room.relic or DrawRelicFromDeck())
  end

  -- sigil / covenant / epic per-clear effects (fixed order, all logged or
  -- announced so the golden run pins them)
  if SigilActive("Blood", 3) then
    PartyHealPct(0.25)
    AnnounceAll("|cffff8888Blood 3pc: the clear feeds the party (25% of maximum life restored).|r")
  end
  if epicFlags.stormcore then
    AddPartyMs(15)
    AnnounceAll("|cff88ccffStormheart Core: +15 party move speed (stacking).|r")
    LogRun("stormcore|+15")
  end
  if room.trial == nil and clearTime <= WRATH_FAST and AnyCovenant("cinders") then
    local bonus = 0
    for _, pid in ipairs(users) do
      if covenantOf[pid] == "cinders" then bonus = bonus + 20 end
    end
    AddEmbers(bonus)
    AnnounceAll("|cffffaa44Covenant of Cinders: the fast clear pays +" .. bonus .. " Embers.|r")
    LogRun("covenant|cinders|+" .. bonus)
  end
  if clearTime > WRATH_SLOW and AnyCovenant("stillness") then
    AddInsight(1, "Covenant of Stillness")
  end
  if AnyCovenant("unbound") then
    PartyStats(1, 1, 1)
    AnnounceAll("|cffffffffCovenant of the Unbound: +1 all stats to the party.|r")
    LogRun("covenant|unbound|+1")
  end

  -- wrath: fast clears feed the vault (survive rooms count as measured)
  local gain
  if room.template.obj == "survive" then gain = WRATH_GAIN.survive
  elseif clearTime <= WRATH_FAST then gain = WRATH_GAIN.fast
  elseif clearTime <= WRATH_SLOW then gain = WRATH_GAIN.mid
  else gain = WRATH_GAIN.slow end
  AddWrath(gain, "clear " .. clearTime .. "s")

  -- death choreography: the party's clear rekindles fallen torches
  ReviveFallen("landing cleared")

  After(2.5, ReturnToHub)
end

function ActivateRoom(f, d, real)
  local R = ROOMS[f][d.island]
  local cx, cy = RegionCenter(R)
  local entryX, entryY = cx, R.minY + 320.0
  local legion = d.trial ~= nil and d.trial.key == "legion"
  activeRoom = { floor = f, island = d.island, template = d.template, danger = d.danger,
    reward = d.reward, region = R, trial = d.trial, offer = d.offer, relic = d.relic }
  roomState = "active"
  activeUnits = {}
  activeSet = {}
  remaining = 0
  roomClock = 0
  doorsArmed = false
  TeleportParty(entryX, entryY)
  CameraBeat(cx, cy)
  LogRun("enter|room=" .. ROOM_KEYS[f][d.island] .. "|tmpl=" .. d.template.key
    .. "|obj=" .. d.template.obj .. "|danger=" .. d.danger .. "|reward="
    .. (d.trial ~= nil and ("trial:" .. d.trial.key) or d.reward))

  -- trial debuff, applied on entry (was announced at the door)
  if d.trial ~= nil then
    local c = d.trial
    AnnounceTimedAll(10.0, "|cffffff66" .. c.name .. " begins: " .. c.debuff .. ".|r")
    if c.key == "cinders" then
      ForEachHero(function(h, pid)
        if Alive(h) then
          local cut = GetUnitState(h, UNIT_STATE_MAX_LIFE) * 0.4
          trialCuts[pid] = cut
          SetUnitState(h, UNIT_STATE_MAX_LIFE, GetUnitState(h, UNIT_STATE_MAX_LIFE) - cut)
          if GetUnitState(h, UNIT_STATE_LIFE) > GetUnitState(h, UNIT_STATE_MAX_LIFE) then
            SetUnitState(h, UNIT_STATE_LIFE, GetUnitState(h, UNIT_STATE_MAX_LIFE))
          end
        end
      end)
    end
  end

  local tmpl = d.template
  local ctx = NewPatternCtx(tmpl.pattern, R)
  local total = CountSpawns(tmpl, d.danger, legion)
  local placed = 0
  if tmpl.obj == "reliquary" then
    local reliquary = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), UNIT_SEALED_RELIQUARY,
      cx, cy + 512.0, 270.0)
    SetUnitInvulnerable(reliquary, true)
  end
  if tmpl.obj == "survive" then
    surviveLeft = SURVIVE_TIME
    trickleLeft = TRICKLE_EVERY
  end
  for _, entry in ipairs(tmpl.comp) do
    local spec = TIER_CREEPS[f][entry.c]
    for _ = 1, CompCount(entry, d.danger, legion) do
      placed = placed + 1
      SpawnRoomCreep(spec, R, tmpl.pattern, placed, total, ctx)
    end
  end
  if d.danger >= 3 then
    SpawnElite(f, R, "scatter", ctx)
  end
  if revenantArmed then
    SpawnRevenant(cx, cy - 256.0, true)
  end
  -- real doors only (debug '-room' chambers stay bare): the seeded interior
  -- variant, then the floor's Guardian — draw order is pinned by the tests
  if real then
    ApplyInteriorVariant(tmpl, R)
    SpawnGuardian(f, R)
  end
  AnnounceTimedAll(10.0, "|cffff9966" .. tmpl.name .. " -- the seal breaks: "
    .. OBJ_LABEL[tmpl.obj] .. (tmpl.obj == "survive" and ". They will not stop coming" or "") .. ".|r")
end

function EnterDoor(i)
  if gameOver or not doorsArmed or roomState == "active" then return end
  if draftActive then return end
  local d = doorDeal[i]
  if d == nil then return end
  firstDoor = true
  ClearDoorTags()
  if trialOffer ~= nil and trialOffer.floor == floorNum then
    AnnounceAll("|cff888888The Trial door seals behind your choice.|r")
    LogRun("trial|declined")
    trialOffer = nil
  end
  StartSound(sndSealChime)
  AnnounceAll("|cffaaddffDoor " .. DOOR_LETTERS[i] .. " grinds open...|r")
  LogRun("door|" .. DOOR_LETTERS[i] .. "|floor=" .. floorNum)
  ActivateRoom(floorNum, d, true)
end

function EnterTrialDoor()
  if gameOver or roomState == "active" or draftActive then return end
  if trialOffer == nil or trialOffer.floor ~= floorNum or not doorsArmed then
    return
  end
  local t = trialOffer
  trialOffer = nil
  firstDoor = true
  ClearDoorTags()
  StartSound(sndSealChime)
  AnnounceAll("|cffffff66The Trial door grinds open...|r")
  LogRun("door|TRIAL|floor=" .. floorNum)
  ActivateRoom(floorNum, { island = t.island, template = t.template, danger = 3,
    reward = "embers", trial = t.contract }, true)
end

-- ------------------------------------------------------------- covenants

function SwearCovenant(pid, key)
  if gameOver then return end
  if firstDoor then
    Tell(pid, "|cffaaaaaaThe altars answer only before the first door.|r")
    return
  end
  if covenantOf[pid] ~= nil then
    Tell(pid, "|cffaaaaaaYour pact is already sealed: " .. COVENANTS[covenantOf[pid]].name .. ".|r")
    return
  end
  if key == "unbound" and not unboundUnlocked then
    Tell(pid, "|cffaaaaaaThe fourth altar is cold. A vow earned by mastery opens it -- beat the Heart flawlessly, or break its Wrath, and listen.|r")
    return
  end
  local c = COVENANTS[key]
  covenantOf[pid] = key
  covenantSworn = true
  StartSound(sndSealChime)
  AnnounceAll("|cffcc88ff" .. GetPlayerName(Player(pid)) .. " swears the " .. c.name
    .. ". Reward: " .. c.gain .. ". Price: " .. c.price .. ".|r")
  LogRun("covenant|pid=" .. pid .. "|" .. key)
  if key == "sealed" then
    local pool = {}
    for _, b in ipairs(BOON_TABLE) do
      if b.rarity == "epic" and not boonTaken[b.key] then pool[#pool + 1] = b end
    end
    if #pool > 0 and heroes[pid] ~= nil then
      local b = pool[RandInt(1, #pool)]
      GrantBoon(b, heroes[pid], pid, "sealedboon")
      AnnounceAll("|cffcc88ffThe Sealed altar pays its debt at once: " .. BoonLabel(b) .. ".|r")
    end
  end
end

-- --------------------------------------------------------------- the boss

function EnterBoss()
  if gameOver or bossActive then return end
  if roomState == "active" then return end
  bossActive = true
  gateArmed = false
  doorsArmed = false
  firstDoor = true
  local cx, cy = RegionCenter(REGION_BOSS_ARENA)
  local entryX, entryY = cx, REGION_BOSS_ARENA.minY + 256.0
  TeleportParty(entryX, entryY)
  CameraBeat(cx, cy + 128.0)
  bossUnit = SpawnHostile(BOSS_SPEC, cx, cy + 128.0)
  bossPhase = 1
  bossFeast = 0
  bossPattern = BOSS_PATTERNS[RandInt(1, #BOSS_PATTERNS)]
  AnnounceTimedAll(12.0, "|cffff4444THE VAULT HEART. The thing your order died sealing beats before you. Break it.|r")
  AnnounceTimedAll(12.0, "|cffff8866This Heart wakes in its " .. string.upper(bossPattern.name)
    .. " aspect -- and at its final phase it will FEED ON HOARDED EMBERS (+1 damage per "
    .. FEAST_PER_EMBERS .. " unspent).|r")
  LogRun("boss|enter")
  LogRun("boss|pattern=" .. bossPattern.name)
  if revenantArmed then
    SpawnRevenant(cx, cy - 512.0, false)
    AnnounceAll("|cffff2222Even here, the vault's wrath finds you.|r")
  end
end

function SpawnBossAdds(phaseSpec)
  local n = ScaleCount(phaseSpec.n)
  local spec = ADD_SPECS[phaseSpec.ref]
  for i = 1, n do
    local x, y
    if phaseSpec.pat == "ring" then
      local ang = (2 * math.pi) * (i - 1) / n
      x = GetUnitX(bossUnit) + math.cos(ang) * 384
      y = GetUnitY(bossUnit) + math.sin(ang) * 384
    else
      x = GetUnitX(bossUnit) + math.floor(NextRand() * 512) - 256
      y = GetUnitY(bossUnit) - 256.0
    end
    local mine = { type = spec.type, name = spec.name, dmg = spec.dmg }
    local u = SpawnHostile(mine, x, y)
    activeUnits[#activeUnits + 1] = u
    activeSet[u] = mine
  end
  return n
end

function BossPhaseWatch()
  if not bossActive or bossUnit == nil or not Alive(bossUnit) then return end
  local ratio = GetWidgetLife(bossUnit) / GetUnitState(bossUnit, UNIT_STATE_MAX_LIFE)
  if bossPhase == 1 and ratio <= BOSS_PHASE2_AT then
    bossPhase = 2
    local n = SpawnBossAdds(bossPattern.p2)
    AnnounceTimedAll(10.0, "|cffff6644The Heart cracks -- its " .. bossPattern.name .. " takes shape and swarms!|r")
    LogRun("boss|phase=2|adds=" .. n)
  elseif bossPhase == 2 and ratio <= BOSS_PHASE3_AT then
    bossPhase = 3
    local n = SpawnBossAdds(bossPattern.p3)
    UnitRemoveAbility(bossUnit, ABIL_VAULT_SLAM)
    UnitAddAbility(bossUnit, ABIL_HEARTSHATTER_SLAM)
    -- the ember feast (Roguelike 2.6's shopkeeper-greed pattern, credited,
    -- telegraphed at the gate AND on the door frames): unspent embers are
    -- damage now
    bossFeast = embersPool // FEAST_PER_EMBERS
    BlzSetUnitBaseDamage(bossUnit, math.floor((BOSS_SPEC.dmg + bossFeast) * BreathFactor() + 0.5), 0)
    AnnounceTimedAll(12.0, "|cffff2222The Heart is breaking -- its slam turns to HEARTSHATTER, and it FEEDS on your hoard: +"
      .. bossFeast .. " damage from " .. embersPool .. " unspent Embers.|r")
    LogRun("boss|phase=3|adds=" .. n .. "|feast=" .. bossFeast)
  end
end

-- ------------------------------------------------------------ master clock
-- One repeating 1-second timer drives the Vault's Breath, the survive
-- countdown/trickle, the room clock and the boss phase watch, so '-ff'
-- scales everything in one place.
function StartClock()
  local t = CreateTimer()
  TimerStart(t, 1.0, true, function()
    if gameOver then return end
    local galeActive = roomState == "active" and activeRoom ~= nil
      and activeRoom.trial ~= nil and activeRoom.trial.key == "gale"
    breathLeft = breathLeft - clockScale * (galeActive and 3 or 1)
    while breathLeft <= 0 do
      breathLeft = breathLeft + BREATH_PERIOD
      ApplyBreathTick()
    end
    chorusLeft = chorusLeft - clockScale
    while chorusLeft <= 0 do
      chorusLeft = chorusLeft + CHORUS_PERIOD
      ChorusTick()
    end
    if roomState == "active" and activeRoom ~= nil then
      roomClock = roomClock + clockScale
      if activeRoom.template.obj == "survive" and not activeRoom.surviveDone then
        surviveLeft = surviveLeft - clockScale
        trickleLeft = trickleLeft - clockScale
        if surviveLeft <= 0 then
          activeRoom.surviveDone = true
          CrumbleTrash()
          if guardian ~= nil and not guardian.slain and Alive(guardian.unit) then
            -- the Guardian standoff: the trash crumbles, the descent waits
            AnnounceAll("|cff88ff88The onslaught spends itself -- only the GUARDIAN"
              .. " stands between you and the descent.|r")
            LogRun("standoff|guardian")
          else
            AnnounceAll("|cff88ff88The onslaught spends itself; the survivors crumble.|r")
            ClearRoom()
          end
        elseif trickleLeft <= 0 then
          trickleLeft = trickleLeft + TRICKLE_EVERY
          local refs = activeRoom.template.trickle or { 1 }
          local n = ScaleCount(activeRoom.danger)
          for i = 1, n do
            local spec = TIER_CREEPS[activeRoom.floor][refs[1 + ((i - 1) % #refs)]]
            SpawnRoomCreep(spec, activeRoom.region, "scatter", i, n, {})
          end
        end
      end
      GuardianWatch()
    end
    BossPhaseWatch()
  end)
end

-- ----------------------------------------------------------- unit triggers

function HandleDeath()
  if gameOver then return end
  local u = GetTriggerUnit()
  if u == nil then return end

  -- the boss
  if bossActive and u == bossUnit then
    bossActive = false
    LogRun("boss|dead")
    VictoryRun()
    return
  end

  -- a torchbearer: rekindled when the party clears its next landing; only
  -- a FULL wipe ends the run (defeat is always handled)
  local pid = HeroPid(u)
  if pid ~= nil then
    deaths = deaths + 1
    DeathsCount = deaths
    AnnounceAll("|cffff8866The torch of " .. GetPlayerName(Player(pid)) .. " gutters out.|r")
    LogRun("death|pid=" .. pid)
    if not AnyHeroAlive() then
      DefeatRun()
      return
    end
    pendingRevive[pid] = true
    AnnounceAll("|cffaaaaaaClear the next landing (or buy the shrine's Rekindle) and the torch relights at half life.|r")
    if epicFlags.lightoath then
      ForEachHero(function(h)
        if Alive(h) then
          SetHeroStr(h, GetHeroStr(h, false) + 4, true)
          SetHeroAgi(h, GetHeroAgi(h, false) + 4, true)
          SetHeroInt(h, GetHeroInt(h, false) + 4, true)
          SetUnitState(h, UNIT_STATE_LIFE, GetUnitState(h, UNIT_STATE_MAX_LIFE))
        end
      end)
      AnnounceAll("|cffffd700Lightwarden's Oath: the survivors carry the flame (+4 all stats, full heal).|r")
      LogRun("lightoath|rally")
    end
    return
  end

  -- the Ash Revenant (room ambush or boss-arena ambush): guaranteed bounty
  local wasRevenant = (u == revenantUnit) and (roomState == "active" or bossActive)
  if wasRevenant then
    revenantUnit = nil
    revenantSlain = true
    local killer = GetKillingUnit()
    local kpid = HeroPid(killer)
    if kpid == nil then
      for _, upid in ipairs(users) do
        if heroes[upid] ~= nil and Alive(heroes[upid]) then kpid = upid break end
      end
    end
    LogRun("revenant|slain")
    local floorRarity = epicFlags.embercov and "epic" or "rare"
    local pool = {}
    for _, b in ipairs(BOON_TABLE) do
      if not boonTaken[b.key] and RARITY_RANK[b.rarity] >= RARITY_RANK[floorRarity] then
        pool[#pool + 1] = b
      end
    end
    if #pool == 0 then
      for _, b in ipairs(BOON_TABLE) do
        if not boonTaken[b.key] then pool[#pool + 1] = b end
      end
    end
    if #pool > 0 and kpid ~= nil then
      local b = pool[RandInt(1, #pool)]
      GrantBoon(b, heroes[kpid], kpid, "revenant|boon")
      AnnounceAll("|cffffd700The Revenant's hoard: " .. GetPlayerName(Player(kpid))
        .. " claims " .. BoonLabel(b) .. ".|r")
    end
    AnnounceAll("|cff88ff88The vault's wrath breaks with its revenant.|r")
  end

  -- room creeps
  if roomState == "active" and activeSet[u] ~= nil then
    local spec = activeSet[u]
    activeSet[u] = nil
    remaining = remaining - 1
    -- the Floor Guardian: its corpse becomes the descent door
    if spec.guardian and guardian ~= nil and u == guardian.unit then
      GuardianFell(u, spec)
    end
    -- elites carry consumables (seeded from the 5-deep drop table)
    if spec.elite then
      CreateItem(ELITE_DROPS[RandInt(1, #ELITE_DROPS)], GetUnitX(u), GetUnitY(u))
      LogRun("elitedrop|" .. spec.name)
    end
    -- Bloodtithe Pact: elite (and revenant/guardian) kills feed the party
    if (spec.elite or spec.revenant or spec.guardian) and epicFlags.bloodpact then
      PartyStats(2, 0, 0)
      PartyHealPct(0.25)
      AnnounceAll("|cffff8888Bloodtithe Pact: the kill pays (+2 Strength, 25% healed).|r")
      LogRun("bloodpact|elite")
    end
    -- Volatile affix: the corpse bursts into fodder (before the clear check)
    if spec.affix == "volatile" and activeRoom ~= nil then
      local fodder = TIER_CREEPS[activeRoom.floor][1]
      for k = 1, 2 do
        local mine = { type = fodder.type, name = fodder.name, dmg = fodder.dmg }
        local v = SpawnHostile(mine, GetUnitX(u) + (k * 128 - 192), GetUnitY(u))
        TrackRoomUnit(v, mine)
      end
      AnnounceAll("|cffff66ffThe Volatile corpse bursts -- 2 vault-born erupt!|r")
      LogRun("volatile|burst")
    end
    -- Vampiric affix: other vault-born deaths feed it
    for _, v in ipairs(activeUnits) do
      local vs = activeSet[v]
      if vs ~= nil and vs.affix == "vampiric" and Alive(v) then
        SetUnitState(v, UNIT_STATE_LIFE,
          GetUnitState(v, UNIT_STATE_LIFE) + GetUnitState(v, UNIT_STATE_MAX_LIFE) * 0.08)
      end
    end
    local obj = activeRoom and activeRoom.template.obj or "killall"
    if remaining <= 0 and (obj == "killall" or obj == "reliquary") then
      if obj == "reliquary" then
        local R = activeRoom.region
        local cx, cy = RegionCenter(R)
        AnnounceAll("|cffffcc00The reliquary seal shatters.|r")
        LogRun("reliquary|looted")
        GrantRelic(DrawRelicFromDeck(), cx, cy + 256.0)
      end
      ClearRoom()
    elseif obj == "survive" and activeRoom ~= nil and activeRoom.surviveDone
      and spec.guardian then
      -- the Guardian standoff breaks: the survive room clears at last
      ClearRoom()
    end
  end
end

function RegisterRegionTrigger(R, fn)
  local trig = CreateTrigger()
  local rgn = CreateRegion()
  RegionAddRect(rgn, Rect(R.minX, R.minY, R.maxX, R.maxY))
  TriggerRegisterEnterRegion(trig, rgn, nil)
  TriggerAddAction(trig, function()
    local u = GetEnteringUnit()
    local pid = HeroPid(u)
    if pid ~= nil then fn(u, pid) end
  end)
end

function RegisterTriggers()
  local death = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(death, EVENT_PLAYER_UNIT_DEATH)
  TriggerAddAction(death, HandleDeath)

  -- doors
  for i = 1, 3 do
    local doorIdx = i
    RegisterRegionTrigger(DOOR_REGIONS[i], function() EnterDoor(doorIdx) end)
  end

  -- the Trial door
  RegisterRegionTrigger(REGION_TRIAL_DOOR, function(_, pid)
    if trialOffer == nil or trialOffer.floor ~= floorNum then
      if not gameOver and roomState ~= "active" then
        Tell(pid, "|cffaaaaaaOnly ash behind this frame -- no Trial stands open.|r")
      end
      return
    end
    EnterTrialDoor()
  end)

  -- the Vault Gate
  RegisterRegionTrigger(REGION_VAULT_GATE, function(_, pid)
    if not gateArmed then
      Tell(pid, "|cffaaaaaaThe Vault Gate is sealed. Clear the three floors first."
        .. " Its inscription reads: THE HEART FEEDS ON HOARDED EMBERS.|r")
      return
    end
    EnterBoss()
  end)

  -- boon pedestal plates
  for i = 1, 3 do
    local plateIdx = i
    RegisterRegionTrigger(BOON_PLATE_REGIONS[i], function(u, pid)
      if not draftActive or gameOver then return end
      TakeBoon(plateIdx, u, pid)
    end)
  end

  -- shrine rune plates
  local shrinePlates = {
    { region = REGION_SHRINE_HEAL, kind = "heal" },
    { region = REGION_SHRINE_REROLL, kind = "reroll" },
    { region = REGION_SHRINE_FORTIFY, kind = "fortify" },
    { region = REGION_SHRINE_REKINDLE, kind = "rekindle" },
  }
  for _, sp in ipairs(shrinePlates) do
    local kind = sp.kind
    RegisterRegionTrigger(sp.region, function(_, pid)
      if gameOver then return end
      ShrinePurchase(kind, pid)
    end)
  end

  -- covenant altars
  for _, alt in ipairs(ALTAR_REGIONS) do
    local key = alt.key
    RegisterRegionTrigger(alt.region, function(_, pid)
      SwearCovenant(pid, key)
    end)
  end

  -- hero pedestals (phase 3): pick a torchbearer kit before the first door
  for _, ped in ipairs(PEDESTAL_REGIONS) do
    local key = ped.key
    RegisterRegionTrigger(ped.region, function(_, pid)
      PickHero(pid, key)
    end)
  end
end

-- --------------------------------------------------------- chat commands

function ShowHelp(pid)
  Tell(pid, "|cffaaddffVaults of Ash commands:|r")
  Tell(pid, "-help : this list. -sigils : your sigil counts + set bonuses. -seed N : reseed, N up to 9 digits (only before any covenant or door; current seed " .. RunSeed .. ").")
  Tell(pid, "-vow <word> : speak an earned vow (before the first door) to open the fourth altar.")
  Tell(pid, "|cff888888The run: pick a torchbearer at the hero pedestals (Torchbearer / Ashblade / Chorister -- before the first door; Torchbearer by default), swear a covenant at the altars (optional, explicit terms), pick omen-read doors (a 4th TRIAL door on 1-2 floors). Every floor's room is warded by a FLOOR GUARDIAN -- the descent door opens at its corpse. Watch Wrath at 50/75/100%, spend Embers before the Heart's final phase feeds on them. Fallen torches rekindle on the next cleared room; a full wipe ends the run.|r")
  Tell(pid, "-test : toggle debug mode (required for the rest).")
  Tell(pid, "-floor N : jump to floor N. -room <killall|survive|reliquary> [danger] : force a room. -trial : force a trial offer.")
  Tell(pid, "-embers N : set Embers. -boon : force a draft. -grant <key> : grant a boon by key. -clear : clear the active room.")
  Tell(pid, "-wrath N : set the Wrath meter. -insight N : set Insight. -covenant <cinders|stillness|sealed|unbound> : force a pact.")
  Tell(pid, "-hero <torch|ashblade|chorister> : force a torchbearer kit.")
  Tell(pid, "-boss : jump to the Vault Heart. -god : invulnerable. -ff : " .. FF_SCALE .. "x clock. -runlog : print the run log.")
  Tell(pid, "|cff888888Design inspirations, credited: Roguelike (DeathdruidX), Ulfsire's Roguelike (incl. its Guardians and exit-from-corpse), Just Another Roguelike (PortusM).|r")
end

-- integer-width portability (gotcha 29 corollary): the game's Lua integers
-- are 64-bit, the headless sim's (fengari) are 32-bit, so a digit string
-- >= 2^31 parses in game but overflows to a float (and fails
-- math.tointeger) in the sim. Numeric chat arguments are therefore capped
-- at 9 digits (max 999999999 < 2^31) BEFORE tonumber ever runs -- both
-- widths accept exactly the same strings, and longer ones return nil
-- (rejected or defaulted by the caller, identically everywhere).
function ParseNumArg(s)
  if s == nil or #s > 9 then return nil end
  return math.tointeger(tonumber(s))
end

function HandleSeed(pid, n)
  if firstDoor or covenantSworn then
    Tell(pid, "|cffaaaaaaThe dungeon is already dealt -- -seed works only before any covenant or door.|r")
    return
  end
  RunSeed = n
  SeedRNG(n)
  RUNLOG = ""
  trialsOffered = 0
  trialOffer = nil
  pendingDrafts = {}
  boonSeen = {}
  relicDrawn = {}
  guardianOrder = nil
  guardian = nil
  LogRun("seed=" .. n)
  AnnounceAll("|cffaaddffThe vault reshuffles its bones: seed " .. n .. ".|r")
  DealFloor(1)
end

function HandleVow(pid, word)
  if unboundUnlocked then
    Tell(pid, "|cffaaaaaaThe fourth altar already burns.|r")
    return
  end
  if firstDoor then
    Tell(pid, "|cffaaaaaaVows are spoken before the first door.|r")
    return
  end
  if word == VOW_PHRASE then
    unboundUnlocked = true
    StartSound(sndSealChime)
    AnnounceAll("|cffffd700The fourth altar flares: the COVENANT OF THE UNBOUND is open ("
      .. COVENANTS.unbound.gain .. "; " .. COVENANTS.unbound.price .. ").|r")
    LogRun("vow|unlocked")
  else
    Tell(pid, "|cffaaaaaaThe vault does not know that vow.|r")
  end
end

function DebugRoom(pid, obj, danger)
  if roomState == "active" or gameOver then
    Tell(pid, "|cffaaaaaaA room is already active.|r")
    return
  end
  if floorNum > 3 then
    Tell(pid, "|cffaaaaaaOnly the Vault Gate remains -- use -boss.|r")
    return
  end
  -- pick the current floor's first template with the requested objective
  local template = nil
  for _, t in ipairs(TEMPLATES[floorNum]) do
    if t.obj == obj then
      template = t
      break
    end
  end
  if template == nil then
    Tell(pid, "|cffaaaaaaNo " .. obj .. " template on floor " .. floorNum .. ".|r")
    return
  end
  firstDoor = true
  LogRun("debugroom|floor=" .. floorNum .. "|tmpl=" .. template.key .. "|obj=" .. obj .. "|danger=" .. danger)
  ActivateRoom(floorNum, { island = 1, template = template, danger = danger, reward = "embers" })
end

function HandleChat(pid, msgRaw)
  local msg = string.lower(msgRaw)
  msg = string.match(msg, "^%s*(.-)%s*$")
  if string.sub(msg, 1, 1) ~= "-" then return end

  if msg == "-help" then
    ShowHelp(pid)
    return
  end
  if msg == "-sigils" then
    ShowSigils(pid)
    return
  end
  local vowArg = string.match(msg, "^%-vow%s+(%w+)$")
  if vowArg ~= nil then
    HandleVow(pid, vowArg)
    return
  end
  local seedArg = string.match(msg, "^%-seed%s+(%d+)$")
  if seedArg ~= nil then
    local n = ParseNumArg(seedArg)
    if n == nil then
      Tell(pid, "|cffaaaaaaSeeds run 1 to 9 digits -- the vault refuses " .. seedArg .. ".|r")
      return
    end
    HandleSeed(pid, n)
    return
  end
  if msg == "-test" then
    testMode[pid] = not testMode[pid]
    if testMode[pid] then
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid))
        .. " enabled -test debug mode.|r Commands: -floor N, -room <obj> [d], -embers N, -boon, -grant <key>, -clear, -boss, -god, -ff, -runlog, -wrath N, -insight N, -covenant <key>, -trial")
    else
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid)) .. " disabled -test debug mode.|r")
    end
    return
  end

  local floorArg = string.match(msg, "^%-floor%s+([1-3])$")
  local roomObj, roomDanger = string.match(msg, "^%-room%s+(%a+)%s*(%d*)$")
  local embersArg = string.match(msg, "^%-embers%s+(%d+)$")
  local wrathArg = string.match(msg, "^%-wrath%s+(%d+)$")
  local insightArg = string.match(msg, "^%-insight%s+(%d+)$")
  local grantArg = string.match(msg, "^%-grant%s+([%w_]+)$")
  local covArg = string.match(msg, "^%-covenant%s+(%a+)$")
  local heroArg = string.match(msg, "^%-hero%s+(%a+)$")
  local known = floorArg ~= nil or roomObj ~= nil or embersArg ~= nil
    or wrathArg ~= nil or insightArg ~= nil or grantArg ~= nil or covArg ~= nil
    or heroArg ~= nil
    or msg == "-boon" or msg == "-clear" or msg == "-boss" or msg == "-god"
    or msg == "-ff" or msg == "-runlog" or msg == "-trial"
  if not known then return end
  if not testMode[pid] then
    Tell(pid, "|cffaaaaaaDebug commands need -test mode. Type -test first.|r")
    return
  end

  if floorArg ~= nil then
    local f = ParseNumArg(floorArg)
    roomsCleared = f - 1
    floorNum = f
    firstDoor = true
    draftActive = false
    pendingDrafts = {}
    ClearDraftItems()
    Tell(pid, "|cffff88ffJumped to floor " .. f .. ".|r")
    LogRun("debugfloor|" .. f)
    DealFloor(f)
  elseif roomObj ~= nil then
    if OBJ_LABEL[roomObj] == nil then
      Tell(pid, "|cffaaaaaa-room wants killall, survive or reliquary.|r")
      return
    end
    local d = ParseNumArg(roomDanger) or 2
    if d < 1 then d = 1 elseif d > 3 then d = 3 end
    DebugRoom(pid, roomObj, d)
  elseif embersArg ~= nil then
    embersPool = ParseNumArg(embersArg) or 0
    SyncEmbers()
    Tell(pid, "|cffff88ffParty Embers set to " .. embersPool .. ".|r")
  elseif wrathArg ~= nil then
    local w = math.min(100, ParseNumArg(wrathArg) or 0)
    wrath = math.max(0, w - 1)
    revenantArmed = false
    if w > 0 then
      -- route the last point through AddWrath so announcements/arming fire
      -- exactly as they would in play (covenant/epic multipliers bypassed)
      local mult = (AnyCovenant("stillness") and 1.5 or 1) * (epicFlags.embercov and 2 or 1)
      wrath = math.max(0, w - math.floor(mult))
      AddWrath(1, "debug")
      wrath = math.min(100, math.max(wrath, w))
      WrathMeter = wrath
      if wrath > wrathPeak then wrathPeak = wrath end
      if wrath >= 100 then revenantArmed = true end
    else
      WrathMeter = 0
    end
    Tell(pid, "|cffff88ffWrath set (now " .. wrath .. "%).|r")
  elseif insightArg ~= nil then
    local target = ParseNumArg(insightArg) or 0
    if target > insight then AddInsight(target - insight, "debug") end
    Tell(pid, "|cffff88ffInsight now " .. insight .. ".|r")
    if doorsArmed and doorDeal ~= nil then ShowDoorOmens() end
  elseif grantArg ~= nil then
    local found = nil
    for _, b in ipairs(BOON_TABLE) do
      if b.key == grantArg then found = b break end
    end
    if found == nil then
      Tell(pid, "|cffaaaaaaNo boon with key '" .. grantArg .. "'.|r")
    elseif boonTaken[found.key] then
      Tell(pid, "|cffaaaaaa" .. found.name .. " is already held.|r")
    else
      GrantBoon(found, heroes[pid], pid, "debuggrant")
    end
  elseif covArg ~= nil then
    if COVENANTS[covArg] == nil then
      Tell(pid, "|cffaaaaaa-covenant wants cinders, stillness, sealed or unbound.|r")
    else
      if covArg == "unbound" then unboundUnlocked = true end
      covenantOf[pid] = nil
      local wasFirst = firstDoor
      firstDoor = false
      SwearCovenant(pid, covArg)
      firstDoor = wasFirst
    end
  elseif heroArg ~= nil then
    if HERO_KINDS[heroArg] == nil then
      Tell(pid, "|cffaaaaaa-hero wants torch, ashblade or chorister.|r")
    else
      local wasFirst = firstDoor
      firstDoor = false
      PickHero(pid, heroArg)
      firstDoor = wasFirst
    end
  elseif msg == "-trial" then
    if trialOffer ~= nil and trialOffer.floor == floorNum then
      Tell(pid, "|cffaaaaaaA trial is already offered on this floor.|r")
    elseif floorNum > 3 then
      Tell(pid, "|cffaaaaaaOnly the Vault Gate remains.|r")
    else
      local deck = TEMPLATES[floorNum]
      trialOffer = { floor = floorNum,
        island = (lastIslandOrder ~= nil and lastIslandOrder[4]) or 4,
        template = deck[(lastTemplateOrder ~= nil and lastTemplateOrder[4]) or 4],
        contract = TRIALS[RandInt(1, #TRIALS)] }
      trialsOffered = trialsOffered + 1
      LogRun("trial|offer|floor=" .. floorNum .. "|" .. trialOffer.contract.key .. "|debug")
      ShowDoorOmens()
      Tell(pid, "|cffff88ffTrial forced: " .. trialOffer.contract.name .. ".|r")
    end
  elseif msg == "-boon" then
    Tell(pid, "|cffff88ffForcing a boon draft.|r")
    DealBoons(nil)
  elseif msg == "-clear" then
    if roomState == "active" then
      Tell(pid, "|cffff88ffForce-clearing the active room.|r")
      ClearRoom()
    else
      Tell(pid, "|cffaaaaaaNo active room.|r")
    end
  elseif msg == "-boss" then
    Tell(pid, "|cffff88ffJumping to the Vault Heart.|r")
    roomsCleared = math.max(roomsCleared, 3)
    floorNum = 4
    EnterBoss()
  elseif msg == "-god" then
    ForEachHero(function(h) SetUnitInvulnerable(h, true) end)
    AnnounceAll("|cffff88ffThe torchbearers walk untouchable.|r")
  elseif msg == "-ff" then
    clockScale = (clockScale == 1) and FF_SCALE or 1
    AnnounceAll("|cffff88ffClock speed is now " .. clockScale .. "x (breath/survive/room timers).|r")
  elseif msg == "-runlog" then
    Tell(pid, "|cffff88ffRun log:|r")
    local count = 0
    for line in string.gmatch(RUNLOG, "[^\n]+") do
      count = count + 1
      if count <= 40 then Tell(pid, "|cff888888" .. line .. "|r") end
    end
    if count > 40 then Tell(pid, "|cff888888... (" .. (count - 40) .. " more lines)|r") end
  end
end

function RegisterChatCommands()
  for pid = 0, MAX_PLAYERS - 1 do
    local trig = CreateTrigger()
    TriggerRegisterPlayerChatEvent(trig, Player(pid), "-", false)
    local capturedPid = pid
    TriggerAddAction(trig, function()
      HandleChat(capturedPid, GetEventPlayerChatString())
    end)
  end
end

-- ------------------------------------------------------------------- intro

function InitSounds()
  -- same built-in files that sounds.json (war3map.w3s) declares
  sndSealChime = CreateSound("Abilities\\Spells\\Items\\AIam\\Tomes.flac",
    false, false, false, 10, 10, "SpellsEAX")
  SetSoundVolume(sndSealChime, 127)
  sndBreathHorn = CreateSound("Sound\\Music\\mp3Music\\Doom.flac",
    false, false, false, 10, 10, "DefaultEAXON")
  SetSoundVolume(sndBreathHorn, 100)
  sndVictoryHorn = CreateSound("Sound\\Music\\mp3Music\\Comradeship.flac",
    false, false, false, 10, 10, "DefaultEAXON")
  SetSoundVolume(sndVictoryHorn, 110)
end

function ShowCredits()
  local q = CreateQuest()
  QuestSetTitle(q, "Credits & Inspirations")
  QuestSetDescription(q, "The Vaults of Ash (wc3-map-toolkit). Design inspirations, adapted with credit:"
    .. " Roguelike by DeathdruidX (the Sin ambush -> our telegraphed Wrath; the shopkeeper's greed -> the Heart's ember feast; the knowledge-code meta -> the vow of the fourth altar);"
    .. " Ulfsire's Roguelike (structure synergies -> our LEGIBLE sigil sets; god pacts -> covenants with printed terms; prime monsters -> elite affixes; escape-revive -> rekindling; Guardian promotion + exit-from-corpse -> our Floor Guardians and their corpse-door descent);"
    .. " Just Another Roguelike by PortusM (risk contracts -> trial doors; the looting stat -> Insight).")
  QuestSetIconPath(q, "ReplaceableTextures\\CommandButtons\\BTNTome.blp")
  QuestSetDiscovered(q, true)
end

function PlayIntro()
  local hx, hy = RegionCenter(REGION_HUB_RETURN)
  CameraBeat(hx, hy - 320.0)
  AnnounceTimedAll(9.0, "|cffaaddffThe Vaults of Ash. Your order burned sealing what sleeps below; you are the last torch it has left.|r")
  After(4.0, function()
    if gameOver then return end
    AnnounceTimedAll(11.0, "|cffaaddffThree HERO PEDESTALS stand west of the spawn: step one BEFORE the first door to take up the Ashblade (a blinking glass cannon) or the Chorister (a mending voice) -- or stay the Torchbearer. Four covenant altars below them: swear ONE covenant each (reward AND price printed; the fourth opens only to an earned vow). Three doors north, omens on the obelisks; sometimes a fourth TRIAL door. Every floor's room is warded by a FLOOR GUARDIAN: the descent door opens at its corpse. The shrine lights after every third room.|r")
  end)
  After(8.0, function()
    if gameOver then return end
    AnnounceTimedAll(12.0, "|cffaaddffBoons carry SIGILS -- hold 2/3 of one sigil for announced set bonuses (-sigils lists yours). Fast clears build WRATH (50/75/100%, ambush announced a room ahead). Fallen torches rekindle on the next cleared room. The Heart's final phase FEEDS on unspent Embers.|r")
  end)
  After(12.0, function()
    if gameOver then return end
    AnnounceTimedAll(12.0, "|cffffff66Seed " .. RunSeed .. " -- replay this exact dungeon with -seed "
      .. RunSeed .. " before the first door. -help for commands. The vault BREATHES every "
      .. math.floor(BREATH_PERIOD) .. "s: linger and it hits harder.|r")
  end)
end

-- =========================================================== entry points

function InitGlobals()
end

-- Lobby configuration in the exact WE shape for "Use Custom Forces" +
-- "Fixed Player Settings" (see maps/tidewatch-arena and CLAUDE.md gotcha
-- 18): every SetPlayerTeam index MUST be the index of an info.json force
-- containing that player. Here all three co-op slots sit in force 0
-- ("The Last Torchbearers"), so every player gets team 0.
function InitCustomPlayerSlots()
  for i = 0, MAX_PLAYERS - 1 do
    SetPlayerStartLocation(Player(i), i)
    ForcePlayerStartLocation(Player(i), i)
    SetPlayerColor(Player(i), ConvertPlayerColor(i))
    SetPlayerRacePreference(Player(i), RACE_PREF_HUMAN)
    SetPlayerRaceSelectable(Player(i), false)
    SetPlayerController(Player(i), MAP_CONTROL_USER)
  end
end

function InitCustomTeams()
  -- one force (index 0) holds red, blue and teal -> team 0 for everyone
  for i = 0, MAX_PLAYERS - 1 do
    SetPlayerTeam(Player(i), 0)
  end
end

function config()
  SetMapName("TRIGSTR_001")
  SetMapDescription("TRIGSTR_002")
  SetPlayers(MAX_PLAYERS)
  SetTeams(1)
  SetGamePlacement(MAP_PLACEMENT_USE_MAP_SETTINGS)

  DefineStartLocation(0, -320.0, -6912.0)
  DefineStartLocation(1, 0.0, -6912.0)
  DefineStartLocation(2, 320.0, -6912.0)

  InitCustomPlayerSlots()
  InitCustomTeams()
end

-- Map start.
function main()
  SetCameraBounds(
    -7680.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    -7680.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM),
    7680.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    7680.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    -7680.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    7680.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    7680.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    -7680.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM))
  SetDayNightModels(
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronTerrain\\DNCLordaeronTerrain.mdl",
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronUnit\\DNCLordaeronUnit.mdl")
  NewSoundEnvironment("Default")
  SetAmbientDaySound("DungeonDay")
  SetAmbientNightSound("DungeonNight")
  SetMapMusic("Music", true, 0)
  InitBlizzard()
  InitGlobals()

  -- seat the party: 1-3 co-op slots actually occupied by humans
  users = {}
  for pid = 0, MAX_PLAYERS - 1 do
    testMode[pid] = false
    if PlayingUser(pid) then users[#users + 1] = pid end
  end
  if #users == 0 then users = { 0 } end
  numPlayers = #users

  -- the co-op truce is real alliance state, not just lobby forces
  -- (CLAUDE.md gotcha 24): both directions of every seated pair
  for _, i in ipairs(users) do
    for _, j in ipairs(users) do
      if i ~= j then
        SetPlayerAlliance(Player(i), Player(j), ALLIANCE_PASSIVE, true)
        SetPlayerAlliance(Player(i), Player(j), ALLIANCE_SHARED_VISION, true)
      end
    end
  end

  -- Preplaced neutral furniture from units.json (build-map generates
  -- CreateAllUnits() into the packed script; war3mapUnits.doo is
  -- editor-only). Runs before anything enumerates preplaced units.
  CreateAllUnits()

  -- one hero per seated player, at the hub landing: everyone starts as the
  -- default Torchbearer; the hero pedestals swap kits before the first door
  local spawnX = { -320.0, 0.0, 320.0 }
  for slot, pid in ipairs(users) do
    SpawnHero(pid, "torch", spawnX[slot] or 0.0, -6912.0, 90.0)
  end

  SeedRNG(DEFAULT_SEED)
  RunSeed = DEFAULT_SEED
  LogRun("seed=" .. DEFAULT_SEED)
  SyncEmbers()

  InitSounds()
  ShowCredits()
  RegisterTriggers()
  RegisterChatCommands()
  StartClock()
  DealFloor(1)

  After(1.5, PlayIntro)
end
