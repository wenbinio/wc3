-- =========================================================================
-- Northreach Founders — war3map.lua
-- =========================================================================
-- 4-player colonization race on a cold Northrend coast, inspired by
-- "Founders of the North" by ShadeGabriel/Sifonseal (Hive Workshop) --
-- design inspiration only, no assets or code taken.
--
-- Each captain lands on the coast with a capital, workers, a hero Captain
-- and a Longship, then races to FOUND SETTLEMENTS: build a Town Hall
-- inside one of the six waystone expansion sites. Owned settlements pay
-- periodic income; creep warbands raid the colonies as the game goes on.
-- Victory: first charter to hold SETTLEMENTS_TO_WIN settlements, or the
-- last capital left standing.
--
-- Data this script reaches into (kept in sync with the JSON):
--   units.json    — preplaced units; build-map appends a generated
--                   CreateAllUnits() which main() calls before
--                   FindCapitals() enumerates the starting bases
--   regions.json  — the site/raid rects below use identical coordinates
--   cameras.json  — CAMERA_* tables mirror the two w3c cameras
--   sounds.json   — gg_snd_* sounds use the same built-in paths
--   objects-*.json— H000 Captain, h001 Longship, h003 Capital,
--                   n000 Settlement Banner, n001 Waystone Cairn
--
-- '-test' debug mode (per player): type -test to toggle, then
--   -gold N, -found, -income, -raid, -reveal, -victory, -ff
-- and -help (always available) prints the command table.
--
-- info.json has scriptLanguage = 1 (Lua); the game calls config() in the
-- lobby and main() on map start.
-- =========================================================================

-- ------------------------------------------------------------------ tuning
local NUM_PLAYERS        = 4
local SETTLEMENTS_TO_WIN = 4
local INCOME_PERIOD      = 30.0   -- seconds between income ticks
local INCOME_CAPITAL     = 40     -- gold per tick for a standing capital
local INCOME_SETTLEMENT  = 30     -- gold per tick per owned settlement
local RAID_FIRST_AT      = 240.0  -- seconds before the first raid
local RAID_PERIOD        = 180.0  -- seconds between raids
local FF_SCALE           = 4      -- -ff clock multiplier

-- ------------------------------------------- expansion sites (= regions.json)
-- 768x768 claim boxes centered on the waystone/gold-mine sites.
local SITES = {
  { name = "Midlands",   x = -640,  y = 128 },
  { name = "Northwood",  x = -2816, y = 3648 },
  { name = "Northgate",  x = 256,   y = 3904 },
  { name = "Eastmark",   x = 3968,  y = -256 },
  { name = "Fjordmouth", x = 1664,  y = -1664 },
  { name = "Highcairn",  x = 2048,  y = 1792 },
}
local SITE_HALF = 384

-- raid spawn points (= regions.json)
local RAID_SPAWNS = {
  { name = "RaidNorthPass", x = -768,  y = 4736 },
  { name = "RaidEastShore", x = 4736,  y = -640 },
}

-- ------------------------------------------------- cameras (= cameras.json)
local CAMERA_INTRO = { x = -1200, y = -1800, rotation = 90,  aoa = 330, distance = 4800, fov = 70 }
local CAMERA_FJORD = { x = 0,     y = -1600, rotation = 120, aoa = 315, distance = 3600, fov = 70 }

-- --------------------------------------------------- sounds (= sounds.json)
local gg_snd_FoundChime  = nil
local gg_snd_VictoryHorn = nil

-- -------------------------------------------------------------- game state
local capitals    = {}    -- pid -> h003 capital unit (nil once fallen)
local testMode    = {}    -- pid -> bool, '-test' debug toggle
local clockScale  = 1     -- -ff sets FF_SCALE
local incomeLeft  = INCOME_PERIOD
local raidLeft    = RAID_FIRST_AT
local raidLevel   = 0
local board       = nil   -- the Founders Score multiboard
local gameOver    = false

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
      PanCameraToTimedForPlayer(p, GetStartLocationX(i), GetStartLocationY(i), dur)
    end
  end
end

local function SettlementCount(pid)
  local n = 0
  for _, s in ipairs(SITES) do
    if s.owner == pid then n = n + 1 end
  end
  return n
end

-- ------------------------------------------------------------ map plumbing

local function InitRects()
  for _, s in ipairs(SITES) do
    s.rect = Rect(s.x - SITE_HALF, s.y - SITE_HALF, s.x + SITE_HALF, s.y + SITE_HALF)
    s.owner = nil
    s.hall = nil
    s.banner = nil
  end
  for _, r in ipairs(RAID_SPAWNS) do
    r.rect = Rect(r.x - 256.0, r.y - 256.0, r.x + 256.0, r.y + 256.0)
  end
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

