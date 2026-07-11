-- =========================================================================
-- The Vaults of Ash — war3map.lua
-- =========================================================================
-- A seeded one-session co-op roguelike for 1-3 players. The last
-- torchbearers of a burned monastic order descend the vault the order died
-- sealing: a hub and four floors of cliff-walled islands hanging in dark
-- void. Travel is trigger teleport only.
--
-- The run:
--   * HUB: the party spawns at the cold landing. Three Sealstone Doors on
--     the north edge lead down; an Omen Obelisk before each door shows its
--     omen (danger skulls + reward sign). The fourth frame is the Vault
--     Gate, sealed until three rooms are cleared.
--   * FLOORS 1-3: each floor's deck holds 4 rooms; a seeded deal (without
--     replacement) puts 3 of them behind the doors. Rooms run a LOCKED ->
--     ACTIVE -> CLEARED state machine with three objective kinds: kill-all,
--     survive 60s, guarded reliquary. Clearing pays Embers (40/60/80 by
--     danger) and triggers the door's reward (embers / boon draft / relic).
--   * BOONS: a boon reward deals 3 boons onto the hub pedestals
--     (3-take-1): step a hero onto a pedestal plate to claim that boon —
--     the other two are consumed. Data-driven BOON_TABLE below.
--   * CAMPFIRE: after every 3rd cleared room the Ashen Shrine lights.
--     Step onto its rune plates to buy: heal 50% (60), boon reroll (40),
--     +100 max life (75). Purchases are TRIGGER-owned (embers deducted by
--     SetPlayerState, effects applied by natives) rather than an engine
--     shop, so the exact same code path runs in the game and in lib/sim.
--   * VAULT'S BREATH: every 90s the vault exhales — all uncleared content
--     gains +2% damage (stacking, announced with sound).
--   * BOSS: the Vault Heart, 3 phases — at 80%/40% health it sheds adds,
--     and at 40% swaps Vault Slam for Heartshatter Slam (the crossroads
--     ACtc pattern). Boss dead = victory; all torchbearers dead = defeat.
--     Either way a run summary (floor/rooms/embers/boons/seed) is shown.
--   * SEED: ALL randomness flows through one xorshift32 PRNG seeded by
--     '-seed N' (before the first door only) or DEFAULT_SEED (printed in
--     the lobby-visible map description). math.random / GetRandomInt are
--     never used, so the game and the headless sim replay identically.
--
-- Object types, regions and sounds are referenced through the GENERATED
-- named constants (UNIT_*/ITEM_*/ABIL_*/REGION_*/SOUND_*) that build-map
-- prepends to the packed script from the map-source JSON — never hand-typed
-- FourCC literals (CLAUDE.md gotcha 27; index: constants.json).
--
-- Chat commands: -help and -seed N (before the first door) always;
-- '-test' toggles debug mode gating: -floor N, -room <obj> [danger],
-- -embers N, -boon, -clear, -boss, -god, -ff, -runlog.
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
local EMBER_BASE       = 20      -- clear pay = EMBER_BASE + 20 * danger (40/60/80)
local EMBER_PER_DANGER = 20
local REWARD_EMBERS    = 40      -- the 'embers' reward bonus
local COST_HEAL        = 60
local COST_REROLL      = 40
local COST_FORTIFY     = 75
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

-- -------------------------------------------------------------- world data
-- All geometry below is read from the generated REGION_* constants —
-- regions.json (written by assets/generate-terrain.mjs) is the single
-- source of truth for every island and plate rect.
local DOOR_LETTERS = { "A", "B", "C" }

-- game state ---------------------------------------------------------------
local users        = {}    -- seated human pids, in slot order
local numPlayers   = 1
local heroes       = {}    -- pid -> Torchbearer hero
local testMode     = {}    -- pid -> bool
local clockScale   = 1
local gameOver     = false
local firstDoor    = false -- true once any door has been entered (-seed lock)

local floorNum     = 1     -- current floor (1..3, then 4 = Vault Gate)
local roomsCleared = 0
local embersPool   = 0
local embersEarned = 0
local boonsTaken   = {}    -- list of boon names, in take order

local doorsArmed   = false
local doorDeal     = nil   -- door idx -> {roomIdx, obj, danger, reward}
local doorTags     = {}    -- door idx -> texttag handle

local roomState    = "idle"   -- idle | active
local activeRoom   = nil      -- {floor, roomIdx, obj, danger, reward, region}
local activeUnits  = {}       -- array of spawned unit handles
local activeSet    = {}       -- unit handle -> spec (membership + drops)
local remaining    = 0
local surviveLeft  = 0
local trickleLeft  = 0

local draftActive  = false
local draftOffer   = nil   -- array of 3 BOON_TABLE entries
local draftItems   = {}    -- plate idx -> item handle
local pendingDraft = false
local boonTaken    = {}    -- boon key -> true once claimed

local shrineLit    = false
local shrineUsed   = {}    -- plate key -> true once bought this lighting

local breathLeft   = BREATH_PERIOD
local breathStacks = 0

local bossActive   = false
local bossUnit     = nil
local bossPhase    = 0
local gateArmed    = false

-- exposed for the headless sim / -runlog (plain globals, sim.global reads them)
RUNLOG = ""
RunSeed = DEFAULT_SEED
VaultBreathStacks = 0

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

local function SeedRNG(n)
  rngState = (n % 2147483646) + 1 -- [1, 2147483646]
end

