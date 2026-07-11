-- =========================================================================
-- Northreach Founders — war3map.lua
-- =========================================================================
-- 4-player frontier-economy sandbox on a cold Northrend coast, carrying the
-- real mechanics DNA of "Founders of the North" by ShadeGabriel/Sifonseal
-- (Hive Workshop) — see docs/reference/fotn-analysis.md. Design lineage
-- only: no assets, code or map data were taken from that map.
--
-- The loop (all FoTN-derived, scaled to this toolkit):
--   * All 4 Founders spawn TOGETHER at one neutral landing on the southern
--     coast, 320 gold / 20 lumber each, one hero, no base.
--   * Income is ACTIVE: hunt deer/wolves and break fishing shoals; they
--     drop trade-good items (Deer Hide / Wolf Pelt / Coastal Catch) that
--     you pawn at the neutral Northreach Market. The engine pays 50% of an
--     item's gold value on pawn; a trigger tops up the other 50%
--     ("currency return"), so goods and coins pawn at FULL value.
--   * Founding is free-form: the Founder builds a Shelter ANYWHERE, then
--     upgrades it Shelter -> Homestead -> Town Hall. '-town' pings the six
--     recommended waystone sites, but nothing enforces them. A Founder
--     Banner is planted when a Town Hall finishes.
--   * Corruption: once you own a Town Hall, every 40s you lose 5% of
--     CARRIED gold. Counter: buy Trade Coins (100/500/1000) at the Market;
--     they pawn back at full value (trigger top-up), exactly FoTN's
--     anti-hoarding coin system.
--   * Grace period: 300s peace timer ENFORCED by alliance state: every user
--     pair is set mutually passive (SetPlayerAlliance ALLIANCE_PASSIVE) for
--     the duration, then reset to enemies (FFA) when it expires; wolves stay
--     docile until it ends.
--   * Night threat: at night wolves speed up and their acquire range grows
--     (a "wolf surge" also spawns a small pack at the two dens); day calms
--     them again.
--   * No automatic victory: any Founder with a Town Hall may declare
--     '-endgame'. From then on, a player with NO Town Hall and a DEAD
--     Founder is purged (defeated); the last charter standing wins.
--     The multiboard is an info-only ledger (halls + gold earned).
--
-- Data this script reaches into (kept in sync with the JSON):
--   units.json    — preplaced units; build-map appends a generated
--                   CreateAllUnits() which main() calls before
--                   FindFounders() enumerates the start heroes
--   regions.json  — the Site*/Den* rects below use identical coordinates
--   cameras.json  — CAMERA_* tables mirror the two w3c cameras
--   sounds.json   — gg_snd_* sounds use the same built-in paths
--   objects-*.json— H000 Founder, h001 Longship, h003 Town Hall,
--                   h004 Shelter, h005 Homestead, h006 Longship Dock,
--                   n000 Founder Banner, n001 Waystone Cairn,
--                   n002 Northreach Market, n003 Fishing Shoal,
--                   I000..I002 trade goods, I003..I005 trade coins
--
-- Chat commands: -help -town -endgame always; '-test' toggles debug mode:
--   -gold N, -found, -tax, -wolves, -grace, -reveal, -victory, -ff
--
-- info.json has scriptLanguage = 1 (Lua); the game calls config() in the
-- lobby and main() on map start.
-- =========================================================================

-- ------------------------------------------------------------------ tuning
local NUM_PLAYERS     = 4
local START_GOLD      = 320    -- FoTN start: 320 gold / 20 lumber
local START_LUMBER    = 20
local GRACE_PERIOD    = 300.0  -- seconds of peace (FoTN uses 900; our map is smaller)
local TAX_PERIOD      = 40.0   -- corruption cadence (FoTN-exact)
local TAX_DIVISOR     = 20     -- gold // 20 = the 5% corruption bite (FoTN-exact)
local HUNT_RESPAWN    = 45.0   -- seconds before a hunted animal/shoal returns
local REVIVE_DELAY    = 30.0   -- seconds before a fallen Founder returns
local PROWL_PERIOD    = 20.0   -- wolf roaming cadence
local WOLF_CAP        = 18     -- max living wolves before surges stop spawning
local WOLF_DAY_ACQ    = 500.0  -- wolf acquire range by day (after grace)
local WOLF_NIGHT_ACQ  = 900.0  -- wolf acquire range at night
local WOLF_GRACE_ACQ  = 200.0  -- docile wolves during the grace period
local WOLF_NIGHT_SPEED = 400   -- wolves run at night
local FF_SCALE        = 4      -- -ff clock multiplier

-- the communal landing (all four charters start here — no per-player bases)
local START = { x = -2688, y = -2496 }
local MARKET = { x = -2240, y = -2496 }

-- ------------------------------------- recommended sites (= regions.json)
-- '-town' pings these; founding itself is free-form (build anywhere).
local SITES = {
  { name = "Midlands",   x = -640,  y = 128 },
  { name = "Northwood",  x = -2816, y = 3648 },
  { name = "Northgate",  x = 256,   y = 3904 },
  { name = "Eastmark",   x = 3968,  y = -256 },
  { name = "Fjordmouth", x = 1664,  y = -1664 },
  { name = "Highcairn",  x = 2048,  y = 1792 },
}

