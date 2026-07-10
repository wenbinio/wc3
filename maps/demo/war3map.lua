-- Toolkit Demo Map — war3map.lua
-- Minimal Lua map script (info.json has scriptLanguage = 1 for Lua).
-- WC3 calls config() in the lobby and main() when the map starts.

function InitGlobals()
end

-- Lobby / game configuration. Must match info.json players and the two
-- 'sloc' start locations in units.json (start location index = playerNum).
function config()
    SetMapName("Toolkit Demo Map")
    SetMapDescription("A minimal 2-player map built headlessly with wc3-map-toolkit.")
    SetPlayers(2)
    SetTeams(2)
    SetGamePlacement(MAP_PLACEMENT_USE_MAP_SETTINGS)

    DefineStartLocation(0, -1536.0, -1536.0)
    DefineStartLocation(1, 1536.0, 1536.0)

    -- Player 0: user, human
    SetPlayerStartLocation(Player(0), 0)
    SetPlayerColor(Player(0), ConvertPlayerColor(0))
    SetPlayerRacePreference(Player(0), RACE_PREF_HUMAN)
    SetPlayerRaceSelectable(Player(0), true)
    SetPlayerController(Player(0), MAP_CONTROL_USER)

    -- Player 1: user, orc
    SetPlayerStartLocation(Player(1), 1)
    SetPlayerColor(Player(1), ConvertPlayerColor(1))
    SetPlayerRacePreference(Player(1), RACE_PREF_ORC)
    SetPlayerRaceSelectable(Player(1), true)
    SetPlayerController(Player(1), MAP_CONTROL_USER)

    SetPlayerTeam(Player(0), 0)
    SetPlayerTeam(Player(1), 1)
end

-- Map initialization.
function main()
    SetCameraBounds(
        -1280.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
        -1536.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM),
        1280.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
        1024.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
        -1280.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
        1024.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
        1280.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
        -1536.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM))
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
    -- into the packed script (war3mapUnits.doo is editor-only data — the
    -- game only spawns script-created units).
    CreateAllUnits()

    -- Demo payload: greet and spawn one EXTRA footman at map center after 2s
    -- (on top of the units.json starting units created above).
    local t = CreateTimer()
    TimerStart(t, 2.00, false, function()
        print("Hello from the wc3-map-toolkit demo map!")
        CreateUnit(Player(0), FourCC("hfoo"), 0.0, 0.0, 270.0)
        DestroyTimer(t)
    end)
end