local function NextRand() -- (0, 1)
  local hi = rngState // 127773
  local lo = rngState % 127773
  rngState = 16807 * lo - 2836 * hi
  if rngState <= 0 then rngState = rngState + 2147483647 end
  return rngState / 2147483647.0
end

local function RandInt(lo, hi) -- inclusive
  return lo + math.floor(NextRand() * (hi - lo + 1))
end

local function ShuffledIndices(n) -- seeded Fisher-Yates over 1..n
  local a = {}
  for i = 1, n do a[i] = i end
  for i = n, 2, -1 do
    local j = RandInt(1, i)
    a[i], a[j] = a[j], a[i]
  end
  return a
end

-- ----------------------------------------------------------------- helpers

local function LogRun(line)
  RUNLOG = RUNLOG .. line .. "\n"
end

local function PlayingUser(pid)
  local p = Player(pid)
  return GetPlayerSlotState(p) == PLAYER_SLOT_STATE_PLAYING
    and GetPlayerController(p) == MAP_CONTROL_USER
end

local function AnnounceAll(msg)
  for _, pid in ipairs(users) do
    DisplayTextToPlayer(Player(pid), 0, 0, msg)
  end
end

local function AnnounceTimedAll(dur, msg)
  for _, pid in ipairs(users) do
    DisplayTimedTextToPlayer(Player(pid), 0, 0, dur, msg)
  end
end

local function Tell(pid, msg)
  DisplayTimedTextToPlayer(Player(pid), 0, 0, 8.0, msg)
end

local function After(delay, fn)
  local t = CreateTimer()
  TimerStart(t, delay, false, function()
    DestroyTimer(t)
    fn()
  end)
end

local function Alive(u)
  return u ~= nil and GetWidgetLife(u) > 0.405
end

local function RegionCenter(R)
  return (R.minX + R.maxX) / 2.0, (R.minY + R.maxY) / 2.0
end

-- embers: one SHARED party pool, mirrored into every seated player's gold
local function SyncEmbers()
  for _, pid in ipairs(users) do
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, embersPool)
  end
end

local function AddEmbers(n)
  embersPool = embersPool + n
  if n > 0 then embersEarned = embersEarned + n end
  SyncEmbers()
end

local function SpendEmbers(n)
  if embersPool < n then return false end
  embersPool = embersPool - n
  SyncEmbers()
  return true
end

local function ForEachHero(fn)
  for _, pid in ipairs(users) do
    if heroes[pid] ~= nil then fn(heroes[pid], pid) end
  end
end

local function AnyHeroAlive()
  local found = false
  ForEachHero(function(h) if Alive(h) then found = true end end)
  return found
end

local function HeroPid(u)
  for _, pid in ipairs(users) do
    if heroes[pid] == u then return pid end
  end
  return nil
end

local function TeleportParty(x, y)
  local i = 0
  ForEachHero(function(h)
    if Alive(h) then
      SetUnitPosition(h, x + (i - 1) * 128.0, y)
      i = i + 1
    end
  end)
end

-- spawn counts: x1.6 per extra player, rounded up
local function ScaleCount(base)
  return math.ceil(base * (SCALE_PER_EXTRA ^ (numPlayers - 1)))
end

-- per-room entry camera beat
local function CameraBeat(x, y)
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

local ROOMS = {
  { REGION_ROOM_F1_A, REGION_ROOM_F1_B, REGION_ROOM_F1_C, REGION_ROOM_F1_D },
  { REGION_ROOM_F2_A, REGION_ROOM_F2_B, REGION_ROOM_F2_C, REGION_ROOM_F2_D },
  { REGION_ROOM_F3_A, REGION_ROOM_F3_B, REGION_ROOM_F3_C, REGION_ROOM_F3_D },
}
-- fixed objective per physical island; the seeded deal picks which three
-- islands (and so which objectives) sit behind this run's doors
local OBJECTIVES = {
  { "killall", "survive", "reliquary", "killall" },
  { "survive", "killall", "killall", "reliquary" },
  { "reliquary", "killall", "survive", "killall" },
}
local ROOM_KEYS = {
  { "F1A", "F1B", "F1C", "F1D" },
  { "F2A", "F2B", "F2C", "F2D" },
  { "F3A", "F3B", "F3C", "F3D" },
}

-- creep tiers by floor; dmg feeds Vault's Breath scaling
local TIERS = {
  { { type = UNIT_ASHSPAWN_ACOLYTE, name = "Ashspawn Acolyte", dmg = 11 },
    { type = UNIT_VAULT_KOBOLD, name = "Vault Kobold", dmg = 9 } },
  { { type = UNIT_CINDER_BRUTE, name = "Cinder Brute", dmg = 19 },
    { type = UNIT_ASH_TIDE_CRAWLER, name = "Ash Tide Crawler", dmg = 15 } },
  { { type = UNIT_VAULTBOUND_OGRE, name = "Vaultbound Ogre", dmg = 26 },
    { type = UNIT_EMBERFANG_ALPHA, name = "Emberfang Alpha", dmg = 22 } },
}
local ELITES = {
  { type = UNIT_PYRE_WARDEN, name = "Pyre Warden", dmg = 32 },
  { type = UNIT_ASHEN_CHAMPION, name = "Ashen Champion", dmg = 30 },
}
local BOSS_SPEC = { type = UNIT_VAULT_HEART, name = "Vault Heart", dmg = 55 }
local ADD_SPECS = {
  { type = UNIT_HEART_SPARK, name = "Heart Spark", dmg = 7 },
  { type = UNIT_MOLTEN_SHARD, name = "Molten Shard", dmg = 12 },
}