-- wolf dens (= regions.json Den*): night surges spawn here
local DENS = {
  { name = "DenNorthPass", x = -768,  y = 4736 },
  { name = "DenEastShore", x = 4736,  y = -640 },
}

-- static respawn tables (mirror units.json placements)
local DEER_SPAWNS = {
  { x = -1664, y = -896 }, { x = -896, y = 1408 }, { x = 512, y = 2176 },
  { x = 2688, y = 384 }, { x = -2176, y = 896 }, { x = 1408, y = -256 },
}
local WOLF_SPAWNS = {
  { x = -704, y = 4416 }, { x = 4544, y = -448 }, { x = -2944, y = 1664 },
  { x = 2816, y = -1088 },
}
-- shoals sit in shallow water; their catch is dropped at the paired shore
-- landing so a Founder on foot can always pick it up
local SHOALS = {
  { x = -3328, y = -3392, landX = -3072, landY = -2944 },
  { x = -1408, y = -3712, landX = -1408, landY = -3392 },
  { x = -3968, y = 320,   landX = -3584, landY = 320 },
}

-- ------------------------------------------------- cameras (= cameras.json)
local CAMERA_INTRO = { x = -1200, y = -1800, rotation = 90,  aoa = 330, distance = 4800, fov = 70 }
local CAMERA_FJORD = { x = 0,     y = -1600, rotation = 120, aoa = 315, distance = 3600, fov = 70 }

-- --------------------------------------------------- sounds (= sounds.json)
local gg_snd_FoundChime  = nil
local gg_snd_VictoryHorn = nil

-- -------------------------------------------------------------- game state
local founders    = {}    -- pid -> H000 Founder hero (handle kept for revives)
local defeated    = {}    -- pid -> true once purged/left
local earned      = {}    -- pid -> lifetime gold earned at the Market
local halls       = {}    -- Town Hall unit -> its Founder Banner unit
local testMode    = {}    -- pid -> bool, '-test' debug toggle
local clockScale  = 1     -- -ff sets FF_SCALE
local taxLeft     = TAX_PERIOD
local prowlLeft   = PROWL_PERIOD
local graceOver   = false
local graceTimer  = nil
local graceDialog = nil
local endgameOn   = false -- true once a Founder declares '-endgame'
local isNight     = false
local surgeLevel  = 0
local board       = nil   -- the info-only Northreach Ledger
local gameOver    = false

-- built at init (FourCC must not run at file scope)
local SALE = nil          -- item typeId -> full pawn value (trigger top-up)
local DROPS = nil         -- unit typeId -> drop spec
local WOLF_TYPES = nil    -- set of wolf unit typeIds

-- ---------------------------------------------------------------- helpers

local function PlayingUser(pid)
  local p = Player(pid)
  return GetPlayerSlotState(p) == PLAYER_SLOT_STATE_PLAYING
    and GetPlayerController(p) == MAP_CONTROL_USER
end

local function AnnounceAll(msg)
  for i = 0, NUM_PLAYERS - 1 do
    DisplayTextToPlayer(Player(i), 0, 0, msg)
  end
end

local function AnnounceTimedAll(dur, msg)
  for i = 0, NUM_PLAYERS - 1 do
    DisplayTimedTextToPlayer(Player(i), 0, 0, dur, msg)
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

local function ApplyCameraForAll(cam, dur)
  for i = 0, NUM_PLAYERS - 1 do
    local p = Player(i)
    if GetPlayerController(p) == MAP_CONTROL_USER then
      PanCameraToTimedForPlayer(p, cam.x, cam.y, dur)
      SetCameraFieldForPlayer(p, CAMERA_FIELD_ROTATION, cam.rotation, dur)
      SetCameraFieldForPlayer(p, CAMERA_FIELD_ANGLE_OF_ATTACK, cam.aoa, dur)
      SetCameraFieldForPlayer(p, CAMERA_FIELD_TARGET_DISTANCE, cam.distance, dur)
      SetCameraFieldForPlayer(p, CAMERA_FIELD_FIELD_OF_VIEW, cam.fov, dur)
    end
  end
end

local function ResetCameraForAll(dur)
  for i = 0, NUM_PLAYERS - 1 do
    local p = Player(i)
    if GetPlayerController(p) == MAP_CONTROL_USER then
      ResetToGameCameraForPlayer(p, dur)
      PanCameraToTimedForPlayer(p, START.x, START.y, dur)
    end
  end
end

local function Alive(u)
  return u ~= nil and GetWidgetLife(u) > 0.405
end

local function AddGold(p, amount)
  SetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD,
    GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) + amount)
end

-- enumerate a player's units of one type through fn(u)
local function ForUnitsOfPlayer(playerIdx, fn)
  local g = CreateGroup()
  GroupEnumUnitsOfPlayer(g, Player(playerIdx), nil)
  local u = FirstOfGroup(g)
  while u ~= nil do
    fn(u)
    GroupRemoveUnit(g, u)
    u = FirstOfGroup(g)
  end
  DestroyGroup(g)
end

