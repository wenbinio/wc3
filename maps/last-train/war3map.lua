-- =========================================================================
-- Last Train from Yio Chu Kang — war3map.lua (phase 1)   a map by Serendipity
-- =========================================================================
-- 1-4 player co-op zombie survival in a rain-soaked Singapore HDB estate,
-- one permanent night before the network shuts down. Scavenge the void
-- decks, craft what the island left you, restore three substations, and
-- board the LAST North-South line train when it calls at Yio Chu Kang at
-- T+12:00 — or walk into the kampong remnant off Lorong Buangkok and kill
-- the Broodmother instead. Death is not elimination: the fallen DEFECT to
-- the horde and play against the living.
--
-- Design (inspiration only, adapted with credit — README + -credits):
--   * Zombination v11 (Trinin, Hive) — the evacuation-window ending, the
--     curable slow-burn infection (rebuilt as per-unit STATE, no
--     dummy-caster churn — their engine flaw, fixed), corpse-rise with a
--     visible window, the anti-snowball pair (kill-XP falloff + passive
--     escalation drip), furniture scavenging + combine crafting (their
--     recipe-discoverability flaw fixed: -recipes + tooltips hint every
--     combination).
--   * Zombie-Simulator 7 (SpirulinaN) — death = defection: the dead play
--     ON as a controllable zombie pack against their old friends; and the
--     lesson that escalation must key off STATE (the infected-population
--     ratio), not wall-clock timers firing into the void.
--   * Dawn of the Dead (PreViO) — gold-as-bullets, lumber-as-clips: every
--     shot costs one round; the reload is the panic window.
--   * NotD: Special Ops — the scripted dread-beat ambience discipline.
--   * SWAT: Aftermath — objectives as anti-camping: the train only opens
--     its doors if THREE substations spread across the estate are fixed.
--   Mechanics only; nothing copied.
--
-- Determinism (CLAUDE.md gotchas 28-30): script-level state lives in Lua
-- GLOBALS (the chunk keeps far under the 200-local engine cap); EVERY
-- random draw (loot, patrols, dread beats) flows through ONE Park-Miller
-- PRNG; '-seed N' (1-9 digits) reseeds until the seed LOCKS at the first
-- commitment point (first -search, or the first patrol at t=90); RUNLOG
-- accumulates machine-readable beats. The golden-run pin is deferred to
-- phase 2 (documented in the README) — every subsystem already routes
-- through the one stream so the pin can land without a re-pin.
--
-- Object types, items and rects come from the GENERATED constants
-- (UNIT_*/ITEM_*/REGION_*) — never hand-typed FourCCs (gotcha 27).
--
-- Chat commands: -help -status -recipes -credits -class <c> -search
-- -craft <r> -reload -sprint -fix -board -seed N; '-test' toggles debug
-- (northreach convention): -gold N -clips N -give <r> -zspawn <kind> [n]
-- -esc N -clock N -power -infectme -clearhorde -ff -runlog.
-- =========================================================================

-- ------------------------------------------------------------------ tuning
local MAX_PLAYERS     = 4
local DEFAULT_SEED    = 20260807 -- lobby-visible: printed in the description
local TRAIN_ARRIVE    = 720      -- the last train calls at T+12:00
local TRAIN_DEPART    = 900      -- and leaves 180s later
local PICK_WINDOW     = 40       -- -class window after spawn
local RELOAD_TIME     = 4        -- seconds locked while reloading
local INFECT_DMG      = 3        -- infection DoT: 3 damage every 2s (1.5 dps)
local INFECT_PERIOD   = 2
local CURE_HP_PCT     = 40       -- Wet Bandage works above this health %
local CLINIC_CURE_T   = 5        -- seconds standing in the clinic to cure
local RISE_DELAY      = 3.5      -- corpse-rise window (burnable)
local MOLOTOV_RADIUS  = 350.0
local MOLOTOV_DMG     = 60.0
local SEARCH_RANGE    = 300.0
local FIX_RANGE       = 300.0
local FIX_TIME        = 10       -- substation channel (technician: half)
local XP_RADIUS       = 600.0    -- kill-XP sharing radius
local XP_FALLOFF_PCT  = 75       -- x0.75 per extra zombie near the kill
local XP_CROWD_CAP    = 8
local XP_PER_LEVEL    = 120
local ESC_LEVEL_CAP   = 8
local ESC_TICK        = 20       -- passive drip cadence
local ESC_HP_PCT      = 10       -- +10% zombie hp per horde level past 1
local PATROL_FROM     = 90       -- first wandering patrol (also a seed lock)
local PATROL_PERIOD   = 45
local DREAD_FROM      = 25       -- first ambience beat
local DREAD_PERIOD    = 35
local SPRINT_BONUS    = 120
local SPRINT_TIME     = 4
local SPRINT_CD       = 20
local SENTRY_AMMO     = 40
local CLIP_DROP_EVERY = 5        -- every 5th zombie kill drops a spare clip
local BLOWTORCH_HEAL  = 300.0
local KOPI_HEAL       = 200.0
local BANDAGE_HEAL    = 150.0
local FF_SCALE        = 4
local rngState        = 1

-- -------------------------------------------------------------- game state
-- Script-level state is GLOBAL (gotcha 28); these are also the sim's
-- observability surface.
Users          = {}     -- seated human pids, in slot order
NumPlayers     = 1
TestMode       = {}     -- pid -> bool
GameOver       = false
GameClock      = 0      -- seconds since main(); the train timeline's clock
ClockScale     = 1
Survivors      = {}     -- pid -> hero unit (nil after boarding/defection)
ClassOf        = {}     -- pid -> class key
ClassPicked    = {}     -- pid -> true once -class used
Defected       = {}     -- pid -> true after death = defection
Aboard         = {}     -- pid -> true once on the train
Infected       = {}     -- pid -> true while the slow burn runs
InfectTick     = {}     -- pid -> phase accumulator for the 2s DoT
ClinicTicks    = {}     -- pid -> consecutive seconds inside the clinic
Reloading      = {}     -- pid -> GameClock when the reload completes
SprintReady    = {}     -- pid -> GameClock when -sprint is available
ClickTold      = {}     -- pid -> dry-clip message shown since last reload
Fixing         = {}     -- pid -> {gen, left} while channeling a -fix
ZombieRec      = {}     -- zombie unit -> {kind}
HordeCount     = 0      -- live horde units (bookkept via ZombieRec)
CorpseList     = {}     -- append-ordered corpse records {x, y, dead, risen}
PropRec        = {}     -- prop unit -> {kind, searched}
GenList        = {}     -- append-ordered substation recs {unit, fixed}
SentryAmmoOf   = {}     -- sentry unit -> rounds left
SentryDry      = {}     -- sentry unit -> true once announced dry
BarricadeRec   = {}     -- barricade/sentry unit -> {kind, pid}
TrainUnit      = nil
TrainAtStation = false
TrainGone      = false
StationPowered = false
GensFixed      = 0
BroodUnit      = nil
BroodDead      = false
HordeXP        = 0
EscLevel       = 1
CivTotal       = 0
CivDead        = 0
ZombiesKilled  = 0      -- by survivors (clip-drop + score bookkeeping)
Searches       = 0
NestsDown      = 0
PhoneUntil     = {}     -- pid -> GameClock while horde vision is shared
FlareUntil     = 0
PickOpen       = true
SeedLocked     = false
ScoreFinal     = 0
Board          = nil
BoardDirty     = false
EscClock       = 0
PatrolClock    = 0
DreadClock     = 0
LastFaller     = nil
RUNLOG         = ""
RunSeed        = DEFAULT_SEED
PlatformRegion = nil
ClinicRegion   = nil
InScriptedDamage = false

-- ---------------------------------------------------------------- the PRNG
-- Park-Miller LCG via Schrage's algorithm — the ONLY randomness in the map
-- (gotchas 29/30). Bit-identical under 32-bit fengari and the game's
-- 64-bit Lua. Same pattern as maps/vaults-of-ash and maps/coinstead.
function SeedRNG(n)
  rngState = (n % 2147483646) + 1
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
  for _, pid in ipairs(Users) do
    DisplayTextToPlayer(Player(pid), 0, 0, msg)
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

function RoundsOf(pid)
  return GetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD)
end

function ClipsOf(pid)
  return GetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_LUMBER)
end

function AddRounds(pid, n)
  SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, RoundsOf(pid) + n)
end

function AddClips(pid, n)
  SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_LUMBER, ClipsOf(pid) + n)
end

function Dist2(x1, y1, x2, y2)
  local dx, dy = x1 - x2, y1 - y2
  return dx * dx + dy * dy
end

function LockSeed(reason)
  if SeedLocked then return end
  SeedLocked = true
  LogRun("seedlock|" .. reason)
  AnnounceAll("|cffaaaaaaThe night has you now (" .. reason .. ") -- seed "
    .. RunSeed .. " is locked for this run.|r")
end

-- ------------------------------------------------------------------ classes
-- Singapore-flavored genre classes (survey furniture, credited in README).
CLASS_ORDER = { "heartlander", "police", "paramedic", "tech" }
CLASSES = {
  heartlander = { unit = UNIT_HEARTLANDER, name = "Heartlander",
    clip = 12, clips = 2, ms = 290,
    items = { ITEM_RATIONS } },
  police = { unit = UNIT_AUXILIARY_POLICE_OFFICER, name = "Auxiliary Police Officer",
    clip = 24, clips = 3, ms = 300, items = {} },
  paramedic = { unit = UNIT_PARAMEDIC, name = "Paramedic",
    clip = 8, clips = 2, ms = 300,
    items = { ITEM_WET_BANDAGE, ITEM_WET_BANDAGE }, cureAnyHp = true },
  tech = { unit = UNIT_TOWN_COUNCIL_TECHNICIAN, name = "Town Council Technician",
    clip = 10, clips = 2, ms = 290,
    items = { ITEM_GENERATOR_PART, ITEM_BARRICADE_KIT }, fastFix = true },
}
SurvivorTypeSet = {}
for _, k in ipairs(CLASS_ORDER) do SurvivorTypeSet[CLASSES[k].unit] = k end

function ClassDefOf(pid) return CLASSES[ClassOf[pid] or "heartlander"] end

function SurvivorPidOf(u)
  for _, pid in ipairs(Users) do
    if Survivors[pid] == u then return pid end
  end
  return nil
end

