-- =========================================================================
-- Crossroads Siege — war3map.lua
-- =========================================================================
-- Wave-survival siege for 1-4 human defenders (players 0-3, allied) against
-- the Withering Legion (player 4, computer). Ten timed waves spawn at the
-- four gate regions and attack-move to the Crossroads Keep in the map
-- center. Defeat if the Keep (custom unit 'h001') dies; victory after the
-- wave-10 boss (custom unit 'u000') and every Legion unit is destroyed.
--
-- Data this script deliberately reaches into (kept in sync with the JSON):
--   units.json    — preplaced units; build-map appends a generated
--                   CreateAllUnits() which main() calls before FindKeep()/
--                   FindWardCrystals() enumerate those units
--   regions.json  — the gg_rct_* rects below use identical coordinates
--   cameras.json  — CAMERA_* tables mirror the three w3c cameras
--   sounds.json   — gg_snd_* sounds use the same built-in paths
--   doodads.json  — the Shortcut Grove trees (LTlt) are killed at wave 5
--   objects-*.json— h000/h001/u000/n000 custom units, I000/I001 items,
--                   A000 boss ability
--
-- info.json has scriptLanguage = 1 (Lua); the game calls config() in the
-- lobby and main() on map start.
-- =========================================================================

-- ------------------------------------------------------------------ tuning
local NUM_DEFENDERS   = 4
local LEGION          = 4          -- player slot of the hostile computer
local TOTAL_WAVES     = 10
local WAVE_FIRST_AT   = 60.0       -- seconds before wave 1
local WAVE_DOWNTIME   = 25.0       -- pause between a cleared wave and the next
local WAVE_POLL       = 2.0        -- how often we check for a cleared wave
local INCOME_PERIOD   = 32.0
local INCOME_BASE     = 40
local INCOME_PER_WAVE = 10
local CRYSTAL_PULSE   = 10.0       -- ward crystal heal pulse period
local CRYSTAL_HEAL    = 20.0
local BOUNTY_ON       = true

-- ------------------------------------------------- regions (= regions.json)
-- Rect(minX, minY, maxX, maxY); identical extents to war3map.w3r.
local gg_rct_SpawnNorth    = nil   -- {-384, 3264,  384, 3552}
local gg_rct_SpawnEast     = nil   -- {3264, -384, 3552,  384}
local gg_rct_SpawnSouth    = nil   -- {-384,-3552,  384,-3264}
local gg_rct_SpawnWest     = nil   -- {-3552,-384,-3264,  384}
local gg_rct_CenterKeep    = nil   -- {-320, -320,  320,  320}
local gg_rct_BossArena     = nil   -- {-1024,-1024,1024, 1024}
local gg_rct_ShortcutGrove = nil   -- {1280, 1280, 1920, 1920}
local gg_rct_PondMist      = nil   -- {1792,  768, 2560, 1536}

-- ------------------------------------------------- cameras (= cameras.json)
local CAMERA_NORTH_GATE = { x = 0, y = 3456, rotation = 270, aoa = 320, distance = 2600, fov = 70 }
local CAMERA_INTRO      = { x = 0, y = 0,    rotation = 90,  aoa = 335, distance = 4200, fov = 70 }
local CAMERA_KEEP       = { x = 0, y = -256, rotation = 90,  aoa = 310, distance = 2200, fov = 70 }

-- --------------------------------------------------- sounds (= sounds.json)
local gg_snd_WaveReward     = nil
local gg_snd_VictoryFanfare = nil

-- ------------------------------------------------------------ wave tables
-- Each wave: display name, unit composition {rawcode, count}, spawn gates.
-- Difficulty escalates by composition and by the per-wave count bonus.
local WAVES = {
  { name = "Ghoul Scavengers",    units = { { "ugho", 4 } },                              gates = { "N" } },
  { name = "Skeletal Vanguard",   units = { { "uske", 5 }, { "ugho", 2 } },               gates = { "N", "E" } },
  { name = "Necromantic Column",  units = { { "ugho", 6 }, { "unec", 2 } },               gates = { "E", "W" } },
  { name = "Gargoyle Flight",     units = { { "ugar", 6 } },                              gates = { "N", "S" } },
  { name = "Crypt Fiend Nest",    units = { { "ucry", 6 } },                              gates = { "E", "S" } },
  { name = "Abominable Press",    units = { { "uabo", 4 }, { "unec", 2 } },               gates = { "N", "W" } },
  { name = "Siege Cortege",       units = { { "umtw", 3 }, { "ugho", 6 } },               gates = { "S", "W" } },
  { name = "Frost Shadows",       units = { { "ufro", 2 }, { "ugar", 4 } },               gates = { "N", "E" } },
  { name = "The Full Assault",    units = { { "uabo", 4 }, { "ucry", 4 }, { "uske", 4 } }, gates = { "N", "E", "S", "W" } },
  { name = "The Dreadflesh Colossus", units = { { "u000", 1 }, { "uabo", 4 } },           gates = { "N" }, boss = true },
}