-- ------------------------------------------------------ data: the boon table
-- Data-driven: phase 2 extends this list (24+ boons) without touching the
-- draft machinery. kind: stat (SetHeroStr/Agi/Int), maxhp, allstats, or
-- ability (object-data ability grant via UnitAddAbility).
local BOON_TABLE = {
  { key = "str", name = "Ember Sinew", item = ITEM_EMBER_SINEW, kind = "stat", stat = "str", amount = 6 },
  { key = "agi", name = "Ashen Grace", item = ITEM_ASHEN_GRACE, kind = "stat", stat = "agi", amount = 6 },
  { key = "int", name = "Kindled Mind", item = ITEM_KINDLED_MIND, kind = "stat", stat = "int", amount = 6 },
  { key = "hp", name = "Torchbearer Vigor", item = ITEM_TORCHBEARER_VIGOR, kind = "maxhp", amount = 150 },
  { key = "evasion", name = "Cinderguard", item = ITEM_CINDERGUARD, kind = "ability", abil = ABIL_CINDERGUARD_EVASION },
  { key = "crit", name = "Emberedge", item = ITEM_EMBEREDGE, kind = "ability", abil = ABIL_EMBEREDGE_STRIKE },
  { key = "bash", name = "Ashbreaker", item = ITEM_ASHBREAKER, kind = "ability", abil = ABIL_ASHBREAKER_BASH },
  { key = "allstats", name = "Pyre Ward", item = ITEM_PYRE_WARD, kind = "allstats", amount = 4 },
}

local BOON_PLATE_REGIONS = { REGION_BOON_PLATE_A, REGION_BOON_PLATE_B, REGION_BOON_PLATE_C }
local DOOR_REGIONS = { REGION_DOOR_A, REGION_DOOR_B, REGION_DOOR_C }

local function ApplyBoon(boon, hero, pid)
  if boon.kind == "stat" then
    if boon.stat == "str" then SetHeroStr(hero, GetHeroStr(hero, false) + boon.amount, true)
    elseif boon.stat == "agi" then SetHeroAgi(hero, GetHeroAgi(hero, false) + boon.amount, true)
    else SetHeroInt(hero, GetHeroInt(hero, false) + boon.amount, true) end
  elseif boon.kind == "maxhp" then
    SetUnitState(hero, UNIT_STATE_MAX_LIFE, GetUnitState(hero, UNIT_STATE_MAX_LIFE) + boon.amount)
    SetUnitState(hero, UNIT_STATE_LIFE, GetUnitState(hero, UNIT_STATE_LIFE) + boon.amount)
  elseif boon.kind == "allstats" then
    SetHeroStr(hero, GetHeroStr(hero, false) + boon.amount, true)
    SetHeroAgi(hero, GetHeroAgi(hero, false) + boon.amount, true)
    SetHeroInt(hero, GetHeroInt(hero, false) + boon.amount, true)
  elseif boon.kind == "ability" then
    UnitAddAbility(hero, boon.abil)
  end
  Tell(pid, "|cff88ff88Boon claimed: " .. boon.name .. ".|r")
end

-- +2 all attributes to the whole party (the relic reward)
local function ApplyRelicBlessing()
  ForEachHero(function(h)
    SetHeroStr(h, GetHeroStr(h, false) + 2, true)
    SetHeroAgi(h, GetHeroAgi(h, false) + 2, true)
    SetHeroInt(h, GetHeroInt(h, false) + 2, true)
  end)
end

-- --------------------------------------------------------- breath & spawning

local function BreathFactor()
  return 1.0 + (BREATH_PCT / 100.0) * breathStacks
end

local function SpawnHostile(spec, x, y)
  local u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), spec.type, x, y, 270.0)
  BlzSetUnitBaseDamage(u, math.floor(spec.dmg * BreathFactor() + 0.5), 0)
  return u
end

local function ApplyBreathTick()
  breathStacks = breathStacks + 1
  VaultBreathStacks = breathStacks
  for _, u in ipairs(activeUnits) do
    if Alive(u) and activeSet[u] ~= nil then
      BlzSetUnitBaseDamage(u, math.floor(activeSet[u].dmg * BreathFactor() + 0.5), 0)
    end
  end
  if bossActive and Alive(bossUnit) then
    BlzSetUnitBaseDamage(bossUnit, math.floor(BOSS_SPEC.dmg * BreathFactor() + 0.5), 0)
  end
  StartSound(sndBreathHorn)
  AnnounceTimedAll(8.0, "|cffff6644The Vault breathes. Everything still stirring below hits "
    .. (BREATH_PCT * breathStacks) .. "% harder.|r")
  LogRun("breath|stacks=" .. breathStacks)
end

-- spawn one room creep at a seeded position inside the room rect
local function SpawnRoomCreep(spec, R)
  local x = math.floor(R.minX + 448 + NextRand() * (R.maxX - R.minX - 896))
  local y = math.floor(R.minY + 448 + NextRand() * (R.maxY - R.minY - 1088))
  local u = SpawnHostile(spec, x, y)
  activeUnits[#activeUnits + 1] = u
  activeSet[u] = spec
  remaining = remaining + 1
  LogRun("spawn|" .. spec.name .. "|x=" .. x .. "|y=" .. y)
  return u
end

-- ------------------------------------------------------------ omens & deal

local OBJ_LABEL = {
  killall = "extinguish every vault-born",
  survive = "survive the onslaught for " .. SURVIVE_TIME .. " seconds",
  reliquary = "slay the reliquary guards and break the seal",
}
local REWARD_LABEL = { embers = "Embers", boon = "a Boon draft", relic = "a Relic" }

local function OmenText(d)
  return "danger " .. string.rep("!", d.danger) .. " / reward: " .. REWARD_LABEL[d.reward]
end

local function ShowDoorOmens()
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
      .. "|r |cff888888(" .. OBJ_LABEL[doorDeal[i].obj] .. ")|r")
  end