-- ---------------------------------------------------------------- the horde
ZOMBIE_KINDS = {
  shambler = { unit = UNIT_SHAMBLING_RESIDENT,     hp = 220,  xp = 6 },
  withered = { unit = UNIT_WITHERED_UNCLE,         hp = 300,  xp = 8 },
  sprinter = { unit = UNIT_PARK_CONNECTOR_SPRINTER, hp = 160, xp = 8 },
  riot     = { unit = UNIT_RIOT_WALKER,            hp = 450,  xp = 14 },
  revenant = { unit = UNIT_REVENANT,               hp = 700,  xp = 25 },
  brood    = { unit = UNIT_THE_BROODMOTHER,        hp = 3500, xp = 0 },
}
ZombieTypeKind = {}
for k, def in pairs(ZOMBIE_KINDS) do ZombieTypeKind[def.unit] = k end

CIVILIAN_TYPES = {
  [UNIT_KOPITIAM_UNCLE] = true,
  [UNIT_PROVISION_SHOP_TOWKAY] = true,
  [UNIT_ESTATE_GARDENER] = true,
}

function RegisterZombie(u, kind)
  ZombieRec[u] = { kind = kind }
  HordeCount = HordeCount + 1
end

function EscHpOf(baseHp)
  return (baseHp * (100 + ESC_HP_PCT * (EscLevel - 1))) // 100
end

function SpawnZombie(kind, x, y, ownerPid)
  local def = ZOMBIE_KINDS[kind]
  local u = CreateUnit(Player(ownerPid or PLAYER_NEUTRAL_AGGRESSIVE_ID),
    def.unit, x, y, 270.0)
  local hp = EscHpOf(def.hp)
  BlzSetUnitMaxHP(u, hp)
  SetWidgetLife(u, hp)
  RegisterZombie(u, kind)
  return u
end

-- Kill-XP with the Zombination anti-snowball falloff (credited): the MORE
-- zombies crowd the kill, the LESS the horde learns from it — the gain is
-- base x 0.75^(n-1) (integer math, n = zombies within XP_RADIUS, capped).
function CrowdAt(x, y)
  local n = 0
  for u, _ in pairs(ZombieRec) do
    if Alive(u) and Dist2(GetUnitX(u), GetUnitY(u), x, y) <= XP_RADIUS * XP_RADIUS then
      n = n + 1
      if n >= XP_CROWD_CAP then return n end
    end
  end
  return n
end

function SharedXPFor(base, crowd)
  local v = base
  local n = crowd
  if n > XP_CROWD_CAP then n = XP_CROWD_CAP end
  for _ = 2, n do
    v = (v * XP_FALLOFF_PCT) // 100
  end
  return v
end

function GrantHordeXP(base, x, y, why)
  local gained = SharedXPFor(base, CrowdAt(x, y))
  if gained <= 0 then return end
  HordeXP = HordeXP + gained
  LogRun("xp|" .. why .. "|+" .. gained .. "|total=" .. HordeXP)
  RecomputeEsc()
end

-- Escalation keys off STATE — the infected-population ratio and what the
-- horde has eaten — never wall-clock alone (the Zombie-Simulator fix).
function RecomputeEsc()
  local lvl = 1 + HordeXP // XP_PER_LEVEL
  if lvl > ESC_LEVEL_CAP then lvl = ESC_LEVEL_CAP end
  if lvl ~= EscLevel then
    EscLevel = lvl
    LogRun("esc|level=" .. lvl)
    AnnounceAll("|cffff8866The moaning is louder now. The horde grows bolder (level "
      .. lvl .. ").|r")
    BoardDirty = true
  end
end

function EscDrip()
  local drip = 2 + (8 * CivDead) // (CivTotal > 0 and CivTotal or 1)
  local defected = 0
  for _, pid in ipairs(Users) do
    if Defected[pid] then defected = defected + 1 end
  end
  drip = drip + 3 * defected
  HordeXP = HordeXP + drip
  RecomputeEsc()
end