-- -------------------------------------------------------------- game state
local theKeep        = nil   -- the h001 Crossroads Keep unit
local theBoss        = nil   -- the u000 boss once spawned
local currentWave    = 0
local waveInFlight   = false
local gameOver       = false
local legionUnits    = nil   -- group of live Legion wave units
local spawnRects     = nil   -- gate letter -> rect
local wardCrystals   = {}    -- n000 units found on the plateau

-- ---------------------------------------------------------------- helpers

local function DefenderPlayers()
  local list = {}
  for i = 0, NUM_DEFENDERS - 1 do
    local p = Player(i)
    if GetPlayerSlotState(p) == PLAYER_SLOT_STATE_PLAYING
        and GetPlayerController(p) == MAP_CONTROL_USER then
      list[#list + 1] = p
    end
  end
  return list
end

local function AnnounceAll(msg)
  for i = 0, NUM_DEFENDERS - 1 do
    DisplayTextToPlayer(Player(i), 0, 0, msg)
  end
end

local function AnnounceTimedAll(dur, msg)
  for i = 0, NUM_DEFENDERS - 1 do
    DisplayTimedTextToPlayer(Player(i), 0, 0, dur, msg)
  end
end

local function RectCenter(r)
  return (GetRectMinX(r) + GetRectMaxX(r)) * 0.5,
         (GetRectMinY(r) + GetRectMaxY(r)) * 0.5
end

local function ApplyCameraForAll(cam, dur)
  for i = 0, NUM_DEFENDERS - 1 do
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
  for i = 0, NUM_DEFENDERS - 1 do
    local p = Player(i)
    if GetPlayerController(p) == MAP_CONTROL_USER then
      ResetToGameCameraForPlayer(p, dur)
      PanCameraToTimedForPlayer(p, GetStartLocationX(i), GetStartLocationY(i), dur)
    end
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
  gg_rct_SpawnNorth    = Rect(-384.0, 3264.0, 384.0, 3552.0)
  gg_rct_SpawnEast     = Rect(3264.0, -384.0, 3552.0, 384.0)
  gg_rct_SpawnSouth    = Rect(-384.0, -3552.0, 384.0, -3264.0)
  gg_rct_SpawnWest     = Rect(-3552.0, -384.0, -3264.0, 384.0)
  gg_rct_CenterKeep    = Rect(-320.0, -320.0, 320.0, 320.0)
  gg_rct_BossArena     = Rect(-1024.0, -1024.0, 1024.0, 1024.0)
  gg_rct_ShortcutGrove = Rect(1280.0, 1280.0, 1920.0, 1920.0)
  gg_rct_PondMist      = Rect(1792.0, 768.0, 2560.0, 1536.0)
  spawnRects = {
    N = gg_rct_SpawnNorth,
    E = gg_rct_SpawnEast,
    S = gg_rct_SpawnSouth,
    W = gg_rct_SpawnWest,
  }
end

local function InitSounds()
  -- same built-in files that sounds.json (war3map.w3s) declares
  gg_snd_WaveReward = CreateSound(
    "Abilities\\Spells\\Items\\AIam\\Tomes.flac", false, false, false, 10, 10, "SpellsEAX")
  SetSoundVolume(gg_snd_WaveReward, 127)
  gg_snd_VictoryFanfare = CreateSound(
    "Sound\\Music\\mp3Music\\Comradeship.flac", false, false, false, 10, 10, "DefaultEAXON")
  SetSoundVolume(gg_snd_VictoryFanfare, 110)
end

local function InitAlliances()
  -- defenders are one team; the Legion hates everyone
  for i = 0, NUM_DEFENDERS - 1 do
    for j = 0, NUM_DEFENDERS - 1 do
      if i ~= j then
        SetPlayerAlliance(Player(i), Player(j), ALLIANCE_PASSIVE, true)
        SetPlayerAlliance(Player(i), Player(j), ALLIANCE_SHARED_VISION, true)
      end
    end
    SetPlayerAlliance(Player(i), Player(LEGION), ALLIANCE_PASSIVE, false)
    SetPlayerAlliance(Player(LEGION), Player(i), ALLIANCE_PASSIVE, false)
  end
  if BOUNTY_ON then
    SetPlayerState(Player(LEGION), PLAYER_STATE_GIVES_BOUNTY, 1)
  end
end

local function FindKeep()
  local g = CreateGroup()
  GroupEnumUnitsInRect(g, gg_rct_CenterKeep, nil)
  local u = FirstOfGroup(g)
  while u ~= nil do
    if GetUnitTypeId(u) == FourCC("h001") then
      theKeep = u
    end
    GroupRemoveUnit(g, u)
    u = FirstOfGroup(g)
  end
  DestroyGroup(g)
end

local function FindWardCrystals()
  local g = CreateGroup()
  GroupEnumUnitsInRect(g, gg_rct_BossArena, nil)
  local u = FirstOfGroup(g)
  while u ~= nil do
    if GetUnitTypeId(u) == FourCC("n000") then
      wardCrystals[#wardCrystals + 1] = u
    end
    GroupRemoveUnit(g, u)
    u = FirstOfGroup(g)
  end
  DestroyGroup(g)
end

-- The ward crystals (custom n000 units with the imported SiegeCrystal.mdx
-- model) pulse a small heal to nearby defender units.
local function StartCrystalPulse()
  local t = CreateTimer()
  TimerStart(t, CRYSTAL_PULSE, true, function()
    if gameOver then return end
    for _, c in ipairs(wardCrystals) do
      if GetUnitState(c, UNIT_STATE_LIFE) > 0.405 then
        local g = CreateGroup()
        GroupEnumUnitsInRange(g, GetUnitX(c), GetUnitY(c), 512.0, nil)
        local u = FirstOfGroup(g)
        while u ~= nil do
          if GetPlayerId(GetOwningPlayer(u)) < NUM_DEFENDERS
              and GetUnitState(u, UNIT_STATE_LIFE) > 0.405 then
            SetUnitState(u, UNIT_STATE_LIFE,
              math.min(GetUnitState(u, UNIT_STATE_LIFE) + CRYSTAL_HEAL,
                       GetUnitState(u, UNIT_STATE_MAX_LIFE)))
          end
          GroupRemoveUnit(g, u)
          u = FirstOfGroup(g)
        end
        DestroyGroup(g)
      end
    end
  end)
end

-- ------------------------------------------------------------ income/bounty

local function StartIncome()
  local t = CreateTimer()
  TimerStart(t, INCOME_PERIOD, true, function()
    if gameOver then return end
    local amount = INCOME_BASE + INCOME_PER_WAVE * currentWave
    for _, p in ipairs(DefenderPlayers()) do
      SetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD,
        GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) + amount)
      DisplayTimedTextToPlayer(p, 0, 0, 4.0,
        "|cffffcc00+" .. amount .. " gold|r war chest stipend.")
    end
  end)