local function FindCapitals()
  for pid = 0, NUM_PLAYERS - 1 do
    local g = CreateGroup()
    GroupEnumUnitsOfPlayer(g, Player(pid), nil)
    local u = FirstOfGroup(g)
    while u ~= nil do
      if GetUnitTypeId(u) == FourCC("h003") then
        capitals[pid] = u
      end
      GroupRemoveUnit(g, u)
      u = FirstOfGroup(g)
    end
    DestroyGroup(g)
  end
end

-- ----------------------------------------------------------- founders score

local function CreateBoard()
  board = CreateMultiboard()
  MultiboardSetTitleText(board, "Founders Score (first to " .. SETTLEMENTS_TO_WIN .. ")")
  MultiboardSetRowCount(board, NUM_PLAYERS)
  MultiboardSetColumnCount(board, 2)
  for r = 0, NUM_PLAYERS - 1 do
    for c = 0, 1 do
      local item = MultiboardGetItem(board, r, c)
      MultiboardSetItemStyle(item, true, false)
      MultiboardSetItemWidth(item, c == 0 and 0.14 or 0.05)
      MultiboardReleaseItem(item)
    end
  end
  MultiboardDisplay(board, true)
end

local function UpdateBoard()
  if board == nil then return end
  for pid = 0, NUM_PLAYERS - 1 do
    local nameItem = MultiboardGetItem(board, pid, 0)
    local countItem = MultiboardGetItem(board, pid, 1)
    local tag = GetPlayerName(Player(pid))
    if capitals[pid] == nil then tag = tag .. " (fallen)" end
    MultiboardSetItemValue(nameItem, tag)
    MultiboardSetItemValue(countItem, tostring(SettlementCount(pid)))
    MultiboardReleaseItem(nameItem)
    MultiboardReleaseItem(countItem)
  end
end

-- ----------------------------------------------------------------- victory

local function Victory(pid, reason)
  if gameOver then return end
  gameOver = true
  StartSound(gg_snd_VictoryHorn)
  AnnounceAll("|cff88ff88" .. GetPlayerName(Player(pid)) .. " claims the North -- " .. reason .. "|r")
  ApplyCameraForAll(CAMERA_FJORD, 2.0)
  After(5.0, function()
    for i = 0, NUM_PLAYERS - 1 do
      if PlayingUser(i) then
        if i == pid then
          CustomVictoryBJ(Player(i), true, true)
        else
          CustomDefeatBJ(Player(i), "A rival charter has claimed the North.")
        end
      end
    end
  end)
end

local function CheckSettlementVictory(pid)
  if SettlementCount(pid) >= SETTLEMENTS_TO_WIN then
    Victory(pid, "first charter to hold " .. SETTLEMENTS_TO_WIN .. " settlements!")
  end
end

local function CheckLastCapital()
  local aliveCount = 0
  local lastPid = -1
  for pid = 0, NUM_PLAYERS - 1 do
    if PlayingUser(pid) and capitals[pid] ~= nil then
      aliveCount = aliveCount + 1
      lastPid = pid
    end
  end
  if aliveCount == 1 then
    Victory(lastPid, "the last capital standing!")
  end
end

-- ------------------------------------------------------------- settlements

local function FoundSettlement(pid, site, hall)
  site.owner = pid
  site.hall = hall
  site.banner = CreateUnit(Player(pid), FourCC("n000"), site.x + 288.0, site.y + 288.0, 270.0)
  StartSound(gg_snd_FoundChime)
  local n = SettlementCount(pid)
  AnnounceTimedAll(10.0, "|cffffcc00" .. GetPlayerName(Player(pid))
    .. " has founded a settlement at " .. site.name .. "!|r ("
    .. n .. "/" .. SETTLEMENTS_TO_WIN .. ")")
  UpdateBoard()
  CheckSettlementVictory(pid)
end

local function LoseSettlement(site)
  local pid = site.owner
  site.owner = nil
  site.hall = nil
  if site.banner ~= nil then
    KillUnit(site.banner)
    site.banner = nil
  end
  if pid ~= nil then
    AnnounceTimedAll(10.0, "|cffff6666The settlement at " .. site.name
      .. " (" .. GetPlayerName(Player(pid)) .. ") has been razed!|r")
  end
  UpdateBoard()
end