end

-- seeded, without replacement: 3 of the floor's 4 rooms land on the doors
local function DealFloor(f)
  local order = ShuffledIndices(4)
  doorDeal = {}
  local anyBoon = false
  for i = 1, 3 do
    local roomIdx = order[i]
    local danger = RandInt(1, 3)
    local roll = NextRand()
    local reward = (roll < 0.4 and "embers") or (roll < 0.8 and "boon") or "relic"
    if reward == "boon" then anyBoon = true end
    doorDeal[i] = { roomIdx = roomIdx, obj = OBJECTIVES[f][roomIdx], danger = danger, reward = reward }
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
  doorsArmed = true
  local parts = {}
  for i = 1, 3 do
    local d = doorDeal[i]
    parts[i] = DOOR_LETTERS[i] .. "=" .. ROOM_KEYS[f][d.roomIdx] .. ":" .. d.obj
      .. ":d" .. d.danger .. ":" .. d.reward
  end
  LogRun("deal|floor=" .. f .. "|" .. table.concat(parts, "|"))
  AnnounceTimedAll(10.0, "|cffaaddffFloor " .. f .. ". Three doors stand unsealed -- read the omens, pick one, step onto its plate.|r")
  ShowDoorOmens()
end

-- --------------------------------------------------------------- boon draft

local function ClearDraftItems()
  for i = 1, 3 do
    if draftItems[i] ~= nil then
      RemoveItem(draftItems[i])
      draftItems[i] = nil
    end
  end
end

local function ProceedAfterDraft()
  if roomsCleared >= CAMPFIRE_EVERY and floorNum > 3 then
    -- gate already unsealed by ReturnToHub; nothing to arm
    return
  end
  if floorNum <= 3 then DealFloor(floorNum) end
end