local function CountHalls(pid)
  local n = 0
  local hallId = FourCC("h003")
  ForUnitsOfPlayer(pid, function(u)
    if GetUnitTypeId(u) == hallId and Alive(u) then n = n + 1 end
  end)
  return n
end

local function CountWolves()
  local n = 0
  ForUnitsOfPlayer(PLAYER_NEUTRAL_AGGRESSIVE, function(u)
    if WOLF_TYPES[GetUnitTypeId(u)] and Alive(u) then n = n + 1 end
  end)
  return n
end

local function ForWolves(fn)
  ForUnitsOfPlayer(PLAYER_NEUTRAL_AGGRESSIVE, function(u)
    if WOLF_TYPES[GetUnitTypeId(u)] and Alive(u) then fn(u) end
  end)
end

-- ------------------------------------------------------------ map plumbing

local function InitTables()
  SALE = {
    [FourCC("I000")] = 25,   -- Deer Hide
    [FourCC("I001")] = 60,   -- Wolf Pelt
    [FourCC("I002")] = 35,   -- Coastal Catch
    [FourCC("I003")] = 100,  -- Trade Coin (100): pawns back at full value
    [FourCC("I004")] = 500,
    [FourCC("I005")] = 1000,
  }
  DROPS = {
    [FourCC("nder")] = { item = "I000", count = 1, respawn = "deer" },
    [FourCC("nwlt")] = { item = "I001", count = 1, respawn = "wolf" },
    [FourCC("nwlg")] = { item = "I001", count = 1, respawn = "wolf" },
    [FourCC("n003")] = { item = "I002", count = 2, respawn = "shoal" },
  }
  WOLF_TYPES = { [FourCC("nwlt")] = true, [FourCC("nwlg")] = true }
end

local function InitSounds()
  -- same built-in files that sounds.json (war3map.w3s) declares
  gg_snd_FoundChime = CreateSound(
    "Abilities\\Spells\\Items\\AIam\\Tomes.flac", false, false, false, 10, 10, "SpellsEAX")
  SetSoundVolume(gg_snd_FoundChime, 127)
  gg_snd_VictoryHorn = CreateSound(
    "Sound\\Music\\mp3Music\\Comradeship.flac", false, false, false, 10, 10, "DefaultEAXON")
  SetSoundVolume(gg_snd_VictoryHorn, 110)
end

local function FindFounders()
  local heroId = FourCC("H000")
  for pid = 0, NUM_PLAYERS - 1 do
    ForUnitsOfPlayer(pid, function(u)
      if GetUnitTypeId(u) == heroId then founders[pid] = u end
    end)
  end
end

-- --------------------------------------------------------------- the wolves

-- one place decides how wolves behave in the current phase
local function ApplyWolfPhase()
  local acq = WOLF_GRACE_ACQ
  if graceOver then
    acq = isNight and WOLF_NIGHT_ACQ or WOLF_DAY_ACQ
  end
  ForWolves(function(u)
    SetUnitAcquireRange(u, acq)
    if graceOver and isNight then
      SetUnitMoveSpeed(u, WOLF_NIGHT_SPEED)
    else
      SetUnitMoveSpeed(u, GetUnitDefaultMoveSpeed(u))
    end
  end)
end

local function SpawnWolf(code, x, y)
  local u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), FourCC(code), x, y, 270.0)
  if graceOver then
    SetUnitAcquireRange(u, isNight and WOLF_NIGHT_ACQ or WOLF_DAY_ACQ)
    if isNight then SetUnitMoveSpeed(u, WOLF_NIGHT_SPEED) end
  else
    SetUnitAcquireRange(u, WOLF_GRACE_ACQ)
  end
  return u
end

