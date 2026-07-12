-- =========================================================================
-- Coinstead — war3map.lua (phase 1: the complete core game)
-- =========================================================================
-- A 1-4 player co-op economy-defense map. The Stead Company holds a lone
-- trade Depot on an open field: each player's Steward raises production
-- chains (harvesters -> refiners), trades a SHARED, fully deterministic
-- market, and keeps the towers fed — every tower shot burns commodities,
-- and an empty rack means an inert tower. Raider waves press the Depot for
-- 20 waves; leaks cost shared company lives.
--
-- Design (inspiration only, adapted with credit — see README + -help):
--   * Economy TD (anonymous, EpicWar) — the economy-first TD frame and
--     income earned by production rather than kills.
--   * Gold TD (EpicWar) — the commitment lesson: income stakes live in
--     standing buildings and die with them; NO interest on idle cash.
--   * Legion TD (AutoAttackGames) — legible wave composition tables.
--   * Line Tower Wars (Hive) — pressure pacing / leak economy.
--   Fixed here: Economy TD's boss that never spawned actually spawns
--   (waves 10 and 20), and the market cannot be griefed — shared prices
--   move on NET flow with a hard per-commodity per-cycle cap.
--
-- The loop:
--   * PRODUCTION: harvesters add raw goods (wood/stone/grain/ore) to their
--     owner's stock every 5s tick; refiners convert on fixed ratios
--     (3 wood -> 1 plank, 4 grain -> 2 bread, 3 ore -> 1 ingot,
--     2 stone + 1 plank -> 1 tool). All bookkeeping is Lua state.
--   * MARKET (every 30s cycle): one shared price per commodity, 10% spread
--     (buy at 110%, sell at 90%), elasticity 1% per (8 x players) NET
--     units traded in the cycle, per-commodity move hard-capped at 5% per
--     cycle, prices clamped to 25%..400% of base. ZERO randomness.
--   * DIVIDENDS (cycle end): each player is paid 25% of the market value
--     of what they PRODUCED this cycle, +1% per 200 gold invested in
--     standing buildings (max +25%), +8% per bread auto-eaten (max 3).
--     A building's stake dies with it (Gold TD's lesson). Idle cash earns
--     NOTHING.
--   * AMMO: watchtower shots burn 1 plank, cannon tower shots burn
--     1 ingot, drawn from the owner's stock on the DAMAGING event; with
--     no stock the shot is zeroed and the tower goes INERT (paused) until
--     the owner restocks.
--   * WAVES: 75s grace (scout raid at 45s), then 20 composed waves from 5
--     raider archetypes (swarm/armored/fast/siege/boss — the Toll Baron
--     REALLY spawns on 10 and 20), scaled by player count, swarm counts
--     jittered +-1 by the seeded PRNG. Leaks cost shared lives (boss 5).
--     Wave 20 cleared = victory + score line; then -endless to keep going.
--   * SEED: every random draw (wave edge, swarm jitter) flows through ONE
--     Park-Miller PRNG. '-seed N' (1-9 digits) reseeds until the seed
--     LOCKS at the first commitment point: the first market trade or the
--     first wave launch, whichever comes first. math.random / GetRandomInt
--     are never used, so the game and the headless sim replay identically.
--
-- Object types and the leak rect are referenced through the GENERATED
-- named constants (UNIT_* / REGION_*) that build-map prepends to the packed
-- script — never hand-typed FourCC literals (CLAUDE.md gotcha 27).
--
-- Chat commands: -help, -price, -eco, -lives, -buy <good> <qty>,
-- -sell <good> <qty>, -seed N, -endless (after victory); '-test' toggles
-- debug gating (northreach convention): -gold N, -stock <good> N,
-- -build <key>, -wave, -wavejump N, -setlives N, -clearwave, -ff, -runlog.
--
-- info.json has scriptLanguage = 1 (Lua); the game calls config() in the
-- lobby and main() on map start. Script-level state lives in Lua GLOBALS
-- (CLAUDE.md gotcha 28) — the chunk keeps its `local` count far under the
-- 200-local engine limit.
-- =========================================================================

-- ------------------------------------------------------------------ tuning
local MAX_PLAYERS       = 4
local DEFAULT_SEED      = 20260712 -- lobby-visible: printed in the description
local START_GOLD        = 200
local START_LIVES       = 20
local PROD_TICK         = 5       -- production tick (seconds)
local CYCLE_TIME        = 30      -- market/dividend cycle (seconds)
local GRACE_TIME        = 75      -- first wave launches at this time
local SCOUT_RAID_AT     = 45      -- grace-period scout raid
local WAVE_GAP          = 45      -- breather between wave clear and next launch
local FINAL_WAVE        = 20
local DIV_RATE_PCT      = 25      -- dividend = 25% of produced market value
local COMMIT_PER_GOLD   = 200     -- +1% dividend per 200g invested standing
local COMMIT_CAP_PCT    = 25
local BREAD_MAX_EAT     = 3       -- bread auto-eaten per player per cycle (cap)
local BREAD_BONUS_PCT   = 8       -- dividend bonus per bread eaten
local ELASTIC_PER_PLAYER = 8      -- 1% move per (8 x players) net units traded
local MOVE_CAP_PCT      = 5       -- per-commodity per-cycle price move cap
local PRICE_FLOOR_PCT   = 25      -- of base price
local PRICE_CEIL_PCT    = 400
local WAVE_HP_PCT       = 6       -- +6% raider hp per wave index past 1
local ENDLESS_GROWTH_PCT = 15     -- +15% composition per wave past 20
local WAVE_BOUNTY_BASE  = 15      -- wave-clear payout: base + per*wave, each player
local WAVE_BOUNTY_PER   = 5
local SCORE_PER_LIFE    = 50
local VICTORY_WINDOW    = 60      -- seconds to type -endless before the win screen
local STEWARD_RESPAWN   = 15
local FF_SCALE          = 4
local rngState          = 1

