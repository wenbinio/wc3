-- =========================================================================
-- Tidewatch Arena — war3map.lua
-- =========================================================================
-- 2-player arena skirmish on a frozen Northrend field. A raised circular
-- arena sits at the map center behind a water moat, reachable over four
-- ramp causeways. The Arena Champion (custom hero 'H000', neutral hostile)
-- holds the center: the player whose forces land the killing blow wins.
--
-- Data this script reaches into (kept in sync with the JSON):
--   units.json    — preplaced units; build-map appends a generated
--                   CreateAllUnits() which main() calls before
--                   FindChampion() enumerates the arena
--   regions.json  — gg_rct_* rects below use identical coordinates
--   cameras.json  — CAMERA_OVERLOOK mirrors the single w3c camera
--   objects-*.json— H000 Arena Champion (Hpal-based, boosted stats)
--
-- info.json has scriptLanguage = 1 (Lua); the game calls config() in the
-- lobby and main() on map start.
-- =========================================================================

local NUM_PLAYERS   = 2
local TAUNT_PERIOD  = 45.0   -- champion taunt timer
local ENTER_POLL    = 1.0    -- arena-entry announcement drain period

-- ------------------------------------------------- regions (= regions.json)
local gg_rct_ArenaCenter    = nil  -- { -768, -768,  768,  768}
local gg_rct_SpawnSouthwest = nil  -- {-2688,-2688,-1920,-1920}
local gg_rct_SpawnNortheast = nil  -- { 1920, 1920, 2688, 2688}

-- ------------------------------------------------- camera (= cameras.json)
local CAMERA_OVERLOOK = { x = 0, y = 0, rotation = 90, aoa = 320, distance = 3200, fov = 70 }

-- -------------------------------------------------------------- game state
local theChampion   = nil    -- the H000 hero once found
local gameOver      = false
local pendingEntries = {}    -- hero names queued by the enter-region trigger

-- ---------------------------------------------------------------- helpers

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

local function After(delay, fn)
  local t = CreateTimer()
  TimerStart(t, delay, false, function()
    DestroyTimer(t)
    fn()
  end)
end

-- ------------------------------------------------------------ map plumbing

local function InitRects()
  gg_rct_ArenaCenter    = Rect(-768.0, -768.0, 768.0, 768.0)
  gg_rct_SpawnSouthwest = Rect(-2688.0, -2688.0, -1920.0, -1920.0)
  gg_rct_SpawnNortheast = Rect(1920.0, 1920.0, 2688.0, 2688.0)
end

local function FindChampion()
  local g = CreateGroup()
  GroupEnumUnitsInRect(g, gg_rct_ArenaCenter, nil)
  local u = FirstOfGroup(g)
  while u ~= nil do
    if GetUnitTypeId(u) == FourCC("H000") then
      theChampion = u
    end
    GroupRemoveUnit(g, u)
    u = FirstOfGroup(g)
  end
  DestroyGroup(g)
end

-- --------------------------------------------------------- arena entrances
-- The enter-region trigger queues hero entries; a repeating timer drains
-- the queue and announces them (at most one line per poll tick).