end

-- ------------------------------------------------------------------- waves

local function SpawnWaveUnit(rawcode, x, y)
  local u = CreateUnit(Player(LEGION), FourCC(rawcode), x, y, 270.0)
  GroupAddUnit(legionUnits, u)
  -- march on the Keep
  IssuePointOrder(u, "attack", 0.0, 0.0)
  return u
end

local function RegisterBossDeath(boss)
  local trig = CreateTrigger()
  TriggerRegisterUnitEvent(trig, boss, EVENT_UNIT_DEATH)
  TriggerAddAction(trig, function()
    -- boss loot: the custom items from objects-items.json
    local x, y = GetUnitX(boss), GetUnitY(boss)
    CreateItem(FourCC("I000"), x - 64.0, y)
    CreateItem(FourCC("I001"), x + 64.0, y)
    AnnounceAll("|cff88ff88The Dreadflesh Colossus is destroyed! It drops the Blade of the Crossroads.|r")
  end)
end

-- escalate: +1 extra unit of the first listed type per two elapsed waves
local function WaveCountBonus(waveIndex)
  return math.floor((waveIndex - 1) // 2)
end

local function SpawnWave(waveIndex)
  local wave = WAVES[waveIndex]
  if wave == nil or gameOver then return end
  waveInFlight = true

  AnnounceTimedAll(8.0, "|cffff6666Wave " .. waveIndex .. "/" .. TOTAL_WAVES
    .. " — " .. wave.name .. "!|r The Legion pours through the gates.")

  for gi, gate in ipairs(wave.gates) do
    local rectG = spawnRects[gate]
    local cx, cy = RectCenter(rectG)
    for ui, entry in ipairs(wave.units) do
      local rawcode, count = entry[1], entry[2]
      if ui == 1 then count = count + WaveCountBonus(waveIndex) end
      for n = 1, count do
        local ox = cx + 96.0 * math.cos(n * 0.9 + ui)
        local oy = cy + 96.0 * math.sin(n * 0.9 + gi)
        local u = SpawnWaveUnit(rawcode, ox, oy)
        if wave.boss and rawcode == "u000" then
          theBoss = u
          RegisterBossDeath(u)
        end
      end
    end
  end

  if wave.boss then
    AnnounceTimedAll(10.0, "|cffff2222BOSS WAVE!|r The Dreadflesh Colossus lumbers toward the Keep. Meet it in the arena!")
    ApplyCameraForAll(CAMERA_NORTH_GATE, 1.5)
    After(4.0, function() ResetCameraForAll(1.0) end)
  end

  -- wave 5: the Legion burns down the Shortcut Grove (doodads.json trees),
  -- opening the northeast shortcut for the rest of the game
  if waveIndex == 5 then
    EnumDestructablesInRect(gg_rct_ShortcutGrove, nil, function()
      KillDestructable(GetEnumDestructable())
    end)
    AnnounceTimedAll(8.0, "|cffffaa33The Legion burns the Shortcut Grove — the northeast path lies open!|r")
  end
end

local function LiveLegionCount()
  local count = 0
  local g = CreateGroup()
  GroupEnumUnitsOfPlayer(g, Player(LEGION), nil)
  local u = FirstOfGroup(g)
  while u ~= nil do
    if GetUnitState(u, UNIT_STATE_LIFE) > 0.405 then
      count = count + 1
    end
    GroupRemoveUnit(g, u)
    u = FirstOfGroup(g)
  end
  DestroyGroup(g)
  return count
end

local function OnVictory()
  if gameOver then return end
  gameOver = true
  StartSound(gg_snd_VictoryFanfare)
  AnnounceAll("|cff88ff88The Withering Legion is broken. The Crossroads hold!|r")
  After(5.0, function()
    for _, p in ipairs(DefenderPlayers()) do
      CustomVictoryBJ(p, true, true)
    end
  end)
end

local function OnWaveCleared(waveIndex)
  waveInFlight = false
  StartSound(gg_snd_WaveReward)
  -- clear bonus scales with the wave number
  local bonus = 75 + 25 * waveIndex
  for _, p in ipairs(DefenderPlayers()) do
    SetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD,
      GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) + bonus)
  end
  if waveIndex >= TOTAL_WAVES then
    OnVictory()
    return
  end
  AnnounceTimedAll(8.0, "|cff88ccffWave " .. waveIndex .. " cleared!|r +" .. bonus
    .. " gold. Next wave in " .. math.floor(WAVE_DOWNTIME) .. " seconds.")