-- ------------------------------------------------------------- corpse-rise
-- Zombination's corpse-rise, credited: anything the horde kills gets back
-- up after a visible window — unless somebody burns the corpse first.
function RecordCorpse(x, y)
  local rec = { x = x, y = y, risen = false, burned = false }
  CorpseList[#CorpseList + 1] = rec
  After(RISE_DELAY, function()
    if GameOver or rec.burned or rec.risen then return end
    rec.risen = true
    SpawnZombie("shambler", rec.x, rec.y)
    LogRun("rise|x=" .. math.floor(rec.x) .. "|y=" .. math.floor(rec.y))
    AnnounceAll("|cffff8866Something that was a neighbour stands back up.|r")
  end)
end

function BurnCorpsesNear(x, y, radius)
  local burned = 0
  for _, rec in ipairs(CorpseList) do
    if not rec.risen and not rec.burned
      and Dist2(rec.x, rec.y, x, y) <= radius * radius then
      rec.burned = true
      burned = burned + 1
    end
  end
  return burned
end

-- --------------------------------------------------------------- infection
-- Zombination's slow-burn infection, rebuilt as per-unit STATE on the
-- virtual clock (no dummy casters): ~1.5 dps until cured or dead.
function InfectSurvivor(pid)
  if Infected[pid] or Defected[pid] or Aboard[pid] then return end
  Infected[pid] = true
  InfectTick[pid] = 0
  ClinicTicks[pid] = 0
  LogRun("infect|pid=" .. pid)
  Tell(pid, "|cffcc66ffThe bite burns. You are INFECTED -- a Wet Bandage above "
    .. CURE_HP_PCT .. "% health cures it, or stand in the polyclinic grounds "
    .. CLINIC_CURE_T .. "s. Untreated, it will take you -- and give you back.|r")
  BoardDirty = true
end

function CureSurvivor(pid, how)
  if not Infected[pid] then return end
  Infected[pid] = nil
  ClinicTicks[pid] = 0
  LogRun("cure|pid=" .. pid .. "|" .. how)
  Tell(pid, "|cff88ff88The fever breaks (" .. how .. "). You are clean.|r")
  BoardDirty = true
end

function InfectionTick()
  for _, pid in ipairs(Users) do
    local u = Survivors[pid]
    if Infected[pid] and not Defected[pid] and Alive(u) then
      InfectTick[pid] = (InfectTick[pid] or 0) + 1
      if InfectTick[pid] >= INFECT_PERIOD then
        InfectTick[pid] = 0
        InScriptedDamage = true
        UnitDamageTarget(u, u, INFECT_DMG + 0.0, true, false,
          ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
        InScriptedDamage = false
      end
      -- the polyclinic cure: hold your ground inside the grounds
      if ClinicRegion ~= nil and IsUnitInRegion(ClinicRegion, u) then
        ClinicTicks[pid] = (ClinicTicks[pid] or 0) + 1
        if ClinicTicks[pid] >= CLINIC_CURE_T then
          CureSurvivor(pid, "clinic")
        end
      else
        ClinicTicks[pid] = 0
      end
    end
  end
end

-- ------------------------------------------------------------ items & craft
function CountItemOfType(u, itemType)
  local n = 0
  for slot = 0, 5 do
    local it = UnitItemInSlot(u, slot)
    if it ~= nil and GetItemTypeId(it) == itemType then n = n + 1 end
  end
  return n
end

function TakeItemOfType(u, itemType)
  for slot = 0, 5 do
    local it = UnitItemInSlot(u, slot)
    if it ~= nil and GetItemTypeId(it) == itemType then
      RemoveItem(it)
      return true
    end
  end
  return false
end

function GiveItem(pid, itemType)
  local u = Survivors[pid]
  if u == nil then return end
  for slot = 0, 5 do
    if UnitItemInSlot(u, slot) == nil then
      UnitAddItemToSlotById(u, itemType, slot)
      return
    end
  end
  CreateItem(itemType, GetUnitX(u), GetUnitY(u))
  Tell(pid, "|cffaaaaaaYour hands are full -- it lands at your feet.|r")
end

MATERIAL_NAMES = {
  [ITEM_PLANK] = "Plank", [ITEM_PIPE] = "Pipe", [ITEM_CLOTH] = "Cloth",
  [ITEM_WIRE] = "Wire", [ITEM_BOTTLE] = "Bottle", [ITEM_KEROSENE] = "Kerosene",
  [ITEM_BATTERY] = "Battery", [ITEM_BOTTLED_WATER] = "Bottled Water",
  [ITEM_RATIONS] = "Rations",
}

-- ~10 combine recipes (Zombination's crafting, discoverability FIXED:
-- '-recipes' lists all of these and every material tooltip hints its uses)
RECIPES = {
  { key = "bandage",   a = ITEM_CLOTH,   b = ITEM_BOTTLED_WATER, out = ITEM_WET_BANDAGE,    name = "Wet Bandage" },
  { key = "parang",    a = ITEM_PLANK,   b = ITEM_PIPE,          out = ITEM_PARANG,         name = "Parang" },
  { key = "phone",     a = ITEM_PIPE,    b = ITEM_WIRE,          out = ITEM_MOBILE_PHONE,   name = "Mobile Phone" },
  { key = "barricade", a = ITEM_CLOTH,   b = ITEM_PLANK,         out = ITEM_BARRICADE_KIT,  name = "Barricade Kit" },
  { key = "molotov",   a = ITEM_BOTTLE,  b = ITEM_KEROSENE,      out = ITEM_MOLOTOV,        name = "Molotov" },
  { key = "flare",     a = ITEM_CLOTH,   b = ITEM_KEROSENE,      out = ITEM_FLARE,          name = "Flare" },
  { key = "sentry",    a = ITEM_PIPE,    b = ITEM_BATTERY,       out = ITEM_SENTRY_KIT,     name = "Sentry Kit" },
  { key = "kopi",      a = ITEM_RATIONS, b = ITEM_BOTTLED_WATER, out = ITEM_KOPI_SET,       name = "Kopi Set" },
  { key = "part",      a = ITEM_WIRE,    b = ITEM_BATTERY,       out = ITEM_GENERATOR_PART, name = "Generator Part" },
  { key = "torch",     a = ITEM_PIPE,    b = ITEM_KEROSENE,      out = ITEM_BLOWTORCH,      name = "Blowtorch" },
}

function HandleCraft(pid, key)
  local u = Survivors[pid]
  if u == nil or not Alive(u) then return end
  for _, r in ipairs(RECIPES) do
    if r.key == key then
      if CountItemOfType(u, r.a) < 1
        or CountItemOfType(u, r.b) < (r.a == r.b and 2 or 1) then
        Tell(pid, "|cffaaaaaa" .. r.name .. " needs " .. MATERIAL_NAMES[r.a]
          .. " + " .. MATERIAL_NAMES[r.b] .. " in your pack.|r")
        return
      end
      TakeItemOfType(u, r.a)
      TakeItemOfType(u, r.b)
      GiveItem(pid, r.out)
      LogRun("craft|pid=" .. pid .. "|" .. r.key)
      Tell(pid, "|cff88ccffYou put together a " .. r.name .. ".|r")
      return
    end
  end
  Tell(pid, "|cffaaaaaaNo such recipe. '-recipes' lists all ten.|r")
end

function ShowRecipes(pid)
  Tell(pid, "|cffffcc00Combine recipes|r ('-craft <name>'; materials come from '-search'):")
  for _, r in ipairs(RECIPES) do
    Tell(pid, "|cffaaddff-craft " .. r.key .. "|r = " .. MATERIAL_NAMES[r.a]
      .. " + " .. MATERIAL_NAMES[r.b] .. " -> " .. r.name)
  end
end

-- ---------------------------------------------------------------- scavenge
-- Furniture scavenging (Zombination, credited): every void deck bench,
-- dumpster, locker, desk, hawker table, car, van and payphone is one
-- SEEDED search. The tables are data — weights are per-prop-kind flavor.
LOOT_TABLES = {
  bench    = { { ITEM_CLOTH, 30 }, { ITEM_PLANK, 25 }, { ITEM_BOTTLED_WATER, 20 }, { ITEM_RATIONS, 15 }, { "clips", 10 } },
  dumpster = { { ITEM_PIPE, 30 }, { ITEM_WIRE, 20 }, { ITEM_BOTTLE, 25 }, { ITEM_PLANK, 15 }, { ITEM_CLOTH, 10 } },
  locker   = { { ITEM_BATTERY, 25 }, { ITEM_WIRE, 20 }, { ITEM_KEROSENE, 20 }, { "clips", 25 }, { ITEM_PLANK, 10 } },
  desk     = { { ITEM_WIRE, 30 }, { ITEM_BATTERY, 20 }, { "clips", 20 }, { ITEM_BOTTLED_WATER, 20 }, { ITEM_CLOTH, 10 } },
  table    = { { ITEM_KEROSENE, 30 }, { ITEM_RATIONS, 25 }, { ITEM_BOTTLED_WATER, 20 }, { ITEM_BOTTLE, 25 } },
  car      = { { ITEM_BATTERY, 30 }, { ITEM_PIPE, 20 }, { "clips", 25 }, { ITEM_KEROSENE, 25 } },
  van      = { { ITEM_RATIONS, 35 }, { ITEM_PLANK, 20 }, { ITEM_BOTTLE, 20 }, { "clips", 15 }, { ITEM_BOTTLED_WATER, 10 } },
  phone    = { { ITEM_WIRE, 55 }, { ITEM_BATTERY, 45 } },
  busstop  = { { ITEM_BOTTLE, 30 }, { ITEM_CLOTH, 30 }, { ITEM_RATIONS, 20 }, { "clips", 20 } },
}
PROP_KINDS = {
  [UNIT_VOID_DECK_BENCH] = "bench",
  [UNIT_RUBBISH_CHUTE_DUMPSTER] = "dumpster",
  [UNIT_STOREROOM_LOCKER] = "locker",
  [UNIT_TOWN_COUNCIL_DESK] = "desk",
  [UNIT_HAWKER_STALL_TABLE] = "table",
  [UNIT_ABANDONED_CAR] = "car",
  [UNIT_ABANDONED_VAN] = "van",
  [UNIT_PUBLIC_PHONE] = "phone",
  [UNIT_BUS_STOP] = "busstop",
}

function LootNameOf(entry)
  if entry == "clips" then return "a spare clip" end
  return MATERIAL_NAMES[entry] or "something"
end

function DrawLoot(kind)
  local tbl = LOOT_TABLES[kind]
  local total = 0
  for _, e in ipairs(tbl) do total = total + e[2] end
  local roll = RandInt(1, total)
  for _, e in ipairs(tbl) do
    roll = roll - e[2]
    if roll <= 0 then return e[1] end
  end
  return tbl[1][1]
end

function HandleSearch(pid)
  local u = Survivors[pid]
  if u == nil or not Alive(u) or Defected[pid] then return end
  local ux, uy = GetUnitX(u), GetUnitY(u)
  local best, bestD = nil, SEARCH_RANGE * SEARCH_RANGE + 1
  for p, rec in pairs(PropRec) do
    if not rec.searched then
      local d = Dist2(GetUnitX(p), GetUnitY(p), ux, uy)
      if d < bestD then best, bestD = p, d end
    end
  end
  if best == nil then
    Tell(pid, "|cffaaaaaaNothing searchable in reach -- benches, dumpsters, lockers, stalls, cars and phones all give parts. Get closer.|r")
    return
  end
  LockSeed("search")
  local rec = PropRec[best]
  rec.searched = true
  Searches = Searches + 1
  local loot = DrawLoot(rec.kind)
  if loot == "clips" then
    AddClips(pid, 1)
  else
    GiveItem(pid, loot)
  end
  LogRun("search|pid=" .. pid .. "|" .. rec.kind .. "|" .. string.lower(LootNameOf(loot)))
  Tell(pid, "|cff88ccffYou turn out the " .. GetUnitName(best) .. ": "
    .. LootNameOf(loot) .. ". ('-recipes' to see what combines.)|r")
end

-- ----------------------------------------------------------- ammo & reload
-- Dawn of the Dead's gold-as-bullets, credited: one round per shot, drawn
-- on the DAMAGING event; a dry clip zeroes the shot (a carried Parang
-- keeps you fighting at half damage); '-reload' burns one clip (lumber),
-- locks you RELOAD_TIME seconds, and refills the rounds. Panic window.
AmmoSpent = {} -- pid -> rounds fired (observability)

function HandleDamaging()
  local src = GetEventDamageSource()
  local tgt = GetTriggerUnit()
  if src == nil or tgt == nil or src == tgt or InScriptedDamage then return end

  -- a channeling fixer who takes a hit loses the channel
  local tpid = SurvivorPidOf(tgt)
  if tpid ~= nil and Fixing[tpid] ~= nil and GetEventDamage() > 0.0 then
    Fixing[tpid] = nil
    Tell(tpid, "|cffff8866The hit knocks the spanner out of your hands -- the fix is interrupted.|r")
  end

  -- sentry guns draw their own belt
  if SentryAmmoOf[src] ~= nil then
    if SentryAmmoOf[src] > 0 then
      SentryAmmoOf[src] = SentryAmmoOf[src] - 1
    else
      BlzSetEventDamage(0.0)
      if not SentryDry[src] then
        SentryDry[src] = true
        AnnounceAll("|cffff8866A sentry gun runs its belt dry and stands inert.|r")
        LogRun("sentry|dry")
      end
    end
    return
  end

  -- survivor guns: one round per shot
  local spid = SurvivorPidOf(src)
  if spid ~= nil then
    if RoundsOf(spid) > 0 then
      AddRounds(spid, -1)
      AmmoSpent[spid] = (AmmoSpent[spid] or 0) + 1
    elseif CountItemOfType(src, ITEM_PARANG) > 0 then
      BlzSetEventDamage(GetEventDamage() / 2.0)
    else
      BlzSetEventDamage(0.0)
      if not ClickTold[spid] then
        ClickTold[spid] = true
        Tell(spid, "|cffff8866Click. Clip's dry -- '-reload' (burns 1 clip, "
          .. RELOAD_TIME .. "s), or craft a Parang to keep swinging.|r")
      end
    end
  end

  -- zombie teeth spread the slow burn
  if tpid ~= nil and ZombieRec[src] ~= nil and GetEventDamage() > 0.0 then
    InfectSurvivor(tpid)
  end
end

function HandleReload(pid)
  local u = Survivors[pid]
  if u == nil or not Alive(u) or Defected[pid] then return end
  if Reloading[pid] ~= nil and GameClock < Reloading[pid] then
    Tell(pid, "|cffaaaaaaAlready reloading -- hands are shaking.|r")
    return
  end
  local def = ClassDefOf(pid)
  if RoundsOf(pid) >= def.clip then
    Tell(pid, "|cffaaaaaaClip is already full (" .. def.clip .. " rounds).|r")
    return
  end
  if ClipsOf(pid) < 1 then
    Tell(pid, "|cffaaaaaaNo spare clips -- search lockers, desks and cars, or hold the trigger on nothing.|r")
    return
  end
  AddClips(pid, -1)
  Reloading[pid] = GameClock + RELOAD_TIME
  PauseUnit(u, true)
  LogRun("reload|pid=" .. pid)
  Tell(pid, "|cffffff66Reloading -- " .. RELOAD_TIME .. " seconds of prayer.|r")
  local rpid = pid
  After(RELOAD_TIME + 0.0, function()
    local ru = Survivors[rpid]
    if ru ~= nil then PauseUnit(ru, false) end
    if GameOver or Defected[rpid] then return end
    SetPlayerState(Player(rpid), PLAYER_STATE_RESOURCE_GOLD, ClassDefOf(rpid).clip)
    ClickTold[rpid] = nil
    Reloading[rpid] = nil
    Tell(rpid, "|cff88ff88Fresh clip seated (" .. ClassDefOf(rpid).clip .. " rounds).|r")
  end)
end

-- ------------------------------------------------------------------ sprint
function HandleSprint(pid)
  local u = Survivors[pid]
  if u == nil or not Alive(u) or Defected[pid] then return end
  local ready = SprintReady[pid] or 0
  if GameClock < ready then
    Tell(pid, "|cffaaaaaaLegs are jelly -- sprint again in " .. (ready - GameClock) .. "s.|r")
    return
  end
  SprintReady[pid] = GameClock + SPRINT_CD
  local base = ClassDefOf(pid).ms
  SetUnitMoveSpeed(u, base + SPRINT_BONUS + 0.0)
  Tell(pid, "|cff88ccffYou RUN.|r")
  local rpid = pid
  After(SPRINT_TIME + 0.0, function()
    local ru = Survivors[rpid]
    if ru ~= nil then SetUnitMoveSpeed(ru, ClassDefOf(rpid).ms + 0.0) end
  end)
end

-- -------------------------------------------------------------- generators
-- SWAT-style anti-camping objective, credited: the train's doors only open
-- if all three substations spread across the estate are live.
function FixGenerator(pid, rec)
  rec.fixed = true
  GensFixed = GensFixed + 1
  LogRun("gen|fixed=" .. GensFixed .. "/3|pid=" .. pid)
  AnnounceAll("|cff88ff88A substation hums back to life (" .. GensFixed
    .. "/3). Somewhere, a lift lobby light flickers on.|r")
  BoardDirty = true
  if GensFixed >= 3 then
    StationPowered = true
    LogRun("power|on")
    AnnounceAll("|cffffff66STATION POWER RESTORED. Yio Chu Kang's platform lights burn through the rain. The doors will open.|r")
  end
end

function HandleFix(pid)
  local u = Survivors[pid]
  if u == nil or not Alive(u) or Defected[pid] then return end
  if Fixing[pid] ~= nil then
    Tell(pid, "|cffaaaaaaAlready elbow-deep in the cabinet.|r")
    return
  end
  local best = nil
  for _, rec in ipairs(GenList) do
    if not rec.fixed and Dist2(GetUnitX(rec.unit), GetUnitY(rec.unit),
      GetUnitX(u), GetUnitY(u)) <= FIX_RANGE * FIX_RANGE then
      best = rec
    end
  end
  if best == nil then
    Tell(pid, "|cffaaaaaaNo dead substation in reach -- three are spread across the estate ('-status' shows the count).|r")
    return
  end
  if CountItemOfType(u, ITEM_GENERATOR_PART) > 0 then
    TakeItemOfType(u, ITEM_GENERATOR_PART)
    Tell(pid, "|cff88ccffThe spare part slots straight in.|r")
    FixGenerator(pid, best)
    return
  end
  local t = FIX_TIME
  if ClassDefOf(pid).fastFix then t = FIX_TIME // 2 end
  Fixing[pid] = { gen = best, left = t }
  Tell(pid, "|cffffff66You crack the cabinet -- " .. t
    .. "s of standing still in the dark. Taking a hit interrupts. A crafted Generator Part is instant.|r")
end

function FixTick()
  for _, pid in ipairs(Users) do
    local f = Fixing[pid]
    if f ~= nil then
      local u = Survivors[pid]
      if u == nil or not Alive(u) or f.gen.fixed
        or Dist2(GetUnitX(f.gen.unit), GetUnitY(f.gen.unit),
          GetUnitX(u), GetUnitY(u)) > FIX_RANGE * FIX_RANGE then
        Fixing[pid] = nil
        Tell(pid, "|cffaaaaaaThe fix lapses -- stay beside the cabinet.|r")
      else
        f.left = f.left - 1
        if f.left <= 0 then
          Fixing[pid] = nil
          FixGenerator(pid, f.gen)
        end
      end
    end
  end
end

-- ------------------------------------------------------------ use triggers
function HandleUseItem()
  local u = GetTriggerUnit()
  local it = GetManipulatedItem()
  if u == nil or it == nil or GameOver then return end
  local pid = SurvivorPidOf(u)
  if pid == nil then return end
  local t = GetItemTypeId(it)
  local x, y = GetUnitX(u), GetUnitY(u)

  if t == ITEM_WET_BANDAGE then
    local lifePct = (GetWidgetLife(u) * 100.0) / GetUnitState(u, UNIT_STATE_MAX_LIFE)
    if Infected[pid] and (ClassDefOf(pid).cureAnyHp or lifePct >= CURE_HP_PCT + 0.0) then
      CureSurvivor(pid, "bandage")
    elseif Infected[pid] then
      Tell(pid, "|cffaaaaaaToo far gone to self-treat below " .. CURE_HP_PCT
        .. "% -- a Paramedic could, or reach the polyclinic.|r")
      return -- the bandage is NOT consumed on a refused cure
    end
    SetWidgetLife(u, math.min(GetWidgetLife(u) + BANDAGE_HEAL, GetUnitState(u, UNIT_STATE_MAX_LIFE)))
    RemoveItem(it)
  elseif t == ITEM_KOPI_SET then
    SetWidgetLife(u, math.min(GetWidgetLife(u) + KOPI_HEAL, GetUnitState(u, UNIT_STATE_MAX_LIFE)))
    Tell(pid, "|cff88ff88Kopi, kaya toast, two eggs. For one minute the world is fine.|r")
    RemoveItem(it)
  elseif t == ITEM_MOLOTOV then
    local burned = BurnCorpsesNear(x, y, MOLOTOV_RADIUS)
    local hits = 0
    InScriptedDamage = true
    for z, _ in pairs(ZombieRec) do
      if Alive(z) and Dist2(GetUnitX(z), GetUnitY(z), x, y) <= MOLOTOV_RADIUS * MOLOTOV_RADIUS then
        UnitDamageTarget(u, z, MOLOTOV_DMG, true, false,
          ATTACK_TYPE_NORMAL, DAMAGE_TYPE_FIRE, WEAPON_TYPE_WHOKNOWS)
        hits = hits + 1
      end
    end
    InScriptedDamage = false
    LogRun("molotov|pid=" .. pid .. "|burned=" .. burned .. "|hit=" .. hits)
    Tell(pid, "|cffff8866Fire blooms across the wet tarmac -- " .. burned
      .. " corpse(s) burned before they could stand, " .. hits .. " zombie(s) scorched.|r")
    RemoveItem(it)
  elseif t == ITEM_MOBILE_PHONE then
    PhoneUntil[pid] = GameClock + 30
    SetPlayerAlliance(Player(PLAYER_NEUTRAL_AGGRESSIVE_ID), Player(pid),
      ALLIANCE_SHARED_VISION, true)
    LogRun("phone|pid=" .. pid)
    Tell(pid, "|cff88ccffOne bar of signal. For 30 seconds the estate's cameras are yours -- the whole horde on the minimap.|r")
    RemoveItem(it)
  elseif t == ITEM_FLARE then
    FlareUntil = GameClock + 30
    LogRun("flare|pid=" .. pid)
    AnnounceAll("|cffffff66A flare soars over the blocks and everything is red daylight for 30 seconds.|r")
    RemoveItem(it)
  elseif t == ITEM_BARRICADE_KIT then
    local b = CreateUnit(Player(pid), UNIT_BARRICADE, x, y, 270.0)
    BarricadeRec[b] = { kind = "barricade", pid = pid }
    LogRun("barricade|pid=" .. pid)
    Tell(pid, "|cff88ff88Planks up, sandbags down. It will hold -- for a while.|r")
    RemoveItem(it)
  elseif t == ITEM_SENTRY_KIT then
    local s = CreateUnit(Player(pid), UNIT_SENTRY_GUN, x, y, 270.0)
    SentryAmmoOf[s] = SENTRY_AMMO
    BarricadeRec[s] = { kind = "sentry", pid = pid }
    LogRun("sentry|pid=" .. pid)
    Tell(pid, "|cff88ff88The sentry spins up: " .. SENTRY_AMMO .. " rounds on the belt, then it is furniture.|r")
    RemoveItem(it)
  elseif t == ITEM_BLOWTORCH then
    local best, bestD = nil, 300.0 * 300.0 + 1
    for b, _ in pairs(BarricadeRec) do
      if Alive(b) then
        local d = Dist2(GetUnitX(b), GetUnitY(b), x, y)
        if d < bestD then best, bestD = b, d end
      end
    end
    for _, rec in ipairs(GenList) do
      if Alive(rec.unit) then
        local d = Dist2(GetUnitX(rec.unit), GetUnitY(rec.unit), x, y)
        if d < bestD then best, bestD = rec.unit, d end
      end
    end
    if best == nil then
      Tell(pid, "|cffaaaaaaNothing weldable in reach (barricades, sentries, substations).|r")
      return
    end
    SetWidgetLife(best, math.min(GetWidgetLife(best) + BLOWTORCH_HEAL,
      GetUnitState(best, UNIT_STATE_MAX_LIFE)))
    LogRun("weld|pid=" .. pid)
    Tell(pid, "|cff88ccffSparks in the rain -- the welds hold another night.|r")
    RemoveItem(it)
  end
end

-- --------------------------------------------------------------- defection
-- Zombie-Simulator's death = defection, credited: no elimination, no
-- spectating — the dead rise as a player-controlled pack and the alliance
-- flips BOTH directions (gotcha 24).
function DefectPlayer(pid, x, y)
  if Defected[pid] then return end
  Defected[pid] = true
  Infected[pid] = nil
  Fixing[pid] = nil
  Survivors[pid] = nil
  LastFaller = pid
  LogRun("defect|pid=" .. pid)
  AnnounceAll("|cffcc66ff" .. GetPlayerName(Player(pid))
    .. " is dead. And then, worse, not. They hunt with the horde now.|r")
  for _, other in ipairs(Users) do
    if other ~= pid then
      if Defected[other] then
        SetPlayerAlliance(Player(pid), Player(other), ALLIANCE_PASSIVE, true)
        SetPlayerAlliance(Player(other), Player(pid), ALLIANCE_PASSIVE, true)
        SetPlayerAlliance(Player(pid), Player(other), ALLIANCE_SHARED_VISION, true)
        SetPlayerAlliance(Player(other), Player(pid), ALLIANCE_SHARED_VISION, true)
      else
        SetPlayerAlliance(Player(pid), Player(other), ALLIANCE_PASSIVE, false)
        SetPlayerAlliance(Player(other), Player(pid), ALLIANCE_PASSIVE, false)
        SetPlayerAlliance(Player(pid), Player(other), ALLIANCE_SHARED_VISION, false)
        SetPlayerAlliance(Player(other), Player(pid), ALLIANCE_SHARED_VISION, false)
      end
    end
  end
  -- the horde shows its new mind the whole board
  SetPlayerAlliance(Player(PLAYER_NEUTRAL_AGGRESSIVE_ID), Player(pid),
    ALLIANCE_SHARED_VISION, true)
  -- the pack: their own risen self and three shamblers, player-controlled
  local r = SpawnZombie("revenant", x, y, pid)
  SpawnZombie("shambler", x + 96.0, y, pid)
  SpawnZombie("shambler", x - 96.0, y, pid)
  SpawnZombie("shambler", x, y + 96.0, pid)
  SelectUnitForPlayerSingle(r, Player(pid))
  Tell(pid, "|cffcc66ffYou rise. Your Revenant and pack answer to you -- the living were never your friends. Hunt.|r")
  BoardDirty = true
  EndCheck()
end

function LivingSurvivors()
  local n = 0
  for _, pid in ipairs(Users) do
    if not Defected[pid] and not Aboard[pid] and Alive(Survivors[pid]) then
      n = n + 1
    end
  end
  return n
end

-- ------------------------------------------------------------ score & ends
function AboardCount()
  local n = 0
  for _, pid in ipairs(Users) do
    if Aboard[pid] then n = n + 1 end
  end
  return n
end

function ComputeScore()
  local civAlive = CivTotal - CivDead
  local defections = 0
  for _, pid in ipairs(Users) do
    if Defected[pid] then defections = defections + 1 end
  end
  local total = AboardCount() * 400 + (BroodDead and 800 or 0)
    + ZombiesKilled * 3 + civAlive * 40 + GensFixed * 100
    + Searches * 5 + NestsDown * 60 - defections * 150
  return total, civAlive, defections
end

function ScoreLine(verdict)
  local total, civAlive, defections = ComputeScore()
  ScoreFinal = total
  return "LAST TRAIN -- " .. verdict .. ". Score " .. total
    .. " (aboard " .. AboardCount() .. " x400"
    .. (BroodDead and " + broodmother 800" or "")
    .. " + kills " .. ZombiesKilled .. "x3 + residents " .. civAlive
    .. "x40 + power " .. GensFixed .. "x100 + searches " .. Searches
    .. "x5 + nests " .. NestsDown .. "x60 - defections " .. defections
    .. "x150). Horde level " .. EscLevel .. ". Seed " .. RunSeed .. "."
end

function IssueVerdicts(winners)
  -- winners: pid -> true; everyone else seated gets defeat
  After(2.0, function()
    for _, pid in ipairs(Users) do
      if winners[pid] then
        CustomVictoryBJ(Player(pid), true, true)
      else
        CustomDefeatBJ(Player(pid), "The estate keeps you.")
      end
    end
  end)
end

function BroodmotherSlain()
  if GameOver then return end
  BroodDead = true
  GameOver = true
  LogRun("brood|slain")
  AnnounceAll("|cff88ff88The Broodmother bursts like a rotten mangosteen. Across the estate, every zombie simply... sits down.|r")
  local line = ScoreLine("VICTORY -- THE BROOD IS DEAD")
  AnnounceAll("|cffffcc00" .. line .. "|r")
  LogRun("verdict|brood|score=" .. ScoreFinal)
  local winners = {}
  for _, pid in ipairs(Users) do
    if not Defected[pid] then winners[pid] = true end
  end
  IssueVerdicts(winners)
end

function ResolveDeparture()
  TrainAtStation = false
  TrainGone = true
  if TrainUnit ~= nil then
    RemoveUnit(TrainUnit)
    TrainUnit = nil
  end
  local aboard = AboardCount()
  if aboard > 0 then
    GameOver = true
    LogRun("train|depart|aboard=" .. aboard)
    AnnounceAll("|cff88ff88The last train pulls out of Yio Chu Kang with "
      .. aboard .. " soul(s) aboard. Behind it, the platform lights gutter out.|r")
    local line = ScoreLine("VICTORY -- ABOARD THE LAST TRAIN")
    AnnounceAll("|cffffcc00" .. line .. "|r")
    LogRun("verdict|train|score=" .. ScoreFinal)
    local winners = {}
    for _, pid in ipairs(Users) do
      if Aboard[pid] then winners[pid] = true end
    end
    IssueVerdicts(winners)
  else
    LogRun("train|empty")
    AnnounceAll("|cffff8866The last train sighs, closes its doors on nobody, and leaves. \"This station is closed. Thank you for riding with SMRT.\"|r")
    AnnounceAll("|cffffcc00Now there is only one way out of Yio Chu Kang: the thing in the kampong dies, or you do.|r")
  end
end

function EndCheck()
  if GameOver then return end
  if LivingSurvivors() > 0 or AboardCount() > 0 then return end
  -- the horde stands over the last of the living
  GameOver = true
  local line = ScoreLine("DEFEAT -- THE ESTATE FALLS")
  AnnounceAll("|cffff4444No one is left standing. The rain keeps falling on Yio Chu Kang, and the horde walks it unopposed.|r")
  AnnounceAll("|cffffcc00" .. line .. "|r")
  LogRun("verdict|wipe|score=" .. ScoreFinal)
  local winners = {}
  for _, pid in ipairs(Users) do
    -- players who defected BEFORE the final fall win as the horde; the
    -- last to fall is the horde's meal, not its member
    if Defected[pid] and pid ~= LastFaller then winners[pid] = true end
  end
  IssueVerdicts(winners)
end

-- ------------------------------------------------------------- the train
function TryBoard(pid)
  local u = Survivors[pid]
  if u == nil or not Alive(u) or Defected[pid] or Aboard[pid] then return end
  if not TrainAtStation then return end
  if not StationPowered then
    Tell(pid, "|cffff8866The doors stay sealed -- the station is DARK. All three substations must be live ('-status').|r")
    return
  end
  if PlatformRegion ~= nil and not IsUnitInRegion(PlatformRegion, u) then
    return
  end
  Aboard[pid] = true
  Survivors[pid] = nil
  RemoveUnit(u)
  LogRun("train|board|pid=" .. pid)
  AnnounceAll("|cff88ff88" .. GetPlayerName(Player(pid))
    .. " steps over the gap and is ABOARD. \"Doors closing.\"|r")
  BoardDirty = true
end

function TrainArrives()
  TrainAtStation = true
  TrainUnit = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE_ID), UNIT_THE_LAST_TRAIN,
    REGION_PLATFORM.maxX - 40.0, 0.0, 270.0)
  LogRun("train|arrive")
  AnnounceAll("|cffffff66Rails singing, headlight cutting the rain -- THE LAST TRAIN slides into Yio Chu Kang.|r")
  AnnounceAll("|cffffcc00\"Last train leaving. Please mind the platform gap.\" It departs in " .. (TRAIN_DEPART - TRAIN_ARRIVE) .. " seconds.|r")
  if not StationPowered then
    AnnounceAll("|cffff8866The platform is DARK -- the doors will not open until all three substations are live.|r")
  end
  -- anyone already waiting on the platform steps aboard
  for _, pid in ipairs(Users) do TryBoard(pid) end