-- a night surge: buff every wolf and let a fresh pack loose from each den
local function WolfSurge()
  surgeLevel = surgeLevel + 1
  ApplyWolfPhase()
  if CountWolves() < WOLF_CAP then
    for _, den in ipairs(DENS) do
      local pack = { SpawnWolf("nwlt", den.x, den.y - 128.0),
                     SpawnWolf("nwlt", den.x + 128.0, den.y) }
      if surgeLevel >= 2 then
        pack[#pack + 1] = SpawnWolf("nwlg", den.x - 128.0, den.y)
      end
      local s = SITES[GetRandomInt(1, #SITES)]
      for _, w in ipairs(pack) do
        IssuePointOrder(w, "attack", s.x, s.y)
      end
    end
  end
  AnnounceTimedAll(10.0, "|cffff9966The wolves of Northreach are hunting -- they run fast and see far in the dark.|r")
end

local function NightBegins()
  if gameOver then return end
  if not graceOver then
    AnnounceTimedAll(8.0, "|cffaaaaaaNight falls, but the grace period keeps the wolves docile... for now.|r")
    return
  end
  WolfSurge()
end

local function DayBreaks()
  if gameOver then return end
  ApplyWolfPhase()
  if graceOver then
    AnnounceTimedAll(8.0, "|cffaaddffDawn. The wolves slink back to their dens and slow down.|r")
  end
end

local function ProwlTick()
  -- lazy roaming so the wild feels alive; hunting pressure comes at night
  ForWolves(function(u)
    if GetRandomInt(1, 4) == 1 then
      IssuePointOrder(u, "move",
        GetUnitX(u) + GetRandomReal(-600.0, 600.0),
        GetUnitY(u) + GetRandomReal(-600.0, 600.0))
    end
  end)
end

-- ------------------------------------------------------- the northreach ledger
-- Info only (FoTN has no score at all): halls owned + lifetime market gold.

local function CreateBoard()
  board = CreateMultiboard()
  MultiboardSetTitleText(board, "Northreach Ledger (info only)")
  MultiboardSetRowCount(board, NUM_PLAYERS)
  MultiboardSetColumnCount(board, 3)
  for r = 0, NUM_PLAYERS - 1 do
    for c = 0, 2 do
      local item = MultiboardGetItem(board, r, c)
      MultiboardSetItemStyle(item, true, false)
      MultiboardSetItemWidth(item, c == 0 and 0.12 or 0.06)
      MultiboardReleaseItem(item)
    end
  end
  MultiboardDisplay(board, true)
end

local function UpdateBoard()
  if board == nil then return end
  for pid = 0, NUM_PLAYERS - 1 do
    local nameItem = MultiboardGetItem(board, pid, 0)
    local hallItem = MultiboardGetItem(board, pid, 1)
    local goldItem = MultiboardGetItem(board, pid, 2)
    local tag = GetPlayerName(Player(pid))
    if defeated[pid] then tag = tag .. " (purged)" end
    MultiboardSetItemValue(nameItem, tag)
    MultiboardSetItemValue(hallItem, "halls " .. CountHalls(pid))
    MultiboardSetItemValue(goldItem, "sold " .. (earned[pid] or 0))
    MultiboardReleaseItem(nameItem)
    MultiboardReleaseItem(hallItem)
    MultiboardReleaseItem(goldItem)
  end
end

-- --------------------------------------------------------- victory / defeat

local function Victory(pid, reason)
  if gameOver then return end
  gameOver = true
  StartSound(gg_snd_VictoryHorn)
  AnnounceAll("|cff88ff88" .. GetPlayerName(Player(pid)) .. " is the one and only lord of the North -- " .. reason .. "|r")
  ApplyCameraForAll(CAMERA_FJORD, 2.0)
  After(5.0, function()
    for i = 0, NUM_PLAYERS - 1 do
      if PlayingUser(i) then
        if i == pid then
          CustomVictoryBJ(Player(i), true, true)
        else
          CustomDefeatBJ(Player(i), "A rival charter rules the North.")
        end
      end
    end
  end)
end

local function CheckLastStanding()
  if gameOver then return end
  local aliveCount = 0
  local lastPid = -1
  for pid = 0, NUM_PLAYERS - 1 do
    if PlayingUser(pid) and not defeated[pid] then
      aliveCount = aliveCount + 1
      lastPid = pid
    end
  end
  if aliveCount == 1 then
    Victory(lastPid, "the last charter standing!")
  end
end

local function Defeat(pid, reason)
  if gameOver or defeated[pid] then return end
  defeated[pid] = true
  AnnounceAll("|cffff4444" .. GetPlayerName(Player(pid)) .. " has been " .. reason .. ".|r")
  UpdateBoard()
  if PlayingUser(pid) then
    After(2.0, function()
      if not gameOver then
        CustomDefeatBJ(Player(pid), "You have been purged from the North.")
      end
    end)
  end
  CheckLastStanding()
end

-- elimination only applies once the endgame has been declared (FoTN R008)
local function EliminationSweep()
  if not endgameOn or gameOver then return end
  for pid = 0, NUM_PLAYERS - 1 do
    if PlayingUser(pid) and not defeated[pid]
        and CountHalls(pid) == 0 and not Alive(founders[pid]) then
      Defeat(pid, "purged from the North entirely (no Town Hall, no Founder)")
    end
  end
end

local function DeclareEndgame(pid)
  if endgameOn then
    Tell(pid, "|cffaaaaaaThe endgame has already been declared.|r")
    return
  end
  if CountHalls(pid) == 0 then
    Tell(pid, "|cffaaaaaaOnly a Founder who holds a Town Hall may declare the endgame.|r")
    return
  end
  endgameOn = true
  StartSound(gg_snd_FoundChime)
  AnnounceAll("|cffff6666" .. GetPlayerName(Player(pid))
    .. " has declared the ENDGAME! The purge begins: any charter with no Town Hall and no living Founder is cast out. The last charter standing rules the North.|r")
  EliminationSweep()
end

-- ------------------------------------------------------------- the founding

local function FoundTown(pid, hall)
  local x, y = GetUnitX(hall), GetUnitY(hall)
  halls[hall] = CreateUnit(Player(pid), FourCC("n000"), x + 192.0, y + 192.0, 270.0)
  StartSound(gg_snd_FoundChime)
  local n = CountHalls(pid)
  AnnounceTimedAll(10.0, "|cffffcc00" .. GetPlayerName(Player(pid))
    .. " has raised a Town Hall and planted the banner of a new town!|r ("
    .. n .. " hall" .. (n == 1 and "" or "s") .. ")")
  PingMinimap(x, y, 5.0)
  if not endgameOn then
    Tell(pid, "|cffaaaaaaCorruption now taxes your carried gold every " .. math.floor(TAX_PERIOD)
      .. "s. Store wealth as Trade Coins at the Market.|r")
  end
  UpdateBoard()
end

local function RegisterConstructions()
  -- Shelters/Docks finish as constructions; Homestead -> Town Hall finishes
  -- as an UPGRADE (the chain is uupt-driven), so listen to both.
  local built = CreateTrigger()
  for pid = 0, NUM_PLAYERS - 1 do
    TriggerRegisterPlayerUnitEvent(built, Player(pid), EVENT_PLAYER_UNIT_CONSTRUCT_FINISH, nil)
  end
  TriggerAddAction(built, function()
    if gameOver then return end
    local u = GetConstructedStructure()
    if u == nil then return end
    local pid = GetPlayerId(GetOwningPlayer(u))
    if pid >= NUM_PLAYERS then return end
    if GetUnitTypeId(u) == FourCC("h004") then
      Tell(pid, "|cffaaaaaaShelter raised. Upgrade it to a Homestead, then to a Town Hall, to found your town.|r")
    elseif GetUnitTypeId(u) == FourCC("h003") then
      FoundTown(pid, u) -- direct builds (e.g. -found) still count
    end
  end)

  local upgraded = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(upgraded, EVENT_PLAYER_UNIT_UPGRADE_FINISH)
  TriggerAddAction(upgraded, function()
    if gameOver then return end
    local u = GetTriggerUnit()
    if u == nil or GetUnitTypeId(u) ~= FourCC("h003") then return end
    local pid = GetPlayerId(GetOwningPlayer(u))
    if pid >= NUM_PLAYERS then return end
    FoundTown(pid, u)
  end)
end

-- ------------------------------------------------------------- the hunting

local function DropLoot(spec, x, y)
  for _ = 1, spec.count do
    CreateItem(FourCC(spec.item), x, y)
  end
end

local function ScheduleRespawn(spec, deadType, x, y)
  After(HUNT_RESPAWN, function()
    if gameOver then return end
    if spec.respawn == "deer" then
      local s = DEER_SPAWNS[GetRandomInt(1, #DEER_SPAWNS)]
      CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), deadType, s.x, s.y, 270.0)
    elseif spec.respawn == "wolf" then
      local s = WOLF_SPAWNS[GetRandomInt(1, #WOLF_SPAWNS)]
      local u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), deadType, s.x, s.y, 270.0)
      SetUnitAcquireRange(u, graceOver and (isNight and WOLF_NIGHT_ACQ or WOLF_DAY_ACQ) or WOLF_GRACE_ACQ)
      if graceOver and isNight then SetUnitMoveSpeed(u, WOLF_NIGHT_SPEED) end
    elseif spec.respawn == "shoal" then
      -- respawn the shoal at its own fixed spot (nearest to where it died)
      local best, bestD = SHOALS[1], nil
      for _, s in ipairs(SHOALS) do
        local d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y)
        if bestD == nil or d < bestD then best, bestD = s, d end
      end
      local u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), deadType, best.x, best.y, 270.0)
      SetUnitAcquireRange(u, 200.0)
    end
  end)