local function DealBoons()
  local pool = {}
  for _, b in ipairs(BOON_TABLE) do
    if not boonTaken[b.key] then pool[#pool + 1] = b end
  end
  if #pool == 0 then
    AnnounceAll("|cffaaaaaaEvery boon of the order has already been claimed.|r")
    draftActive = false
    pendingDraft = false
    ProceedAfterDraft()
    return
  end
  local order = ShuffledIndices(#pool)
  draftOffer = {}
  local names = {}
  for i = 1, math.min(3, #pool) do
    draftOffer[i] = pool[order[i]]
    names[#names + 1] = pool[order[i]].name
  end
  ClearDraftItems()
  for i = 1, #draftOffer do
    local cx, cy = RegionCenter(BOON_PLATE_REGIONS[i])
    draftItems[i] = CreateItem(draftOffer[i].item, cx, cy + 96.0)
  end
  draftActive = true
  pendingDraft = false
  StartSound(sndSealChime)
  AnnounceTimedAll(12.0, "|cff88ff88A boon draft: " .. table.concat(names, ", ")
    .. ". Step one torchbearer onto a pedestal plate to claim ITS boon -- the others crumble.|r")
  LogRun("boonoffer|" .. table.concat(names, "|"))
end

local function TakeBoon(plateIdx, hero, pid)
  local boon = draftOffer[plateIdx]
  if boon == nil then return end
  draftActive = false
  boonTaken[boon.key] = true
  boonsTaken[#boonsTaken + 1] = boon.name
  ClearDraftItems()
  ApplyBoon(boon, hero, pid)
  AnnounceAll("|cff88ff88" .. GetPlayerName(Player(pid)) .. " claims " .. boon.name
    .. "; the unclaimed boons crumble to ash.|r")
  LogRun("boontake|pid=" .. pid .. "|" .. boon.name)
  ProceedAfterDraft()
end

-- ---------------------------------------------------------------- campfire

local function LightShrine()
  shrineLit = true
  shrineUsed = {}
  StartSound(sndSealChime)
  AnnounceTimedAll(12.0, "|cffffaa44The Ashen Shrine flares to life. Rune plates: HEAL half your wounds ("
    .. COST_HEAL .. "), REROLL a pending boon draft (" .. COST_REROLL .. "), FORTIFY +"
    .. FORTIFY_HP .. " max life (" .. COST_FORTIFY .. "). Embers: " .. embersPool .. ".|r")
  LogRun("campfire|lit")
end

local function ShrinePurchase(kind, pid)
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
  local cost = (kind == "heal" and COST_HEAL) or (kind == "reroll" and COST_REROLL) or COST_FORTIFY
  if not SpendEmbers(cost) then
    Tell(pid, "|cffaaaaaaNot enough Embers (" .. cost .. " needed, " .. embersPool .. " held).|r")
    return
  end
  shrineUsed[kind] = true
  if kind == "heal" then
    ForEachHero(function(h)
      if Alive(h) then
        local maxhp = GetUnitState(h, UNIT_STATE_MAX_LIFE)
        SetUnitState(h, UNIT_STATE_LIFE, GetUnitState(h, UNIT_STATE_LIFE) + maxhp * 0.5)
      end
    end)
    AnnounceAll("|cffffaa44The shrine knits the party's wounds (half of maximum life restored).|r")
  elseif kind == "fortify" then
    ForEachHero(function(h)
      SetUnitState(h, UNIT_STATE_MAX_LIFE, GetUnitState(h, UNIT_STATE_MAX_LIFE) + FORTIFY_HP)
      SetUnitState(h, UNIT_STATE_LIFE, GetUnitState(h, UNIT_STATE_LIFE) + FORTIFY_HP)
    end)
    AnnounceAll("|cffffaa44The shrine tempers the party: +" .. FORTIFY_HP .. " maximum life.|r")
  else
    AnnounceAll("|cffffaa44The shrine stirs the ashes -- the boon draft is redealt.|r")
    LogRun("reroll")
    DealBoons()
  end
  LogRun("campfire|" .. kind .. "|-" .. cost)
end

-- ------------------------------------------------------------- run summary

local function BuildSummary(verdict)
  local boons = (#boonsTaken > 0) and table.concat(boonsTaken, ", ") or "none"
  return "THE VAULTS OF ASH -- " .. verdict .. ". Floor reached: " .. floorNum
    .. "/4. Rooms cleared: " .. roomsCleared .. ". Embers earned: " .. embersEarned
    .. ". Boons: " .. boons .. ". Seed: " .. RunSeed .. "."
end

local function ShowSummary(verdict)
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

local function DefeatRun()
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

local function VictoryRun()
  if gameOver then return end
  gameOver = true
  StartSound(sndVictoryHorn)
  AnnounceAll("|cff88ff88The Vault Heart shatters. The seal your order died for holds at last.|r")
  ShowSummary("VICTORY")
  LogRun("victory")
  After(5.0, function()
    for _, pid in ipairs(users) do
      CustomVictoryBJ(Player(pid), true, true)
    end
  end)
end

-- ------------------------------------------------------- room state machine

local function ReturnToHub()
  if gameOver then return end
  local cx, cy = RegionCenter(REGION_HUB_RETURN)
  TeleportParty(cx, cy)
  for _, pid in ipairs(users) do
    PanCameraToTimedForPlayer(Player(pid), cx, cy, 0.0)
  end
  if roomsCleared > 0 and roomsCleared % CAMPFIRE_EVERY == 0 then
    LightShrine()
  end
  if pendingDraft then
    DealBoons()
  elseif floorNum <= 3 then
    DealFloor(floorNum)
  end
  if floorNum > 3 and not gateArmed then
    gateArmed = true
    StartSound(sndSealChime)
    AnnounceTimedAll(12.0, "|cffff6666Three rooms lie silent. The VAULT GATE stands unsealed -- step onto its plate when you are ready to face the Heart.|r")
    LogRun("gate|unsealed")
  end
end

local function ClearRoom()
  if activeRoom == nil or roomState ~= "active" then return end
  roomState = "idle"
  local room = activeRoom
  activeRoom = nil
  -- survivors of a survive-room crumble with the seal (no drops, no log)
  for _, u in ipairs(activeUnits) do
    if Alive(u) then KillUnit(u) end
  end
  activeUnits = {}
  activeSet = {}
  remaining = 0
  local pay = EMBER_BASE + EMBER_PER_DANGER * room.danger
  AddEmbers(pay)
  StartSound(sndSealChime)
  AnnounceTimedAll(10.0, "|cff88ff88Room cleared! +" .. pay .. " Embers (danger "
    .. string.rep("!", room.danger) .. "). Party Embers: " .. embersPool .. ".|r")
  LogRun("clear|room=" .. ROOM_KEYS[room.floor][room.roomIdx] .. "|embers=" .. pay .. "|total=" .. embersPool)
  roomsCleared = roomsCleared + 1
  floorNum = roomsCleared + 1
  if room.reward == "embers" then
    AddEmbers(REWARD_EMBERS)
    AnnounceAll("|cffffcc00The room's cache spills " .. REWARD_EMBERS .. " bonus Embers.|r")
    LogRun("reward|embers|+" .. REWARD_EMBERS)
  elseif room.reward == "boon" then
    pendingDraft = true
    AnnounceAll("|cff88ff88The order's blessing lingers here -- a boon draft awaits at the hub pedestals.|r")
    LogRun("reward|boon")
  else
    local hx, hy = RegionCenter(REGION_HUB_RETURN)
    CreateItem(ITEM_MONASTIC_RELIC, hx + 256.0, hy)
    ApplyRelicBlessing()
    AnnounceAll("|cffffcc00A Monastic Relic is recovered: +2 to all attributes of every torchbearer.|r")
    LogRun("reward|relic")
  end
  After(2.5, ReturnToHub)
end

local function ActivateRoom(f, d)
  local R = ROOMS[f][d.roomIdx]
  local cx, cy = RegionCenter(R)
  local entryX, entryY = cx, R.minY + 320.0
  activeRoom = { floor = f, roomIdx = d.roomIdx, obj = d.obj, danger = d.danger, reward = d.reward, region = R }
  roomState = "active"
  activeUnits = {}
  activeSet = {}
  remaining = 0
  doorsArmed = false
  TeleportParty(entryX, entryY)
  CameraBeat(cx, cy)
  LogRun("enter|room=" .. ROOM_KEYS[f][d.roomIdx] .. "|obj=" .. d.obj
    .. "|danger=" .. d.danger .. "|reward=" .. d.reward)

  local tier = TIERS[f]
  if d.obj == "killall" then
    local total = ScaleCount(3 + 2 * d.danger)
    for i = 1, total do
      SpawnRoomCreep(tier[1 + (i % 2)], R)
    end
    if d.danger >= 3 then
      SpawnRoomCreep(ELITES[1 + (RandInt(0, 1))], R)
    end
    AnnounceTimedAll(10.0, "|cffff9966The seal breaks: " .. OBJ_LABEL.killall .. ".|r")
  elseif d.obj == "survive" then
    surviveLeft = SURVIVE_TIME
    trickleLeft = TRICKLE_EVERY
    local initial = ScaleCount(2 + d.danger)
    for i = 1, initial do
      SpawnRoomCreep(tier[1 + (i % 2)], R)
    end
    AnnounceTimedAll(10.0, "|cffff9966The seal breaks: " .. OBJ_LABEL.survive .. ". They will not stop coming.|r")
  else -- reliquary
    local reliquary = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), UNIT_SEALED_RELIQUARY,
      cx, cy + 512.0, 270.0)
    SetUnitInvulnerable(reliquary, true)
    local guards = ScaleCount(2 + d.danger)
    for i = 1, guards do
      SpawnRoomCreep(tier[1 + (i % 2)], R)
    end
    if d.danger >= 3 then
      SpawnRoomCreep(ELITES[1 + (RandInt(0, 1))], R)
    end
    AnnounceTimedAll(10.0, "|cffff9966The seal breaks: " .. OBJ_LABEL.reliquary .. ".|r")
  end
end

local function EnterDoor(i)
  if gameOver or not doorsArmed or roomState == "active" then return end
  if draftActive then return end
  local d = doorDeal[i]
  if d == nil then return end
  firstDoor = true
  for k = 1, 3 do
    if doorTags[k] ~= nil then
      DestroyTextTag(doorTags[k])
      doorTags[k] = nil
    end
  end
  StartSound(sndSealChime)
  AnnounceAll("|cffaaddffDoor " .. DOOR_LETTERS[i] .. " grinds open...|r")
  LogRun("door|" .. DOOR_LETTERS[i] .. "|floor=" .. floorNum)
  ActivateRoom(floorNum, d)
end

-- --------------------------------------------------------------- the boss

local function EnterBoss()
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
  AnnounceTimedAll(12.0, "|cffff4444THE VAULT HEART. The thing your order died sealing beats before you. Break it.|r")
  LogRun("boss|enter")
end

local function BossPhaseWatch()
  if not bossActive or bossUnit == nil or not Alive(bossUnit) then return end
  local ratio = GetWidgetLife(bossUnit) / GetUnitState(bossUnit, UNIT_STATE_MAX_LIFE)
  if bossPhase == 1 and ratio <= BOSS_PHASE2_AT then
    bossPhase = 2
    local n = ScaleCount(2)
    for i = 1, n do
      local u = SpawnHostile(ADD_SPECS[1],
        GetUnitX(bossUnit) + math.floor(NextRand() * 512) - 256,
        GetUnitY(bossUnit) - 256.0)
      activeUnits[#activeUnits + 1] = u
      activeSet[u] = ADD_SPECS[1]
    end
    AnnounceTimedAll(10.0, "|cffff6644The Heart cracks -- sparks of it take shape and swarm!|r")
    LogRun("boss|phase=2|adds=" .. n)
  elseif bossPhase == 2 and ratio <= BOSS_PHASE3_AT then
    bossPhase = 3
    local n = ScaleCount(2)
    for i = 1, n do
      local u = SpawnHostile(ADD_SPECS[2],
        GetUnitX(bossUnit) + math.floor(NextRand() * 512) - 256,
        GetUnitY(bossUnit) - 256.0)
      activeUnits[#activeUnits + 1] = u
      activeSet[u] = ADD_SPECS[2]
    end
    UnitRemoveAbility(bossUnit, ABIL_VAULT_SLAM)
    UnitAddAbility(bossUnit, ABIL_HEARTSHATTER_SLAM)
    AnnounceTimedAll(10.0, "|cffff2222The Heart is breaking -- molten shards tear loose and its slam turns to HEARTSHATTER!|r")
    LogRun("boss|phase=3|adds=" .. n)
  end
end

-- ------------------------------------------------------------ master clock
-- One repeating 1-second timer drives the Vault's Breath, the survive
-- countdown/trickle and the boss phase watch, so '-ff' scales everything
-- in one place.
local function StartClock()
  local t = CreateTimer()
  TimerStart(t, 1.0, true, function()
    if gameOver then return end
    breathLeft = breathLeft - clockScale
    while breathLeft <= 0 do
      breathLeft = breathLeft + BREATH_PERIOD
      ApplyBreathTick()
    end
    if roomState == "active" and activeRoom ~= nil and activeRoom.obj == "survive" then
      surviveLeft = surviveLeft - clockScale
      trickleLeft = trickleLeft - clockScale
      if surviveLeft <= 0 then
        AnnounceAll("|cff88ff88The onslaught spends itself; the survivors crumble.|r")
        ClearRoom()
      elseif trickleLeft <= 0 then
        trickleLeft = trickleLeft + TRICKLE_EVERY
        local tier = TIERS[activeRoom.floor]
        local n = ScaleCount(activeRoom.danger)
        for i = 1, n do
          SpawnRoomCreep(tier[1 + (i % 2)], activeRoom.region)
        end
      end
    end
    BossPhaseWatch()
  end)
end

-- ----------------------------------------------------------- unit triggers

local function HandleDeath()
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

  -- a torchbearer: permadeath — when the last torch goes out the run ends
  local pid = HeroPid(u)
  if pid ~= nil then
    AnnounceAll("|cffff8866The torch of " .. GetPlayerName(Player(pid)) .. " gutters out.|r")
    if not AnyHeroAlive() then DefeatRun() end
    return
  end

  -- room creeps
  if roomState == "active" and activeSet[u] ~= nil then
    local spec = activeSet[u]
    activeSet[u] = nil
    remaining = remaining - 1
    -- elites carry consumables
    if spec.type == UNIT_PYRE_WARDEN or spec.type == UNIT_ASHEN_CHAMPION then
      local it = (NextRand() < 0.5) and ITEM_EMBER_DRAUGHT or ITEM_TORCH_OIL
      CreateItem(it, GetUnitX(u), GetUnitY(u))
      LogRun("elitedrop|" .. spec.name)
    end
    local obj = activeRoom and activeRoom.obj or "killall"
    if remaining <= 0 and (obj == "killall" or obj == "reliquary") then
      if obj == "reliquary" then
        local R = activeRoom.region
        local cx, cy = RegionCenter(R)
        CreateItem(ITEM_MONASTIC_RELIC, cx, cy + 256.0)
        AnnounceAll("|cffffcc00The reliquary seal shatters; its relic tumbles free.|r")
        LogRun("reliquary|looted")
      end
      ClearRoom()
    end
  end
end

local function RegisterTriggers()
  local death = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(death, EVENT_PLAYER_UNIT_DEATH)
  TriggerAddAction(death, HandleDeath)

  -- doors
  for i = 1, 3 do
    local trig = CreateTrigger()
    local rgn = CreateRegion()
    local R = DOOR_REGIONS[i]
    RegionAddRect(rgn, Rect(R.minX, R.minY, R.maxX, R.maxY))
    TriggerRegisterEnterRegion(trig, rgn, nil)
    local doorIdx = i
    TriggerAddAction(trig, function()
      local u = GetEnteringUnit()
      if HeroPid(u) ~= nil then EnterDoor(doorIdx) end
    end)
  end

  -- the Vault Gate
  do
    local trig = CreateTrigger()
    local rgn = CreateRegion()
    local R = REGION_VAULT_GATE
    RegionAddRect(rgn, Rect(R.minX, R.minY, R.maxX, R.maxY))
    TriggerRegisterEnterRegion(trig, rgn, nil)
    TriggerAddAction(trig, function()
      local u = GetEnteringUnit()
      local pid = HeroPid(u)
      if pid == nil then return end
      if not gateArmed then
        Tell(pid, "|cffaaaaaaThe Vault Gate is sealed. Clear the three floors first.|r")
        return
      end
      EnterBoss()
    end)
  end

  -- boon pedestal plates
  for i = 1, 3 do
    local trig = CreateTrigger()
    local rgn = CreateRegion()
    local R = BOON_PLATE_REGIONS[i]
    RegionAddRect(rgn, Rect(R.minX, R.minY, R.maxX, R.maxY))
    TriggerRegisterEnterRegion(trig, rgn, nil)
    local plateIdx = i
    TriggerAddAction(trig, function()
      if not draftActive or gameOver then return end
      local u = GetEnteringUnit()
      local pid = HeroPid(u)
      if pid ~= nil then TakeBoon(plateIdx, u, pid) end
    end)
  end

  -- shrine rune plates
  local shrinePlates = {
    { region = REGION_SHRINE_HEAL, kind = "heal" },
    { region = REGION_SHRINE_REROLL, kind = "reroll" },
    { region = REGION_SHRINE_FORTIFY, kind = "fortify" },
  }
  for _, sp in ipairs(shrinePlates) do
    local trig = CreateTrigger()
    local rgn = CreateRegion()
    RegionAddRect(rgn, Rect(sp.region.minX, sp.region.minY, sp.region.maxX, sp.region.maxY))
    TriggerRegisterEnterRegion(trig, rgn, nil)
    local kind = sp.kind
    TriggerAddAction(trig, function()
      if gameOver then return end
      local u = GetEnteringUnit()
      local pid = HeroPid(u)
      if pid ~= nil then ShrinePurchase(kind, pid) end
    end)
  end
end

-- --------------------------------------------------------- chat commands

local function ShowHelp(pid)
  Tell(pid, "|cffaaddffVaults of Ash commands:|r")
  Tell(pid, "-help : this list. -seed N : reseed the dungeon (only before the first door; current seed " .. RunSeed .. ").")
  Tell(pid, "-test : toggle debug mode (required for the rest).")
  Tell(pid, "-floor N : jump the run to floor N. -room <killall|survive|reliquary> [danger] : force a room.")
  Tell(pid, "-embers N : set the party's Embers. -boon : force a boon draft. -clear : clear the active room.")
  Tell(pid, "-boss : jump to the Vault Heart. -god : make torchbearers invulnerable. -ff : " .. FF_SCALE .. "x clock.")
  Tell(pid, "-runlog : print the deterministic run log.")
end

local function HandleSeed(pid, n)
  if firstDoor then
    Tell(pid, "|cffaaaaaaThe dungeon is already dealt -- -seed works only before the first door.|r")
    return
  end
  RunSeed = n
  SeedRNG(n)
  RUNLOG = ""
  LogRun("seed=" .. n)
  AnnounceAll("|cffaaddffThe vault reshuffles its bones: seed " .. n .. ".|r")
  DealFloor(1)
end

local function DebugRoom(pid, obj, danger)
  if roomState == "active" or gameOver then
    Tell(pid, "|cffaaaaaaA room is already active.|r")
    return
  end
  if floorNum > 3 then
    Tell(pid, "|cffaaaaaaOnly the Vault Gate remains -- use -boss.|r")
    return
  end
  -- pick the current floor's first island with the requested objective
  local roomIdx = nil
  for i = 1, 4 do
    if OBJECTIVES[floorNum][i] == obj then
      roomIdx = i
      break
    end
  end
  if roomIdx == nil then
    Tell(pid, "|cffaaaaaaNo " .. obj .. " room on floor " .. floorNum .. ".|r")
    return
  end
  firstDoor = true
  LogRun("debugroom|floor=" .. floorNum .. "|obj=" .. obj .. "|danger=" .. danger)
  ActivateRoom(floorNum, { roomIdx = roomIdx, obj = obj, danger = danger, reward = "embers" })
end

local function HandleChat(pid, msgRaw)
  local msg = string.lower(msgRaw)
  msg = string.match(msg, "^%s*(.-)%s*$")
  if string.sub(msg, 1, 1) ~= "-" then return end

  if msg == "-help" then
    ShowHelp(pid)
    return
  end
  local seedArg = string.match(msg, "^%-seed%s+(%d+)$")
  if seedArg ~= nil then
    HandleSeed(pid, math.tointeger(tonumber(seedArg)) or DEFAULT_SEED)
    return
  end
  if msg == "-test" then
    testMode[pid] = not testMode[pid]
    if testMode[pid] then
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid))
        .. " enabled -test debug mode.|r Commands: -floor N, -room <obj> [d], -embers N, -boon, -clear, -boss, -god, -ff, -runlog")
    else
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid)) .. " disabled -test debug mode.|r")
    end
    return
  end

  local floorArg = string.match(msg, "^%-floor%s+([1-3])$")
  local roomObj, roomDanger = string.match(msg, "^%-room%s+(%a+)%s*(%d*)$")
  local embersArg = string.match(msg, "^%-embers%s+(%d+)$")
  local known = floorArg ~= nil or roomObj ~= nil or embersArg ~= nil
    or msg == "-boon" or msg == "-clear" or msg == "-boss" or msg == "-god"
    or msg == "-ff" or msg == "-runlog"
  if not known then return end
  if not testMode[pid] then
    Tell(pid, "|cffaaaaaaDebug commands need -test mode. Type -test first.|r")
    return
  end

  if floorArg ~= nil then
    local f = math.tointeger(tonumber(floorArg))
    roomsCleared = f - 1
    floorNum = f
    firstDoor = true
    draftActive = false
    pendingDraft = false
    ClearDraftItems()
    Tell(pid, "|cffff88ffJumped to floor " .. f .. ".|r")
    LogRun("debugfloor|" .. f)
    DealFloor(f)
  elseif roomObj ~= nil then
    if OBJ_LABEL[roomObj] == nil then
      Tell(pid, "|cffaaaaaa-room wants killall, survive or reliquary.|r")
      return
    end
    local d = math.tointeger(tonumber(roomDanger)) or 2
    if d < 1 then d = 1 elseif d > 3 then d = 3 end
    DebugRoom(pid, roomObj, d)
  elseif embersArg ~= nil then
    embersPool = math.tointeger(tonumber(embersArg)) or 0
    SyncEmbers()
    Tell(pid, "|cffff88ffParty Embers set to " .. embersPool .. ".|r")
  elseif msg == "-boon" then
    Tell(pid, "|cffff88ffForcing a boon draft.|r")
    DealBoons()
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
    AnnounceAll("|cffff88ffClock speed is now " .. clockScale .. "x (breath/survive timers).|r")
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