local function RegisterConstructions()
  local trig = CreateTrigger()
  for pid = 0, NUM_PLAYERS - 1 do
    TriggerRegisterPlayerUnitEvent(trig, Player(pid), EVENT_PLAYER_UNIT_CONSTRUCT_FINISH, nil)
  end
  TriggerAddAction(trig, function()
    if gameOver then return end
    local hall = GetConstructedStructure()
    if hall == nil or GetUnitTypeId(hall) ~= FourCC("htow") then return end
    local pid = GetPlayerId(GetOwningPlayer(hall))
    if pid >= NUM_PLAYERS then return end
    local x, y = GetUnitX(hall), GetUnitY(hall)
    for _, s in ipairs(SITES) do
      if s.owner == nil and x >= s.x - SITE_HALF and x <= s.x + SITE_HALF
          and y >= s.y - SITE_HALF and y <= s.y + SITE_HALF then
        FoundSettlement(pid, s, hall)
        return
      end
    end
    Tell(pid, "|cffaaaaaaThat hall stands outside every waystone site -- it earns no charter income.|r")
  end)
end

local function RegisterDeaths()
  local trig = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(trig, EVENT_PLAYER_UNIT_DEATH)
  TriggerAddAction(trig, function()
    if gameOver then return end
    local u = GetTriggerUnit()
    for _, s in ipairs(SITES) do
      if u == s.hall then
        LoseSettlement(s)
        return
      end
    end
    for pid = 0, NUM_PLAYERS - 1 do
      if u == capitals[pid] then
        capitals[pid] = nil
        AnnounceAll("|cffff4444The capital of " .. GetPlayerName(Player(pid))
          .. " has fallen! The charter is broken.|r")
        UpdateBoard()
        if PlayingUser(pid) then
          After(2.0, function()
            if not gameOver then
              CustomDefeatBJ(Player(pid), "Your capital has fallen.")
            end
          end)
        end
        CheckLastCapital()
        return
      end
    end
  end)
end

-- ------------------------------------------------------------------ income

local function DoIncomeTick()
  for pid = 0, NUM_PLAYERS - 1 do
    if PlayingUser(pid) and capitals[pid] ~= nil then
      local n = SettlementCount(pid)
      local amount = INCOME_CAPITAL + INCOME_SETTLEMENT * n
      SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD,
        GetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD) + amount)
      Tell(pid, "|cffffcc00+" .. amount .. " gold|r charter income ("
        .. n .. " settlement" .. (n == 1 and "" or "s") .. " + capital).")
    end
  end
end

-- ------------------------------------------------------------------- raids

