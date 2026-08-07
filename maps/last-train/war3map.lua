-- =========================================================================
-- Last Train from Yio Chu Kang — war3map.lua (phase 2A)  a map by Serendipity
-- =========================================================================
-- 1-4 player co-op zombie survival in a rain-soaked Singapore HDB estate,
-- one permanent night before the network shuts down. Scavenge the void
-- decks, let your pack auto-combine what the island left you, restore
-- three substations by STANDING at them, and board the LAST North-South
-- line train at T+12:00 — or walk into the kampong remnant off Lorong
-- Buangkok and kill the Broodmother instead. Death is not elimination:
-- the fallen DEFECT to the horde and conduct it against the living.
--
-- PHASE 2A — the fun transplant (DESIGN-WALKTHROUGH.md is the design gate
-- this file implements; playtest verdict on phase 1: "constant typing is
-- bad"). The doctrine is CLAUDE.md gotcha 33: chat is META ONLY — every
-- combat-tempo verb is a click, an ability, an item, or proximity:
--   * class pick   = walk onto a class circle (first 40s)
--   * scavenge     = RUMMAGE (stand ~3s near a prop, quiet) or SMASH
--                    (props are ~30 HP units; instant loot, +Noise)
--   * craft        = AUTO-COMBINE on pickup (4 recipes, each material in
--                    exactly one recipe)
--   * reload       = ability R (4s gun-down, legs still work)
--   * sprint       = ability E
--   * repair       = stand in the substation yard (progress persists,
--                    damage knocks 3s off)
--   * board        = walk onto the platform
--   * shop         = the Provision Shop sells tools for CLIPS (lumber)
-- The night's heartbeat is the SURGE cycle (telegraphed siren 20s ahead,
-- every ~120s, sized by escalation + players + district NOISE), the Last
-- Mile trickle from T+600, and the platform siege across the boarding
-- window. A persistent countdown window runs from frame one.
--
-- Design (inspiration only, adapted with credit — README + -credits):
--   * Zombie Defense Custom (Lions_Blood) — the surge/countdown heartbeat,
--     spendable downtime, ground-drop economy, the fort as a shared team
--     artifact (decomposed 2026-08; docs/reference/
--     zombie-survival-comparison.md).
--   * Zombination v11 (Trinin) — evacuation window, curable infection
--     STATE, corpse-rise with a burnable window, the anti-snowball pair.
--   * Zombie-Simulator 7 (SpirulinaN) — death = defection; state-keyed
--     escalation.
--   * Dawn of the Dead (PreViO) — gold-as-bullets, lumber-as-clips.
--   * NotD: Special Ops — scripted dread beats (now pre-surge only).
--   * SWAT: Aftermath — objectives as anti-camping.
--   Mechanics only; nothing copied.
--
-- Determinism (CLAUDE.md gotchas 28-30): script-level state lives in Lua
-- GLOBALS; EVERY random draw (loot, spills, surges, wanderers, nests,
-- dread) flows through ONE Park-Miller PRNG; '-seed N' reseeds until the
-- seed LOCKS at the first commitment point (first rummage/smash/spill
-- draw, or the first wanderer at t=90); RUNLOG accumulates
-- machine-readable beats. Golden-run pin still deferred (README).
--
-- Chat is META ONLY (gotcha 33): -help -status -recipes -credits -seed N;
-- '-test' toggles debug (northreach convention): -gold N -clips N
-- -give <r> -zspawn <kind> [n] -esc N -clock N -power -infectme
-- -clearhorde -ff -runlog -surge -xp N -noise N.
-- =========================================================================

-- ------------------------------------------------------------------ tuning
local MAX_PLAYERS     = 4
local DEFAULT_SEED    = 20260807 -- lobby-visible: printed in the description
local TRAIN_ARRIVE    = 720      -- the last train calls at T+12:00
local TRAIN_DEPART    = 900      -- and leaves 180s later
local PICK_WINDOW     = 40       -- class-circle window after spawn
local RELOAD_TIME     = 4        -- seconds gun-down while reloading
local INFECT_DMG      = 3        -- infection DoT: 3 damage every 2s (1.5 dps)
local INFECT_PERIOD   = 2
local CURE_HP_PCT     = 40       -- Wet Bandage works above this health %
local CLINIC_CURE_T   = 5        -- seconds standing in the clinic to cure
local RISE_DELAY      = 3.5      -- corpse-rise window (burnable)
local MOLOTOV_RADIUS  = 350.0
local MOLOTOV_DMG     = 60.0
local MOLOTOV_NEST_DMG = 200.0
local RUMMAGE_RANGE   = 250.0    -- stand this close to auto-rummage
local RUMMAGE_TIME    = 3        -- ~3s of standing turns the prop out
local FIX_RANGE       = 300.0    -- the substation yard
local FIX_TIME        = 10       -- progress seconds to complete (tech: 2x rate)
local FIX_KNOCK       = 3        -- a hit knocks this much progress off
local XP_RADIUS       = 600.0    -- horde kill-XP sharing radius
local XP_FALLOFF_PCT  = 75       -- x0.75 per extra zombie near the kill
local XP_CROWD_CAP    = 8
local XP_PER_LEVEL    = 120      -- horde escalation
local ESC_LEVEL_CAP   = 8
local ESC_TICK        = 20       -- passive drip cadence
local ESC_HP_PCT      = 10       -- +10% zombie hp per horde level past 1
local SURV_XP_LEVEL   = 80       -- survivor XP per level
local SURV_LEVEL_CAP  = 8
local SIG_LEVEL       = 3        -- signature ability unlock
local WANDER_FROM     = 90       -- first ambient wanderers (also a seed lock)
local WANDER_PERIOD   = 45
local SURGE_WARN      = 20       -- siren lead time
local SURGE_LAST      = 600      -- the last cyclical surge -> Last Mile
local TRICKLE_PERIOD  = 20
local NOISE_SMASH     = 10
local NOISE_MOLOTOV   = 15
local NOISE_SHOT      = 1
local NOISE_DECAY_T   = 6        -- every 6s each district cools 1 heat
local SPILL_PCT       = 20       -- surge kills spill loot this often
local SPRINT_BONUS    = 120
local SPRINT_TIME     = 4
local SPRINT_CD       = 20
local RIOT_TIME       = 10
local RIOT_CD         = 45
local TRIAGE_RANGE    = 400.0
local TRIAGE_HEAL     = 100.0
local TRIAGE_CD       = 45
local OVERCLOCK_CD    = 60
local FEAST_RANGE     = 400.0
local FEAST_CD        = 15
local SHRIEK_CD       = 60
local SHRIEK_HOLD     = 90       -- shriek steers surges/trickle this long
local SENTRY_AMMO     = 40
local RATIONS_HEAL    = 100.0
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
ClassPicked    = {}     -- pid -> true once a circle was stepped on
Defected       = {}     -- pid -> true after death = defection
Aboard         = {}     -- pid -> true once on the train
Infected       = {}     -- pid -> true while the slow burn runs
InfectTick     = {}     -- pid -> phase accumulator for the 2s DoT
ClinicTicks    = {}     -- pid -> consecutive seconds inside the clinic
Reloading      = {}     -- pid -> GameClock when the reload completes
SprintReady    = {}     -- pid -> GameClock when Sprint is available
SigReady       = {}     -- pid -> GameClock when the signature is available
FeastReady     = {}     -- pid -> GameClock (Revenant)
ShriekReady    = {}     -- pid -> GameClock (Revenant)
RiotUntil      = {}     -- pid -> GameClock while Riot Discipline holds
OverclockArmed = {}     -- pid -> true while the next repair is instant
ClickTold      = {}     -- pid -> dry-clip message shown since last reload
ReloadTold     = {}     -- pid -> gun-down message shown this reload
RummageProp    = {}     -- pid -> prop unit currently being rummaged
RummageTicks   = {}     -- pid -> consecutive seconds beside that prop
SurvXP         = {}     -- pid -> survivor XP
SurvLevel      = {}     -- pid -> survivor level (1..SURV_LEVEL_CAP)
ZombieRec      = {}     -- zombie unit -> {kind}
HordeCount     = 0      -- live horde units (bookkept via ZombieRec)
CorpseList     = {}     -- append-ordered corpse records {x, y, risen, burned}
PropRec        = {}     -- prop unit -> {kind, searched}
GenList        = {}     -- append-ordered substation recs {unit, fixed, progress}
NestRec        = {}     -- nest unit -> true
SentryAmmoOf   = {}     -- sentry unit -> rounds left
SentryDry      = {}     -- sentry unit -> true once announced dry
BarricadeRec   = {}     -- barricade/sentry unit -> {kind, pid}
NoiseHeat      = {}     -- district key -> heat (decays)
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
ZombiesKilled  = 0
Searches       = 0      -- rummages + smashes (RUNLOG bookkeeping)
NestsDown      = 0
LampsLit       = 0
PhoneUntil     = {}     -- pid -> GameClock while horde vision is shared
FlareUntil     = 0
PickOpen       = true
SeedLocked     = false
NestsSeeded    = false
ScoreFinal     = 0
Board          = nil
BoardDirty     = false
EscClock       = 0
WanderClock    = 0
NoiseClock     = 0
TrickleClock   = 0
LastMile       = false
SiegeCalled    = false
PendingSurge   = nil    -- {x, y, key, name, idx} set by the siren
SurgeIdx       = 0
ShriekPoint    = nil    -- {x, y, until} the Revenant's conductor baton
LastRepairKey  = nil
LastRepairAt   = -999
LastFaller     = nil
RUNLOG         = ""
RunSeed        = DEFAULT_SEED
PlatformRegion = nil
ClinicRegion   = nil
TrainTimer     = nil
TrainDialog    = nil
SndSiren       = nil
SndChime       = nil
InScriptedDamage = false
InAutoCombine  = false

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