-- -------------------------------------------------------------- game state
-- Script-level state is GLOBAL (gotcha 28); these are also the sim's
-- observability surface (sim.global reads scalars, sim.call the getters).
Users          = {}     -- seated human pids, in slot order
NumPlayers     = 1
TestMode       = {}     -- pid -> bool
GameOver       = false
VictoryPending = false  -- wave 20 cleared, -endless window open
VictoryClock   = 0
EndlessMode    = false
ClockScale     = 1
Lives          = 0
WavePhase      = "grace"  -- grace | active | gap | done
GraceClock     = 0
GapLeft        = 0
WaveNumber     = 0      -- last launched wave index
WaveRaidersLeft = 0     -- live raiders belonging to launched waves
RaiderRec      = {}     -- raider unit -> {kind, wave, leak, bounty}
Buildings      = {}     -- building unit -> {key, def, pid, dead}
BuildingList   = {}     -- append-ordered array of the same recs (determinism)
TowerInert     = {}     -- tower unit -> true while starved
DepotUnit      = nil
Stewards       = {}     -- pid -> steward unit
Stock          = {}     -- pid -> commodity key -> units held
ProducedC      = {}     -- pid -> market value (cents) produced this cycle
LastDividend   = {}     -- pid -> gold paid at the last cycle
InvestedStanding = {}   -- pid -> gold invested in standing buildings
PriceC         = {}     -- commodity key -> current price (cents, integer)
NetFlow        = {}     -- commodity key -> net units traded this cycle (+buy)
MarketProfit   = 0      -- company-wide: sell income - buy spend (gold)
CycleCount     = 0
CycleClock     = 0
ProdClock      = 0
ScoutDone      = false
SeedLocked     = false
ScoreFinal     = 0
RUNLOG         = ""
RunSeed        = DEFAULT_SEED

-- ---------------------------------------------------------------- the PRNG
-- Park-Miller "minimal standard" LCG (Lehmer, via Schrage's algorithm) —
-- the ONLY source of randomness in this map (CLAUDE.md gotchas 29/30).
-- Schrage keeps every intermediate below 2^31, so the sequence is
-- bit-identical under the game's 64-bit Lua integers AND fengari's 32-bit
-- integers (the headless sim). Same pattern as maps/vaults-of-ash.
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

function GoldOf(pid)
  return GetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD)
end

function AddGold(pid, n)
  SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, GoldOf(pid) + n)
end

-- ------------------------------------------------------- commodities/market
-- Prices are integer CENTS (1 gold = 100), all arithmetic integer — the
-- market is deterministic to the bit under both Lua integer widths.
COMMODITIES = {
  { key = "wood",   name = "Wood",   base = 200 },
  { key = "stone",  name = "Stone",  base = 300 },
  { key = "grain",  name = "Grain",  base = 100 },
  { key = "ore",    name = "Ore",    base = 500 },
  { key = "planks", name = "Planks", base = 800 },
  { key = "bread",  name = "Bread",  base = 400 },
  { key = "tools",  name = "Tools",  base = 1500 },
  { key = "ingots", name = "Ingots", base = 1800 },
}
COMM = {} -- key -> entry
for _, c in ipairs(COMMODITIES) do COMM[c.key] = c end

function StockOf(pid, key)
  return (Stock[pid] and Stock[pid][key]) or 0
end

function AddStock(pid, key, n)
  Stock[pid][key] = StockOf(pid, key) + n
end

-- take n of key from pid's stock; false (untouched) when short
function TakeStock(pid, key, n)
  if StockOf(pid, key) < n then return false end
  Stock[pid][key] = Stock[pid][key] - n
  return true
end

function PriceOf(key) return PriceC[key] end

function BuyUnitC(key)  -- cents per unit bought (110% of price, ceil)
  return (PriceC[key] * 11 + 9) // 10
end

function SellUnitC(key) -- cents per unit sold (90% of price, floor)
  return (PriceC[key] * 9) // 10
end

function BuyGoldFor(key, qty)  -- gold cost, ceil
  return (BuyUnitC(key) * qty + 99) // 100
end

function SellGoldFor(key, qty) -- gold paid, floor
  return (SellUnitC(key) * qty) // 100
end