end

local function HandleHuntDeath(u)
  local spec = DROPS[GetUnitTypeId(u)]
  if spec == nil then return false end
  local x, y = GetUnitX(u), GetUnitY(u)
  if spec.respawn == "shoal" then
    -- drop the catch on the paired shore landing, never in open water
    local best, bestD = SHOALS[1], nil
    for _, s in ipairs(SHOALS) do
      local d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y)
      if bestD == nil or d < bestD then best, bestD = s, d end
    end
    DropLoot(spec, best.landX, best.landY)
    local killer = GetKillingUnit()
    if killer ~= nil and GetPlayerId(GetOwningPlayer(killer)) < NUM_PLAYERS then
      Tell(GetPlayerId(GetOwningPlayer(killer)),
        "|cffaaddffThe catch washes ashore nearby -- carry it to the Market.|r")
    end
  else
    DropLoot(spec, x, y)
  end
  ScheduleRespawn(spec, GetUnitTypeId(u), x, y)
  return true
end

-- ------------------------------------------------------------- the market
-- Engine pawn (Apit on the Market) pays 50% of an item's gold cost; this
-- trigger tops it up to 100% -- FoTN's "Currency Return", which is also what
-- makes Trade Coins a corruption-proof store of value.

local function RegisterMarket()
  local trig = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(trig, EVENT_PLAYER_UNIT_PAWN_ITEM)
  TriggerAddAction(trig, function()
    if gameOver then return end
    local it = GetSoldItem()
    if it == nil then return end
    local value = SALE[GetItemTypeId(it)]
    if value == nil then return end
    local seller = GetTriggerUnit()
    if seller == nil then seller = GetSellingUnit() end
    if seller == nil then return end
    local pid = GetPlayerId(GetOwningPlayer(seller))
    if pid >= NUM_PLAYERS then
      seller = GetSellingUnit()
      if seller == nil then return end
      pid = GetPlayerId(GetOwningPlayer(seller))
      if pid >= NUM_PLAYERS then return end
    end
    local topup = value - (value // 2) -- engine already paid value // 2
    AddGold(Player(pid), topup)
    earned[pid] = (earned[pid] or 0) + value
    Tell(pid, "|cffffcc00Sold for " .. value .. " gold|r (Market pays full value).")
    UpdateBoard()
  end)
end

-- --------------------------------------------------------- corruption tax
-- FoTN-exact: every 40s, every player who owns a Town Hall loses gold//20
-- (5%) of CARRIED gold. Coined wealth (I003..I005) is never touched.

local function DoCorruptionTick()
  for pid = 0, NUM_PLAYERS - 1 do
    if PlayingUser(pid) and not defeated[pid] and CountHalls(pid) > 0 then
      local g = GetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD)
      local bite = g // TAX_DIVISOR
      if bite > 0 then
        SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, g - bite)
        Tell(pid, "|cffaaaaaaCorruption claims " .. bite .. " gold from your coffers.|r")
      end
    end
  end