end

local function StartWaveEngine()
  legionUnits = CreateGroup()
  local poll = CreateTimer()
  local downtime = 0.0
  local started = false

  After(WAVE_FIRST_AT - 15.0, function()
    if not gameOver then
      AnnounceTimedAll(8.0, "|cffffff66The ground shakes... the first wave arrives in 15 seconds!|r")
    end
  end)
  After(WAVE_FIRST_AT, function()
    if gameOver then return end
    started = true
    currentWave = 1
    SpawnWave(currentWave)
  end)

  TimerStart(poll, WAVE_POLL, true, function()
    if gameOver or not started then return end
    if waveInFlight then
      if LiveLegionCount() == 0 then
        OnWaveCleared(currentWave)
        downtime = 0.0
      end
    elseif currentWave < TOTAL_WAVES then
      downtime = downtime + WAVE_POLL
      if downtime >= WAVE_DOWNTIME then
        downtime = 0.0
        currentWave = currentWave + 1
        SpawnWave(currentWave)
      end
    end
  end)
end

-- ------------------------------------------------------------------ defeat

local function RegisterKeepDeath()
  if theKeep == nil then return end
  local trig = CreateTrigger()
  TriggerRegisterUnitEvent(trig, theKeep, EVENT_UNIT_DEATH)
  TriggerAddAction(trig, function()
    if gameOver then return end
    gameOver = true
    AnnounceAll("|cffff4444The Crossroads Keep has fallen. The heartlands are lost...|r")
    ApplyCameraForAll(CAMERA_KEEP, 1.0)
    After(5.0, function()
      for _, p in ipairs(DefenderPlayers()) do
        CustomDefeatBJ(p, "The Keep has fallen.")
      end
    end)
  end)
end