function FmtGold(cents)
  return string.format("%d.%02d", cents // 100, cents % 100)
end

function LockSeed(reason)
  if SeedLocked then return end
  SeedLocked = true
  LogRun("seedlock|" .. reason)
  AnnounceAll("|cffaaaaaaThe ledger is open (" .. reason .. ") -- seed "
    .. RunSeed .. " is locked for this run.|r")
end

function DoTrade(pid, dir, key, qty)
  local c = COMM[key]
  if c == nil then
    Tell(pid, "|cffaaaaaaNo such good. Goods: wood, stone, grain, ore, planks, bread, tools, ingots.|r")
    return
  end
  if qty == nil or qty < 1 then
    Tell(pid, "|cffaaaaaaQuantity must be 1-999.|r")
    return
  end
  if qty > 999 then qty = 999 end
  if dir == "buy" then
    local cost = BuyGoldFor(key, qty)
    if GoldOf(pid) < cost then
      Tell(pid, "|cffaaaaaaBuying " .. qty .. " " .. c.name .. " costs " .. cost .. "g -- you are short.|r")
      return
    end
    LockSeed("trade")
    AddGold(pid, -cost)
    AddStock(pid, key, qty)
    NetFlow[key] = NetFlow[key] + qty
    MarketProfit = MarketProfit - cost
    Tell(pid, "|cff88ccffBought " .. qty .. " " .. c.name .. " for " .. cost .. "g (" .. FmtGold(BuyUnitC(key)) .. "g each).|r")
    LogRun("trade|pid=" .. pid .. "|buy|" .. key .. "|q=" .. qty .. "|gold=" .. cost)
  else
    if StockOf(pid, key) < qty then
      Tell(pid, "|cffaaaaaaYou hold " .. StockOf(pid, key) .. " " .. c.name .. " -- cannot sell " .. qty .. ".|r")
      return
    end
    LockSeed("trade")
    TakeStock(pid, key, qty)
    local gain = SellGoldFor(key, qty)
    AddGold(pid, gain)
    NetFlow[key] = NetFlow[key] - qty
    MarketProfit = MarketProfit + gain
    Tell(pid, "|cff88ccffSold " .. qty .. " " .. c.name .. " for " .. gain .. "g (" .. FmtGold(SellUnitC(key)) .. "g each).|r")
    LogRun("trade|pid=" .. pid .. "|sell|" .. key .. "|q=" .. qty .. "|gold=" .. gain)
  end
  RearmTowers(pid)
end

-- cycle-end price move: 1% per (ELASTIC_PER_PLAYER x players) NET units,
-- hard-capped at MOVE_CAP_PCT per commodity per cycle (the anti-grief fix),
-- clamped to PRICE_FLOOR/CEIL of base. Iterates the COMMODITIES array so
-- log order is deterministic everywhere.
function MarketCycle()
  local denom = ELASTIC_PER_PLAYER * NumPlayers
  for _, c in ipairs(COMMODITIES) do
    local net = NetFlow[c.key]
    local mag = net
    if mag < 0 then mag = -mag end
    local pct = mag // denom
    if pct > MOVE_CAP_PCT then pct = MOVE_CAP_PCT end
    if pct > 0 and net ~= 0 then
      local delta = (PriceC[c.key] * pct) // 100
      if net > 0 then
        PriceC[c.key] = PriceC[c.key] + delta
      else
        PriceC[c.key] = PriceC[c.key] - delta
      end
      local floorC = (c.base * PRICE_FLOOR_PCT) // 100
      local ceilC = (c.base * PRICE_CEIL_PCT) // 100
      if PriceC[c.key] < floorC then PriceC[c.key] = floorC end
      if PriceC[c.key] > ceilC then PriceC[c.key] = ceilC end
      local dir = net > 0 and "+" or "-"
      LogRun("market|" .. c.key .. "|" .. dir .. pct .. "%|price=" .. PriceC[c.key])
      AnnounceAll("|cffccaa66Market: " .. c.name .. " " .. dir .. pct .. "% -> "
        .. FmtGold(PriceC[c.key]) .. "g.|r")
    end
    NetFlow[c.key] = 0
  end
end

-- --------------------------------------------------------------- buildings
-- Build keys -> definitions. Unit types come from the GENERATED constants;
-- costs mirror the object-data ugol values (engine builds charge them; the
-- debug -build path is free by design). BUILD_ORDER keeps every iteration
-- deterministic.
BUILD_ORDER = { "woodcamp", "quarry", "grainfield", "orepit",
  "sawmill", "bakery", "smelter", "toolworks", "watchtower", "cannontower" }
BUILD_DEFS = {
  woodcamp    = { unit = UNIT_WOODCAMP,     cost = 120, kind = "harvest", out = "wood",   qty = 4 },
  quarry      = { unit = UNIT_QUARRY,       cost = 140, kind = "harvest", out = "stone",  qty = 3 },
  grainfield  = { unit = UNIT_GRAINFIELD,   cost = 100, kind = "harvest", out = "grain",  qty = 5 },
  orepit      = { unit = UNIT_OREPIT,       cost = 170, kind = "harvest", out = "ore",    qty = 2 },
  sawmill     = { unit = UNIT_SAWMILL,      cost = 220, kind = "refine",  out = "planks", qty = 1, inputs = { { "wood", 3 } } },
  bakery      = { unit = UNIT_BAKERY,       cost = 180, kind = "refine",  out = "bread",  qty = 2, inputs = { { "grain", 4 } } },
  smelter     = { unit = UNIT_SMELTER,      cost = 260, kind = "refine",  out = "ingots", qty = 1, inputs = { { "ore", 3 } } },
  toolworks   = { unit = UNIT_TOOLWORKS,    cost = 300, kind = "refine",  out = "tools",  qty = 1, inputs = { { "stone", 2 }, { "planks", 1 } } },
  watchtower  = { unit = UNIT_WATCHTOWER,   cost = 150, kind = "tower",   ammo = "planks" },
  cannontower = { unit = UNIT_CANNON_TOWER, cost = 280, kind = "tower",   ammo = "ingots" },
}
TypeToBuildKey = {} -- unit type id -> build key
for _, k in ipairs(BUILD_ORDER) do TypeToBuildKey[BUILD_DEFS[k].unit] = k end

function BuildKeyOfUnit(u)
  return TypeToBuildKey[GetUnitTypeId(u)]
end

-- shared registration path: engine CONSTRUCT_FINISH and debug -build both
-- land here. The stake enters the owner's standing investment (and leaves
-- it when the building dies — Gold TD's commitment lesson, credited).
function RegisterBuilding(u)
  local key = BuildKeyOfUnit(u)
  if key == nil or Buildings[u] ~= nil then return end
  local pid = GetPlayerId(GetOwningPlayer(u))
  local rec = { unit = u, key = key, def = BUILD_DEFS[key], pid = pid, dead = false }
  Buildings[u] = rec
  BuildingList[#BuildingList + 1] = rec
  InvestedStanding[pid] = (InvestedStanding[pid] or 0) + rec.def.cost
  LogRun("build|pid=" .. pid .. "|" .. key)
  Tell(pid, "|cff88ff88" .. key .. " raised -- " .. rec.def.cost
    .. "g now working for your dividend (stake: " .. InvestedStanding[pid] .. "g).|r")
end

function BuildingCountOf(pid, key)
  local n = 0
  for _, rec in ipairs(BuildingList) do
    if not rec.dead and rec.pid == pid and rec.key == key then n = n + 1 end
  end
  return n
end

function InvestedOf(pid) return InvestedStanding[pid] or 0 end

-- ------------------------------------------------------ production/dividend

function ProductionTick()
  for _, rec in ipairs(BuildingList) do
    if not rec.dead and Alive(rec.unit) then
      local d = rec.def
      if d.kind == "harvest" then
        AddStock(rec.pid, d.out, d.qty)
        ProducedC[rec.pid] = ProducedC[rec.pid] + d.qty * PriceC[d.out]
      elseif d.kind == "refine" then
        local ok = true
        for _, inp in ipairs(d.inputs) do
          if StockOf(rec.pid, inp[1]) < inp[2] then ok = false end
        end
        if ok then
          for _, inp in ipairs(d.inputs) do TakeStock(rec.pid, inp[1], inp[2]) end
          AddStock(rec.pid, d.out, d.qty)
          ProducedC[rec.pid] = ProducedC[rec.pid] + d.qty * PriceC[d.out]
        end
      end
    end
  end
  for _, pid in ipairs(Users) do RearmTowers(pid) end
end

-- cycle end: bread is eaten (bounded), dividends are paid on this cycle's
-- GROSS production value, the market reprices. NO interest is paid on cash
-- — the only income is production you committed to.
function CycleEnd()
  CycleCount = CycleCount + 1
  for _, pid in ipairs(Users) do
    local eaten = StockOf(pid, "bread")
    if eaten > BREAD_MAX_EAT then eaten = BREAD_MAX_EAT end
    if eaten > 0 then
      TakeStock(pid, "bread", eaten)
      LogRun("eat|pid=" .. pid .. "|n=" .. eaten)
    end
    local commit = (InvestedStanding[pid] or 0) // COMMIT_PER_GOLD
    if commit > COMMIT_CAP_PCT then commit = COMMIT_CAP_PCT end
    local bonus = commit + eaten * BREAD_BONUS_PCT
    local divC = (ProducedC[pid] * DIV_RATE_PCT) // 100
    divC = (divC * (100 + bonus)) // 100
    local gold = divC // 100
    LastDividend[pid] = gold
    if gold > 0 then
      AddGold(pid, gold)
      Tell(pid, "|cffffdd66Dividend: +" .. gold .. "g on this cycle's production (+"
        .. bonus .. "% commitment/bread bonus).|r")
      LogRun("div|pid=" .. pid .. "|gold=" .. gold .. "|bonus=" .. bonus)
    end
    ProducedC[pid] = 0
  end
  MarketCycle()
end

function DividendOf(pid) return LastDividend[pid] or 0 end

-- ------------------------------------------------------------------- towers
-- Every tower shot burns 1 unit of its ammo commodity from the OWNER's
-- stock, drawn in the DAMAGING event (fires for real engine attacks in the
-- game and for sim.damage in the harness). No ammo: the shot is zeroed and
-- the tower goes INERT (paused) until the owner restocks.
AmmoSpent = {} -- pid -> total units burned (observability)

function HandleDamaging()
  local src = GetEventDamageSource()
  if src == nil then return end
  local rec = Buildings[src]
  if rec == nil or rec.dead or rec.def.kind ~= "tower" then return end
  if TakeStock(rec.pid, rec.def.ammo, 1) then
    AmmoSpent[rec.pid] = (AmmoSpent[rec.pid] or 0) + 1
  else
    BlzSetEventDamage(0.0)
    if not TowerInert[src] then
      TowerInert[src] = true
      PauseUnit(src, true)
      Tell(rec.pid, "|cffff8866A " .. rec.key .. " has run dry of " .. rec.def.ammo
        .. " -- it stands INERT until you restock.|r")
      LogRun("tower|inert|pid=" .. rec.pid .. "|" .. rec.key)
    end
  end
end

function RearmTowers(pid)
  for _, rec in ipairs(BuildingList) do
    if not rec.dead and rec.pid == pid and rec.def.kind == "tower"
      and TowerInert[rec.unit] and StockOf(pid, rec.def.ammo) > 0 then
      TowerInert[rec.unit] = nil
      PauseUnit(rec.unit, false)
      Tell(pid, "|cff88ff88A " .. rec.key .. " is restocked and firing again.|r")
      LogRun("tower|rearmed|pid=" .. pid .. "|" .. rec.key)
    end
  end
end

function TowerInertCount(pid)
  local n = 0
  for _, rec in ipairs(BuildingList) do
    if not rec.dead and rec.pid == pid and rec.def.kind == "tower"
      and TowerInert[rec.unit] then n = n + 1 end
  end
  return n
end

-- -------------------------------------------------------------------- waves
-- 5 archetypes; leak = shared lives cost. Composition below is the BASE
-- count per wave — non-boss entries scale x(1 + 0.25 per extra player)
-- (ceil), swarm entries then jitter -1..+1 (seeded, min 1). Bosses are
-- authored counts, never scaled. Raider hp scales +6%/wave (bookkept in
-- WaveHpOf and applied via BlzSetUnitMaxHP for the game client).
ARCHETYPES = {
  cutpurse = { unit = UNIT_RAIDER_CUTPURSE,   hp = 90,   bounty = 3,   leak = 1, swarm = true },
  marauder = { unit = UNIT_IRONHIDE_MARAUDER, hp = 400,  bounty = 12,  leak = 1 },
  runner   = { unit = UNIT_DUST_RUNNER,       hp = 140,  bounty = 6,   leak = 1, swarm = true },
  sapper   = { unit = UNIT_TUNNEL_SAPPER,     hp = 250,  bounty = 10,  leak = 1, siege = true },
  baron    = { unit = UNIT_TOLL_BARON,        hp = 2500, bounty = 150, leak = 5, boss = true },
}
WAVES = {
  { { "cutpurse", 6 } },
  { { "cutpurse", 8 } },
  { { "cutpurse", 6 }, { "runner", 2 } },
  { { "marauder", 3 } },
  { { "cutpurse", 10 }, { "runner", 3 } },
  { { "marauder", 4 }, { "cutpurse", 4 } },
  { { "runner", 8 } },
  { { "sapper", 3 }, { "cutpurse", 6 } },
  { { "marauder", 6 } },
  { { "baron", 1 }, { "marauder", 2 } },          -- the boss ACTUALLY spawns
  { { "cutpurse", 14 }, { "runner", 4 } },
  { { "sapper", 5 }, { "marauder", 3 } },
  { { "runner", 12 } },
  { { "marauder", 8 }, { "sapper", 2 } },
  { { "cutpurse", 16 }, { "marauder", 4 } },
  { { "sapper", 6 }, { "runner", 6 } },
  { { "marauder", 10 } },
  { { "runner", 10 }, { "sapper", 4 } },
  { { "marauder", 8 }, { "cutpurse", 12 }, { "sapper", 3 } },
  { { "baron", 2 }, { "marauder", 6 } },          -- the final toll
}
EDGE_NAMES = { "north", "east", "south", "west" }
EDGE_POS = { { 0, 3800 }, { 3800, 0 }, { 0, -3800 }, { -3800, 0 } }

function WaveHpOf(kind, wave)
  local a = ARCHETYPES[kind]
  return (a.hp * (100 + WAVE_HP_PCT * (wave - 1))) // 100
end

function ScaledCount(base, kind)
  local a = ARCHETYPES[kind]
  if a.boss then return base end
  local n = math.ceil(base * (1.0 + 0.25 * (NumPlayers - 1)))
  if a.swarm then
    n = n + (RandInt(0, 2) - 1) -- seeded jitter -1..+1
    if n < 1 then n = 1 end
  end
  return n
end

function NearestBuilding(x, y)
  local best, bestD = nil, nil
  for _, rec in ipairs(BuildingList) do
    if not rec.dead and Alive(rec.unit) then
      local dx = GetUnitX(rec.unit) - x
      local dy = GetUnitY(rec.unit) - y
      local d = dx * dx + dy * dy
      if bestD == nil or d < bestD then best, bestD = rec.unit, d end
    end
  end
  return best
end

function SpawnRaider(kind, wave, x, y)
  local a = ARCHETYPES[kind]
  local u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), a.unit, x, y, 270.0)
  local hp = WaveHpOf(kind, wave < 1 and 1 or wave)
  BlzSetUnitMaxHP(u, hp)
  SetWidgetLife(u, hp)
  RaiderRec[u] = { kind = kind, wave = wave, leak = a.leak, bounty = a.bounty }
  if wave > 0 then WaveRaidersLeft = WaveRaidersLeft + 1 end
  if a.siege then
    local tgt = NearestBuilding(x, y)
    if tgt ~= nil then
      IssueTargetOrder(u, "attack", tgt)
      return u
    end
  end
  IssuePointOrder(u, "attack", 0.0, 0.0)
  return u