local function RegisterArenaEntries()
  local region = CreateRegion()
  RegionAddRect(region, gg_rct_ArenaCenter)
  local trig = CreateTrigger()
  TriggerRegisterEnterRegion(trig, region, nil)
  TriggerAddAction(trig, function()
    local u = GetTriggerUnit()
    if u ~= nil and IsUnitType(u, UNIT_TYPE_HERO)
        and GetPlayerId(GetOwningPlayer(u)) < NUM_PLAYERS then
      pendingEntries[#pendingEntries + 1] =
        GetUnitName(u) .. " (" .. GetPlayerName(GetOwningPlayer(u)) .. ")"
    end
  end)

  local drain = CreateTimer()
  TimerStart(drain, ENTER_POLL, true, function()
    if gameOver or #pendingEntries == 0 then return end
    local who = table.remove(pendingEntries, 1)
    AnnounceTimedAll(6.0, "|cffffcc00" .. who .. " has entered the arena!|r")
  end)
end

-- --------------------------------------------------------- champion taunts

local function StartChampionTaunts()
  local t = CreateTimer()
  TimerStart(t, TAUNT_PERIOD, true, function()
    if gameOver then
      DestroyTimer(t)
      return
    end
    if theChampion ~= nil and GetUnitState(theChampion, UNIT_STATE_LIFE) > 0.405 then
      AnnounceTimedAll(6.0,
        "|cffaaddffMaera Tidewatcher still holds the arena. Breach the ramps and bring her down!|r")
    end
  end)
end

-- ----------------------------------------------------------------- victory

local function RegisterChampionDeath()
  if theChampion == nil then return end
  local trig = CreateTrigger()
  TriggerRegisterUnitEvent(trig, theChampion, EVENT_UNIT_DEATH)
  TriggerAddAction(trig, function()
    if gameOver then return end
    gameOver = true
    local killer = GetKillingUnit()
    local winnerId = -1
    if killer ~= nil then
      winnerId = GetPlayerId(GetOwningPlayer(killer))
    end
    if winnerId >= 0 and winnerId < NUM_PLAYERS then
      AnnounceAll("|cff88ff88The Arena Champion has fallen to "
        .. GetPlayerName(Player(winnerId)) .. "! The arena is claimed.|r")
      After(4.0, function()
        for i = 0, NUM_PLAYERS - 1 do
          if i == winnerId then
            CustomVictoryBJ(Player(i), true, true)
          else
            CustomDefeatBJ(Player(i), "Your rival claimed the arena.")
          end
        end
      end)
    else
      -- champion died to something unowned; call it a draw and end the game
      AnnounceAll("|cffffcc00The Arena Champion has fallen. The arena stands empty.|r")
      After(4.0, function()
        for i = 0, NUM_PLAYERS - 1 do
          CustomVictoryBJ(Player(i), true, true)
        end
      end)
    end
  end)
end

-- ------------------------------------------------------------------- intro

local function PlayIntro()
  AnnounceTimedAll(8.0,
    "|cffaaddffTidewatch Arena — a frozen ring behind a moat. The Arena Champion waits at its heart.|r")
  AnnounceTimedAll(12.0,
    "|cffffff66Build up, take a ramp, and slay Maera Tidewatcher. The killing blow decides the match.|r")
end

-- =========================================================== entry points

function InitGlobals()
end

-- Lobby configuration, kept in the exact shape World Editor generates for a
-- "Use Custom Forces" + "Fixed Player Settings" map (compare the genuine WE
-- Lua in wc3-ts-template): InitCustomPlayerSlots + InitCustomTeams, with
-- ForcePlayerStartLocation (start positions are fixed in info.json) and
-- SetPlayerRaceSelectable(false) (player settings are fixed).
--
-- CRITICAL invariant: every team index passed to SetPlayerTeam below MUST be
-- the index of a force in info.json's "forces" array. A team without a
-- matching w3i force (the pre-fix state: one force but SetPlayerTeam(...,1))
-- leaves the locked lobby with no valid slot arrangement and the multiplayer
-- "Create" button disabled.
function InitCustomPlayerSlots()
  -- Player 0: user, human, southwest
  SetPlayerStartLocation(Player(0), 0)
  ForcePlayerStartLocation(Player(0), 0)
  SetPlayerColor(Player(0), ConvertPlayerColor(0))
  SetPlayerRacePreference(Player(0), RACE_PREF_HUMAN)
  SetPlayerRaceSelectable(Player(0), false)
  SetPlayerController(Player(0), MAP_CONTROL_USER)

  -- Player 1: user, orc, northeast
  SetPlayerStartLocation(Player(1), 1)
  ForcePlayerStartLocation(Player(1), 1)
  SetPlayerColor(Player(1), ConvertPlayerColor(1))
  SetPlayerRacePreference(Player(1), RACE_PREF_ORC)
  SetPlayerRaceSelectable(Player(1), false)
  SetPlayerController(Player(1), MAP_CONTROL_USER)
end

function InitCustomTeams()
  -- Force: TRIGSTR_009 (South Rivals)
  SetPlayerTeam(Player(0), 0)
  -- Force: TRIGSTR_010 (North Rivals)
  SetPlayerTeam(Player(1), 1)
end

function config()
  SetMapName("TRIGSTR_001")
  SetMapDescription("TRIGSTR_002")
  SetPlayers(2)
  SetTeams(2)
  SetGamePlacement(MAP_PLACEMENT_USE_MAP_SETTINGS)

  DefineStartLocation(0, -2304.0, -2304.0)
  DefineStartLocation(1, 2304.0, 2304.0)

  InitCustomPlayerSlots()
  InitCustomTeams()
end

-- Map start.
function main()
  SetCameraBounds(
    -2560.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    -2560.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM),
    2560.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    2560.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    -2560.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    2560.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    2560.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    -2560.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM))
  SetDayNightModels(
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronTerrain\\DNCLordaeronTerrain.mdl",
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronUnit\\DNCLordaeronUnit.mdl")
  NewSoundEnvironment("Default")
  SetAmbientDaySound("NorthrendDay")
  SetAmbientNightSound("NorthrendNight")
  SetMapMusic("Music", true, 0)
  InitBlizzard()
  InitGlobals()

  -- Preplaced units from units.json. build-map generates CreateAllUnits()
  -- into the packed script (war3mapUnits.doo is editor-only data — the game
  -- only spawns script-created units). FindChampion() below enumerates
  -- preplaced units, so it MUST run after this call.
  CreateAllUnits()

  InitRects()
  FindChampion()
  RegisterChampionDeath()
  RegisterArenaEntries()
  StartChampionTaunts()

  After(2.0, PlayIntro)
end