local function RegisterChatCommands()
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

local function InitSounds()
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

local function PlayIntro()
  local hx, hy = RegionCenter(REGION_HUB_RETURN)
  CameraBeat(hx, hy - 320.0)
  AnnounceTimedAll(9.0, "|cffaaddffThe Vaults of Ash. Your order burned sealing what sleeps below; you are the last torch it has left.|r")
  After(4.0, function()
    if gameOver then return end
    AnnounceTimedAll(10.0, "|cffaaddffThree doors, three omens -- danger in skulls, reward in kind. Clear the room behind your door, take your Embers, descend. The shrine lights after every third room.|r")
  end)
  After(8.0, function()
    if gameOver then return end
    AnnounceTimedAll(12.0, "|cffffff66Seed " .. RunSeed .. " -- this exact dungeon can be replayed with -seed "
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

  -- one Torchbearer per seated player, at the hub landing
  local spawnX = { -320.0, 0.0, 320.0 }
  for slot, pid in ipairs(users) do
    local h = CreateUnit(Player(pid), UNIT_TORCHBEARER, spawnX[slot] or 0.0, -6912.0, 90.0)
    SetHeroStr(h, START_STR, true)
    SetHeroAgi(h, START_AGI, true)
    SetHeroInt(h, START_INT, true)
    heroes[pid] = h
  end

  SeedRNG(DEFAULT_SEED)
  RunSeed = DEFAULT_SEED
  LogRun("seed=" .. DEFAULT_SEED)
  SyncEmbers()

  InitSounds()
  RegisterTriggers()
  RegisterChatCommands()
  StartClock()
  DealFloor(1)

  After(1.5, PlayIntro)
end