end

-- ---------------------------------------------------------------- patrols
-- Wandering spawn patrols between escalation beats (anti-camping): seeded
-- district to seeded district, sized by the horde's level.
DISTRICTS = {
  { key = "teckghee", name = "Teck Ghee", x = -800.0, y = -3200.0 },
  { key = "kebunbaru", name = "Kebun Baru", x = -4200.0, y = 800.0 },
  { key = "gardens", name = "Yio Chu Kang Gardens", x = 400.0, y = 3200.0 },
  { key = "seletar", name = "Seletar Hills", x = 3200.0, y = 3800.0 },
  { key = "chengsan", name = "Cheng San", x = 2200.0, y = -3400.0 },
  { key = "parkconnector", name = "the park connector", x = -2600.0, y = 0.0 },
}

function SpawnPatrol()
  LockSeed("patrol")
  local fromI = RandInt(1, #DISTRICTS)
  local toI = RandInt(1, #DISTRICTS - 1)
  if toI >= fromI then toI = toI + 1 end
  local from, to = DISTRICTS[fromI], DISTRICTS[toI]
  local n = 2 + EscLevel // 2
  local parts = {}
  for i = 1, n do
    local kind = (i % 2 == 0) and "withered" or "shambler"
    local u = SpawnZombie(kind, from.x + (i - 1) * 72.0, from.y)
    IssuePointOrder(u, "attack", to.x, to.y)
    parts[#parts + 1] = kind
  end
  if EscLevel >= 3 then
    local u = SpawnZombie("sprinter", from.x, from.y + 96.0)
    IssuePointOrder(u, "attack", to.x, to.y)
    parts[#parts + 1] = "sprinter"
  end
  if EscLevel >= 5 then
    local u = SpawnZombie("riot", from.x, from.y - 96.0)
    IssuePointOrder(u, "attack", to.x, to.y)
    parts[#parts + 1] = "riot"
  end
  LogRun("patrol|" .. from.key .. ">" .. to.key .. "|n=" .. #parts)
  AnnounceAll("|cffff8866Movement out of " .. from.name .. " -- " .. #parts
    .. " of them, drifting toward " .. to.name .. ".|r")
end

-- --------------------------------------------------------------- ambience
-- NotD-style scripted dread beats, data-driven and seeded: one line every
-- DREAD_PERIOD seconds, drawn from the map's ONE stream (gotcha 30 —
-- ambience shares the stream so replays stay byte-identical).
DREAD_LINES = {
  "Somewhere across the carpark, a car alarm dies mid-wail.",
  "A lift arrives at an empty lobby. Nobody pressed the button.",
  "Rain on zinc roofs. Under it, the sound of dragging feet.",
  "The station PA crackles: \"...stand behind the yellow line...\" to nobody.",
  "A dog barks twice in Cheng San. Then it stops barking.",
  "On the sixth floor, laundry still turns on a bamboo pole.",
  "The hawker centre's last working fan squeaks round. And round.",
  "Down the park connector, the grass moves against the wind.",
  "A window grille rattles somewhere above the void deck.",
  "The 265 bus timetable glass is smeared from the inside.",
}

function DreadBeat()
  local line = DREAD_LINES[RandInt(1, #DREAD_LINES)]
  AnnounceAll("|cff8888aa" .. line .. "|r")
end

-- ---------------------------------------------------------- the multiboard
-- One shared board (no GetLocalPlayer, desync-safe — the coinstead rule):
-- the run header plus one row per seated player.
function SetBoardCell(r, col, txt, w)
  local mi = MultiboardGetItem(Board, r, col)
  MultiboardSetItemStyle(mi, true, false)
  MultiboardSetItemWidth(mi, w)
  MultiboardSetItemValue(mi, txt)
  MultiboardReleaseItem(mi)
end

function PlayerStatus(pid)
  if Aboard[pid] then return "ABOARD" end
  if Defected[pid] then return "HORDE" end
  if not Alive(Survivors[pid]) then return "DOWN" end
  if Infected[pid] then return "INFECTED" end
  return "alive"
end

function UpdateBoard()
  if Board == nil then return end
  BoardDirty = false
  local trainTxt
  if TrainGone then trainTxt = "gone"
  elseif TrainAtStation then trainTxt = "BOARDING " .. (TRAIN_DEPART - GameClock) .. "s"
  else trainTxt = "T-" .. (TRAIN_ARRIVE - GameClock) .. "s" end
  SetBoardCell(0, 0, "Last train", 0.07)
  SetBoardCell(0, 1, trainTxt, 0.06)
  SetBoardCell(1, 0, "Power", 0.07)
  SetBoardCell(1, 1, GensFixed .. "/3" .. (StationPowered and " LIVE" or ""), 0.06)
  SetBoardCell(2, 0, "Horde", 0.07)
  SetBoardCell(2, 1, "lv " .. EscLevel .. " (" .. HordeCount .. ")", 0.06)
  SetBoardCell(3, 0, "Residents", 0.07)
  SetBoardCell(3, 1, (CivTotal - CivDead) .. "/" .. CivTotal, 0.06)
  for i, pid in ipairs(Users) do
    SetBoardCell(3 + i, 0, GetPlayerName(Player(pid)), 0.07)
    SetBoardCell(3 + i, 1, ClassDefOf(pid).name .. " -- " .. PlayerStatus(pid), 0.11)
  end
end

function InitBoard()
  Board = CreateMultiboard()
  MultiboardSetTitleText(Board, "Last Train from Yio Chu Kang")
  MultiboardSetRowCount(Board, 4 + #Users)
  MultiboardSetColumnCount(Board, 2)
  UpdateBoard()
  MultiboardDisplay(Board, true)
  MultiboardMinimize(Board, false)
end

-- ------------------------------------------------------------ unit deaths
function HandleDeath()
  local u = GetTriggerUnit()
  if u == nil or GameOver then return end
  local killer = GetKillingUnit()
  local hordeKill = killer ~= nil and (ZombieRec[killer] ~= nil)

  -- a horde unit falls
  local zrec = ZombieRec[u]
  if zrec ~= nil then
    ZombieRec[u] = nil
    HordeCount = HordeCount - 1
    if u == BroodUnit then
      BroodmotherSlain()
      return
    end
    if killer ~= nil then
      local kpid = SurvivorPidOf(killer)
      if kpid == nil and SentryAmmoOf[killer] ~= nil then
        kpid = GetPlayerId(GetOwningPlayer(killer))
      end
      if kpid ~= nil and not Defected[kpid] then
        ZombiesKilled = ZombiesKilled + 1
        if ZombiesKilled % CLIP_DROP_EVERY == 0 then
          AddClips(kpid, 1)
          Tell(kpid, "|cff88ccffYou strip a spare clip off the fallen (+1 clip).|r")
        end
      end
    end
    BoardDirty = true
    return
  end

  -- a resident falls
  if CIVILIAN_TYPES[GetUnitTypeId(u)] then
    CivDead = CivDead + 1
    LogRun("civdead|" .. CivDead .. "/" .. CivTotal)
    if hordeKill then
      GrantHordeXP(10, GetUnitX(u), GetUnitY(u), "civilian")
    end
    RecordCorpse(GetUnitX(u), GetUnitY(u))
    BoardDirty = true
    return
  end

  -- a survivor falls: defection, and their rise IS the Revenant
  local pid = SurvivorPidOf(u)
  if pid ~= nil then
    if hordeKill or Infected[pid] then
      GrantHordeXP(50, GetUnitX(u), GetUnitY(u), "survivor")
    end
    DefectPlayer(pid, GetUnitX(u), GetUnitY(u))
    return
  end

  -- barricades and sentries feed the horde a little
  local brec = BarricadeRec[u]
  if brec ~= nil then
    BarricadeRec[u] = nil
    SentryAmmoOf[u] = nil
    if hordeKill then
      GrantHordeXP(brec.kind == "sentry" and 8 or 4, GetUnitX(u), GetUnitY(u), brec.kind)
    end
    return
  end

  -- a kampong nest burns
  if GetUnitTypeId(u) == UNIT_KAMPONG_NEST then
    NestsDown = NestsDown + 1
    LogRun("nest|down|" .. NestsDown)
    AnnounceAll("|cff88ff88A brood nest collapses into the mud (" .. NestsDown .. "/3).|r")
    return
  end
end

-- -------------------------------------------------------------------- clock
function ClockTick()
  if GameOver then return end
  for _ = 1, ClockScale do
    GameClock = GameClock + 1
    InfectionTick()
    FixTick()

    -- the class-pick window closes
    if PickOpen and GameClock >= PICK_WINDOW then
      PickOpen = false
      AnnounceAll("|cffaaaaaaThe moment for second thoughts is over. You are who you are.|r")
    end

    -- phone vision expires
    for _, pid in ipairs(Users) do
      if PhoneUntil[pid] ~= nil and GameClock >= PhoneUntil[pid] then
        PhoneUntil[pid] = nil
        if not Defected[pid] then
          SetPlayerAlliance(Player(PLAYER_NEUTRAL_AGGRESSIVE_ID), Player(pid),
            ALLIANCE_SHARED_VISION, false)
          Tell(pid, "|cffaaaaaaThe signal dies. The cameras go dark again.|r")
        end
      end
    end

    -- escalation drip (state-keyed) and patrols
    EscClock = EscClock + 1
    if EscClock >= ESC_TICK then
      EscClock = 0
      EscDrip()
    end
    if GameClock >= PATROL_FROM then
      PatrolClock = PatrolClock + 1
      if GameClock == PATROL_FROM or PatrolClock >= PATROL_PERIOD then
        PatrolClock = 0
        SpawnPatrol()
      end
    end

    -- dread beats
    if GameClock >= DREAD_FROM then
      DreadClock = DreadClock + 1
      if GameClock == DREAD_FROM or DreadClock >= DREAD_PERIOD then
        DreadClock = 0
        DreadBeat()
      end
    end

    -- the train timeline
    if GameClock == TRAIN_ARRIVE - 180 then
      AnnounceAll("|cffffff66The station PA, clear across the rain: \"The last train departs Yishun. Yio Chu Kang, twelve o'clock.\" Three minutes.|r")
    elseif GameClock == TRAIN_ARRIVE - 60 then
      AnnounceAll("|cffffff66Far up the line, a headlight. One minute to Yio Chu Kang.|r")
    elseif GameClock == TRAIN_ARRIVE - 20 then
      AnnounceAll("|cff8888aaThe rails begin to sing.|r")
    elseif GameClock == TRAIN_ARRIVE then
      TrainArrives()
    elseif GameClock == TRAIN_DEPART - 30 and TrainAtStation then
      AnnounceAll("|cffffff66\"Doors closing in thirty seconds. This is the last train.\" RUN.|r")
    elseif GameClock == TRAIN_DEPART and TrainAtStation then
      ResolveDeparture()
      if GameOver then return end
    end
  end
  if BoardDirty then UpdateBoard() end
  if GameClock % 5 == 0 then UpdateBoard() end
end

function StartClock()
  local t = CreateTimer()
  TimerStart(t, 1.0, true, ClockTick)
end

-- ------------------------------------------------------------ chat: info
function ShowHelp(pid)
  Tell(pid, "|cffffcc00LAST TRAIN FROM YIO CHU KANG|r -- co-op survival. Board the last train at T+"
    .. TRAIN_ARRIVE .. "s (it waits " .. (TRAIN_DEPART - TRAIN_ARRIVE)
    .. "s), or kill the Broodmother in the kampong. Death = you join the horde.")
  Tell(pid, "|cffaaddffBullets are GOLD, clips are LUMBER:|r every shot costs 1 round; dry clip = clicks (craft a Parang to fight on at half damage); '-reload' burns a clip and locks you "
    .. RELOAD_TIME .. "s.")
  Tell(pid, "|cffaaddffScavenge + craft:|r '-search' near benches/dumpsters/lockers/stalls/cars/phones; '-craft <name>' combines (all ten: '-recipes').")
  Tell(pid, "|cffaaddffInfection:|r zombie hits infect (1.5 dps). Cure: Wet Bandage above "
    .. CURE_HP_PCT .. "% health (Paramedic: any), or " .. CLINIC_CURE_T
    .. "s in the polyclinic. The horde's kills RISE in " .. RISE_DELAY
    .. "s -- burn corpses with a Molotov.")
  Tell(pid, "|cffaaddffThe train needs POWER:|r all three substations ('-fix' beside one, "
    .. FIX_TIME .. "s channel; Technician half; a Generator Part is instant). No power, no doors.")
  Tell(pid, "|cffaaddffCommands:|r -help -status -recipes -credits -class <heartlander|police|paramedic|tech> (first "
    .. PICK_WINDOW .. "s) -search -craft -reload -sprint -fix -board -seed N (until first search/patrol) -test (debug).")
  Tell(pid, "|cff888888A map by Serendipity. Design adapted with credit from Zombination v11 (Trinin), Zombie-Simulator 7 (SpirulinaN), Dawn of the Dead (PreViO), NotD: Special Ops, SWAT: Aftermath. '-credits' for the full roll incl. every community model author. Mechanics only; nothing copied.|r")
end

function ShowStatus(pid)
  local trainTxt
  if TrainGone then
    trainTxt = "gone -- only the Broodmother ends this now"
  elseif TrainAtStation then
    trainTxt = "AT THE PLATFORM, doors " .. (StationPowered and "OPEN" or "sealed (no power)")
      .. ", departs in " .. (TRAIN_DEPART - GameClock) .. "s"
  else
    trainTxt = "arrives in " .. (TRAIN_ARRIVE - GameClock) .. "s"
  end
  Tell(pid, "|cffffcc00T+" .. GameClock .. "s.|r Train: " .. trainTxt .. ".")
  Tell(pid, "|cffaaddffPower:|r " .. GensFixed .. "/3 substations"
    .. (StationPowered and " -- STATION LIVE" or "") .. ". |cffaaddffHorde:|r level "
    .. EscLevel .. ", " .. HordeCount .. " walking. |cffaaddffResidents:|r "
    .. (CivTotal - CivDead) .. "/" .. CivTotal .. " still breathing.")
  Tell(pid, "|cffaaddffYou:|r " .. PlayerStatus(pid) .. ", " .. RoundsOf(pid)
    .. " rounds, " .. ClipsOf(pid) .. " clips"
    .. (Infected[pid] and " -- |cffcc66ffINFECTED|r" or "") .. ".")
end

function ShowCreditsCmd(pid)
  Tell(pid, "|cffffcc00Last Train from Yio Chu Kang -- a map by Serendipity.|r")
  Tell(pid, "|cffaaddffCommunity models (Hive Workshop, per-author credit):|r HerrDave -- T-Virus Zombies, Police Officer, Urban Prop Pack; Ilya Alaric (after Ujimasa Hojo's Villager) -- Citizen Pack; bakr -- Assorted City Buildings; Wayshan/purparisien -- Modern Cars Pack.")
  Tell(pid, "|cffaaddffCommissioned ambience models:|r Sol (GPT 5.6 Codex fleet) -- the two 2026-08-07 batches: HDB point tower, hawker centre, MRT platform canopies, bus stop shelters, street lamps, the monsoon drain, overhead bridges, kopitiam seating; round 2: the Broodmother, the kampong lair set (flesh pods, bone mounds, house shells), fare gates, platform screen doors, void-deck pillars, mailbox walls, bike racks, taxis, food carts.")
  Tell(pid, "|cffaaddffDesign inspirations (mechanics only, nothing copied):|r Zombination v11 (Trinin) -- evacuation window, curable infection, corpse-rise, XP falloff + drip, scavenging/crafting; Zombie-Simulator 7 (SpirulinaN) -- death = defection, state-keyed escalation; Dawn of the Dead (PreViO) -- gold-as-bullets; NotD: Special Ops -- dread-beat ambience; SWAT: Aftermath -- power objectives.")
  Tell(pid, "|cff888888Everything else (train, platform, viaduct, HDB blocks, the CBD skyline, MRT entrance and signs, laundry racks, linkways, substations, icons, terrain) is generated by this map's committed asset scripts. Built headlessly with wc3-map-toolkit.|r")
end

function HandleClassPick(pid, key)
  if not PickOpen then
    Tell(pid, "|cffaaaaaaThe pick window is closed -- you walk out as what you are.|r")
    return
  end
  local def = CLASSES[key]
  if def == nil then
    Tell(pid, "|cffaaaaaaClasses: heartlander, police, paramedic, tech.|r")
    return
  end
  if Defected[pid] or Aboard[pid] then return end
  local old = Survivors[pid]
  local x, y, face = GetUnitX(old), GetUnitY(old), GetUnitFacing(old)
  RemoveUnit(old)
  ClassOf[pid] = key
  ClassPicked[pid] = true
  local u = CreateUnit(Player(pid), def.unit, x, y, face)
  Survivors[pid] = u
  SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, def.clip)
  SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_LUMBER, def.clips)
  for _, it in ipairs(def.items) do GiveItem(pid, it) end
  SelectUnitForPlayerSingle(u, Player(pid))
  LogRun("class|pid=" .. pid .. "|" .. key)
  AnnounceAll("|cff88ccff" .. GetPlayerName(Player(pid)) .. " steps up as the "
    .. def.name .. ".|r")
  BoardDirty = true
end

-- 9-digit numeric-argument guard (vaults' ParseNumArg): the game parses
-- >= 2^31 as 64-bit, fengari overflows to float — capping the DIGIT COUNT
-- keeps both widths accepting exactly the same strings.
function ParseNumArg(s)
  if s == nil or #s > 9 then return nil end
  return math.tointeger(tonumber(s))
end

function HandleSeed(pid, n)
  if SeedLocked then
    Tell(pid, "|cffaaaaaaThe night is already committed -- -seed works only before your first search (or the first patrol).|r")
    return
  end
  RunSeed = n
  SeedRNG(n)
  RUNLOG = ""
  LogRun("seed=" .. n)
  AnnounceAll("|cffaaddffThe night rewinds to seed " .. n .. ".|r")
end

-- ---------------------------------------------------------- chat: debug
function GiveTokenItem(pid, token)
  for _, r in ipairs(RECIPES) do
    if r.key == token then
      GiveItem(pid, r.out)
      Tell(pid, "|cffff88ff" .. r.name .. " conjured.|r")
      return
    end
  end
  for it, nm in pairs(MATERIAL_NAMES) do
    if string.lower(nm) == token or string.lower(string.gsub(nm, " ", "")) == token then
      GiveItem(pid, it)
      Tell(pid, "|cffff88ff" .. nm .. " conjured.|r")
      return
    end
  end
  Tell(pid, "|cffaaaaaa-give wants a recipe key (-recipes) or material name.|r")
end

function HandleChat(pid, msgRaw)
  local msg = string.lower(msgRaw)
  msg = string.match(msg, "^%s*(.-)%s*$")
  if string.sub(msg, 1, 1) ~= "-" then return end

  if msg == "-help" then ShowHelp(pid) return end
  if msg == "-status" then ShowStatus(pid) return end
  if msg == "-recipes" then ShowRecipes(pid) return end
  if msg == "-credits" then ShowCreditsCmd(pid) return end
  if msg == "-search" then
    if GameOver then return end
    HandleSearch(pid)
    return
  end
  if msg == "-reload" then
    if GameOver then return end
    HandleReload(pid)
    return
  end
  if msg == "-sprint" then
    if GameOver then return end
    HandleSprint(pid)
    return
  end
  if msg == "-fix" then
    if GameOver then return end
    HandleFix(pid)
    return
  end
  if msg == "-board" then
    if GameOver then return end
    if not TrainAtStation then
      Tell(pid, "|cffaaaaaaThere is no train to board" .. (TrainGone and " -- it is gone" or " yet") .. ".|r")
      return
    end
    local u = Survivors[pid]
    if u ~= nil and PlatformRegion ~= nil and not IsUnitInRegion(PlatformRegion, u) then
      Tell(pid, "|cffaaaaaaYou are not on the platform.|r")
      return
    end
    TryBoard(pid)
    return
  end

  local classArg = string.match(msg, "^%-class%s+(%a+)$")
  if classArg ~= nil then
    if GameOver then return end
    HandleClassPick(pid, classArg)
    return
  end
  local craftArg = string.match(msg, "^%-craft%s+(%a+)$")
  if craftArg ~= nil then
    if GameOver then return end
    HandleCraft(pid, craftArg)
    return
  end
  local seedArg = string.match(msg, "^%-seed%s+(%d+)$")
  if seedArg ~= nil then
    local n = ParseNumArg(seedArg)
    if n == nil then
      Tell(pid, "|cffaaaaaaSeeds run 1 to 9 digits -- the night refuses " .. seedArg .. ".|r")
      return
    end
    HandleSeed(pid, n)
    return
  end

  if msg == "-test" then
    TestMode[pid] = not TestMode[pid]
    if TestMode[pid] then
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid))
        .. " enabled -test debug mode.|r Commands: -gold N, -clips N, -give <r>, -zspawn <kind> [n], -esc N, -clock N, -power, -infectme, -clearhorde, -ff, -runlog")
    else
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid)) .. " disabled -test debug mode.|r")
    end
    return
  end

  local goldArg = string.match(msg, "^%-gold%s+(%d+)$")
  local clipsArg = string.match(msg, "^%-clips%s+(%d+)$")
  local giveArg = string.match(msg, "^%-give%s+(%a+)$")
  local zKind, zCount = string.match(msg, "^%-zspawn%s+(%a+)%s*(%d*)$")
  local escArg = string.match(msg, "^%-esc%s+(%d+)$")
  local clockArg = string.match(msg, "^%-clock%s+(%d+)$")
  local known = goldArg ~= nil or clipsArg ~= nil or giveArg ~= nil
    or zKind ~= nil or escArg ~= nil or clockArg ~= nil
    or msg == "-power" or msg == "-infectme" or msg == "-clearhorde"
    or msg == "-ff" or msg == "-runlog"
  if not known then return end
  if not TestMode[pid] then
    Tell(pid, "|cffaaaaaaDebug commands need -test mode. Type -test first.|r")
    return
  end

  if goldArg ~= nil then
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, ParseNumArg(goldArg) or 0)
    Tell(pid, "|cffff88ffRounds set to " .. RoundsOf(pid) .. ".|r")
  elseif clipsArg ~= nil then
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_LUMBER, ParseNumArg(clipsArg) or 0)
    Tell(pid, "|cffff88ffClips set to " .. ClipsOf(pid) .. ".|r")
  elseif giveArg ~= nil then
    GiveTokenItem(pid, giveArg)
  elseif zKind ~= nil then
    if ZOMBIE_KINDS[zKind] == nil or zKind == "brood" then
      Tell(pid, "|cffaaaaaa-zspawn wants: shambler, withered, sprinter, riot, revenant.|r")
      return
    end
    local n = ParseNumArg(zCount)
    if n == nil or n < 1 then n = 1 end
    if n > 24 then n = 24 end
    local u = Survivors[pid]
    local x = u ~= nil and GetUnitX(u) or 0.0
    local y = u ~= nil and GetUnitY(u) or 0.0
    for i = 1, n do
      SpawnZombie(zKind, x + 200.0 + (i - 1) * 64.0, y)
    end
    Tell(pid, "|cffff88ff" .. n .. " " .. zKind .. "(s) shuffle in.|r")
    LogRun("debug|zspawn|" .. zKind .. "|n=" .. n)
  elseif escArg ~= nil then
    local lvl = ParseNumArg(escArg) or 1
    if lvl < 1 then lvl = 1 end
    if lvl > ESC_LEVEL_CAP then lvl = ESC_LEVEL_CAP end
    HordeXP = (lvl - 1) * XP_PER_LEVEL
    RecomputeEsc()
    Tell(pid, "|cffff88ffHorde level set to " .. EscLevel .. ".|r")
  elseif clockArg ~= nil then
    local t = ParseNumArg(clockArg) or GameClock
    GameClock = t
    LogRun("debug|clock|" .. t)
    AnnounceAll("|cffff88ffThe night lurches to T+" .. t .. "s.|r")
    BoardDirty = true
  elseif msg == "-power" then
    for _, rec in ipairs(GenList) do
      if not rec.fixed then FixGenerator(pid, rec) end
    end
  elseif msg == "-infectme" then
    InfectSurvivor(pid)
  elseif msg == "-clearhorde" then
    local doomed = {}
    for u in pairs(ZombieRec) do
      if u ~= BroodUnit then doomed[#doomed + 1] = u end
    end
    for _, u in ipairs(doomed) do
      ZombieRec[u] = nil
      HordeCount = HordeCount - 1
      RemoveUnit(u)
    end
    Tell(pid, "|cffff88ffThe estate falls quiet (" .. #doomed .. " removed; the Broodmother remains).|r")
    LogRun("debug|clearhorde|" .. #doomed)
  elseif msg == "-ff" then
    ClockScale = (ClockScale == 1) and FF_SCALE or 1
    AnnounceAll("|cffff88ffClock speed is now " .. ClockScale .. "x.|r")
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

function RegisterTriggers()
  local death = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(death, EVENT_PLAYER_UNIT_DEATH)
  TriggerAddAction(death, HandleDeath)

  local damaging = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(damaging, EVENT_PLAYER_UNIT_DAMAGING)
  TriggerAddAction(damaging, HandleDamaging)

  local useItem = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(useItem, EVENT_PLAYER_UNIT_USE_ITEM)
  TriggerAddAction(useItem, HandleUseItem)

  -- the platform: stepping in while the train waits boards you
  local boardTrig = CreateTrigger()
  PlatformRegion = CreateRegion()
  RegionAddRect(PlatformRegion, Rect(REGION_PLATFORM.minX, REGION_PLATFORM.minY,
    REGION_PLATFORM.maxX, REGION_PLATFORM.maxY))
  TriggerRegisterEnterRegion(boardTrig, PlatformRegion, nil)
  TriggerAddAction(boardTrig, function()
    local pid = SurvivorPidOf(GetEnteringUnit())
    if pid ~= nil then TryBoard(pid) end
  end)

  ClinicRegion = CreateRegion()
  RegionAddRect(ClinicRegion, Rect(REGION_CLINIC.minX, REGION_CLINIC.minY,
    REGION_CLINIC.maxX, REGION_CLINIC.maxY))
end

-- ------------------------------------------------------------------- intro
function ShowCredits()
  local q = CreateQuest()
  QuestSetTitle(q, "Credits & Inspirations")
  QuestSetDescription(q, "Last Train from Yio Chu Kang -- a map by Serendipity (wc3-map-toolkit)."
    .. " Community models, per-author credit (Hive Workshop): HerrDave (T-Virus Zombies; Police Officer; Urban Prop Pack),"
    .. " Ilya Alaric after Ujimasa Hojo's Villager (Citizen Pack), bakr (Assorted City Buildings), Wayshan/purparisien (Modern Cars Pack)."
    .. " Commissioned ambience models: Sol (GPT 5.6 Codex fleet), 2026-08-07 batches 1 and 2 (incl. the Broodmother and the lair, station, void-deck and street sets)."
    .. " Design inspirations, mechanics only, nothing copied: Zombination v11 (Trinin) -- evacuation window, curable infection, corpse-rise, XP falloff;"
    .. " Zombie-Simulator 7 (SpirulinaN) -- death = defection, state-keyed escalation; Dawn of the Dead (PreViO) -- gold-as-bullets ammo;"
    .. " NotD: Special Ops -- dread-beat ambience; SWAT: Aftermath -- power objectives.")
  QuestSetIconPath(q, "ReplaceableTextures\\CommandButtons\\BTNZombie.blp")
  QuestSetDiscovered(q, true)

  local q2 = CreateQuest()
  QuestSetTitle(q2, "How to Survive (and the Recipes)")
  QuestSetDescription(q2, "Board the last train (T+" .. TRAIN_ARRIVE .. "s, waits "
    .. (TRAIN_DEPART - TRAIN_ARRIVE) .. "s; needs 3/3 substations '-fix'ed) or kill the Broodmother in the kampong."
    .. " Bullets are gold, clips are lumber, '-reload' takes " .. RELOAD_TIME .. "s."
    .. " '-search' furniture for materials; '-craft': bandage=Cloth+Water, parang=Plank+Pipe, phone=Pipe+Wire,"
    .. " barricade=Cloth+Plank, molotov=Bottle+Kerosene, flare=Cloth+Kerosene, sentry=Pipe+Battery,"
    .. " kopi=Rations+Water, part=Wire+Battery, torch=Pipe+Kerosene."
    .. " Zombie bites infect (cure: Wet Bandage above " .. CURE_HP_PCT .. "%, or the polyclinic)."
    .. " The horde's kills rise in " .. RISE_DELAY .. "s -- burn corpses. Death = defection: the fallen play on, against you.")
  QuestSetIconPath(q2, "ReplaceableTextures\\CommandButtons\\BTNSteelMelee.blp")
  QuestSetDiscovered(q2, true)
end

function PlayIntro()
  AnnounceAll("|cffaaddffYIO CHU KANG, 9.47 PM. The island went dark estate by estate. The PA says one more train.|r")
  After(4.0, function()
    if GameOver then return end
    AnnounceAll("|cffaaddffPick a class in the first " .. PICK_WINDOW
      .. "s (-class heartlander|police|paramedic|tech). Scavenge ('-search'), craft ('-recipes'), fix the three substations ('-fix'), and be on that platform at T+"
      .. TRAIN_ARRIVE .. "s -- or take the long walk to the kampong and end it yourself.|r")
  end)
  After(8.0, function()
    if GameOver then return end
    AnnounceAll("|cffffff66Seed " .. RunSeed
      .. " -- replay this exact night with -seed N before your first search. -help for everything.|r")
  end)
end

-- =========================================================== entry points
function InitGlobals()
end

-- Lobby configuration in the exact WE shape for "Use Custom Forces" +
-- "Fixed Player Settings" (tidewatch pattern, gotcha 18): all four co-op
-- slots sit in force 0 ("The Survivors"), so every player gets team 0.
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

  DefineStartLocation(0, -700.0, -400.0)
  DefineStartLocation(1, -500.0, -400.0)
  DefineStartLocation(2, -700.0, 0.0)
  DefineStartLocation(3, -500.0, 0.0)

  InitCustomPlayerSlots()
  InitCustomTeams()
end

PLAYER_NEUTRAL_AGGRESSIVE_ID = 24
PLAYER_NEUTRAL_PASSIVE_ID = 27
PLAYER_NEUTRAL_VICTIM_ID = 25

function main()
  SetCameraBounds(
    -5376.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    -5632.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM),
    5376.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    5120.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    -5376.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    5120.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    5376.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    -5632.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM))
  SetDayNightModels(
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronTerrain\\DNCLordaeronTerrain.mdl",
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronUnit\\DNCLordaeronUnit.mdl")
  NewSoundEnvironment("Default")
  SetAmbientDaySound("LordaeronSummerNight")
  SetAmbientNightSound("LordaeronSummerNight")
  SetMapMusic("Music", true, 0)
  InitBlizzard()
  InitGlobals()

  -- ONE PERMANENT NIGHT: the whole run happens under a stopped clock,
  -- monsoon rain and low blue fog — darkness is a managed resource
  -- (lamplight pockets, flares, the Mobile Phone's 30s of cameras).
  SetTimeOfDay(22.0)
  SetTimeOfDayScale(0.0)
  SetTerrainFogEx(0, 1400.0, 5200.0, 0.35, 0.05, 0.07, 0.12)
  AddWeatherEffect(Rect(-6144.0, -6144.0, 6144.0, 6144.0), FourCC("RLlr"))

  -- seat the survivors: 1-4 co-op slots occupied by humans
  Users = {}
  for pid = 0, MAX_PLAYERS - 1 do
    TestMode[pid] = false
    if PlayingUser(pid) then Users[#Users + 1] = pid end
  end
  if #Users == 0 then Users = { 0 } end
  NumPlayers = #Users

  -- the co-op alliance is real alliance state (gotcha 24): both directions
  -- of every seated pair — DefectPlayer tears exactly this down later
  for _, i in ipairs(Users) do
    for _, j in ipairs(Users) do
      if i ~= j then
        SetPlayerAlliance(Player(i), Player(j), ALLIANCE_PASSIVE, true)
        SetPlayerAlliance(Player(i), Player(j), ALLIANCE_SHARED_VISION, true)
      end
    end
  end

  -- preplaced estate: HDB blocks, props, civilians, the seeded horde, the
  -- lair (units.json is the single source of truth — gotcha 10)
  CreateAllUnits()

  -- register the world CreateAllUnits placed: props, generators, civilians,
  -- the horde and the Broodmother (deterministic enumeration by player)
  local g = CreateGroup()
  for _, owner in ipairs({ PLAYER_NEUTRAL_PASSIVE_ID, PLAYER_NEUTRAL_AGGRESSIVE_ID }) do
    GroupEnumUnitsOfPlayer(g, Player(owner), nil)
    local u = FirstOfGroup(g)
    while u ~= nil do
      local t = GetUnitTypeId(u)
      if PROP_KINDS[t] ~= nil then
        PropRec[u] = { kind = PROP_KINDS[t], searched = false }
      elseif t == UNIT_SUBSTATION then
        GenList[#GenList + 1] = { unit = u, fixed = false }
      elseif ZombieTypeKind[t] ~= nil then
        RegisterZombie(u, ZombieTypeKind[t])
        if t == UNIT_THE_BROODMOTHER then BroodUnit = u end
      end
      GroupRemoveUnit(g, u)
      u = FirstOfGroup(g)
    end
  end
  GroupEnumUnitsOfPlayer(g, Player(PLAYER_NEUTRAL_VICTIM_ID), nil)
  local cu = FirstOfGroup(g)
  while cu ~= nil do
    if CIVILIAN_TYPES[GetUnitTypeId(cu)] then CivTotal = CivTotal + 1 end
    GroupRemoveUnit(g, cu)
    cu = FirstOfGroup(g)
  end
  DestroyGroup(g)

  -- the survivors walk out of the void deck as Heartlanders (the -class
  -- window re-casts them); bullets are gold, clips are lumber
  for _, pid in ipairs(Users) do
    ClassOf[pid] = "heartlander"
    local def = CLASSES.heartlander
    local sx = -700.0 + 200.0 * (pid % 2)
    local sy = -400.0 + 400.0 * (pid // 2)
    Survivors[pid] = CreateUnit(Player(pid), def.unit, sx, sy, 90.0)
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, def.clip)
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_LUMBER, def.clips)
    for _, it in ipairs(def.items) do GiveItem(pid, it) end
    AmmoSpent[pid] = 0
  end

  SeedRNG(DEFAULT_SEED)
  RunSeed = DEFAULT_SEED
  LogRun("seed=" .. DEFAULT_SEED)

  ShowCredits()
  InitBoard()
  RegisterTriggers()
  RegisterChatCommands()
  StartClock()

  After(1.5, PlayIntro)
end