-- ------------------------------------------------------------------- intro

-- Simple scripted camera pan over the three w3c cameras, then hand control
-- back to the players.
local function PlayIntro()
  ApplyCameraForAll(CAMERA_INTRO, 0.0)
  AnnounceTimedAll(6.0, "|cffaaddffThe crossroads. Four roads, four gates — and one keep between the Legion and home.|r")
  After(3.5, function()
    if gameOver then return end
    ApplyCameraForAll(CAMERA_NORTH_GATE, 2.5)
    AnnounceTimedAll(5.0, "|cffaaddffThe blighted north gate: the Legion masses beyond it.|r")
  end)
  After(7.0, function()
    if gameOver then return end
    ApplyCameraForAll(CAMERA_KEEP, 2.5)
    AnnounceTimedAll(5.0, "|cffaaddffProtect the Crossroads Keep. If it falls, all falls.|r")
  end)
  After(10.5, function()
    if gameOver then return end
    ResetCameraForAll(1.5)
    AnnounceTimedAll(8.0, "|cffffff66Build your defenses — the first wave comes in "
      .. math.floor(WAVE_FIRST_AT) .. " seconds. The ward crystals mend nearby troops.|r")
  end)
end

-- --------------------------------------------------------------- ambiance

local function StartPondMist()
  -- match regions.json: PondMist declares the RLlr (rain) weather effect
  local weather = AddWeatherEffect(gg_rct_PondMist, FourCC("RLlr"))
  EnableWeatherEffect(weather, true)
end

-- =========================================================== entry points

function InitGlobals()
end

-- Lobby configuration. Must stay consistent with info.json (players/forces)
-- and the five 'sloc' start locations in units.json.
function config()
  SetMapName("TRIGSTR_001")
  SetMapDescription("TRIGSTR_002")
  SetPlayers(5)
  SetTeams(2)
  SetGamePlacement(MAP_PLACEMENT_USE_MAP_SETTINGS)

  DefineStartLocation(0, -2432.0, -2432.0)
  DefineStartLocation(1, -2432.0, 2432.0)
  DefineStartLocation(2, 2432.0, 2432.0)
  DefineStartLocation(3, 2432.0, -2432.0)
  DefineStartLocation(4, 0.0, 3456.0)

  -- defenders: user-controlled humans
  for i = 0, NUM_DEFENDERS - 1 do
    SetPlayerStartLocation(Player(i), i)
    SetPlayerColor(Player(i), ConvertPlayerColor(i))
    SetPlayerRacePreference(Player(i), RACE_PREF_HUMAN)
    SetPlayerRaceSelectable(Player(i), false)
    SetPlayerController(Player(i), MAP_CONTROL_USER)
    SetPlayerTeam(Player(i), 0)
  end

  -- the Withering Legion: hostile computer
  SetPlayerStartLocation(Player(LEGION), LEGION)
  SetPlayerColor(Player(LEGION), ConvertPlayerColor(LEGION))
  SetPlayerRacePreference(Player(LEGION), RACE_PREF_UNDEAD)
  SetPlayerRaceSelectable(Player(LEGION), false)
  SetPlayerController(Player(LEGION), MAP_CONTROL_COMPUTER)
  SetPlayerTeam(Player(LEGION), 1)
end

-- Map start.
function main()
  SetCameraBounds(
    -3584.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    -3584.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM),
    3584.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    3584.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    -3584.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    3584.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    3584.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    -3584.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM))
  SetDayNightModels(
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronTerrain\\DNCLordaeronTerrain.mdl",
    "Environment\\DNC\\DNCLordaeron\\DNCLordaeronUnit\\DNCLordaeronUnit.mdl")
  NewSoundEnvironment("Default")
  SetAmbientDaySound("LordaeronSummerDay")
  SetAmbientNightSound("LordaeronSummerNight")
  SetMapMusic("Music", true, 0)
  InitBlizzard()
  InitGlobals()

  -- Preplaced units from units.json. build-map generates CreateAllUnits()
  -- into the packed script (war3mapUnits.doo is editor-only data — the game
  -- only spawns script-created units). Everything below that enumerates
  -- preplaced units (FindKeep, FindWardCrystals) MUST run after this call.
  CreateAllUnits()

  InitRects()
  InitSounds()
  InitAlliances()
  FindKeep()
  FindWardCrystals()
  RegisterKeepDeath()
  StartPondMist()
  StartCrystalPulse()
  StartIncome()
  StartWaveEngine()

  -- short scripted intro once loading settles
  After(1.0, PlayIntro)
end