local function RaidComposition(level)
  local comp = { { "nftr", 2 + level } }
  if level >= 2 then comp[#comp + 1] = { "nftb", 1 + (level // 2) } end
  if level >= 3 then comp[#comp + 1] = { "nogr", level - 2 } end
  if level >= 5 then comp[#comp + 1] = { "nogm", 1 } end
  return comp
end

local function LaunchRaid()
  raidLevel = raidLevel + 1

  -- target: a random owned settlement, else a random standing capital
  local targets = {}
  for _, s in ipairs(SITES) do
    if s.owner ~= nil and s.hall ~= nil then
      targets[#targets + 1] = { x = s.x, y = s.y, label = s.name }
    end
  end
  if #targets == 0 then
    for pid = 0, NUM_PLAYERS - 1 do
      if capitals[pid] ~= nil and PlayingUser(pid) then
        targets[#targets + 1] = {
          x = GetUnitX(capitals[pid]), y = GetUnitY(capitals[pid]),
          label = GetPlayerName(Player(pid)) .. "'s landing",
        }
      end
    end
  end
  if #targets == 0 then return end
  local target = targets[GetRandomInt(1, #targets)]
  local spawn = RAID_SPAWNS[GetRandomInt(1, #RAID_SPAWNS)]

  for _, entry in ipairs(RaidComposition(raidLevel)) do
    local code, count = entry[1], entry[2]
    for n = 1, count do
      local ox = spawn.x + 128.0 * math.cos(n * 1.1)
      local oy = spawn.y + 128.0 * math.sin(n * 1.1)
      local u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), FourCC(code), ox, oy, 270.0)
      IssuePointOrder(u, "attack", target.x, target.y)
    end
  end
  AnnounceTimedAll(10.0, "|cffff9966A wild warband (strength " .. raidLevel
    .. ") descends from " .. spawn.name .. " toward " .. target.label .. "!|r")
end

-- ------------------------------------------------------------ master clock
-- One repeating 1-second timer drives income and raids so that '-ff' can
-- scale everything in one place.

local function StartClock()
  local t = CreateTimer()
  TimerStart(t, 1.0, true, function()
    if gameOver then return end
    incomeLeft = incomeLeft - clockScale
    if incomeLeft <= 0 then
      incomeLeft = INCOME_PERIOD
      DoIncomeTick()
    end
    raidLeft = raidLeft - clockScale
    if raidLeft <= 0 then
      raidLeft = RAID_PERIOD
      LaunchRaid()
    end
  end)
end

-- --------------------------------------------------------- '-test' commands

local function TestFound(pid)
  -- claim the nearest unclaimed site outright
  local cx, cy = GetStartLocationX(pid), GetStartLocationY(pid)
  if capitals[pid] ~= nil then
    cx, cy = GetUnitX(capitals[pid]), GetUnitY(capitals[pid])
  end
  local best, bestD = nil, nil
  for _, s in ipairs(SITES) do
    if s.owner == nil then
      local d = (s.x - cx) * (s.x - cx) + (s.y - cy) * (s.y - cy)
      if bestD == nil or d < bestD then
        best, bestD = s, d
      end
    end
  end
  if best == nil then
    Tell(pid, "|cffaaaaaaNo unclaimed sites remain.|r")
    return
  end
  local hall = CreateUnit(Player(pid), FourCC("htow"), best.x, best.y, 270.0)
  FoundSettlement(pid, best, hall)
end

local function ShowHelp(pid)
  Tell(pid, "|cffaaddffNorthreach commands:|r")
  Tell(pid, "-help : this list. -test : toggle debug mode (required for the rest).")
  Tell(pid, "-gold N : set gold to N. -found : claim the nearest open site instantly.")
  Tell(pid, "-income : force an income tick. -raid : launch a creep raid now.")
  Tell(pid, "-reveal : reveal the map. -victory : run the victory sequence.")
  Tell(pid, "-ff : toggle " .. FF_SCALE .. "x speed on the income/raid clock.")
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
  if msg == "-test" then
    testMode[pid] = not testMode[pid]
    if testMode[pid] then
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid))
        .. " enabled -test debug mode.|r Commands: -gold N, -found, -income, -raid, -reveal, -victory, -ff")
    else
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid)) .. " disabled -test debug mode.|r")
    end
    return
  end

  local goldArg = string.match(msg, "^%-gold%s+(%d+)$")
  local known = goldArg ~= nil or msg == "-found" or msg == "-income" or msg == "-raid"
    or msg == "-reveal" or msg == "-victory" or msg == "-ff"
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
  elseif msg == "-income" then
    Tell(pid, "|cffff88ffForcing an income tick.|r")
    DoIncomeTick()
    incomeLeft = INCOME_PERIOD
  elseif msg == "-raid" then
    Tell(pid, "|cffff88ffLaunching a raid now.|r")
    LaunchRaid()
    raidLeft = RAID_PERIOD
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
    AnnounceAll("|cffff88ffClock speed is now " .. clockScale .. "x (income/raid timers).|r")
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
  AnnounceTimedAll(7.0, "|cffaaddffNorthreach. A cold sea, six old waystone sites -- and four charters racing to claim them.|r")
  After(3.5, function()
    if gameOver then return end
    ApplyCameraForAll(CAMERA_FJORD, 2.5)
    AnnounceTimedAll(6.0, "|cffaaddffBuild a Town Hall inside a waystone site to found a settlement. Settlements pay income -- and draw raids.|r")
  end)
  After(7.5, function()
    if gameOver then return end
    ResetCameraForAll(1.5)
    AnnounceTimedAll(10.0, "|cffffff66First to hold " .. SETTLEMENTS_TO_WIN
      .. " settlements wins; lose your capital and you are out. Type -help for commands.|r")
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

  DefineStartLocation(0, -2624.0, -2624.0)
  DefineStartLocation(1, 1280.0, -2688.0)
  DefineStartLocation(2, -2688.0, 2176.0)
  DefineStartLocation(3, 3712.0, -2432.0)

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
  end

  -- Preplaced units from units.json. build-map generates CreateAllUnits()
  -- into the packed script (war3mapUnits.doo is editor-only data — the game
  -- only spawns script-created units). FindCapitals() below enumerates
  -- preplaced units, so it MUST run after this call.
  CreateAllUnits()

  InitRects()
  InitSounds()
  FindCapitals()
  RegisterConstructions()
  RegisterDeaths()
  RegisterChatCommands()
  StartClock()
  After(1.0, function()
    CreateBoard()
    UpdateBoard()
  end)

  After(2.0, PlayIntro)
end