end

-- pre-wave scout raid: fixed composition (no PRNG — it runs before the
-- seed can lock), a taste of the leak rules during the grace period
function ScoutRaid()
  local n = 1 + NumPlayers
  for i = 1, n do
    SpawnRaider("cutpurse", 0, EDGE_POS[1][1] + (i - 1) * 64.0, EDGE_POS[1][2] + 0.0)
  end
  AnnounceAll("|cffff8866Scouts on the north road -- " .. n
    .. " cutpurses probe the stead. Leaks cost lives even now.|r")
  LogRun("raid|scouts|n=" .. n)
end

function CompositionOf(wave) -- entries of WAVES + endless growth percent
  if wave <= FINAL_WAVE then return WAVES[wave], 100 end
  -- endless: wave-20 composition grown +15% per wave past 20
  return WAVES[FINAL_WAVE], 100 + ENDLESS_GROWTH_PCT * (wave - FINAL_WAVE)
end

function LaunchWave(n)
  LockSeed("wave")
  WaveNumber = n
  WavePhase = "active"
  local comp, growPct = CompositionOf(n)
  local edge = RandInt(1, 4)
  local ex, ey = EDGE_POS[edge][1] + 0.0, EDGE_POS[edge][2] + 0.0
  local parts = {}
  for _, entry in ipairs(comp) do
    local kind, base = entry[1], entry[2]
    local count = ScaledCount((base * growPct) // 100, kind)
    if count < 1 then count = 1 end
    for i = 1, count do
      -- fan the pack out along the edge, perpendicular to the approach
      local off = (i - 1) * 72.0 - (count - 1) * 36.0
      if edge == 1 or edge == 3 then
        SpawnRaider(kind, n, ex + off, ey)
      else
        SpawnRaider(kind, n, ex, ey + off)
      end
    end
    parts[#parts + 1] = kind .. ":" .. count
    if ARCHETYPES[kind].boss then
      AnnounceAll("|cffff4444The TOLL BARON rides with wave " .. n .. " -- leaking him costs 5 lives.|r")
    end
  end
  local desc = table.concat(parts, ",")
  AnnounceAll("|cffffcc00Wave " .. n .. " from the " .. EDGE_NAMES[edge] .. " -- " .. desc .. ".|r")
  LogRun("wave|start|" .. n .. "|edge=" .. EDGE_NAMES[edge] .. "|" .. desc)
end

function WaveCleared()
  WavePhase = "gap"
  local bounty = WAVE_BOUNTY_BASE + WAVE_BOUNTY_PER * WaveNumber
  for _, pid in ipairs(Users) do AddGold(pid, bounty) end
  AnnounceAll("|cff88ff88Wave " .. WaveNumber .. " broken -- +" .. bounty .. "g to every founder.|r")
  LogRun("wave|clear|" .. WaveNumber .. "|bounty=" .. bounty)
  if WaveNumber >= FINAL_WAVE and not EndlessMode and not VictoryPending then
    VictoryReached()
    return
  end
  GapLeft = WAVE_GAP
end

function CheckWaveEnd()
  if WavePhase == "active" and WaveRaidersLeft <= 0 then
    WaveCleared()
  end
end

function RaiderGone(u, killed)
  local rec = RaiderRec[u]
  if rec == nil then return end
  RaiderRec[u] = nil
  if killed and rec.bounty > 0 then
    local killer = GetKillingUnit()
    if killer ~= nil then
      local kpid = GetPlayerId(GetOwningPlayer(killer))
      if kpid ~= nil and kpid < MAX_PLAYERS then
        AddGold(kpid, rec.bounty)
      end
    end
  end
  if rec.wave > 0 then
    WaveRaidersLeft = WaveRaidersLeft - 1
    CheckWaveEnd()
  end
end

function HandleLeak(u)
  local rec = RaiderRec[u]
  if rec == nil or GameOver then return end
  Lives = Lives - rec.leak
  if Lives < 0 then Lives = 0 end
  AnnounceAll("|cffff4444A " .. rec.kind .. " reaches the Depot -- -" .. rec.leak
    .. (rec.leak == 1 and " life" or " lives") .. " (" .. Lives .. " left).|r")
  LogRun("leak|" .. rec.kind .. "|lives=" .. Lives)
  RaiderGone(u, false)
  RemoveUnit(u)
  if Lives <= 0 then
    DefeatRun("The raiders bled the company dry.")
  end
end

-- ------------------------------------------------------------ score/verdict

function ComputeScore()
  local gold, stockV, invested = 0, 0, 0
  for _, pid in ipairs(Users) do
    gold = gold + GoldOf(pid)
    invested = invested + (InvestedStanding[pid] or 0)
    for _, c in ipairs(COMMODITIES) do
      stockV = stockV + SellGoldFor(c.key, StockOf(pid, c.key))
    end
  end
  local total = gold + stockV + invested + Lives * SCORE_PER_LIFE + MarketProfit
  return total, gold, stockV, invested, Lives * SCORE_PER_LIFE, MarketProfit
end

function ScoreLine(verdict)
  local total, gold, stockV, invested, livesV, profit = ComputeScore()
  ScoreFinal = total
  return "COINSTEAD -- " .. verdict .. ". Score " .. total
    .. " (coin " .. gold .. " + goods " .. stockV .. " + stakes " .. invested
    .. " + lives " .. livesV .. " + market " .. profit .. ")."
    .. " Waves: " .. WaveNumber .. ". Cycles: " .. CycleCount .. ". Seed: " .. RunSeed .. "."
end

function VictoryReached()
  VictoryPending = true
  VictoryClock = VICTORY_WINDOW
  WavePhase = "done"
  local line = ScoreLine("VICTORY")
  AnnounceAll("|cff88ff88The twentieth wave breaks against the stead. The road is yours.|r")
  AnnounceAll("|cffffcc00" .. line .. "|r")
  AnnounceAll("|cffaaddffType -endless within " .. VICTORY_WINDOW
    .. "s to keep the company trading against ever-larger raids.|r")
  LogRun("verdict|victory|wave=" .. WaveNumber .. "|score=" .. ScoreFinal)
end

function FinishVictory()
  if GameOver then return end
  GameOver = true
  VictoryPending = false
  AnnounceAll("|cff88ff88The company retires rich. Coinstead stands.|r")
  LogRun("gameover|victory")
  After(2.0, function()
    for _, pid in ipairs(Users) do
      CustomVictoryBJ(Player(pid), true, true)
    end
  end)
end

function DefeatRun(why)
  if GameOver then return end
  GameOver = true
  local line = ScoreLine("DEFEAT")
  AnnounceAll("|cffff4444" .. why .. "|r")
  AnnounceAll("|cffffcc00" .. line .. "|r")
  LogRun("verdict|defeat|wave=" .. WaveNumber .. "|score=" .. ScoreFinal)
  After(2.0, function()
    for _, pid in ipairs(Users) do
      CustomDefeatBJ(Player(pid), "The stead has fallen.")
    end
  end)
end

function StartEndless(pid)
  if not VictoryPending and not EndlessMode then
    Tell(pid, "|cffaaaaaa-endless opens only after the twentieth wave falls.|r")
    return
  end
  if EndlessMode then
    Tell(pid, "|cffaaaaaaThe endless road is already open.|r")
    return
  end
  EndlessMode = true
  VictoryPending = false
  WavePhase = "gap"
  GapLeft = WAVE_GAP
  AnnounceAll("|cffff88ffENDLESS: the raids grow " .. ENDLESS_GROWTH_PCT
    .. "% per wave past " .. FINAL_WAVE .. ". Hold as long as the ledgers do.|r")
  LogRun("endless|on")
end

-- ------------------------------------------------------------ unit triggers

function StartPosOf(pid)
  local xs = { -512.0, 512.0, -512.0, 512.0 }
  local ys = { -512.0, -512.0, 512.0, 512.0 }
  return xs[pid + 1] or 0.0, ys[pid + 1] or 0.0
end

function HandleDeath()
  local u = GetTriggerUnit()
  if u == nil or GameOver then return end

  -- raider down: bounty to the killer's owner, wave accounting
  if RaiderRec[u] ~= nil then
    RaiderGone(u, true)
    return
  end

  -- the Depot: razed = instant defeat, whatever the lives count
  if u == DepotUnit then
    DefeatRun("The Depot burns. There is no company without its vault.")
    return
  end

  -- a registered building: production AND its income stake die with it
  local rec = Buildings[u]
  if rec ~= nil and not rec.dead then
    rec.dead = true
    Buildings[u] = nil
    TowerInert[u] = nil
    InvestedStanding[rec.pid] = (InvestedStanding[rec.pid] or 0) - rec.def.cost
    if InvestedStanding[rec.pid] < 0 then InvestedStanding[rec.pid] = 0 end
    Tell(rec.pid, "|cffff8866Your " .. rec.key .. " is rubble -- its " .. rec.def.cost
      .. "g stake is out of your dividend (stake now " .. InvestedStanding[rec.pid] .. "g).|r")
    LogRun("building|lost|pid=" .. rec.pid .. "|" .. rec.key .. "|stake=" .. InvestedStanding[rec.pid])
    return
  end

  -- a Steward: respawns at the player's start after a pause
  for _, pid in ipairs(Users) do
    if Stewards[pid] == u then
      Stewards[pid] = nil
      Tell(pid, "|cffff8866Your Steward is down -- a replacement arrives in "
        .. STEWARD_RESPAWN .. "s.|r")
      LogRun("steward|down|pid=" .. pid)
      local rpid = pid
      After(STEWARD_RESPAWN, function()
        if GameOver then return end
        local x, y = StartPosOf(rpid)
        Stewards[rpid] = CreateUnit(Player(rpid), UNIT_STEWARD, x, y, 270.0)
        Tell(rpid, "|cff88ff88A new Steward reports for duty.|r")
        LogRun("steward|back|pid=" .. rpid)
      end)
      return
    end
  end
end

function HandleConstructFinish()
  RegisterBuilding(GetConstructedStructure())
end

-- -------------------------------------------------------------------- clock

function StartClock()
  local t = CreateTimer()
  TimerStart(t, 1.0, true, function()
    if GameOver then return end
    ProdClock = ProdClock + ClockScale
    while ProdClock >= PROD_TICK do
      ProdClock = ProdClock - PROD_TICK
      ProductionTick()
    end
    CycleClock = CycleClock + ClockScale
    while CycleClock >= CYCLE_TIME do
      CycleClock = CycleClock - CYCLE_TIME
      CycleEnd()
    end
    if VictoryPending then
      VictoryClock = VictoryClock - ClockScale
      if VictoryClock <= 0 then
        FinishVictory()
        return
      end
    end
    if WavePhase == "grace" then
      GraceClock = GraceClock + ClockScale
      if not ScoutDone and GraceClock >= SCOUT_RAID_AT then
        ScoutDone = true
        ScoutRaid()
      end
      if GraceClock >= GRACE_TIME then
        LaunchWave(1)
      end
    elseif WavePhase == "gap" then
      GapLeft = GapLeft - ClockScale
      if GapLeft <= 0 then
        LaunchWave(WaveNumber + 1)
      end
    end
  end)
end

-- ------------------------------------------------------------ chat commands

function ShowHelp(pid)
  Tell(pid, "|cffffcc00COINSTEAD|r -- co-op economy defense. Hold the Depot for "
    .. FINAL_WAVE .. " waves; leaks cost shared lives.")
  Tell(pid, "|cffaaddffEconomy:|r harvesters make wood/stone/grain/ore each "
    .. PROD_TICK .. "s; refiners convert (3 wood->1 plank, 4 grain->2 bread, 3 ore->1 ingot, 2 stone+1 plank->1 tool).")
  Tell(pid, "|cffaaddffDividends every " .. CYCLE_TIME .. "s:|r " .. DIV_RATE_PCT
    .. "% of what you PRODUCED, +1%/" .. COMMIT_PER_GOLD .. "g standing stake (max +"
    .. COMMIT_CAP_PCT .. "%), +" .. BREAD_BONUS_PCT .. "%/bread eaten (max "
    .. BREAD_MAX_EAT .. "). Idle cash earns nothing; a dead building takes its stake with it.")
  Tell(pid, "|cffaaddffMarket:|r -price, -buy <good> <qty>, -sell <good> <qty>. Shared prices, 10% spread; prices move 1% per "
    .. ELASTIC_PER_PLAYER .. "x(players) net units traded, hard-capped at "
    .. MOVE_CAP_PCT .. "%/cycle. No randomness.")
  Tell(pid, "|cffaaddffAmmo:|r watchtowers burn planks, cannon towers burn ingots -- 1 per shot; empty racks = INERT tower until restocked.")
  Tell(pid, "|cffaaddffCommands:|r -help -price -eco -lives -buy -sell -seed N (until the first trade/wave) -endless (after victory) -test (debug).")
  Tell(pid, "|cff888888Credits: adapted with credit from Economy TD (anonymous, EpicWar), Gold TD (EpicWar), Legion TD (AutoAttackGames), Line Tower Wars (Hive Workshop). Mechanics only; nothing copied.|r")
end

function ShowPrices(pid)
  Tell(pid, "|cffffcc00Market prices|r (buy 110% / sell 90%, cycle "
    .. CycleCount .. ", next move in " .. (CYCLE_TIME - CycleClock) .. "s):")
  for _, c in ipairs(COMMODITIES) do
    Tell(pid, "|cffccaa66" .. c.name .. "|r " .. FmtGold(PriceC[c.key])
      .. "g (buy " .. FmtGold(BuyUnitC(c.key)) .. " / sell " .. FmtGold(SellUnitC(c.key))
      .. ") net " .. NetFlow[c.key])
  end
end

function ShowEco(pid)
  Tell(pid, "|cffffcc00Your ledger|r (stake " .. InvestedOf(pid)
    .. "g, last dividend " .. DividendOf(pid) .. "g):")
  local parts = {}
  for _, k in ipairs(BUILD_ORDER) do
    local n = BuildingCountOf(pid, k)
    if n > 0 then parts[#parts + 1] = k .. " x" .. n end
  end
  Tell(pid, "|cffaaddffBuildings:|r " .. (#parts > 0 and table.concat(parts, ", ") or "none"))
  parts = {}
  for _, c in ipairs(COMMODITIES) do
    local n = StockOf(pid, c.key)
    if n > 0 then parts[#parts + 1] = c.key .. " x" .. n end
  end
  Tell(pid, "|cffaaddffStock:|r " .. (#parts > 0 and table.concat(parts, ", ") or "empty"))
  local inert = TowerInertCount(pid)
  if inert > 0 then
    Tell(pid, "|cffff8866" .. inert .. " of your towers stand INERT -- restock their ammo.|r")
  end
end

function ShowLives(pid)
  local status
  if WavePhase == "grace" then
    status = "wave 1 in " .. (GRACE_TIME - GraceClock) .. "s"
  elseif WavePhase == "active" then
    status = "wave " .. WaveNumber .. " in the field (" .. WaveRaidersLeft .. " raiders left)"
  elseif WavePhase == "gap" then
    status = "wave " .. (WaveNumber + 1) .. " in " .. GapLeft .. "s"
  else
    status = "the road is quiet"
  end
  Tell(pid, "|cffffcc00Lives:|r " .. Lives .. " -- " .. status .. ".")
end

-- 9-digit numeric-argument guard (vaults' ParseNumArg precedent): the game
-- parses >= 2^31 as a 64-bit integer, fengari overflows to a float — capping
-- the digit COUNT before tonumber keeps both widths accepting exactly the
-- same strings.
function ParseNumArg(s)
  if s == nil or #s > 9 then return nil end
  return math.tointeger(tonumber(s))
end

function HandleSeed(pid, n)
  if SeedLocked then
    Tell(pid, "|cffaaaaaaThe ledger is already open -- -seed works only before the first trade or wave.|r")
    return
  end
  RunSeed = n
  SeedRNG(n)
  RUNLOG = ""
  LogRun("seed=" .. n)
  AnnounceAll("|cffaaddffThe books reopen at seed " .. n .. ".|r")
end

function DebugBuild(pid, key)
  local def = BUILD_DEFS[key]
  if def == nil then
    Tell(pid, "|cffaaaaaa-build wants one of: " .. table.concat(BUILD_ORDER, ", ") .. ".|r")
    return
  end
  local x, y = StartPosOf(pid)
  local n = 0
  for _, rec in ipairs(BuildingList) do
    if rec.pid == pid then n = n + 1 end
  end
  local u = CreateUnit(Player(pid), def.unit,
    x + 128.0 + 96.0 * (n % 8), y + 224.0 + 96.0 * (n // 8), 270.0)
  RegisterBuilding(u)
end

function HandleChat(pid, msgRaw)
  local msg = string.lower(msgRaw)
  msg = string.match(msg, "^%s*(.-)%s*$")
  if string.sub(msg, 1, 1) ~= "-" then return end

  if msg == "-help" then ShowHelp(pid) return end
  if msg == "-price" or msg == "-prices" then ShowPrices(pid) return end
  if msg == "-eco" then ShowEco(pid) return end
  if msg == "-lives" then ShowLives(pid) return end
  if msg == "-endless" then StartEndless(pid) return end

  local tradeDir, tradeKey, tradeQty = string.match(msg, "^%-(buy)%s+(%a+)%s+(%d+)$")
  if tradeDir == nil then
    tradeDir, tradeKey, tradeQty = string.match(msg, "^%-(sell)%s+(%a+)%s+(%d+)$")
  end
  if tradeDir ~= nil then
    if GameOver then return end
    DoTrade(pid, tradeDir, tradeKey, ParseNumArg(tradeQty))
    return
  end

  local seedArg = string.match(msg, "^%-seed%s+(%d+)$")
  if seedArg ~= nil then
    local n = ParseNumArg(seedArg)
    if n == nil then
      Tell(pid, "|cffaaaaaaSeeds run 1 to 9 digits -- the ledger refuses " .. seedArg .. ".|r")
      return
    end
    HandleSeed(pid, n)
    return
  end

  if msg == "-test" then
    TestMode[pid] = not TestMode[pid]
    if TestMode[pid] then
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid))
        .. " enabled -test debug mode.|r Commands: -gold N, -stock <good> N, -build <key>, -wave, -wavejump N, -setlives N, -clearwave, -ff, -runlog")
    else
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid)) .. " disabled -test debug mode.|r")
    end
    return
  end

  local goldArg = string.match(msg, "^%-gold%s+(%d+)$")
  local stockKey, stockArg = string.match(msg, "^%-stock%s+(%a+)%s+(%d+)$")
  local buildArg = string.match(msg, "^%-build%s+(%a+)$")
  local jumpArg = string.match(msg, "^%-wavejump%s+(%d+)$")
  local livesArg = string.match(msg, "^%-setlives%s+(%d+)$")
  local known = goldArg ~= nil or stockKey ~= nil or buildArg ~= nil
    or jumpArg ~= nil or livesArg ~= nil
    or msg == "-wave" or msg == "-clearwave" or msg == "-ff" or msg == "-runlog"
  if not known then return end
  if not TestMode[pid] then
    Tell(pid, "|cffaaaaaaDebug commands need -test mode. Type -test first.|r")
    return
  end

  if goldArg ~= nil then
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, ParseNumArg(goldArg) or 0)
    Tell(pid, "|cffff88ffGold set to " .. GoldOf(pid) .. ".|r")
  elseif stockKey ~= nil then
    if COMM[stockKey] == nil then
      Tell(pid, "|cffaaaaaaNo such good.|r")
      return
    end
    Stock[pid][stockKey] = ParseNumArg(stockArg) or 0
    Tell(pid, "|cffff88ff" .. COMM[stockKey].name .. " stock set to " .. StockOf(pid, stockKey) .. ".|r")
    RearmTowers(pid)
  elseif buildArg ~= nil then
    DebugBuild(pid, buildArg)
  elseif jumpArg ~= nil then
    local n = ParseNumArg(jumpArg) or 1
    if n < 1 then n = 1 end
    WaveNumber = n - 1
    WavePhase = "gap"
    GapLeft = 1
    Tell(pid, "|cffff88ffNext wave will be " .. n .. " (launching now).|r")
    LogRun("debug|wavejump|" .. n)
  elseif livesArg ~= nil then
    Lives = ParseNumArg(livesArg) or Lives
    AnnounceAll("|cffff88ffCompany lives set to " .. Lives .. ".|r")
  elseif msg == "-wave" then
    if VictoryPending or WavePhase == "done" then
      Tell(pid, "|cffaaaaaaThe road is decided -- use -endless.|r")
    else
      LaunchWave(WaveNumber + 1)
    end
  elseif msg == "-clearwave" then
    local doomed = {}
    for u in pairs(RaiderRec) do doomed[#doomed + 1] = u end
    for _, u in ipairs(doomed) do
      local rec = RaiderRec[u]
      RaiderRec[u] = nil
      if rec ~= nil and rec.wave > 0 then WaveRaidersLeft = WaveRaidersLeft - 1 end
      RemoveUnit(u)
    end
    Tell(pid, "|cffff88ffField swept (" .. #doomed .. " raiders removed).|r")
    LogRun("debug|clearwave|" .. #doomed)
    CheckWaveEnd()
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

  local construct = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(construct, EVENT_PLAYER_UNIT_CONSTRUCT_FINISH)
  TriggerAddAction(construct, HandleConstructFinish)

  local damaging = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(damaging, EVENT_PLAYER_UNIT_DAMAGING)
  TriggerAddAction(damaging, HandleDamaging)

  -- the leak rect around the Depot, from the generated REGION_ constant
  local leak = CreateTrigger()
  local rgn = CreateRegion()
  RegionAddRect(rgn, Rect(REGION_DEPOT_CORE.minX, REGION_DEPOT_CORE.minY,
    REGION_DEPOT_CORE.maxX, REGION_DEPOT_CORE.maxY))
  TriggerRegisterEnterRegion(leak, rgn, nil)
  TriggerAddAction(leak, function()
    HandleLeak(GetEnteringUnit())
  end)
end

-- ------------------------------------------------------------------- intro

function ShowCredits()
  local q = CreateQuest()
  QuestSetTitle(q, "Credits & Inspirations")
  QuestSetDescription(q, "Coinstead (wc3-map-toolkit). Design inspirations, adapted with credit, nothing copied:"
    .. " Economy TD (anonymous, EpicWar) -- the economy-first tower defense frame, income from production;"
    .. " Gold TD (EpicWar) -- income stakes that live and die with the buildings that earn them, no idle interest;"
    .. " Legion TD (AutoAttackGames) -- legible authored wave composition;"
    .. " Line Tower Wars (Hive Workshop) -- leak pressure pacing."
    .. " Fixed here: the boss that never spawned spawns, and the shared market cannot be griefed (net-flow elasticity with a hard per-cycle cap).")
  QuestSetIconPath(q, "ReplaceableTextures\\CommandButtons\\BTNGoldMine.blp")
  QuestSetDiscovered(q, true)
end

function PlayIntro()
  AnnounceAll("|cffaaddffCOINSTEAD. One Depot, one shared market, twenty waves of toll-hungry raiders.|r")
  After(4.0, function()
    if GameOver then return end
    AnnounceAll("|cffaaddffYour Steward builds the economy: harvesters feed refiners, refiners feed the market and your TOWERS -- every shot burns planks or ingots, and an empty rack is an inert tower. Dividends pay on what you PRODUCE, never on idle coin.|r")
  end)
  After(8.0, function()
    if GameOver then return end
    AnnounceAll("|cffffff66Wave 1 arrives at " .. GRACE_TIME .. "s (scouts sooner). Seed "
      .. RunSeed .. " -- replay this exact run with -seed N before your first trade. -help for everything.|r")
  end)
end

-- =========================================================== entry points

function InitGlobals()
end

-- Lobby configuration in the exact WE shape for "Use Custom Forces" +
-- "Fixed Player Settings" (maps/tidewatch-arena pattern, CLAUDE.md gotcha
-- 18): every SetPlayerTeam index MUST be the index of an info.json force
-- containing that player. All four co-op slots sit in force 0
-- ("The Stead Company"), so every player gets team 0.
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

  DefineStartLocation(0, -512.0, -512.0)
  DefineStartLocation(1, 512.0, -512.0)
  DefineStartLocation(2, -512.0, 512.0)
  DefineStartLocation(3, 512.0, 512.0)

  InitCustomPlayerSlots()
  InitCustomTeams()
end

function main()
  SetCameraBounds(
    -3328.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    -3584.0 + GetCameraMargin(CAMERA_MARGIN_BOTTOM),
    3328.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
    3072.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    -3328.0 + GetCameraMargin(CAMERA_MARGIN_LEFT),
    3072.0 - GetCameraMargin(CAMERA_MARGIN_TOP),
    3328.0 - GetCameraMargin(CAMERA_MARGIN_RIGHT),
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

  -- seat the company: 1-4 co-op slots occupied by humans
  Users = {}
  for pid = 0, MAX_PLAYERS - 1 do
    TestMode[pid] = false
    if PlayingUser(pid) then Users[#Users + 1] = pid end
  end
  if #Users == 0 then Users = { 0 } end
  NumPlayers = #Users

  -- the co-op alliance is real alliance state, not just lobby forces
  -- (CLAUDE.md gotcha 24): both directions of every seated pair
  for _, i in ipairs(Users) do
    for _, j in ipairs(Users) do
      if i ~= j then
        SetPlayerAlliance(Player(i), Player(j), ALLIANCE_PASSIVE, true)
        SetPlayerAlliance(Player(i), Player(j), ALLIANCE_SHARED_VISION, true)
      end
    end
  end

  -- preplaced content from units.json (slocs only here; the generated
  -- CreateAllUnits() must still run before anything enumerates units)
  CreateAllUnits()

  -- market opens at base prices; ledgers zeroed
  for _, c in ipairs(COMMODITIES) do
    PriceC[c.key] = c.base
    NetFlow[c.key] = 0
  end
  Lives = START_LIVES
  for _, pid in ipairs(Users) do
    Stock[pid] = {}
    ProducedC[pid] = 0
    LastDividend[pid] = 0
    InvestedStanding[pid] = 0
    AmmoSpent[pid] = 0
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, START_GOLD)
  end

  -- the shared Depot (owned by the first seated founder) and one Steward
  -- per founder at their start location
  DepotUnit = CreateUnit(Player(Users[1]), UNIT_COINSTEAD_DEPOT, 0.0, 0.0, 270.0)
  for _, pid in ipairs(Users) do
    local x, y = StartPosOf(pid)
    Stewards[pid] = CreateUnit(Player(pid), UNIT_STEWARD, x, y, 270.0)
  end

  SeedRNG(DEFAULT_SEED)
  RunSeed = DEFAULT_SEED
  LogRun("seed=" .. DEFAULT_SEED)

  ShowCredits()
  RegisterTriggers()
  RegisterChatCommands()
  StartClock()

  After(1.5, PlayIntro)
end