end

-- ------------------------------------------------------ deaths and revives

local function HandleFounderDeath(pid)
  AnnounceAll("|cffff8866The Founder of " .. GetPlayerName(Player(pid)) .. " has fallen!|r")
  if endgameOn and CountHalls(pid) == 0 then
    EliminationSweep()
    return
  end
  After(REVIVE_DELAY, function()
    if gameOver or defeated[pid] or Alive(founders[pid]) then return end
    local x, y = START.x, START.y
    local hallId = FourCC("h003")
    ForUnitsOfPlayer(pid, function(u)
      if GetUnitTypeId(u) == hallId and Alive(u) then
        x, y = GetUnitX(u), GetUnitY(u)
      end
    end)
    ReviveHero(founders[pid], x, y, true)
    Tell(pid, "|cffaaddffYour Founder returns to the North.|r")
  end)
end

local function RegisterDeaths()
  local trig = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(trig, EVENT_PLAYER_UNIT_DEATH)
  TriggerAddAction(trig, function()
    if gameOver then return end
    local u = GetTriggerUnit()
    if HandleHuntDeath(u) then return end
    if GetUnitTypeId(u) == FourCC("h003") then
      local banner = halls[u]
      if banner ~= nil then
        KillUnit(banner)
        halls[u] = nil
      end
      local pid = GetPlayerId(GetOwningPlayer(u))
      if pid < NUM_PLAYERS then
        AnnounceTimedAll(10.0, "|cffff6666A town of " .. GetPlayerName(Player(pid))
          .. " has been razed!|r")
        UpdateBoard()
        EliminationSweep()
      end
      return
    end
    for pid = 0, NUM_PLAYERS - 1 do
      if u == founders[pid] then
        HandleFounderDeath(pid)
        return
      end
    end
  end)
end

local function RegisterLeavers()
  for pid = 0, NUM_PLAYERS - 1 do
    local trig = CreateTrigger()
    TriggerRegisterPlayerEvent(trig, Player(pid), EVENT_PLAYER_LEAVE)
    local capturedPid = pid
    TriggerAddAction(trig, function()
      if gameOver or defeated[capturedPid] then return end
      defeated[capturedPid] = true
      AnnounceAll("|cffff4444" .. GetPlayerName(Player(capturedPid))
        .. " has retired from life in the North.|r")
      UpdateBoard()
      CheckLastStanding()
    end)
  end
end

-- ------------------------------------------------------------ grace period

-- The truce is real alliance state, not an announcement: while the grace
-- period runs, every pair of user players is mutually ALLIANCE_PASSIVE
-- (cannot attack or be attacked); when it ends the pairs become enemies
-- again (FFA). Plain native, both directions of every pair. No vision or
-- control is ever shared, and computer/neutral slots are untouched (all
-- four slots are MAP_CONTROL_USER, see InitCustomPlayerSlots).
local function SetFounderTruce(peace)
  for i = 0, NUM_PLAYERS - 1 do
    for j = 0, NUM_PLAYERS - 1 do
      if i ~= j then
        SetPlayerAlliance(Player(i), Player(j), ALLIANCE_PASSIVE, peace)
      end
    end
  end
end

local function GraceEnds()
  if graceOver then return end
  graceOver = true
  SetFounderTruce(false) -- back to all-pairs enemies: the FFA begins
  if graceDialog ~= nil then
    TimerDialogDisplay(graceDialog, false)
    DestroyTimerDialog(graceDialog)
    graceDialog = nil
  end
  AnnounceTimedAll(12.0, "|cffff6666The grace period has ended. Charters may now war on one another -- and the wolves remember they are hungry.|r")
  ApplyWolfPhase()
  if isNight then WolfSurge() end
end

local function StartGrace()
  SetFounderTruce(true) -- mutual passive alliance between all user pairs
  graceTimer = CreateTimer()
  TimerStart(graceTimer, GRACE_PERIOD, false, GraceEnds)
  graceDialog = CreateTimerDialog(graceTimer)
  TimerDialogSetTitle(graceDialog, "Grace Period")
  TimerDialogDisplay(graceDialog, true)
end

-- ------------------------------------------------------------ master clock
-- One repeating 1-second timer drives the corruption tax, the wolf prowl and
-- the day/night watch so that '-ff' can scale everything in one place.