function FloatText(x, y, msg)
  local tt = CreateTextTag()
  SetTextTagText(tt, msg, 0.023)
  SetTextTagPos(tt, x, y, 16.0)
  SetTextTagVelocity(tt, 0.0, 0.03)
  SetTextTagPermanent(tt, false)
  SetTextTagLifespan(tt, 3.0)
  SetTextTagFadepoint(tt, 2.0)
end

function LockSeed(reason)
  if SeedLocked then return end
  SeedLocked = true
  LogRun("seedlock|" .. reason)
  AnnounceAll("|cffaaaaaaThe night has you now (" .. reason .. ") -- seed "
    .. RunSeed .. " is locked for this run.|r")
  SpawnNests()
end

-- ------------------------------------------------------------------ classes
-- Singapore-flavored genre classes (survey furniture, credited in README).
-- hp/dmg mirror objects-units.json uhpm/ua1b so survivor level bonuses can
-- be computed without reading engine state back (sim-honest).
CLASS_ORDER = { "heartlander", "police", "paramedic", "tech" }
CLASSES = {
  heartlander = { unit = UNIT_HEARTLANDER, name = "Heartlander",
    clip = 12, clips = 2, ms = 290, hp = 550, dmg = 22,
    items = { ITEM_RATIONS } },
  police = { unit = UNIT_AUXILIARY_POLICE_OFFICER, name = "Auxiliary Police Officer",
    clip = 24, clips = 3, ms = 300, hp = 500, dmg = 26, items = {} },
  paramedic = { unit = UNIT_PARAMEDIC, name = "Paramedic",
    clip = 8, clips = 2, ms = 300, hp = 450, dmg = 16,
    items = { ITEM_WET_BANDAGE, ITEM_WET_BANDAGE }, cureAnyHp = true },
  tech = { unit = UNIT_TOWN_COUNCIL_TECHNICIAN, name = "Town Council Technician",
    clip = 10, clips = 2, ms = 290, hp = 480, dmg = 18,
    items = { ITEM_BARRICADE_KIT }, fastFix = true },
}
SIG_ABIL = {
  heartlander = ABIL_STEADY_HANDS,
  police = ABIL_RIOT_DISCIPLINE,
  paramedic = ABIL_FIELD_TRIAGE,
  tech = ABIL_OVERCLOCK,
}
SIG_NAME = {
  heartlander = "Steady Hands",
  police = "Riot Discipline",
  paramedic = "Field Triage",
  tech = "Overclock",
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

-- ------------------------------------------------- survivor XP & levels
-- The player-owned compounding number (canon invariant I2 — the fun
-- transplant's core): XP per kill and per objective; small stats each
-- level; ONE signature ability per class at level 3.
function HasSteadyHands(pid)
  return ClassOf[pid] == "heartlander" and (SurvLevel[pid] or 1) >= SIG_LEVEL
end

function ClipSizeOf(pid)
  local clip = ClassDefOf(pid).clip
  if HasSteadyHands(pid) then clip = clip + 2 * ((SurvLevel[pid] or 1) - 1) end
  return clip
end

function ReloadTimeOf(pid)
  if HasSteadyHands(pid) then return RELOAD_TIME - 1 end
  return RELOAD_TIME
end

function ApplyLevelStats(pid)
  -- (re)apply the FULL level bonus to the pid's current unit — used on
  -- level-up and after a class-circle re-pick swaps the unit out
  local u = Survivors[pid]
  if u == nil then return end
  local def = ClassDefOf(pid)
  local lvl = SurvLevel[pid] or 1
  BlzSetUnitMaxHP(u, def.hp + 30 * (lvl - 1))
  BlzSetUnitBaseDamage(u, def.dmg + 2 * (lvl - 1), 0)
  if lvl >= SIG_LEVEL then
    UnitAddAbility(u, SIG_ABIL[ClassOf[pid] or "heartlander"])
  end
end

function GrantSurvXP(pid, amt, why)
  if pid == nil or amt <= 0 or Defected[pid] or Aboard[pid] then return end
  SurvXP[pid] = (SurvXP[pid] or 0) + amt
  local lvl = 1 + SurvXP[pid] // SURV_XP_LEVEL
  if lvl > SURV_LEVEL_CAP then lvl = SURV_LEVEL_CAP end
  local u = Survivors[pid]
  if u ~= nil and Alive(u) then
    FloatText(GetUnitX(u), GetUnitY(u), "|cffffcc00+" .. amt .. " xp|r")
  end
  if lvl ~= (SurvLevel[pid] or 1) then
    SurvLevel[pid] = lvl
    ApplyLevelStats(pid)
    if u ~= nil then
      SetWidgetLife(u, math.min(GetWidgetLife(u) + 30.0,
        GetUnitState(u, UNIT_STATE_MAX_LIFE)))
    end
    LogRun("lvl|pid=" .. pid .. "|l=" .. lvl .. "|" .. why)
    Tell(pid, "|cffffcc00Level " .. lvl .. ".|r Harder to kill, harder hitting.")
    if lvl == SIG_LEVEL then
      LogRun("sig|pid=" .. pid .. "|" .. (ClassOf[pid] or "heartlander"))
      Tell(pid, "|cff88ccffSignature unlocked: " .. SIG_NAME[ClassOf[pid] or "heartlander"] .. ".|r")
    end
    BoardDirty = true
  end
end

-- ---------------------------------------------------------------- the horde
-- .xp is the SURVIVOR XP a kill of that kind pays (phase 2A power curve).
ZOMBIE_KINDS = {
  shambler = { unit = UNIT_SHAMBLING_RESIDENT,      hp = 220,  xp = 6 },
  withered = { unit = UNIT_WITHERED_UNCLE,          hp = 300,  xp = 8 },
  sprinter = { unit = UNIT_PARK_CONNECTOR_SPRINTER, hp = 160,  xp = 8 },
  riot     = { unit = UNIT_RIOT_WALKER,             hp = 450,  xp = 14 },
  revenant = { unit = UNIT_REVENANT,                hp = 700,  xp = 25 },
  brood    = { unit = UNIT_THE_BROODMOTHER,         hp = 3500, xp = 0 },
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

-- Horde kill-XP with the Zombination anti-snowball falloff (credited).
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
  -- every nest burned trims the drip one step (ZCD's radiation fragments,
  -- adapted: downtime becomes spendable, camping gains counterplay)
  drip = drip - NestsDown
  if drip < 1 then drip = 1 end
  HordeXP = HordeXP + drip
  RecomputeEsc()
end

-- ------------------------------------------------------------- corpse-rise
-- Zombination's corpse-rise, credited: anything the horde kills gets back
-- up after a visible window — unless somebody burns the corpse first.
-- Phase 2A: the Revenant's Feast claims a corpse EARLY, so burning is
-- direct PvP denial too.
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
  GrantSurvXP(pid, 10, "cure")
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

-- FOUR recipes, each material in EXACTLY one — that is what makes crafting
-- safe to run AUTOMATICALLY on pickup (no ambiguity, no typing; gotcha 33).
RECIPES = {
  { key = "bandage", a = ITEM_CLOTH,  b = ITEM_BOTTLED_WATER, out = ITEM_WET_BANDAGE, name = "Wet Bandage" },
  { key = "parang",  a = ITEM_PLANK,  b = ITEM_PIPE,          out = ITEM_PARANG,      name = "Parang" },
  { key = "molotov", a = ITEM_BOTTLE, b = ITEM_KEROSENE,      out = ITEM_MOLOTOV,     name = "Molotov" },
  { key = "sentry",  a = ITEM_WIRE,   b = ITEM_BATTERY,       out = ITEM_SENTRY_KIT,  name = "Sentry Kit" },
}

function AutoCombine(pid)
  local u = Survivors[pid]
  if u == nil or not Alive(u) or InAutoCombine then return end
  InAutoCombine = true
  for _, r in ipairs(RECIPES) do
    while CountItemOfType(u, r.a) >= 1 and CountItemOfType(u, r.b) >= 1 do
      TakeItemOfType(u, r.a)
      TakeItemOfType(u, r.b)
      GiveItem(pid, r.out)
      LogRun("craft|pid=" .. pid .. "|" .. r.key)
      StartSound(SndChime)
      FloatText(GetUnitX(u), GetUnitY(u), "|cff88ccff" .. r.name .. "|r")
      Tell(pid, "|cff88ccffYour hands know this one: " .. MATERIAL_NAMES[r.a]
        .. " + " .. MATERIAL_NAMES[r.b] .. " -> " .. r.name .. ".|r")
    end
  end
  InAutoCombine = false
end

function ShowRecipes(pid)
  Tell(pid, "|cffffcc00Combining is AUTOMATIC|r -- carry both halves and they snap together:")
  for _, r in ipairs(RECIPES) do
    Tell(pid, "|cffaaddff" .. MATERIAL_NAMES[r.a] .. " + " .. MATERIAL_NAMES[r.b]
      .. "|r -> " .. r.name)
  end
  Tell(pid, "|cffaaddffThe Provision Shop|r at the void deck sells Barricade Kit (2 clips), Mobile Phone (3), Wet Bandage (2), Flare (1). Rations you just eat.")
end

-- ---------------------------------------------------------------- scavenge
-- Furniture scavenging (Zombination, credited), de-chatted (gotcha 33):
-- RUMMAGE = stand ~3s within reach of an unsearched prop, quiet, the loot
-- pops out on the ground. SMASH = the prop is a ~30 HP unit; kill it for
-- instant loot at the price of district Noise. Same seeded draw either way.
LOOT_TABLES = {
  bench    = { { ITEM_CLOTH, 30 }, { ITEM_PLANK, 25 }, { ITEM_BOTTLED_WATER, 20 }, { ITEM_RATIONS, 15 }, { "clips", 10 } },
  dumpster = { { ITEM_PIPE, 30 }, { ITEM_WIRE, 20 }, { ITEM_BOTTLE, 25 }, { ITEM_PLANK, 15 }, { ITEM_CLOTH, 10 } },
  locker   = { { ITEM_BATTERY, 25 }, { ITEM_WIRE, 20 }, { ITEM_KEROSENE, 15 }, { "clips", 25 }, { ITEM_PLANK, 5 }, { ITEM_FLARE, 10 } },
  desk     = { { ITEM_WIRE, 30 }, { ITEM_BATTERY, 20 }, { "clips", 20 }, { ITEM_BOTTLED_WATER, 15 }, { ITEM_CLOTH, 10 }, { ITEM_MOBILE_PHONE, 5 } },
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

LOOT_EXTRA_NAMES = { [ITEM_FLARE] = "Flare", [ITEM_MOBILE_PHONE] = "Mobile Phone" }

function LootNameOf(entry)
  if entry == "clips" then return "a clip pack" end
  return MATERIAL_NAMES[entry] or LOOT_EXTRA_NAMES[entry] or "something"
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

function DropLoot(kind, x, y)
  -- the seeded draw, popped onto the ground at the prop (click to take;
  -- pickup handles auto-combine and clip-pack banking)
  local loot = DrawLoot(kind)
  if loot == "clips" then
    CreateItem(ITEM_CLIP_PACK, x, y)
    return "clip pack"
  end
  CreateItem(loot, x, y)
  return string.lower(LootNameOf(loot))
end

function RummageScan()
  for _, pid in ipairs(Users) do
    local u = Survivors[pid]
    if Alive(u) and not Defected[pid] and not Aboard[pid] then
      local ux, uy = GetUnitX(u), GetUnitY(u)
      local best, bestD = nil, RUMMAGE_RANGE * RUMMAGE_RANGE + 1
      for p, rec in pairs(PropRec) do
        if not rec.searched and Alive(p) then
          local d = Dist2(GetUnitX(p), GetUnitY(p), ux, uy)
          if d < bestD then best, bestD = p, d end
        end
      end
      if best == nil then
        RummageProp[pid] = nil
      elseif RummageProp[pid] ~= best then
        RummageProp[pid] = best
        RummageTicks[pid] = 1
        Tell(pid, "|cffaaaaaaYou start going through the " .. GetUnitName(best) .. "...|r")
      else
        RummageTicks[pid] = (RummageTicks[pid] or 0) + 1
        if RummageTicks[pid] >= RUMMAGE_TIME then
          LockSeed("rummage")
          local rec = PropRec[best]
          rec.searched = true
          Searches = Searches + 1
          local got = DropLoot(rec.kind, GetUnitX(best), GetUnitY(best))
          LogRun("rummage|pid=" .. pid .. "|" .. rec.kind .. "|" .. got)
          Tell(pid, "|cff88ccffYou turn out the " .. GetUnitName(best) .. ": "
            .. got .. " -- it drops at the foot of it.|r")
          RummageProp[pid] = nil
        end
      end
    end
  end
end

-- ------------------------------------------------------- districts & noise
-- Per-district heat: loud verbs raise it, time cools it, the NEXT surge in
-- a district is sized x(1 + heat/100). Loud is fast, quiet is slow, the
-- siren is always counting.
DISTRICTS = {
  { key = "teckghee", name = "Teck Ghee", x = -800.0, y = -3200.0 },
  { key = "kebunbaru", name = "Kebun Baru", x = -4200.0, y = 800.0 },
  { key = "gardens", name = "Yio Chu Kang Gardens", x = 400.0, y = 3200.0 },
  { key = "seletar", name = "Seletar Hills", x = 3200.0, y = 3800.0 },
  { key = "chengsan", name = "Cheng San", x = 2200.0, y = -3400.0 },
  { key = "parkconnector", name = "the park connector", x = -2600.0, y = 0.0 },
}

function DistrictAt(x, y)
  local best, bestD = DISTRICTS[1], Dist2(x, y, DISTRICTS[1].x, DISTRICTS[1].y)
  for i = 2, #DISTRICTS do
    local d = Dist2(x, y, DISTRICTS[i].x, DISTRICTS[i].y)
    if d < bestD then best, bestD = DISTRICTS[i], d end
  end
  return best
end

function NoiseAdd(x, y, amt)
  local d = DistrictAt(x, y)
  local heat = (NoiseHeat[d.key] or 0) + amt
  if heat > 150 then heat = 150 end
  NoiseHeat[d.key] = heat
end

function NoiseDecay()
  for _, d in ipairs(DISTRICTS) do
    local heat = NoiseHeat[d.key] or 0
    if heat > 0 then NoiseHeat[d.key] = heat - 1 end
  end
end

function HottestDistrict()
  local best, heat = nil, 0
  for _, d in ipairs(DISTRICTS) do
    if (NoiseHeat[d.key] or 0) > heat then best, heat = d, NoiseHeat[d.key] end
  end
  return best, heat
end

-- ----------------------------------------------------------- ammo & reload
-- Dawn of the Dead's gold-as-bullets, credited: one round per shot, drawn
-- on the DAMAGING event; a dry clip zeroes the shot (a carried Parang
-- keeps you fighting at half damage). Phase 2A: Reload is ability R — 4s
-- with the GUN DOWN (outgoing shots zeroed) but the legs still work; the
-- old PauseUnit is gone (reload-while-fleeing is the genre's tension
-- moment). Every live shot is +1 district Noise.
AmmoSpent = {} -- pid -> rounds fired (observability)

function HandleDamaging()
  local src = GetEventDamageSource()
  local tgt = GetTriggerUnit()
  if src == nil or tgt == nil or src == tgt or InScriptedDamage then return end

  local tpid = SurvivorPidOf(tgt)

  -- a survivor standing a repair loses progress when bitten (persists
  -- otherwise: damage is a setback, not a reset)
  if tpid ~= nil and GetEventDamage() > 0.0 then
    for _, rec in ipairs(GenList) do
      if not rec.fixed and (rec.progress or 0) > 0
        and Dist2(GetUnitX(rec.unit), GetUnitY(rec.unit),
          GetUnitX(tgt), GetUnitY(tgt)) <= FIX_RANGE * FIX_RANGE then
        rec.progress = rec.progress - FIX_KNOCK
        if rec.progress < 0 then rec.progress = 0 end
        Tell(tpid, "|cffff8866The hit costs you " .. FIX_KNOCK
          .. "s of repair work (" .. rec.progress .. "/" .. FIX_TIME .. " held).|r")
      end
    end
  end

  -- sentry guns draw their own belt (+1 Noise per live round)
  if SentryAmmoOf[src] ~= nil then
    if SentryAmmoOf[src] > 0 then
      SentryAmmoOf[src] = SentryAmmoOf[src] - 1
      NoiseAdd(GetUnitX(src), GetUnitY(src), NOISE_SHOT)
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

  -- survivor guns: one round per shot; gun-down while reloading
  local spid = SurvivorPidOf(src)
  if spid ~= nil then
    if Reloading[spid] ~= nil and GameClock < Reloading[spid] then
      BlzSetEventDamage(0.0)
      if not ReloadTold[spid] then
        ReloadTold[spid] = true
        Tell(spid, "|cffaaaaaaGun's down mid-rack -- run, don't shoot.|r")
      end
    elseif RoundsOf(spid) > 0 then
      AddRounds(spid, -1)
      AmmoSpent[spid] = (AmmoSpent[spid] or 0) + 1
      NoiseAdd(GetUnitX(src), GetUnitY(src), NOISE_SHOT)
    elseif CountItemOfType(src, ITEM_PARANG) > 0 then
      BlzSetEventDamage(GetEventDamage() / 2.0)
    else
      BlzSetEventDamage(0.0)
      if not ClickTold[spid] then
        ClickTold[spid] = true
        Tell(spid, "|cffff8866Click. Clip's dry -- hit |cffffcc00R|r to reload (1 clip, "
          .. ReloadTimeOf(spid) .. "s), or carry a Parang to keep swinging.|r")
      end
    end
  end

  -- Riot Discipline: the APO's signature halves what gets through
  if tpid ~= nil and (RiotUntil[tpid] or 0) > GameClock then
    BlzSetEventDamage(GetEventDamage() / 2.0)
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
    Tell(pid, "|cffaaaaaaAlready racking it -- hands are shaking.|r")
    return
  end
  local clip = ClipSizeOf(pid)
  if RoundsOf(pid) >= clip then
    Tell(pid, "|cffaaaaaaClip is already full (" .. clip .. " rounds).|r")
    return
  end
  if ClipsOf(pid) < 1 then
    Tell(pid, "|cffaaaaaaNo spare clips -- rummage lockers, desks and cars, buy none: the shop sells tools, the estate sells clips.|r")
    return
  end
  AddClips(pid, -1)
  local rt = ReloadTimeOf(pid)
  Reloading[pid] = GameClock + rt
  ReloadTold[pid] = nil
  LogRun("reload|pid=" .. pid)
  Tell(pid, "|cffffff66Racking a fresh clip -- " .. rt .. " seconds with the gun down. Your legs still work.|r")
  local rpid = pid
  After(rt + 0.0, function()
    if GameOver or Defected[rpid] then return end
    SetPlayerState(Player(rpid), PLAYER_STATE_RESOURCE_GOLD, ClipSizeOf(rpid))
    ClickTold[rpid] = nil
    Reloading[rpid] = nil
    Tell(rpid, "|cff88ff88Fresh clip seated (" .. ClipSizeOf(rpid) .. " rounds).|r")
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

-- ----------------------------------------------------- signature abilities
function HandleRiotDiscipline(pid)
  if GameClock < (SigReady[pid] or 0) then return end
  SigReady[pid] = GameClock + RIOT_CD
  RiotUntil[pid] = GameClock + RIOT_TIME
  LogRun("riot|pid=" .. pid)
  Tell(pid, "|cff88ccffShield drill: " .. RIOT_TIME .. " seconds of half damage.|r")
end

function HandleFieldTriage(pid)
  if GameClock < (SigReady[pid] or 0) then return end
  local u = Survivors[pid]
  if u == nil then return end
  SigReady[pid] = GameClock + TRIAGE_CD
  local cx, cy = GetUnitX(u), GetUnitY(u)
  local cured, healed = 0, 0
  for _, other in ipairs(Users) do
    local ou = Survivors[other]
    if Alive(ou) and not Defected[other]
      and Dist2(GetUnitX(ou), GetUnitY(ou), cx, cy) <= TRIAGE_RANGE * TRIAGE_RANGE then
      SetWidgetLife(ou, math.min(GetWidgetLife(ou) + TRIAGE_HEAL,
        GetUnitState(ou, UNIT_STATE_MAX_LIFE)))
      healed = healed + 1
      if Infected[other] then
        CureSurvivor(other, "triage")
        cured = cured + 1
      end
    end
  end
  LogRun("triage|pid=" .. pid .. "|healed=" .. healed .. "|cured=" .. cured)
  Tell(pid, "|cff88ff88Field triage: " .. healed .. " patched, " .. cured .. " cured.|r")
end

function HandleOverclock(pid)
  if GameClock < (SigReady[pid] or 0) then return end
  SigReady[pid] = GameClock + OVERCLOCK_CD
  OverclockArmed[pid] = true
  LogRun("overclock|pid=" .. pid)
  Tell(pid, "|cff88ccffOverclocked: the next substation you stand at completes INSTANTLY.|r")
end

-- ------------------------------------------------------------ the defector
-- Canon I6: the map's crown mechanic. The Revenant is a CONDUCTOR: Feast
-- claims un-burnt corpses into the pack (Molotov burning becomes direct
-- PvP denial); Shriek converges the horde's next surge on a point.
function HandleFeast(pid, tx, ty)
  if not Defected[pid] then return end
  if GameClock < (FeastReady[pid] or 0) then return end
  local best, bestD = nil, FEAST_RANGE * FEAST_RANGE + 1
  for _, rec in ipairs(CorpseList) do
    if not rec.risen and not rec.burned then
      local d = Dist2(rec.x, rec.y, tx, ty)
      if d < bestD then best, bestD = rec, d end
    end
  end
  if best == nil then
    Tell(pid, "|cffaaaaaaNo whole corpse there -- the living burn what they cannot carry.|r")
    return
  end
  FeastReady[pid] = GameClock + FEAST_CD
  best.risen = true
  SpawnZombie("shambler", best.x, best.y, pid)
  LogRun("feast|pid=" .. pid)
  Tell(pid, "|cffcc66ffIt rises for YOU.|r")
  AnnounceAll("|cffff8866A corpse is claimed before it cools. The dead have a shepherd now.|r")
end

function HandleShriek(pid, tx, ty)
  if not Defected[pid] then return end
  if GameClock < (ShriekReady[pid] or 0) then return end
  ShriekReady[pid] = GameClock + SHRIEK_CD
  ShriekPoint = { x = tx, y = ty, till = GameClock + SHRIEK_HOLD }
  LogRun("shriek|pid=" .. pid)
  Tell(pid, "|cffcc66ffYou shriek. The horde turns its head.|r")
  AnnounceAll("|cffff8866A shriek rolls across the blocks -- something is CALLING them.|r")
end

-- -------------------------------------------------------------- generators
-- SWAT-style anti-camping objective, credited. Phase 2A: repair is
-- PRESENCE — progress accrues every second you stand in the yard, PERSISTS
-- per substation, and a hit knocks FIX_KNOCK seconds off (see
-- HandleDamaging). Technician accrues 2x; Overclock completes instantly.
LAMP_RELIGHT = {
  { x = -4400.0, y = 2500.0, lamps = { { -4400.0, 1800.0 }, { -4150.0, 1200.0 }, { -3900.0, 700.0 }, { -4300.0, 300.0 } } },
  { x = 3400.0, y = 2500.0, lamps = { { 3400.0, 1900.0 }, { 3200.0, 1300.0 }, { 3000.0, 800.0 }, { 3300.0, 300.0 } } },
  { x = 2400.0, y = -4500.0, lamps = { { 2350.0, -3900.0 }, { 2250.0, -3300.0 }, { 2150.0, -2700.0 }, { 2050.0, -2100.0 } } },
}

function RelightDistrict(rec)
  -- the estate relights: the map is the progress bar (canon I2)
  for _, entry in ipairs(LAMP_RELIGHT) do
    if Dist2(entry.x, entry.y, GetUnitX(rec.unit), GetUnitY(rec.unit)) < 1.0 then
      for _, l in ipairs(entry.lamps) do
        CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE_ID), UNIT_STREET_LAMP, l[1], l[2], 270.0)
        LampsLit = LampsLit + 1
      end
      LogRun("relight|lamps=" .. #entry.lamps)
      AnnounceAll("|cffffff66Down the road from the substation, the street lamps flicker on one by one. The estate takes a block back.|r")
      return
    end
  end
end

function FixGenerator(pid, rec)
  rec.fixed = true
  GensFixed = GensFixed + 1
  LogRun("gen|fixed=" .. GensFixed .. "/3|pid=" .. pid)
  AnnounceAll("|cff88ff88A substation hums back to life (" .. GensFixed
    .. "/3). Somewhere, a lift lobby light flickers on.|r")
  GrantSurvXP(pid, 40, "gen")
  RelightDistrict(rec)
  BoardDirty = true
  if GensFixed >= 3 then
    StationPowered = true
    LogRun("power|on")
    AnnounceAll("|cffffff66STATION POWER RESTORED. Yio Chu Kang's platform lights burn through the rain. The doors will open.|r")
  end
end

function RepairScan()
  for _, pid in ipairs(Users) do
    local u = Survivors[pid]
    if Alive(u) and not Defected[pid] and not Aboard[pid] then
      for _, rec in ipairs(GenList) do
        if not rec.fixed and Dist2(GetUnitX(rec.unit), GetUnitY(rec.unit),
          GetUnitX(u), GetUnitY(u)) <= FIX_RANGE * FIX_RANGE then
          if OverclockArmed[pid] then
            OverclockArmed[pid] = nil
            rec.progress = FIX_TIME
            Tell(pid, "|cff88ccffThe overclocked rig slams the breakers home.|r")
          else
            local was = rec.progress or 0
            rec.progress = was + (ClassDefOf(pid).fastFix and 2 or 1)
            if was == 0 then
              Tell(pid, "|cffffff66You crack the cabinet -- stay in the yard and the work adds up. A hit costs "
                .. FIX_KNOCK .. "s; the progress KEEPS.|r")
            end
          end
          local d = DistrictAt(GetUnitX(rec.unit), GetUnitY(rec.unit))
          LastRepairKey = d.key
          LastRepairAt = GameClock
          FloatText(GetUnitX(rec.unit), GetUnitY(rec.unit),
            "|cffffff66" .. math.min(rec.progress, FIX_TIME) .. "/" .. FIX_TIME .. "|r")
          if rec.progress >= FIX_TIME then
            FixGenerator(pid, rec)
          end
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
  elseif t == ITEM_RATIONS then
    SetWidgetLife(u, math.min(GetWidgetLife(u) + RATIONS_HEAL, GetUnitState(u, UNIT_STATE_MAX_LIFE)))
    Tell(pid, "|cff88ff88Biscuits and kaya in the rain. It helps more than it should.|r")
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
    for n, _ in pairs(NestRec) do
      if Alive(n) and Dist2(GetUnitX(n), GetUnitY(n), x, y) <= MOLOTOV_RADIUS * MOLOTOV_RADIUS then
        UnitDamageTarget(u, n, MOLOTOV_NEST_DMG, true, false,
          ATTACK_TYPE_NORMAL, DAMAGE_TYPE_FIRE, WEAPON_TYPE_WHOKNOWS)
      end
    end
    InScriptedDamage = false
    NoiseAdd(x, y, NOISE_MOLOTOV)
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
  end
end

-- pickup: clip packs bank a clip; everything else may auto-combine
function HandlePickup()
  local u = GetTriggerUnit()
  local it = GetManipulatedItem()
  if u == nil or it == nil or GameOver then return end
  local pid = SurvivorPidOf(u)
  if pid == nil then return end
  if GetItemTypeId(it) == ITEM_CLIP_PACK then
    RemoveItem(it)
    AddClips(pid, 1)
    LogRun("clip|pid=" .. pid)
    Tell(pid, "|cff88ccffA clip pack -- banked (+1 clip).|r")
    return
  end
  AutoCombine(pid)
end

-- the Provision Shop: the engine charges the CLIPS price (item lumber
-- cost); the script logs the trade for the run record
SHOP_TOKENS = {}

function HandleSell()
  local buyer = GetBuyingUnit()
  local it = GetSoldItem()
  if buyer == nil or it == nil then return end
  local pid = SurvivorPidOf(buyer)
  if pid == nil then return end
  local token = SHOP_TOKENS[GetItemTypeId(it)] or "ware"
  LogRun("buy|pid=" .. pid .. "|" .. token)
  Tell(pid, "|cff88ccffThe towkay nods. (" .. token .. " -- paid in clips.)|r")
end

-- --------------------------------------------------------------- defection
-- Zombie-Simulator's death = defection, credited: no elimination, no
-- spectating — the dead rise as a player-controlled pack and the alliance
-- flips BOTH directions (gotcha 24). Phase 2A: the Revenant carries Feast
-- + Shriek and its claws ride the escalation level.
function DefectPlayer(pid, x, y)
  if Defected[pid] then return end
  Defected[pid] = true
  Infected[pid] = nil
  Survivors[pid] = nil
  RummageProp[pid] = nil
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
  BlzSetUnitBaseDamage(r, 30 + 4 * (EscLevel - 1), 0)
  SpawnZombie("shambler", x + 96.0, y, pid)
  SpawnZombie("shambler", x - 96.0, y, pid)
  SpawnZombie("shambler", x, y + 96.0, pid)
  SelectUnitForPlayerSingle(r, Player(pid))
  Tell(pid, "|cffcc66ffYou rise. Your Revenant answers to you -- |cffffcc00F|r FEASTS a corpse into your pack, |cffffcc00C|r SHRIEKS the next surge onto a point. The living were never your friends. Hunt.|r")
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

function DefensesStanding()
  local n = 0
  for b, _ in pairs(BarricadeRec) do
    if Alive(b) then n = n + 1 end
  end
  return n
end

-- score = OUTCOMES only (the cut list): souls aboard, the Broodmother,
-- power restored, defenses still standing when the verdict lands.
function ComputeScore()
  local defenses = DefensesStanding()
  local total = AboardCount() * 400 + (BroodDead and 800 or 0)
    + GensFixed * 100 + defenses * 25
  return total, defenses
end

function ScoreLine(verdict)
  local total, defenses = ComputeScore()
  ScoreFinal = total
  return "LAST TRAIN -- " .. verdict .. ". Score " .. total
    .. " (aboard " .. AboardCount() .. " x400"
    .. (BroodDead and " + broodmother 800" or "")
    .. " + power " .. GensFixed .. "x100 + defenses standing " .. defenses
    .. "x25). Horde level " .. EscLevel .. ". Seed " .. RunSeed .. "."
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
  if TrainDialog ~= nil then
    TimerDialogDisplay(TrainDialog, false)
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
    Tell(pid, "|cffff8866The doors stay sealed -- the station is DARK. All three substations must be live.|r")
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

FORECOURT = { x = 4050.0, y = 0.0 }

function PlatformSiege()
  -- the whole wild horde converges on the fare-gate forecourt: the night's
  -- banked barricades and sentries ARE the chokepoint now
  if SiegeCalled then return end
  SiegeCalled = true
  local horde = Player(PLAYER_NEUTRAL_AGGRESSIVE_ID)
  for u, _ in pairs(ZombieRec) do
    if Alive(u) and GetOwningPlayer(u) == horde then
      IssuePointOrder(u, "attack", FORECOURT.x, FORECOURT.y)
    end
  end
  LogRun("siege")
  AnnounceAll("|cffff4444Every walking thing in the estate turns toward the station at once. HOLD THE FORECOURT.|r")
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
  -- the countdown window flips to the boarding clock
  if TrainTimer ~= nil then
    TimerStart(TrainTimer, (TRAIN_DEPART - TRAIN_ARRIVE) + 0.0, false, nil)
    TimerDialogSetTitle(TrainDialog, "Doors close")
  end
  PlatformSiege()
  -- anyone already waiting on the platform steps aboard
  for _, pid in ipairs(Users) do TryBoard(pid) end
end

-- -------------------------------------------------------- surges & horde AI
-- The surge heartbeat (ZCD's wave clock, adapted): telegraphed by a siren
-- SURGE_WARN seconds ahead, every ~120s at T+120..600, then the Last Mile
-- (trickle + one final oversized surge) and the platform siege. Size
-- scales with escalation, LIVING players, and district Noise; each nest
-- down trims it one step. Targets: the Shriek point, an active repair
-- yard, or the district where the survivors are.
SURGE_SCHED = {
  { warn = 100, at = 120 },
  { warn = 220, at = 240 },
  { warn = 340, at = 360 },
  { warn = 460, at = 480 },
  { warn = 580, at = 600 },
  { warn = 680, at = 700, final = true },
}
-- integer ring offsets (no trig: cross-width float determinism, gotcha 29)
SURGE_OFFSETS = {
  { 0, 900 }, { 636, 636 }, { 900, 0 }, { 636, -636 },
  { 0, -900 }, { -636, -636 }, { -900, 0 }, { -636, 636 },
}
EDGE_POINTS = {
  { -5800.0, 0.0 }, { -5800.0, 3600.0 }, { -5800.0, -3600.0 },
  { 0.0, 4800.0 }, { -3000.0, 4800.0 }, { 3000.0, 4800.0 },
  { 0.0, -5300.0 }, { -3000.0, -5300.0 },
}

function SurgeTargetPick()
  -- the Shriek trumps everything (the traitor conducts)
  if ShriekPoint ~= nil and GameClock <= ShriekPoint.till then
    local d = DistrictAt(ShriekPoint.x, ShriekPoint.y)
    return { x = ShriekPoint.x, y = ShriekPoint.y, key = d.key, name = "the shriek" }
  end
  -- an active repair channel pulls the horde (last 15s)
  if LastRepairKey ~= nil and GameClock - LastRepairAt <= 15 then
    for _, rec in ipairs(GenList) do
      if not rec.fixed and (rec.progress or 0) > 0 then
        local d = DistrictAt(GetUnitX(rec.unit), GetUnitY(rec.unit))
        if d.key == LastRepairKey then
          return { x = GetUnitX(rec.unit), y = GetUnitY(rec.unit), key = d.key, name = d.name }
        end
      end
    end
  end
  -- else: the district with the most living survivors (ties: table order);
  -- the surge converges on a SURVIVOR standing there, not the district's
  -- geometric center — the siren means YOU
  local counts, anchor = {}, {}
  for _, pid in ipairs(Users) do
    local u = Survivors[pid]
    if Alive(u) and not Defected[pid] then
      local d = DistrictAt(GetUnitX(u), GetUnitY(u))
      counts[d.key] = (counts[d.key] or 0) + 1
      if anchor[d.key] == nil then anchor[d.key] = u end
    end
  end
  local best, bestN = nil, 0
  for _, d in ipairs(DISTRICTS) do
    if (counts[d.key] or 0) > bestN then best, bestN = d, counts[d.key] end
  end
  if best == nil then
    local d = DISTRICTS[1]
    return { x = d.x, y = d.y, key = d.key, name = d.name }
  end
  local au = anchor[best.key]
  return { x = GetUnitX(au), y = GetUnitY(au), key = best.key, name = best.name }
end

function SurgeSizeAt(key, final)
  local living = LivingSurvivors()
  local n = 3 + EscLevel + 2 * math.max(0, living - 1)
  local heat = NoiseHeat[key] or 0
  n = (n * (100 + heat)) // 100
  n = n - NestsDown
  if final then n = n * 2 end
  if n < 2 then n = 2 end
  if n > 30 then n = 30 end
  return n, heat
end

function SurgeWarnNow(sched)
  SurgeIdx = SurgeIdx + 1
  PendingSurge = SurgeTargetPick()
  PendingSurge.idx = SurgeIdx
  PendingSurge.final = sched.final
  StartSound(SndSiren)
  PingMinimap(PendingSurge.x, PendingSurge.y, 4.0)
  LockSeed("siren")
  local line = DREAD_LINES[RandInt(1, #DREAD_LINES)]
  LogRun("siren|k=" .. SurgeIdx .. "|" .. PendingSurge.key)
  AnnounceAll("|cffff4444THE SIREN.|r |cffff8866Something is massing toward "
    .. PendingSurge.name .. " -- " .. SURGE_WARN .. " seconds.|r")
  AnnounceAll("|cff8888aa" .. line .. "|r")
end

function FireSurge(target, final)
  LockSeed("surge")
  -- a live Shriek redirects even a warned surge (the traitor plays the
  -- vulnerability window), consumed on use
  if ShriekPoint ~= nil and GameClock <= ShriekPoint.till then
    local d = DistrictAt(ShriekPoint.x, ShriekPoint.y)
    target = { x = ShriekPoint.x, y = ShriekPoint.y, key = d.key, name = "the shriek" }
    ShriekPoint = nil
  end
  local n, heat = SurgeSizeAt(target.key, final)
  local o = SURGE_OFFSETS[RandInt(1, #SURGE_OFFSETS)]
  for i = 1, n do
    local kind = (i % 2 == 0) and "withered" or "shambler"
    if EscLevel >= 3 and i == n then kind = "sprinter" end
    if EscLevel >= 5 and i == n - 1 then kind = "riot" end
    local ox = (i % 2 == 0) and o[1] or -o[1]
    local oy = (i % 2 == 0) and o[2] or -o[2]
    local u = SpawnZombie(kind, target.x + ox + (i - 1) * 24.0, target.y + oy)
    IssuePointOrder(u, "attack", target.x, target.y)
  end
  LogRun("surge|k=" .. (target.idx or SurgeIdx) .. "|" .. target.key
    .. "|n=" .. n .. "|heat=" .. heat)
  AnnounceAll("|cffff4444THE SURGE BREAKS|r|cffff8866 over " .. target.name
    .. " -- " .. n .. " of them" .. (final and ", and this is the LAST MILE" or "") .. ".|r")
  PendingSurge = nil
end

function TrickleTick()
  -- the Last Mile: a steady seeded drip walking station-ward (or to the
  -- Shriek), so the run's back half never goes quiet
  local n = RandInt(1, 2)
  local e = EDGE_POINTS[RandInt(1, #EDGE_POINTS)]
  local tx, ty = FORECOURT.x, FORECOURT.y
  if ShriekPoint ~= nil and GameClock <= ShriekPoint.till then
    tx, ty = ShriekPoint.x, ShriekPoint.y
  end
  for i = 1, n do
    local kind = (RandInt(1, 3) == 1) and "withered" or "shambler"
    local u = SpawnZombie(kind, e[1] + (i - 1) * 64.0, e[2])
    IssuePointOrder(u, "attack", tx, ty)
  end
  LogRun("trickle|n=" .. n)
end

function SpawnWanderer()
  -- ambient texture between surges: 1-2 zombies drifting district to
  -- district (kept from phase 1's patrols, demoted from primary pressure)
  LockSeed("wander")
  local fromI = RandInt(1, #DISTRICTS)
  local toI = RandInt(1, #DISTRICTS - 1)
  if toI >= fromI then toI = toI + 1 end
  local from, to = DISTRICTS[fromI], DISTRICTS[toI]
  local n = RandInt(1, 2)
  for i = 1, n do
    local kind = (RandInt(1, 3) == 1) and "withered" or "shambler"
    local u = SpawnZombie(kind, from.x + (i - 1) * 72.0, from.y)
    IssuePointOrder(u, "attack", to.x, to.y)
  end
  LogRun("wander|" .. from.key .. ">" .. to.key .. "|n=" .. n)
end

-- ------------------------------------------------------------------- nests
-- ZCD's radiation fragments, adapted: seeded rat-king nests across the
-- districts; each one down trims the escalation drip AND the surge size
-- one step, and pays XP. Spawned once, at the seed-lock commitment point,
-- so '-seed N' before commitment re-deals them.
function SpawnNests()
  if NestsSeeded then return end
  NestsSeeded = true
  local count = 8 + RandInt(0, 4)
  for _ = 1, count do
    local d = DISTRICTS[RandInt(1, #DISTRICTS)]
    local x = d.x + RandInt(-600, 600)
    local y = d.y + RandInt(-600, 600)
    local u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE_ID), UNIT_KAMPONG_NEST,
      x + 0.0, y + 0.0, 270.0)
    NestRec[u] = true
  end
  LogRun("nests|n=" .. count)
  AnnounceAll("|cffff8866Rat-king nests glisten in the void decks and drains -- "
    .. count .. " of them, breeding. Burn them and the horde grows SLOWER.|r")
end

-- ------------------------------------------------------------ ground spills
-- Surge kills seed occasional visible drops (through the ONE stream):
-- roaming and fighting both pay (ZCD's bundle economy, adapted).
SPILL_MATERIALS = {
  ITEM_PLANK, ITEM_PIPE, ITEM_CLOTH, ITEM_WIRE,
  ITEM_BOTTLE, ITEM_KEROSENE, ITEM_BATTERY, ITEM_BOTTLED_WATER,
}

function MaybeSpill(x, y)
  LockSeed("spill")
  if RandInt(1, 100) > SPILL_PCT then return end
  if RandInt(1, 2) == 1 then
    CreateItem(ITEM_CLIP_PACK, x, y)
    LogRun("spill|clip")
  else
    local it = SPILL_MATERIALS[RandInt(1, #SPILL_MATERIALS)]
    CreateItem(it, x, y)
    LogRun("spill|" .. string.lower(MATERIAL_NAMES[it]))
  end
end

-- --------------------------------------------------------------- ambience
-- NotD-style dread lines, seeded — phase 2A fires them ONLY pre-surge
-- (SurgeWarnNow) and at scripted timeline beats; the 35s metronome is cut.
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

-- ---------------------------------------------------------- the multiboard
-- One shared board (no GetLocalPlayer, desync-safe — the coinstead rule):
-- Train / Power / Surge / Noise, then one row per seated player
-- (class · level · rounds · clips · state). The residents row is cut.
function SetBoardCell(r, col, txt, w)
  local mi = MultiboardGetItem(Board, r, col)
  MultiboardSetItemStyle(mi, true, false)
  MultiboardSetItemWidth(mi, w)
  MultiboardSetItemValue(mi, txt)
  MultiboardReleaseItem(mi)
end

function PlayerStatus(pid)
  if Aboard[pid] then return "ABOARD" end
  if Defected[pid] then return "HUNT: no one boards" end
  if not Alive(Survivors[pid]) then return "DOWN" end
  if Infected[pid] then return "INFECTED" end
  return "alive"
end

function FmtMMSS(s)
  if s < 0 then s = 0 end
  local m = s // 60
  local r = s % 60
  return m .. ":" .. (r < 10 and "0" or "") .. r
end

function NextSurgeIn()
  for _, s in ipairs(SURGE_SCHED) do
    if GameClock < s.at then return s.at - GameClock end
  end
  return nil
end

function UpdateBoard()
  if Board == nil then return end
  BoardDirty = false
  local trainTxt
  if TrainGone then trainTxt = "gone"
  elseif TrainAtStation then trainTxt = "DOORS " .. FmtMMSS(TRAIN_DEPART - GameClock)
  else trainTxt = "T-" .. FmtMMSS(TRAIN_ARRIVE - GameClock) end
  local surgeTxt
  local nxt = NextSurgeIn()
  if nxt ~= nil then surgeTxt = "in " .. FmtMMSS(nxt) .. " (lv " .. EscLevel .. ")"
  elseif LastMile then surgeTxt = "LAST MILE (lv " .. EscLevel .. ")"
  else surgeTxt = "-- (lv " .. EscLevel .. ")" end
  local noiseTxt
  local hd, heat = HottestDistrict()
  if hd == nil or heat < 20 then noiseTxt = "estate quiet"
  elseif heat < 60 then noiseTxt = hd.name .. " uneasy (" .. heat .. ")"
  else noiseTxt = hd.name .. " ROUSED (" .. heat .. ")" end
  SetBoardCell(0, 0, "Last train", 0.07)
  SetBoardCell(0, 1, trainTxt, 0.09)
  SetBoardCell(1, 0, "Power", 0.07)
  SetBoardCell(1, 1, GensFixed .. "/3" .. (StationPowered and " LIVE" or ""), 0.09)
  SetBoardCell(2, 0, "Surge", 0.07)
  SetBoardCell(2, 1, surgeTxt, 0.09)
  SetBoardCell(3, 0, "Noise", 0.07)
  SetBoardCell(3, 1, noiseTxt, 0.09)
  for i, pid in ipairs(Users) do
    SetBoardCell(3 + i, 0, GetPlayerName(Player(pid)), 0.07)
    local rowTxt
    if Defected[pid] then
      rowTxt = "Revenant -- " .. PlayerStatus(pid)
    else
      rowTxt = ClassDefOf(pid).name .. " L" .. (SurvLevel[pid] or 1)
        .. " -- " .. RoundsOf(pid) .. "rd " .. ClipsOf(pid) .. "cl -- "
        .. PlayerStatus(pid)
    end
    SetBoardCell(3 + i, 1, rowTxt, 0.13)
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
        GrantSurvXP(kpid, ZOMBIE_KINDS[zrec.kind].xp, "kill")
        MaybeSpill(GetUnitX(u), GetUnitY(u))
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

  -- a rat-king nest burns: the horde grows slower, the burner grows
  if NestRec[u] ~= nil then
    NestRec[u] = nil
    NestsDown = NestsDown + 1
    LogRun("nest|down|" .. NestsDown)
    AnnounceAll("|cff88ff88A rat-king nest collapses into the mud (" .. NestsDown
      .. " down). The horde will grow slower for it.|r")
    if killer ~= nil then
      GrantSurvXP(SurvivorPidOf(killer), 30, "nest")
    end
    return
  end

  -- a prop smashed open: instant loot, and the district HEARS it
  local prec = PropRec[u]
  if prec ~= nil then
    PropRec[u] = nil
    NoiseAdd(GetUnitX(u), GetUnitY(u), NOISE_SMASH)
    if not prec.searched then
      LockSeed("smash")
      Searches = Searches + 1
      local got = DropLoot(prec.kind, GetUnitX(u), GetUnitY(u))
      LogRun("smash|" .. prec.kind .. "|" .. got)
      local kpid = killer ~= nil and SurvivorPidOf(killer) or nil
      if kpid ~= nil then
        Tell(kpid, "|cff88ccffThe " .. prec.kind .. " bursts open: " .. got
          .. ". Every district ear turned your way (+noise).|r")
      end
    end
    return
  end
end

-- -------------------------------------------------------------------- clock
function ClockTick()
  if GameOver then return end
  for _ = 1, ClockScale do
    GameClock = GameClock + 1
    InfectionTick()
    RummageScan()
    RepairScan()

    -- noise cools
    NoiseClock = NoiseClock + 1
    if NoiseClock >= NOISE_DECAY_T then
      NoiseClock = 0
      NoiseDecay()
    end

    -- the class-circle window closes, silently (the policing is cut)
    if PickOpen and GameClock >= PICK_WINDOW then
      PickOpen = false
      LogRun("pick|closed")
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

    -- escalation drip (state-keyed)
    EscClock = EscClock + 1
    if EscClock >= ESC_TICK then
      EscClock = 0
      EscDrip()
    end

    -- ambient wanderers (texture, and the t=90 seed-lock point)
    if GameClock >= WANDER_FROM then
      WanderClock = WanderClock + 1
      if GameClock == WANDER_FROM or WanderClock >= WANDER_PERIOD then
        WanderClock = 0
        SpawnWanderer()
      end
    end

    -- the surge heartbeat
    for _, s in ipairs(SURGE_SCHED) do
      if GameClock == s.warn then
        SurgeWarnNow(s)
      elseif GameClock == s.at then
        FireSurge(PendingSurge or SurgeTargetPick(), s.final)
      end
    end

    -- the Last Mile: trickle + station drift
    if not LastMile and GameClock >= SURGE_LAST then
      LastMile = true
      LogRun("lastmile")
      AnnounceAll("|cffff8866The estate empties toward the tracks. From here the horde only walks ONE way: yours.|r")
    end
    if LastMile and not TrainGone then
      TrickleClock = TrickleClock + 1
      if TrickleClock >= TRICKLE_PERIOD then
        TrickleClock = 0
        TrickleTick()
      end
    end

    -- the train timeline (scripted beats; the T+45 tone-setter is a FIXED
    -- line — no draw, so '-seed' stays open until the first commitment)
    if GameClock == 45 then
      AnnounceAll("|cff8888aa" .. DREAD_LINES[3] .. "|r")
    elseif GameClock == 300 then
      AnnounceAll("|cff8888aaThe station PA, far off: \"...the last train has departed Tampines...\"|r")
    elseif GameClock == TRAIN_ARRIVE - 180 then
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
    .. TRAIN_ARRIVE .. "s (walk onto the platform; it waits " .. (TRAIN_DEPART - TRAIN_ARRIVE)
    .. "s and needs 3/3 substations), or kill the Broodmother in the kampong. Death = you join the horde (F feasts corpses, C shrieks the surge).")
  Tell(pid, "|cffaaddffThe verbs are your MOUSE and hotkeys:|r walk onto a class circle (first "
    .. PICK_WINDOW .. "s); stand ~3s by furniture to RUMMAGE it quietly, or SMASH it open for instant loot and +Noise; loot auto-combines ('-recipes'); |cffffcc00R|r reloads (1 clip, gun down "
    .. RELOAD_TIME .. "s, legs work); |cffffcc00E|r sprints; STAND in a substation yard to repair it (progress keeps; hits cost 3s).")
  Tell(pid, "|cffaaddffThe SIREN|r warns " .. SURGE_WARN .. "s before every surge; surges grow with the horde level, your headcount and district NOISE. Burn rat-king nests to slow it all down. From T+600 the horde walks station-ward. Survivor levels pay stats and a level-"
    .. SIG_LEVEL .. " signature ability.")
  Tell(pid, "|cffaaddffBullets are GOLD, clips are LUMBER:|r every shot costs 1 round and makes 1 noise. The Provision Shop at the void deck sells tools FOR clips. Infection: cure with a Wet Bandage above "
    .. CURE_HP_PCT .. "% (Paramedic: any) or " .. CLINIC_CURE_T .. "s in the polyclinic. Corpses rise in " .. RISE_DELAY .. "s -- burn them.")
  Tell(pid, "|cffaaddffChat is reference only:|r -help -status -recipes -credits -seed N (until the night commits) -test (debug).")
  Tell(pid, "|cff888888A map by Serendipity. Design adapted with credit from Zombie Defense Custom (Lions_Blood), Zombination v11 (Trinin), Zombie-Simulator 7 (SpirulinaN), Dawn of the Dead (PreViO), NotD: Special Ops, SWAT: Aftermath. '-credits' for the full roll incl. every community model author. Mechanics only; nothing copied.|r")
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
  local nxt = NextSurgeIn()
  Tell(pid, "|cffaaddffPower:|r " .. GensFixed .. "/3 substations"
    .. (StationPowered and " -- STATION LIVE" or "") .. ". |cffaaddffHorde:|r level "
    .. EscLevel .. ", " .. HordeCount .. " walking, "
    .. (nxt ~= nil and ("surge in " .. nxt .. "s") or (LastMile and "the LAST MILE" or "no surge scheduled"))
    .. ". |cffaaddffNests:|r " .. NestsDown .. " down.")
  Tell(pid, "|cffaaddffYou:|r " .. PlayerStatus(pid) .. ", level " .. (SurvLevel[pid] or 1)
    .. ", " .. RoundsOf(pid) .. " rounds, " .. ClipsOf(pid) .. " clips"
    .. (Infected[pid] and " -- |cffcc66ffINFECTED|r" or "") .. ".")
end

function ShowCreditsCmd(pid)
  Tell(pid, "|cffffcc00Last Train from Yio Chu Kang -- a map by Serendipity.|r")
  Tell(pid, "|cffaaddffCommunity models (Hive Workshop, per-author credit):|r HerrDave -- T-Virus Zombies, Police Officer, Urban Prop Pack; Ilya Alaric (after Ujimasa Hojo's Villager) -- Citizen Pack; bakr -- Assorted City Buildings; Wayshan/purparisien -- Modern Cars Pack.")
  Tell(pid, "|cffaaddffCommissioned ambience models:|r Sol (GPT 5.6 Codex fleet) -- the two 2026-08-07 batches: HDB point tower, hawker centre, MRT platform canopies, bus stop shelters, street lamps, the monsoon drain, overhead bridges, kopitiam seating; round 2: the Broodmother, the kampong lair set (flesh pods, bone mounds, house shells), fare gates, platform screen doors, void-deck pillars, mailbox walls, bike racks, taxis, food carts.")
  Tell(pid, "|cffaaddffDesign inspirations (mechanics only, nothing copied):|r Zombie Defense Custom (Lions_Blood) -- the surge/countdown heartbeat, ground-drop economy, spendable downtime, the fort as a team artifact; Zombination v11 (Trinin) -- evacuation window, curable infection, corpse-rise, XP falloff + drip, scavenging; Zombie-Simulator 7 (SpirulinaN) -- death = defection, state-keyed escalation; Dawn of the Dead (PreViO) -- gold-as-bullets; NotD: Special Ops -- dread-beat ambience; SWAT: Aftermath -- power objectives.")
  Tell(pid, "|cff888888Everything else (train, platform, viaduct, HDB blocks, the CBD skyline, MRT entrance and signs, laundry racks, linkways, substations, icons, terrain) is generated by this map's committed asset scripts. Built headlessly with wc3-map-toolkit.|r")
end

function HandleClassPick(pid, key)
  if GameOver or not PickOpen then return end
  if Defected[pid] or Aboard[pid] then return end
  if ClassOf[pid] == key and ClassPicked[pid] then return end
  local def = CLASSES[key]
  if def == nil then return end
  local old = Survivors[pid]
  if old == nil then return end
  local x, y, face = GetUnitX(old), GetUnitY(old), GetUnitFacing(old)
  RemoveUnit(old)
  ClassOf[pid] = key
  ClassPicked[pid] = true
  local u = CreateUnit(Player(pid), def.unit, x, y, face)
  Survivors[pid] = u
  SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, def.clip)
  SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_LUMBER, def.clips)
  for _, it in ipairs(def.items) do GiveItem(pid, it) end
  ApplyLevelStats(pid)
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
    Tell(pid, "|cffaaaaaaThe night is already committed -- -seed works only before the first loot draw, siren or wanderer.|r")
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
  local extras = {
    barricade = ITEM_BARRICADE_KIT, flare = ITEM_FLARE,
    phone = ITEM_MOBILE_PHONE, clippack = ITEM_CLIP_PACK,
  }
  if extras[token] ~= nil then
    GiveItem(pid, extras[token])
    Tell(pid, "|cffff88ff" .. token .. " conjured.|r")
    return
  end
  for it, nm in pairs(MATERIAL_NAMES) do
    if string.lower(nm) == token or string.lower(string.gsub(nm, " ", "")) == token then
      GiveItem(pid, it)
      Tell(pid, "|cffff88ff" .. nm .. " conjured.|r")
      return
    end
  end
  Tell(pid, "|cffaaaaaa-give wants a recipe key, barricade/flare/phone/clippack, or a material name.|r")
end

function HandleChat(pid, msgRaw)
  local msg = string.lower(msgRaw)
  msg = string.match(msg, "^%s*(.-)%s*$")
  if string.sub(msg, 1, 1) ~= "-" then return end

  if msg == "-help" then ShowHelp(pid) return end
  if msg == "-status" then ShowStatus(pid) return end
  if msg == "-recipes" then ShowRecipes(pid) return end
  if msg == "-credits" then ShowCreditsCmd(pid) return end

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
        .. " enabled -test debug mode.|r Commands: -gold N, -clips N, -give <r>, -zspawn <kind> [n], -esc N, -clock N, -power, -infectme, -clearhorde, -ff, -runlog, -surge, -xp N, -noise N")
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
  local xpArg = string.match(msg, "^%-xp%s+(%d+)$")
  local noiseArg = string.match(msg, "^%-noise%s+(%d+)$")
  local known = goldArg ~= nil or clipsArg ~= nil or giveArg ~= nil
    or zKind ~= nil or escArg ~= nil or clockArg ~= nil
    or xpArg ~= nil or noiseArg ~= nil
    or msg == "-power" or msg == "-infectme" or msg == "-clearhorde"
    or msg == "-ff" or msg == "-runlog" or msg == "-surge"
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
  elseif xpArg ~= nil then
    local amt = ParseNumArg(xpArg) or 0
    GrantSurvXP(pid, amt, "debug")
    Tell(pid, "|cffff88ff+" .. amt .. " survivor XP (level " .. (SurvLevel[pid] or 1) .. ").|r")
  elseif noiseArg ~= nil then
    local u = Survivors[pid]
    if u ~= nil then
      local d = DistrictAt(GetUnitX(u), GetUnitY(u))
      NoiseHeat[d.key] = math.min(ParseNumArg(noiseArg) or 0, 150)
      Tell(pid, "|cffff88ff" .. d.name .. " noise set to " .. NoiseHeat[d.key] .. ".|r")
    end
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
  elseif msg == "-surge" then
    FireSurge(SurgeTargetPick(), false)
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

-- --------------------------------------------------------- spell dispatch
function HandleSpellEffect()
  local u = GetTriggerUnit()
  if u == nil or GameOver then return end
  local aid = GetSpellAbilityId()
  local pid = SurvivorPidOf(u)
  if pid ~= nil then
    if aid == ABIL_RELOAD then HandleReload(pid)
    elseif aid == ABIL_SPRINT then HandleSprint(pid)
    elseif aid == ABIL_RIOT_DISCIPLINE then HandleRiotDiscipline(pid)
    elseif aid == ABIL_FIELD_TRIAGE then HandleFieldTriage(pid)
    elseif aid == ABIL_OVERCLOCK then HandleOverclock(pid)
    end
    return
  end
  -- the Revenant's kit
  local opid = GetPlayerId(GetOwningPlayer(u))
  if Defected[opid] then
    if aid == ABIL_FEAST then
      HandleFeast(opid, GetSpellTargetX(), GetSpellTargetY())
    elseif aid == ABIL_SHRIEK then
      HandleShriek(opid, GetSpellTargetX(), GetSpellTargetY())
    end
  end
end

CIRCLE_KEYS = { "heartlander", "police", "paramedic", "tech" }

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

  local pickup = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(pickup, EVENT_PLAYER_UNIT_PICKUP_ITEM)
  TriggerAddAction(pickup, HandlePickup)

  local sell = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(sell, EVENT_PLAYER_UNIT_SELL_ITEM)
  TriggerAddAction(sell, HandleSell)

  local spell = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(spell, EVENT_PLAYER_UNIT_SPELL_EFFECT)
  TriggerAddAction(spell, HandleSpellEffect)

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

  -- the four class circles: walk a survivor in, walk a class out
  local circleRects = {
    REGION_PICK_HEARTLANDER, REGION_PICK_POLICE,
    REGION_PICK_PARAMEDIC, REGION_PICK_TECH,
  }
  for i, rc in ipairs(circleRects) do
    local trig = CreateTrigger()
    local reg = CreateRegion()
    RegionAddRect(reg, Rect(rc.minX, rc.minY, rc.maxX, rc.maxY))
    TriggerRegisterEnterRegion(trig, reg, nil)
    local key = CIRCLE_KEYS[i]
    TriggerAddAction(trig, function()
      local pid = SurvivorPidOf(GetEnteringUnit())
      if pid ~= nil then HandleClassPick(pid, key) end
    end)
  end
end

-- ------------------------------------------------------------------- intro
function ShowCredits()
  local q = CreateQuest()
  QuestSetTitle(q, "Credits & Inspirations")
  QuestSetDescription(q, "Last Train from Yio Chu Kang -- a map by Serendipity (wc3-map-toolkit)."
    .. " Community models, per-author credit (Hive Workshop): HerrDave (T-Virus Zombies; Police Officer; Urban Prop Pack),"
    .. " Ilya Alaric after Ujimasa Hojo's Villager (Citizen Pack), bakr (Assorted City Buildings), Wayshan/purparisien (Modern Cars Pack)."
    .. " Commissioned ambience models: Sol (GPT 5.6 Codex fleet), 2026-08-07 batches 1 and 2 (incl. the Broodmother and the lair, station, void-deck and street sets)."
    .. " Design inspirations, mechanics only, nothing copied: Zombie Defense Custom (Lions_Blood) -- surge/countdown heartbeat, ground drops, spendable downtime;"
    .. " Zombination v11 (Trinin) -- evacuation window, curable infection, corpse-rise, XP falloff;"
    .. " Zombie-Simulator 7 (SpirulinaN) -- death = defection, state-keyed escalation; Dawn of the Dead (PreViO) -- gold-as-bullets ammo;"
    .. " NotD: Special Ops -- dread-beat ambience; SWAT: Aftermath -- power objectives.")
  QuestSetIconPath(q, "ReplaceableTextures\\CommandButtons\\BTNZombie.blp")
  QuestSetDiscovered(q, true)

  local q2 = CreateQuest()
  QuestSetTitle(q2, "How to Survive (and the Recipes)")
  QuestSetDescription(q2, "Board the last train (T+" .. TRAIN_ARRIVE .. "s, waits "
    .. (TRAIN_DEPART - TRAIN_ARRIVE) .. "s; needs 3/3 substations -- STAND in the yard, progress keeps, hits cost 3s) or kill the Broodmother in the kampong."
    .. " Walk onto a class circle in the first " .. PICK_WINDOW .. "s. Bullets are gold, clips are lumber; R reloads (gun down "
    .. RELOAD_TIME .. "s, legs work), E sprints."
    .. " RUMMAGE furniture by standing beside it ~3s (quiet) or SMASH it (instant, +Noise -- noisy districts get BIGGER surges)."
    .. " Crafting is AUTOMATIC on pickup: Cloth+Water=Wet Bandage, Plank+Pipe=Parang, Bottle+Kerosene=Molotov, Wire+Battery=Sentry Kit."
    .. " The Provision Shop sells Barricade Kit (2 clips), Mobile Phone (3), Wet Bandage (2), Flare (1). Rations: eat for 100."
    .. " The SIREN gives " .. SURGE_WARN .. "s of warning before every surge. Burn rat-king nests: each one slows the horde's growth."
    .. " Zombie bites infect (cure: Wet Bandage above " .. CURE_HP_PCT .. "%, or the polyclinic)."
    .. " The horde's kills rise in " .. RISE_DELAY .. "s -- burn corpses; a burned corpse is also DENIED to the defectors' Feast."
    .. " Death = defection: the fallen play on, against you, with Feast and Shriek.")
  QuestSetIconPath(q2, "ReplaceableTextures\\CommandButtons\\BTNSteelMelee.blp")
  QuestSetDiscovered(q2, true)
end

function PlayIntro()
  AnnounceAll("|cffaaddffYIO CHU KANG, 9.47 PM. The island went dark estate by estate. The PA says one more train.|r")
  After(4.0, function()
    if GameOver then return end
    AnnounceAll("|cffaaddffFour circles glow at the void deck -- walk onto one in the first " .. PICK_WINDOW
      .. "s to choose who you are. Stand by furniture to rummage it; smash it if you are in a hurry and don't mind the NOISE. |cffffcc00R|r reloads. |cffffcc00E|r sprints. The clock above is the last train.|r")
  end)
  After(8.0, function()
    if GameOver then return end
    AnnounceAll("|cffffff66Seed " .. RunSeed
      .. " -- replay this exact night with -seed N before the night commits. -help for everything.|r")
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

  -- the siren and the combine chime (stock paths; cosmetic, game-only)
  SndSiren = CreateSound("Sound\\Ambient\\DoodadEffects\\TheHornOfCenarius.wav",
    false, false, false, 10, 10, "")
  SndChime = CreateSound("Sound\\Interface\\SecretFound.wav",
    false, false, false, 10, 10, "")

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
  -- lair, the class-circle statues, the shop (units.json — gotcha 10)
  CreateAllUnits()

  -- register the world CreateAllUnits placed (deterministic enumeration)
  local g = CreateGroup()
  for _, owner in ipairs({ PLAYER_NEUTRAL_PASSIVE_ID, PLAYER_NEUTRAL_AGGRESSIVE_ID }) do
    GroupEnumUnitsOfPlayer(g, Player(owner), nil)
    local u = FirstOfGroup(g)
    while u ~= nil do
      local t = GetUnitTypeId(u)
      if PROP_KINDS[t] ~= nil then
        PropRec[u] = { kind = PROP_KINDS[t], searched = false }
      elseif t == UNIT_SUBSTATION then
        GenList[#GenList + 1] = { unit = u, fixed = false, progress = 0 }
      elseif t == UNIT_KAMPONG_NEST then
        NestRec[u] = true
      elseif SurvivorTypeSet[t] ~= nil then
        -- a class-circle statue: scenery that cannot be killed
        SetUnitInvulnerable(u, true)
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

  -- the shop's wares, keyed for the run log
  SHOP_TOKENS[ITEM_BARRICADE_KIT] = "barricade"
  SHOP_TOKENS[ITEM_MOBILE_PHONE] = "phone"
  SHOP_TOKENS[ITEM_WET_BANDAGE] = "bandage"
  SHOP_TOKENS[ITEM_FLARE] = "flare"

  -- the survivors walk out of the void deck as Heartlanders (the class
  -- circles re-cast them); bullets are gold, clips are lumber
  for _, pid in ipairs(Users) do
    ClassOf[pid] = "heartlander"
    SurvXP[pid] = 0
    SurvLevel[pid] = 1
    local def = CLASSES.heartlander
    local sx = -700.0 + 200.0 * (pid % 2)
    local sy = -400.0 + 400.0 * (pid // 2)
    Survivors[pid] = CreateUnit(Player(pid), def.unit, sx, sy, 90.0)
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, def.clip)
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_LUMBER, def.clips)
    for _, it in ipairs(def.items) do GiveItem(pid, it) end
    AmmoSpent[pid] = 0
  end

  -- the countdown window: the clock is a metronome from frame one (ZCD's
  -- "Final Wave In..." pattern; canon negative space: no hidden state)
  TrainTimer = CreateTimer()
  TimerStart(TrainTimer, TRAIN_ARRIVE + 0.0, false, nil)
  TrainDialog = CreateTimerDialog(TrainTimer)
  TimerDialogSetTitle(TrainDialog, "Last train")
  TimerDialogDisplay(TrainDialog, true)

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