local function StartClock()
  local t = CreateTimer()
  TimerStart(t, 1.0, true, function()
    if gameOver then return end
    local tod = GetTimeOfDay()
    local night = tod < 6.0 or tod >= 18.0
    if night ~= isNight then
      isNight = night
      if night then NightBegins() else DayBreaks() end
    end
    taxLeft = taxLeft - clockScale
    if taxLeft <= 0 then
      taxLeft = TAX_PERIOD
      DoCorruptionTick()
    end
    prowlLeft = prowlLeft - clockScale
    if prowlLeft <= 0 then
      prowlLeft = PROWL_PERIOD
      ProwlTick()
    end
  end)
end

-- --------------------------------------------------------- chat commands

local function TestFound(pid)
  -- plant a finished Town Hall at the Founder's feet (or the landing)
  local x, y = START.x, START.y
  if Alive(founders[pid]) then
    x, y = GetUnitX(founders[pid]) + 256.0, GetUnitY(founders[pid])
  end
  CreateUnit(Player(pid), FourCC("h003"), x, y, 270.0)
  -- EVENT_PLAYER_UNIT_CONSTRUCT_FINISH does not fire for CreateUnit, so the
  -- construct trigger won't see it; found it explicitly.
  local hallId = FourCC("h003")
  ForUnitsOfPlayer(pid, function(u)
    if GetUnitTypeId(u) == hallId and Alive(u) and halls[u] == nil then
      FoundTown(pid, u)
    end
  end)
end

local function ShowHelp(pid)
  Tell(pid, "|cffaaddffNorthreach commands:|r")
  Tell(pid, "-help : this list. -town : ping the six recommended waystone sites.")
  Tell(pid, "-endgame : (needs a Town Hall) declare the purge -- elimination begins, last charter standing wins.")
  Tell(pid, "-test : toggle debug mode (required for the rest).")
  Tell(pid, "-gold N : set gold. -found : plant a finished Town Hall at your Founder.")
  Tell(pid, "-tax : force a corruption tick. -wolves : force a wolf surge. -grace : end the grace period.")
  Tell(pid, "-reveal : reveal the map. -victory : run the victory sequence.")
  Tell(pid, "-ff : toggle " .. FF_SCALE .. "x speed on the tax/prowl clock.")
end

local function PingSites(pid)
  for _, s in ipairs(SITES) do
    PingMinimap(s.x, s.y, 6.0)
  end
  PingMinimap(MARKET.x, MARKET.y, 6.0)
  Tell(pid, "|cffaaddffPinged: the six recommended waystone sites (and the Market). You may found your town anywhere.|r")
end

local function HandleChat(pid, msgRaw)
  local msg = string.lower(msgRaw)
  -- trim trailing whitespace
  msg = string.match(msg, "^%s*(.-)%s*$")
  if string.sub(msg, 1, 1) ~= "-" then return end

  if msg == "-help" then
    ShowHelp(pid)
    return
  end
  if msg == "-town" then
    PingSites(pid)
    return
  end
  if msg == "-endgame" then
    DeclareEndgame(pid)
    return
  end
  if msg == "-test" then
    testMode[pid] = not testMode[pid]
    if testMode[pid] then
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid))
        .. " enabled -test debug mode.|r Commands: -gold N, -found, -tax, -wolves, -grace, -reveal, -victory, -ff")
    else
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid)) .. " disabled -test debug mode.|r")
    end
    return
  end

  local goldArg = string.match(msg, "^%-gold%s+(%d+)$")
  local known = goldArg ~= nil or msg == "-found" or msg == "-tax" or msg == "-wolves"
    or msg == "-grace" or msg == "-reveal" or msg == "-victory" or msg == "-ff"
  if not known then return end
  if not testMode[pid] then
    Tell(pid, "|cffaaaaaaDebug commands need -test mode. Type -test first.|r")
    return
  end

  if goldArg ~= nil then
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, tonumber(goldArg))
    Tell(pid, "|cffff88ffGold set to " .. goldArg .. ".|r")
  elseif msg == "-found" then
    TestFound(pid)
  elseif msg == "-tax" then
    Tell(pid, "|cffff88ffForcing a corruption tick.|r")
    DoCorruptionTick()
    taxLeft = TAX_PERIOD
  elseif msg == "-wolves" then
    Tell(pid, "|cffff88ffForcing a wolf surge.|r")
    WolfSurge()
  elseif msg == "-grace" then
    Tell(pid, "|cffff88ffEnding the grace period now.|r")
    if graceTimer ~= nil then PauseTimer(graceTimer) end
    GraceEnds()
  elseif msg == "-reveal" then
    FogModifierStart(CreateFogModifierRect(Player(pid), FOG_OF_WAR_VISIBLE,
      bj_mapInitialPlayableArea, true, false))
    Tell(pid, "|cffff88ffMap revealed.|r")
  elseif msg == "-victory" then
    Victory(pid, "victory sequence test (-victory)")
  elseif msg == "-ff" then
    if clockScale == 1 then
      clockScale = FF_SCALE
    else
      clockScale = 1
    end
    AnnounceAll("|cffff88ffClock speed is now " .. clockScale .. "x (tax/prowl timers).|r")
  end
end

local function RegisterChatCommands()
  for pid = 0, NUM_PLAYERS - 1 do
    local trig = CreateTrigger()
    -- substring match: fires on any message containing '-'; HandleChat
    -- then pattern-matches the exact command
    TriggerRegisterPlayerChatEvent(trig, Player(pid), "-", false)
    local capturedPid = pid
    TriggerAddAction(trig, function()
      HandleChat(capturedPid, GetEventPlayerChatString())
    end)
  end
end

-- ------------------------------------------------------------------- intro

local function PlayIntro()
  ApplyCameraForAll(CAMERA_INTRO, 0.0)
  AnnounceTimedAll(7.0, "|cffaaddffNorthreach. Four Founders, one cold landing, 320 gold each -- and a whole North to claim.|r")
  After(3.5, function()
    if gameOver then return end
    ApplyCameraForAll(CAMERA_FJORD, 2.5)
    AnnounceTimedAll(7.0, "|cffaaddffHunt deer and wolves, break the fishing shoals, and pawn your take at the Market. Build a Shelter anywhere and raise it to a Town Hall. Type -town for suggested sites.|r")
  end)
  After(7.5, function()
    if gameOver then return end
    ResetCameraForAll(1.5)
    AnnounceTimedAll(12.0, "|cffffff66Corruption taxes hoarded gold once you hold a Town Hall (coin your wealth!). Wolves hunt at night. No one wins until a Founder declares -endgame. Type -help for commands.|r")
  end)
end

-- =========================================================== entry points

function InitGlobals()
end

-- Lobby configuration, kept in the exact shape World Editor generates for a
-- "Use Custom Forces" + "Fixed Player Settings" map (see
-- maps/tidewatch-arena): InitCustomPlayerSlots + InitCustomTeams, with
-- ForcePlayerStartLocation and SetPlayerRaceSelectable(false).
--
-- CRITICAL invariant: every team index passed to SetPlayerTeam below MUST be
-- the index of a force in info.json's "forces" array (4 one-player forces
-- here -> teams 0..3). A team without a matching w3i force leaves the locked
-- lobby with no valid slot arrangement and the multiplayer "Create" button
-- disabled.
function InitCustomPlayerSlots()
  for i = 0, NUM_PLAYERS - 1 do
    SetPlayerStartLocation(Player(i), i)
    ForcePlayerStartLocation(Player(i), i)
    SetPlayerColor(Player(i), ConvertPlayerColor(i))
    SetPlayerRacePreference(Player(i), RACE_PREF_HUMAN)
    SetPlayerRaceSelectable(Player(i), false)
    SetPlayerController(Player(i), MAP_CONTROL_USER)
  end
end

function InitCustomTeams()
  -- Forces: TRIGSTR_009..TRIGSTR_012 (Ravenshold/Icefarers/Stormlanders/
  -- Whitewake) — team index i = force index i, one player each (FFA).
  for i = 0, NUM_PLAYERS - 1 do
    SetPlayerTeam(Player(i), i)
  end
end

function config()
  SetMapName("TRIGSTR_001")
  SetMapDescription("TRIGSTR_002")
  SetPlayers(NUM_PLAYERS)
  SetTeams(NUM_PLAYERS)
  SetGamePlacement(MAP_PLACEMENT_USE_MAP_SETTINGS)

  -- one communal landing on the southern coast (FoTN-style shared start)
  DefineStartLocation(0, -2816.0, -2624.0)
  DefineStartLocation(1, -2560.0, -2624.0)
  DefineStartLocation(2, -2816.0, -2368.0)
  DefineStartLocation(3, -2560.0, -2368.0)

  InitCustomPlayerSlots()
  InitCustomTeams()
end

-- Map start.
function main()
  SetCameraBounds(
    -4608.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    -4608.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM),
    4608.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    4608.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    -4608.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    4608.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    4608.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    -4608.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM))
  SetDayNightModels(
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronTerrain\\DNCLordaeronTerrain.mdl",
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronUnit\\DNCLordaeronUnit.mdl")
  NewSoundEnvironment("Default")
  SetAmbientDaySound("NorthrendDay")
  SetAmbientNightSound("NorthrendNight")
  SetMapMusic("Music", true, 0)
  InitBlizzard()
  InitGlobals()

  for pid = 0, NUM_PLAYERS - 1 do
    testMode[pid] = false
    defeated[pid] = false
    earned[pid] = 0
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, START_GOLD)
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_LUMBER, START_LUMBER)
  end

  -- Preplaced units from units.json. build-map generates CreateAllUnits()
  -- into the packed script (war3mapUnits.doo is editor-only data — the game
  -- only spawns script-created units). FindFounders() below enumerates
  -- preplaced units, so it MUST run after this call.
  CreateAllUnits()

  InitTables()
  InitSounds()
  FindFounders()
  ApplyWolfPhase() -- wolves start docile (grace)
  RegisterConstructions()
  RegisterDeaths()
  RegisterMarket()
  RegisterLeavers()
  RegisterChatCommands()
  StartGrace()
  StartClock()
  After(1.0, function()
    CreateBoard()
    UpdateBoard()
  end)

  After(2.0, PlayIntro)
end
