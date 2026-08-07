-- =========================================================================
-- Coinstead — war3map.lua (phase 3: physical logistics + the live board)
-- =========================================================================
-- A 1-4 player co-op economy-defense map. The Stead Company holds a lone
-- trade Depot on an open field: each player's Steward raises production
-- chains (harvesters -> refiners), trades a SHARED, fully deterministic
-- market, and keeps the towers fed — every tower shot burns commodities,
-- and an empty rack means an inert tower. Raider waves press the Depot for
-- 20 waves; leaks cost shared company lives.
--
-- PHASE 3 — goods are PHYSICAL (Economy TD's two conceded wins, adopted
-- and adapted with credit):
--   * Every building stores goods as ITEM CHARGES in its own 6-slot
--     inventory (one commodity stack per slot, 200 charges per stack).
--     Harvesters store their own output; refiners eat inputs FROM their
--     own slots; towers burn ammo FROM their own racks; the shared Depot
--     and Market Stall hold stock too (stacks tagged by owning founder).
--     A building whose output cannot fit HALTS (no partial batches, no
--     silent waste) until space frees.
--   * TRANSFER LINKS, not walking haulers: '-link <from> <to> [good]'
--     opens a directed route that pumps up to 5 charges per second
--     between two of your buildings (or depot/stall). 2 outgoing routes
--     per building per founder, 1200 range, no pathing anywhere. Links
--     from the same building are served in CREATION ORDER — a hungry
--     first route can starve the second; steer with filters or -unlink.
--     Towers never ship (racks only take deliveries). Refiners never
--     export their own inputs.
--   * The Depot is the company vault: dividends are UNDERWRITTEN by your
--     reserves there — each cycle pays on min(produced value, value of
--     your goods at the Depot). Bread is eaten from the Depot, the
--     Toolwright is paid from the Depot, contract deliveries draw from
--     the Depot. Idle goods alone still earn NOTHING (base is capped by
--     production, never replaced by parking).
--   * Selling needs goods AT the stall; buying lands goods AT the stall.
--   * A razed building SPILLS half its stored charges as ground stacks;
--     a Steward that picks a spill up couriers it to the Depot (surplus
--     beyond the vault's space is lost).
--   * A LIVE PRICE MULTIBOARD (one shared board, no GetLocalPlayer):
--     price, trend vs base and stall stock per commodity, refreshed on
--     every trade, every market cycle and stall arrivals.
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
--     1 ingot, drawn from the TOWER'S OWN rack on the DAMAGING event; with
--     an empty rack the shot is zeroed and the tower goes INERT (paused)
--     until a route restocks it.
--   * WAVES: 75s grace (scout raid at 45s), then 20 composed waves from 5
--     raider archetypes (swarm/armored/fast/siege/boss — the Toll Baron
--     REALLY spawns on 10 and 20), scaled by player count, swarm counts
--     jittered +-1 by the seeded PRNG. Leaks cost shared lives (boss 5).
--     Wave 20 cleared = victory + score line; then -endless to keep going.
--   * TOOLWRIGHT (phase 2): a 3-tier per-founder upgrade ladder paid in
--     COMMODITIES, never gold ('-forge buy'): Bench (harvesters +1/tick),
--     Works (refiners +1/batch), Charter (towers burn ammo only every
--     second shot). Spending goods on tiers keeps the economy circulating.
--   * CONTRACTS (phase 2): after every 4th wave the company board posts a
--     SEEDED choice of two contracts ('-contract a|b', one active max):
--     delivery consignments (goods in, lump dividend out), the Trade
--     Tariff (+20% sell prices for 2 cycles, next wave adds a marauder
--     squad) and the Toll Concession (-15% buy prices for 2 cycles, wave
--     bounties halved for 2 waves). Every offer/accept/deliver/resolve
--     beat lands in RUNLOG.
--   * WAVE TEXTURE (phase 2): the Tollman Skimmer (leaks also skim 25g
--     from every founder) rides waves 11/15/18, and each boss entry draws
--     a seeded AFFIX (Ironclad +35% hp / Swift +70 speed / Greedy: leak 7
--     but bounty 250).
--   * SEED: every random draw (wave edge, swarm jitter, contract offers,
--     boss affixes) flows through ONE
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
-- -sell <good> <qty>, -link <from> <to> [good], -unlink <from> <to>,
-- -links, -forge [buy], -contract [a|b], -deliver <qty>,
-- -seed N, -endless (after victory); '-test' toggles
-- debug gating (northreach convention): -gold N, -stock [bldg] <good> N,
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
local STACK_CAP         = 200     -- charges per storage slot (6 slots/building)
local PUMP_RATE         = 5      -- charges per transfer link per second
local LINK_RANGE        = 1200.0 -- max distance between linked buildings
local LINKS_OUT_MAX     = 2      -- outgoing links per building per founder
local SPILL_PCT         = 50     -- % of stored charges spilled on building death
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
DepotRec       = nil    -- the Depot's storage rec (shared; stacks tagged by pid)
StallUnit      = nil
StallRec       = nil    -- the Market Stall's storage rec (shared)
Stewards       = {}     -- pid -> steward unit
LinkList       = {}     -- append-ordered directed transfer links (determinism)
BuildSeq       = {}     -- pid -> key -> ordinal (building names: woodcamp1, ...)
Board          = nil    -- the live price multiboard (one shared board)
BoardDirty     = false  -- stall stock changed since the last board refresh
ProducedC      = {}     -- pid -> market value (cents) produced this cycle
LastDividend   = {}     -- pid -> gold paid at the last cycle
InvestedStanding = {}   -- pid -> gold invested in standing buildings
PriceC         = {}     -- commodity key -> current price (cents, integer)
NetFlow        = {}     -- commodity key -> net units traded this cycle (+buy)
MarketProfit   = 0      -- company-wide: sell income - buy spend (gold)
ForgeTier      = {}     -- pid -> 0..3 Toolwright tiers forged
ShotParity     = {}     -- pid -> 0/1 (the Charter's every-second-shot bookkeeping)
ContractOffer  = nil    -- { a, b, wave } — open until the next wave launches
ContractActive = nil    -- the one accepted contract (one active max)
ContractsDone  = 0      -- fulfilled deliveries + resolved pacts
ContractsFailed = 0     -- missed delivery deadlines
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
-- Each commodity is a PHYSICAL item type (objects-items.json): goods live
-- as item charges in building inventories, one commodity stack per slot,
-- STACK_CAP charges per stack (phase 3).
COMMODITIES = {
  { key = "wood",   name = "Wood",   base = 200,  item = ITEM_WOOD },
  { key = "stone",  name = "Stone",  base = 300,  item = ITEM_STONE },
  { key = "grain",  name = "Grain",  base = 100,  item = ITEM_GRAIN },
  { key = "ore",    name = "Ore",    base = 500,  item = ITEM_ORE },
  { key = "planks", name = "Planks", base = 800,  item = ITEM_PLANKS },
  { key = "bread",  name = "Bread",  base = 400,  item = ITEM_BREAD },
  { key = "tools",  name = "Tools",  base = 1500, item = ITEM_TOOLS },
  { key = "ingots", name = "Ingots", base = 1800, item = ITEM_INGOTS },
}
COMM = {} -- key -> entry
ItemKeyOf = {} -- item type id -> commodity key (spill recovery)
for _, c in ipairs(COMMODITIES) do
  COMM[c.key] = c
  ItemKeyOf[c.item] = c.key
end

-- ------------------------------------------------------- physical storage
-- Every storage rec (production buildings, towers, the Depot, the Stall)
-- carries rec.store: slots 1..6, each nil or {key, pid, n, item}. The
-- engine item mirrors the stack (UnitAddItemToSlotById + SetItemCharges)
-- so the game SHOWS the goods; the Lua table is the source of truth. All
-- slot iteration is an explicit 1..6 loop — order is deterministic.

function CountGoods(rec, pid, key)
  if rec == nil then return 0 end
  local n = 0
  for i = 1, 6 do
    local s = rec.store[i]
    if s ~= nil and s.key == key and s.pid == pid then n = n + s.n end
  end
  return n
end

function CountAllGoods(rec, key) -- every founder's stacks (the board's column)
  if rec == nil then return 0 end
  local n = 0
  for i = 1, 6 do
    local s = rec.store[i]
    if s ~= nil and s.key == key then n = n + s.n end
  end
  return n
end

function SpaceFor(rec, pid, key)
  if rec == nil or rec.dead then return 0 end
  local space = 0
  for i = 1, 6 do
    local s = rec.store[i]
    if s == nil then
      space = space + STACK_CAP
    elseif s.key == key and s.pid == pid then
      space = space + (STACK_CAP - s.n)
    end
  end
  return space
end

-- store up to n charges (top up matching stacks, then open empty slots);
-- returns the amount actually stored. Rearms an inert tower and marks the
-- board dirty on stall arrivals.
function StoreGoods(rec, pid, key, n)
  if rec == nil or rec.dead or n <= 0 then return 0 end
  local left = n
  for i = 1, 6 do
    local s = rec.store[i]
    if left > 0 and s ~= nil and s.key == key and s.pid == pid and s.n < STACK_CAP then
      local add = STACK_CAP - s.n
      if add > left then add = left end
      s.n = s.n + add
      if s.item ~= nil then SetItemCharges(s.item, s.n) end
      left = left - add
    end
  end
  for i = 1, 6 do
    if left > 0 and rec.store[i] == nil then
      local add = left
      if add > STACK_CAP then add = STACK_CAP end
      UnitAddItemToSlotById(rec.unit, COMM[key].item, i - 1)
      local it = UnitItemInSlot(rec.unit, i - 1)
      if it ~= nil then SetItemCharges(it, add) end
      rec.store[i] = { key = key, pid = pid, n = add, item = it }
      left = left - add
    end
  end
  local stored = n - left
  if stored > 0 then
    if rec.def.kind == "tower" then MaybeRearm(rec) end
    if rec == StallRec then BoardDirty = true end
  end
  return stored
end

-- take exactly n of key from pid's stacks; false (untouched) when short
function TakeGoods(rec, pid, key, n)
  if rec == nil or n <= 0 or CountGoods(rec, pid, key) < n then return false end
  local left = n
  for i = 1, 6 do
    local s = rec.store[i]
    if left > 0 and s ~= nil and s.key == key and s.pid == pid then
      local take = s.n
      if take > left then take = left end
      s.n = s.n - take
      left = left - take
      if s.n <= 0 then
        if s.item ~= nil then RemoveItem(s.item) end
        rec.store[i] = nil
      elseif s.item ~= nil then
        SetItemCharges(s.item, s.n)
      end
    end
  end
  if rec == StallRec then BoardDirty = true end
  return true
end

function SetGoods(rec, pid, key, n) -- debug -stock: set a stack exactly
  local cur = CountGoods(rec, pid, key)
  if cur > 0 then TakeGoods(rec, pid, key, cur) end
  if n > 0 then StoreGoods(rec, pid, key, n) end
end

-- pid's total holdings everywhere (depot + stall + own buildings) — the
-- score/eco view; the storage recs are visited in a fixed order.
function StockOf(pid, key)
  local n = CountGoods(DepotRec, pid, key) + CountGoods(StallRec, pid, key)
  for _, rec in ipairs(BuildingList) do
    if not rec.dead and rec.pid == pid then n = n + CountGoods(rec, pid, key) end
  end
  return n
end

-- resolve a player-visible storage name: "depot", "stall" or one of YOUR
-- buildings ("woodcamp1", "watchtower2", ... — see -eco)
function FindStorage(pid, name)
  if name == "depot" then return DepotRec end
  if name == "stall" then return StallRec end
  for _, rec in ipairs(BuildingList) do
    if not rec.dead and rec.pid == pid and rec.name == name then return rec end
  end
  return nil
end

function StockAt(pid, name, key) -- observability (tests, -eco)
  return CountGoods(FindStorage(pid, name), pid, key)
end

function PriceOf(key) return PriceC[key] end

function BuyUnitC(key)  -- cents per unit bought (110% of price, ceil)
  local cents = (PriceC[key] * 11 + 9) // 10
  -- the Toll Concession pact: buy prices discounted while its cycles run
  if ContractActive ~= nil and ContractActive.key == "toll"
    and (ContractActive.cyclesLeft or 0) > 0 then
    cents = (cents * (100 - CONTRACTS.toll.pct) + 99) // 100
  end
  return cents
end

function SellUnitC(key) -- cents per unit sold (90% of price, floor)
  local cents = (PriceC[key] * 9) // 10
  -- the Trade Tariff pact: sell prices boosted while its cycles run
  if ContractActive ~= nil and ContractActive.key == "tariff"
    and (ContractActive.cyclesLeft or 0) > 0 then
    cents = (cents * (100 + CONTRACTS.tariff.pct)) // 100
  end
  return cents
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

-- Trading is PHYSICAL (phase 3): selling draws your goods AT the stall,
-- buying lands goods AT the stall (both refused when they cannot fit/be
-- found there). Route goods with -link.
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
  if StallRec == nil or StallRec.dead then
    Tell(pid, "|cffaaaaaaThe Market Stall is rubble -- there is no market to trade on.|r")
    return
  end
  if dir == "buy" then
    local cost = BuyGoldFor(key, qty)
    if GoldOf(pid) < cost then
      Tell(pid, "|cffaaaaaaBuying " .. qty .. " " .. c.name .. " costs " .. cost .. "g -- you are short.|r")
      return
    end
    local space = SpaceFor(StallRec, pid, key)
    if space < qty then
      Tell(pid, "|cffaaaaaaThe stall floor has room for only " .. space .. " more " .. c.name
        .. " of yours -- bought goods land AT the stall.|r")
      return
    end
    LockSeed("trade")
    AddGold(pid, -cost)
    StoreGoods(StallRec, pid, key, qty)
    NetFlow[key] = NetFlow[key] + qty
    MarketProfit = MarketProfit - cost
    Tell(pid, "|cff88ccffBought " .. qty .. " " .. c.name .. " for " .. cost .. "g (" .. FmtGold(BuyUnitC(key)) .. "g each) -- stacked at the stall.|r")
    LogRun("trade|pid=" .. pid .. "|buy|" .. key .. "|q=" .. qty .. "|gold=" .. cost)
  else
    local held = CountGoods(StallRec, pid, key)
    if held < qty then
      Tell(pid, "|cffaaaaaaYou hold " .. held .. " " .. c.name
        .. " AT THE STALL -- route goods there ('-link <from> stall') to sell.|r")
      return
    end
    LockSeed("trade")
    TakeGoods(StallRec, pid, key, qty)
    local gain = SellGoldFor(key, qty)
    AddGold(pid, gain)
    NetFlow[key] = NetFlow[key] - qty
    MarketProfit = MarketProfit + gain
    Tell(pid, "|cff88ccffSold " .. qty .. " " .. c.name .. " for " .. gain .. "g (" .. FmtGold(SellUnitC(key)) .. "g each).|r")
    LogRun("trade|pid=" .. pid .. "|sell|" .. key .. "|q=" .. qty .. "|gold=" .. gain)
  end
  UpdateBoard()
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

-- ---------------------------------------------------------- the Toolwright
-- A 3-tier per-founder upgrade ladder paid in COMMODITIES, never gold
-- (Economy TD's blacksmith idea, bounded and credited): spending goods on
-- permanent improvements keeps the market circulating. No PRNG, no seed
-- interaction — the ladder is pure commitment.
FORGE_TIERS = {
  { name = "Toolwright's Bench",   desc = "your harvesters yield +1 unit per tick",
    cost = { { "tools", 4 }, { "planks", 6 } } },
  { name = "Toolwright's Works",   desc = "your refiners yield +1 unit per batch",
    cost = { { "tools", 8 }, { "ingots", 4 } } },
  { name = "Toolwright's Charter", desc = "your towers burn ammo only every SECOND shot",
    cost = { { "tools", 12 }, { "ingots", 8 } } },
}

function ForgeTierOf(pid) return ForgeTier[pid] or 0 end

function ForgeCostText(tier)
  local parts = {}
  for _, cst in ipairs(FORGE_TIERS[tier].cost) do
    parts[#parts + 1] = cst[2] .. " " .. cst[1]
  end
  return table.concat(parts, " + ")
end

function ShowForge(pid)
  local t = ForgeTierOf(pid)
  Tell(pid, "|cffffcc00Toolwright ladder|r (paid in GOODS from your Depot reserve, never gold; your tier: "
    .. t .. "/" .. #FORGE_TIERS .. "):")
  for i, def in ipairs(FORGE_TIERS) do
    local mark
    if i <= t then mark = "[forged]"
    elseif i == t + 1 then mark = "[next: '-forge buy' for " .. ForgeCostText(i) .. "]"
    else mark = "[locked]" end
    Tell(pid, "|cffaaddff" .. i .. ". " .. def.name .. "|r -- " .. def.desc .. " " .. mark)
  end
end

function HandleForgeBuy(pid)
  local t = ForgeTierOf(pid)
  if t >= #FORGE_TIERS then
    Tell(pid, "|cffaaaaaaThe Toolwright has nothing left to teach you.|r")
    return
  end
  local def = FORGE_TIERS[t + 1]
  for _, cst in ipairs(def.cost) do
    if CountGoods(DepotRec, pid, cst[1]) < cst[2] then
      Tell(pid, "|cffaaaaaa" .. def.name .. " costs " .. ForgeCostText(t + 1)
        .. " AT THE DEPOT -- you are short of " .. cst[1] .. " there.|r")
      return
    end
  end
  for _, cst in ipairs(def.cost) do TakeGoods(DepotRec, pid, cst[1], cst[2]) end
  ForgeTier[pid] = t + 1
  LogRun("forge|pid=" .. pid .. "|tier=" .. (t + 1))
  AnnounceAll("|cffffdd66" .. GetPlayerName(Player(pid)) .. " forges " .. def.name
    .. " -- " .. def.desc .. ".|r")
end

-- ---------------------------------------------------------------- contracts
-- After every 4th wave the company board posts a SEEDED choice of two
-- contracts; one active contract max; every state transition is a RUNLOG
-- beat (offer / accept / deliver / fulfilled / failed / resolved / lapsed).
-- The offer draws ALWAYS happen (whether or not anyone can accept), so the
-- PRNG stream never depends on player state — only on the run's inputs.
CONTRACTS = {
  planks = { kind = "deliver", name = "Plank Consignment", good = "planks",
             qty = 30, waves = 3, lump = 120 },
  bread  = { kind = "deliver", name = "Provisions Order", good = "bread",
             qty = 20, waves = 3, lump = 90 },
  tariff = { kind = "tariff", name = "Trade Tariff", pct = 20, cycles = 2,
             squad = "marauder", squadN = 3 },
  toll   = { kind = "toll", name = "Toll Concession", pct = 15, cycles = 2,
             bwaves = 2 },
}
CONTRACT_ORDER = { "planks", "bread", "tariff", "toll" }

function ContractTerms(key, wave)
  local def = CONTRACTS[key]
  if def.kind == "deliver" then
    return def.name .. ": deliver " .. def.qty .. " " .. def.good
      .. " ('-deliver N') before wave " .. (wave + def.waves)
      .. " clears -- a lump " .. def.lump .. "g dividend to every founder"
  elseif def.kind == "tariff" then
    return def.name .. ": sell prices +" .. def.pct .. "% for " .. def.cycles
      .. " market cycles, but the next wave adds a marauder squad (+" .. def.squadN .. ")"
  end
  return def.name .. ": buy prices -" .. def.pct .. "% for " .. def.cycles
    .. " market cycles, but wave bounties are HALVED for the next " .. def.bwaves .. " waves"
end

function OfferContracts()
  local i = RandInt(1, #CONTRACT_ORDER)
  local j = RandInt(1, #CONTRACT_ORDER - 1)
  if j >= i then j = j + 1 end
  ContractOffer = { a = CONTRACT_ORDER[i], b = CONTRACT_ORDER[j], wave = WaveNumber }
  LogRun("contract|offer|wave=" .. WaveNumber .. "|a=" .. ContractOffer.a
    .. "|b=" .. ContractOffer.b)
  AnnounceAll("|cffffcc00The company board posts CONTRACTS -- accept ONE before the next wave:|r")
  AnnounceAll("|cffaaddff-contract a: " .. ContractTerms(ContractOffer.a, WaveNumber) .. "|r")
  AnnounceAll("|cffaaddff-contract b: " .. ContractTerms(ContractOffer.b, WaveNumber) .. "|r")
  if ContractActive ~= nil then
    AnnounceAll("|cffaaaaaa(The company's hands are full -- the "
      .. ContractActive.def.name .. " must resolve first.)|r")
  end
end

function AcceptContract(pid, slot)
  if ContractOffer == nil then
    Tell(pid, "|cffaaaaaaNothing is on the board -- contracts are posted after every fourth wave.|r")
    return
  end
  if ContractActive ~= nil then
    Tell(pid, "|cffaaaaaaOne contract at a time -- the " .. ContractActive.def.name
      .. " must resolve first.|r")
    return
  end
  local key = (slot == "a") and ContractOffer.a or ContractOffer.b
  local def = CONTRACTS[key]
  local a = { key = key, def = def }
  if def.kind == "deliver" then
    a.delivered = 0
    a.due = ContractOffer.wave + def.waves
  elseif def.kind == "tariff" then
    a.cyclesLeft = def.cycles
    a.squadPending = true
  else
    a.cyclesLeft = def.cycles
    a.bountyWaves = def.bwaves
  end
  ContractActive = a
  local offerWave = ContractOffer.wave
  ContractOffer = nil
  LogRun("contract|accept|pid=" .. pid .. "|" .. key)
  AnnounceAll("|cff88ccff" .. GetPlayerName(Player(pid)) .. " signs the "
    .. def.name .. ": " .. ContractTerms(key, offerWave) .. ".|r")
end

function HandleDeliver(pid, n)
  local a = ContractActive
  if a == nil or a.def.kind ~= "deliver" then
    Tell(pid, "|cffaaaaaaNo delivery contract is open.|r")
    return
  end
  if n == nil or n < 1 then
    Tell(pid, "|cffaaaaaaQuantity must be 1-999.|r")
    return
  end
  local remaining = a.def.qty - a.delivered
  if n > remaining then n = remaining end
  local atDepot = CountGoods(DepotRec, pid, a.def.good)
  if atDepot < n then n = atDepot end
  if n < 1 then
    Tell(pid, "|cffaaaaaaYou hold no " .. a.def.good .. " AT THE DEPOT to deliver -- consignments ship from the vault.|r")
    return
  end
  TakeGoods(DepotRec, pid, a.def.good, n)
  a.delivered = a.delivered + n
  LogRun("contract|deliver|pid=" .. pid .. "|" .. a.def.good .. "|n=" .. n
    .. "|total=" .. a.delivered .. "/" .. a.def.qty)
  Tell(pid, "|cff88ccffDelivered " .. n .. " " .. a.def.good .. " ("
    .. a.delivered .. "/" .. a.def.qty .. ").|r")
  if a.delivered >= a.def.qty then
    for _, u in ipairs(Users) do AddGold(u, a.def.lump) end
    ContractsDone = ContractsDone + 1
    ContractActive = nil
    LogRun("contract|fulfilled|" .. a.key .. "|lump=" .. a.def.lump)
    AnnounceAll("|cffffdd66The " .. a.def.name .. " is FULFILLED -- a lump "
      .. a.def.lump .. "g dividend lands in every founder's purse.|r")
  end
end

-- an effect pact resolves once every clause has run its course
function CheckPactResolved()
  local a = ContractActive
  if a == nil or a.def.kind == "deliver" then return end
  if (a.cyclesLeft or 0) <= 0 and not a.squadPending and (a.bountyWaves or 0) <= 0 then
    ContractsDone = ContractsDone + 1
    ContractActive = nil
    LogRun("contract|resolved|" .. a.key)
    AnnounceAll("|cff88ccffThe " .. a.def.name .. " has run its course -- the books close on it.|r")
  end
end

-- wave-clear bookkeeping: delivery deadlines are checked here
function ContractWaveCheck()
  local a = ContractActive
  if a == nil then return end
  if a.def.kind == "deliver" then
    if WaveNumber >= a.due and a.delivered < a.def.qty then
      ContractsFailed = ContractsFailed + 1
      ContractActive = nil
      LogRun("contract|failed|" .. a.key .. "|got=" .. a.delivered .. "/" .. a.def.qty)
      AnnounceAll("|cffff8866The " .. a.def.name .. " FAILS -- only " .. a.delivered
        .. " of " .. a.def.qty .. " " .. a.def.good .. " arrived in time. The company's name suffers.|r")
    end
  else
    CheckPactResolved()
  end
end

function ShowContract(pid)
  if ContractActive ~= nil then
    local a = ContractActive
    if a.def.kind == "deliver" then
      Tell(pid, "|cffffcc00Active contract:|r " .. a.def.name .. " -- " .. a.delivered
        .. "/" .. a.def.qty .. " " .. a.def.good .. " delivered ('-deliver N'), due before wave "
        .. a.due .. " clears.")
    else
      local bits = (a.cyclesLeft or 0) .. " market cycles left"
      if a.squadPending then bits = bits .. ", the marauder squad is still owed" end
      if (a.bountyWaves or 0) > 0 then bits = bits .. ", " .. a.bountyWaves .. " halved bounties left" end
      Tell(pid, "|cffffcc00Active contract:|r " .. a.def.name .. " -- " .. bits .. ".")
    end
  elseif ContractOffer ~= nil then
    Tell(pid, "|cffffcc00On the board (accept before the next wave):|r")
    Tell(pid, "|cffaaddff-contract a: " .. ContractTerms(ContractOffer.a, ContractOffer.wave) .. "|r")
    Tell(pid, "|cffaaddff-contract b: " .. ContractTerms(ContractOffer.b, ContractOffer.wave) .. "|r")
  else
    Tell(pid, "|cffaaaaaaNo contracts on the board -- the company posts them after every fourth wave.|r")
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
-- Phase 3: every building gets a 6-slot physical store and a stable
-- player-visible name (key + per-founder ordinal: woodcamp1, sawmill2...)
-- that -link/-unlink/-stock address it by.
function RegisterBuilding(u)
  local key = BuildKeyOfUnit(u)
  if key == nil or Buildings[u] ~= nil then return end
  local pid = GetPlayerId(GetOwningPlayer(u))
  BuildSeq[pid] = BuildSeq[pid] or {}
  local seq = (BuildSeq[pid][key] or 0) + 1
  BuildSeq[pid][key] = seq
  local rec = { unit = u, key = key, name = key .. seq, def = BUILD_DEFS[key],
    pid = pid, dead = false, store = {} }
  Buildings[u] = rec
  BuildingList[#BuildingList + 1] = rec
  InvestedStanding[pid] = (InvestedStanding[pid] or 0) + rec.def.cost
  LogRun("build|pid=" .. pid .. "|" .. rec.name)
  Tell(pid, "|cff88ff88" .. rec.name .. " raised -- " .. rec.def.cost
    .. "g now working for your dividend (stake: " .. InvestedStanding[pid] .. "g).|r")
end

function InvestedOf(pid) return InvestedStanding[pid] or 0 end

-- ------------------------------------------------------ production/dividend

-- a producer whose output cannot fit in its OWN slots halts whole batches
-- (no partials, no silent waste) until space frees — the phase-3 overflow
-- rule. Transitions are told to the owner, not logged (no beat spam).
function OutputHalted(rec, key, qty)
  if SpaceFor(rec, rec.pid, key) >= qty then
    if rec.halted then
      rec.halted = nil
      Tell(rec.pid, "|cff88ff88Your " .. rec.name .. " has room again and resumes work.|r")
    end
    return false
  end
  if not rec.halted then
    rec.halted = true
    Tell(rec.pid, "|cffff8866Your " .. rec.name .. " is FULL -- it halts until a route ('-link') moves its goods out.|r")
  end
  return true
end

function ProductionTick()
  for _, rec in ipairs(BuildingList) do
    if not rec.dead and Alive(rec.unit) then
      local d = rec.def
      if d.kind == "harvest" then
        local qty = d.qty
        if ForgeTierOf(rec.pid) >= 1 then qty = qty + 1 end -- Toolwright's Bench
        if not OutputHalted(rec, d.out, qty) then
          StoreGoods(rec, rec.pid, d.out, qty)
          ProducedC[rec.pid] = ProducedC[rec.pid] + qty * PriceC[d.out]
        end
      elseif d.kind == "refine" then
        -- inputs come from the refiner's OWN slots (route them in)
        local ok = true
        for _, inp in ipairs(d.inputs) do
          if CountGoods(rec, rec.pid, inp[1]) < inp[2] then ok = false end
        end
        if ok then
          local qty = d.qty
          if ForgeTierOf(rec.pid) >= 2 then qty = qty + 1 end -- Toolwright's Works
          if not OutputHalted(rec, d.out, qty) then
            for _, inp in ipairs(d.inputs) do TakeGoods(rec, rec.pid, inp[1], inp[2]) end
            StoreGoods(rec, rec.pid, d.out, qty)
            ProducedC[rec.pid] = ProducedC[rec.pid] + qty * PriceC[d.out]
          end
        end
      end
    end
  end
end

-- pid's goods value (cents, current prices) banked at the Depot — the
-- vault reserve that UNDERWRITES the dividend (phase 3)
function DepotValueC(pid)
  local v = 0
  for _, c in ipairs(COMMODITIES) do
    v = v + CountGoods(DepotRec, pid, c.key) * PriceC[c.key]
  end
  return v
end

-- cycle end: bread is eaten from the DEPOT (provisions live in the vault),
-- dividends are paid on this cycle's production value UNDERWRITTEN by your
-- Depot reserve — min(produced, banked value) — then the market reprices.
-- NO interest on cash, and parked goods alone earn nothing either: the
-- reserve is a CAP on production income, never a source.
function CycleEnd()
  CycleCount = CycleCount + 1
  for _, pid in ipairs(Users) do
    local eaten = CountGoods(DepotRec, pid, "bread")
    if eaten > BREAD_MAX_EAT then eaten = BREAD_MAX_EAT end
    if eaten > 0 then
      TakeGoods(DepotRec, pid, "bread", eaten)
      LogRun("eat|pid=" .. pid .. "|n=" .. eaten)
    end
    local commit = (InvestedStanding[pid] or 0) // COMMIT_PER_GOLD
    if commit > COMMIT_CAP_PCT then commit = COMMIT_CAP_PCT end
    local bonus = commit + eaten * BREAD_BONUS_PCT
    local baseC = ProducedC[pid]
    local reserveC = DepotValueC(pid)
    if reserveC < baseC then baseC = reserveC end
    local divC = (baseC * DIV_RATE_PCT) // 100
    divC = (divC * (100 + bonus)) // 100
    local gold = divC // 100
    LastDividend[pid] = gold
    if gold > 0 then
      AddGold(pid, gold)
      Tell(pid, "|cffffdd66Dividend: +" .. gold .. "g on this cycle's production (+"
        .. bonus .. "% commitment/bread bonus; vault reserve underwrites it).|r")
      LogRun("div|pid=" .. pid .. "|gold=" .. gold .. "|bonus=" .. bonus)
    end
    ProducedC[pid] = 0
  end
  MarketCycle()
  UpdateBoard()
  -- effect pacts burn a cycle at each market close
  if ContractActive ~= nil and (ContractActive.cyclesLeft or 0) > 0 then
    ContractActive.cyclesLeft = ContractActive.cyclesLeft - 1
    CheckPactResolved()
  end
end

function DividendOf(pid) return LastDividend[pid] or 0 end

-- ------------------------------------------------------------------- towers
-- Every tower shot burns 1 unit of its ammo commodity from the tower's OWN
-- rack (its inventory — phase 3), drawn in the DAMAGING event (fires for
-- real engine attacks in the game and for sim.damage in the harness). No
-- ammo: the shot is zeroed and the tower goes INERT (paused) until a route
-- (or a debug -stock) puts charges back in its slots.
AmmoSpent = {} -- pid -> total units burned (observability)

function HandleDamaging()
  local src = GetEventDamageSource()
  if src == nil then return end
  local rec = Buildings[src]
  if rec == nil or rec.dead or rec.def.kind ~= "tower" then return end
  if ForgeTierOf(rec.pid) >= 3 then -- Toolwright's Charter: every 2nd shot free
    ShotParity[rec.pid] = 1 - (ShotParity[rec.pid] or 0)
    if ShotParity[rec.pid] == 0 then return end
  end
  if TakeGoods(rec, rec.pid, rec.def.ammo, 1) then
    AmmoSpent[rec.pid] = (AmmoSpent[rec.pid] or 0) + 1
  else
    BlzSetEventDamage(0.0)
    if not TowerInert[src] then
      TowerInert[src] = true
      PauseUnit(src, true)
      Tell(rec.pid, "|cffff8866Your " .. rec.name .. " has run dry of " .. rec.def.ammo
        .. " -- it stands INERT until a route restocks its rack.|r")
      LogRun("tower|inert|pid=" .. rec.pid .. "|" .. rec.name)
    end
  end
end

-- called by StoreGoods whenever charges land in a tower's rack
function MaybeRearm(rec)
  if TowerInert[rec.unit] and not rec.dead
    and CountGoods(rec, rec.pid, rec.def.ammo) > 0 then
    TowerInert[rec.unit] = nil
    PauseUnit(rec.unit, false)
    Tell(rec.pid, "|cff88ff88Your " .. rec.name .. " is restocked and firing again.|r")
    LogRun("tower|rearmed|pid=" .. rec.pid .. "|" .. rec.name)
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

-- ------------------------------------------------------------ transfer links
-- Economy TD's logistics physicality, adapted with credit: no unit walks —
-- a LINK is a directed route that pumps up to PUMP_RATE charges per second
-- from one building's slots to another's. Player command:
--   -link <from> <to> [good]   (names from -eco, plus depot/stall)
-- Rules (all deterministic, all position- not pathing-based):
--   * both endpoints yours or shared (depot/stall); range LINK_RANGE
--   * LINKS_OUT_MAX outgoing routes per building per founder
--   * links pump only YOUR stacks; optional [good] filters the route
--   * refiners never export their own inputs; towers never ship at all
--   * links from one building are served in CREATION ORDER — a hungry
--     first route can starve the second (steer with filters/-unlink)
--   * a link dies with either endpoint (link|cut beat)

function IsRefinerInput(rec, key)
  if rec.def.kind ~= "refine" then return false end
  for _, inp in ipairs(rec.def.inputs) do
    if inp[1] == key then return true end
  end
  return false
end

function LinksOutOf(pid, rec)
  local n = 0
  for _, ln in ipairs(LinkList) do
    if not ln.dead and ln.pid == pid and ln.from == rec then n = n + 1 end
  end
  return n
end

function HandleLink(pid, fromName, toName, filterKey)
  local from = FindStorage(pid, fromName)
  local to = FindStorage(pid, toName)
  if from == nil or to == nil or from.dead or to.dead then
    Tell(pid, "|cffaaaaaa-link wants two of YOUR buildings by name (see -eco), or depot/stall.|r")
    return
  end
  if from == to then
    Tell(pid, "|cffaaaaaaA building cannot ship to itself.|r")
    return
  end
  if from.def.kind == "tower" then
    Tell(pid, "|cffaaaaaaTowers do not ship -- their racks only take deliveries.|r")
    return
  end
  local filter = nil
  if filterKey ~= nil and filterKey ~= "" then
    if COMM[filterKey] == nil then
      Tell(pid, "|cffaaaaaaNo such good. Goods: wood, stone, grain, ore, planks, bread, tools, ingots.|r")
      return
    end
    filter = filterKey
  end
  for _, ln in ipairs(LinkList) do
    if not ln.dead and ln.pid == pid and ln.from == from and ln.to == to then
      Tell(pid, "|cffaaaaaa" .. from.name .. " already ships to " .. to.name .. " -- -unlink it first.|r")
      return
    end
  end
  if LinksOutOf(pid, from) >= LINKS_OUT_MAX then
    Tell(pid, "|cffaaaaaa" .. from.name .. " already runs " .. LINKS_OUT_MAX
      .. " outgoing routes -- -unlink one first.|r")
    return
  end
  local dx = GetUnitX(from.unit) - GetUnitX(to.unit)
  local dy = GetUnitY(from.unit) - GetUnitY(to.unit)
  if dx * dx + dy * dy > LINK_RANGE * LINK_RANGE then
    Tell(pid, "|cffaaaaaa" .. to.name .. " is out of carting range of " .. from.name
      .. " (" .. math.floor(LINK_RANGE) .. ") -- place storage closer.|r")
    return
  end
  LinkList[#LinkList + 1] = { pid = pid, from = from, to = to, filter = filter }
  LogRun("link|create|pid=" .. pid .. "|" .. from.name .. ">" .. to.name
    .. (filter ~= nil and ("|" .. filter) or ""))
  Tell(pid, "|cff88ccffRoute open: " .. from.name .. " -> " .. to.name
    .. (filter ~= nil and (" (" .. filter .. " only)") or "")
    .. ", up to " .. PUMP_RATE .. " goods/s.|r")
end

function HandleUnlink(pid, fromName, toName)
  for _, ln in ipairs(LinkList) do
    if not ln.dead and ln.pid == pid and ln.from.name == fromName and ln.to.name == toName then
      ln.dead = true
      LogRun("link|cut|pid=" .. pid .. "|" .. fromName .. ">" .. toName)
      Tell(pid, "|cffaaaaaaRoute cut: " .. fromName .. " -> " .. toName .. ".|r")
      return
    end
  end
  Tell(pid, "|cffaaaaaaNo such route of yours. '-links' lists them.|r")
end

function CutLinksFor(u)
  for _, ln in ipairs(LinkList) do
    if not ln.dead and (ln.from.unit == u or ln.to.unit == u) then
      ln.dead = true
      LogRun("link|cut|pid=" .. ln.pid .. "|" .. ln.from.name .. ">" .. ln.to.name)
    end
  end
end

function ShowLinks(pid)
  local n = 0
  for _, ln in ipairs(LinkList) do
    if not ln.dead and ln.pid == pid then
      n = n + 1
      Tell(pid, "|cffaaddff" .. n .. ". " .. ln.from.name .. " -> " .. ln.to.name
        .. (ln.filter ~= nil and (" (" .. ln.filter .. " only)") or " (all goods)") .. "|r")
    end
  end
  if n == 0 then
    Tell(pid, "|cffaaaaaaNo routes. '-link <from> <to> [good]' opens one (names: see -eco; depot/stall work too).|r")
  end
end

-- one pump pass per virtual second, links in creation order, slots in
-- order — fully deterministic. Each link moves up to PUMP_RATE charges of
-- its owner's eligible stacks into whatever space the target has.
function PumpLinks()
  for _, ln in ipairs(LinkList) do
    if not ln.dead and not ln.from.dead and not ln.to.dead then
      local budget = PUMP_RATE
      local keys, seen = {}, {}
      for i = 1, 6 do
        local s = ln.from.store[i]
        if s ~= nil and s.pid == ln.pid and not seen[s.key]
          and (ln.filter == nil or ln.filter == s.key)
          and not IsRefinerInput(ln.from, s.key) then
          seen[s.key] = true
          keys[#keys + 1] = s.key
        end
      end
      for _, key in ipairs(keys) do
        if budget > 0 then
          local m = CountGoods(ln.from, ln.pid, key)
          if m > budget then m = budget end
          local space = SpaceFor(ln.to, ln.pid, key)
          if m > space then m = space end
          if m > 0 then
            TakeGoods(ln.from, ln.pid, key, m)
            StoreGoods(ln.to, ln.pid, key, m)
            budget = budget - m
          end
        end
      end
    end
  end
end

-- ------------------------------------------------------------ spill/recovery
-- A razed building SPILLS half its stored charges (per commodity, floor)
-- as ground item stacks at its feet; the rest burns with it. A Steward
-- that picks a spill up couriers it to the Depot with the recovering
-- founder's mark (surplus beyond the vault's space is lost).
function SpillStore(rec)
  local tag = rec.pid ~= nil and ("pid=" .. rec.pid .. "|" .. rec.name) or rec.name
  for _, c in ipairs(COMMODITIES) do
    local total = 0
    for i = 1, 6 do
      local s = rec.store[i]
      if s ~= nil and s.key == c.key then total = total + s.n end
    end
    if total > 0 then
      local sp = (total * SPILL_PCT) // 100
      if sp > 0 then
        local it = CreateItem(c.item, GetUnitX(rec.unit), GetUnitY(rec.unit))
        SetItemCharges(it, sp)
        LogRun("spill|" .. tag .. "|" .. c.key .. "|n=" .. sp)
      end
    end
  end
  for i = 1, 6 do
    local s = rec.store[i]
    if s ~= nil then
      if s.item ~= nil then RemoveItem(s.item) end
      rec.store[i] = nil
    end
  end
end

function HandleItemPickup()
  if GameOver then return end
  local u = GetTriggerUnit()
  if u == nil or GetUnitTypeId(u) ~= UNIT_STEWARD then return end
  local it = GetManipulatedItem()
  if it == nil then return end
  local key = ItemKeyOf[GetItemTypeId(it)]
  if key == nil then return end
  local n = GetItemCharges(it)
  if n == nil or n < 1 then n = 1 end
  RemoveItem(it)
  local pid = GetPlayerId(GetOwningPlayer(u))
  local stored = StoreGoods(DepotRec, pid, key, n)
  local lost = n - stored
  LogRun("recover|pid=" .. pid .. "|" .. key .. "|n=" .. stored
    .. (lost > 0 and ("|lost=" .. lost) or ""))
  Tell(pid, "|cff88ccffYour Steward couriers " .. stored .. " spilled " .. key
    .. " to the Depot" .. (lost > 0 and (" (" .. lost .. " lost -- the vault is full)") or "") .. ".|r")
end

-- ------------------------------------------------------- the live price board
-- Economy TD's price multiboard, adopted with credit: ONE shared board for
-- every founder (no GetLocalPlayer, desync-safe) — commodity, price, trend
-- vs base, stall stock. Refreshed on every trade, every market cycle, and
-- (through BoardDirty, once per second at most) on stall arrivals.
function SetBoardCell(r, col, txt, w)
  local mi = MultiboardGetItem(Board, r, col)
  MultiboardSetItemStyle(mi, true, false)
  MultiboardSetItemWidth(mi, w)
  MultiboardSetItemValue(mi, txt)
  MultiboardReleaseItem(mi)
end

function UpdateBoard()
  if Board == nil then return end
  BoardDirty = false
  for i, c in ipairs(COMMODITIES) do
    local pct = (PriceC[c.key] * 100) // c.base - 100
    local trend
    if pct > 0 then trend = "+" .. pct .. "%"
    elseif pct < 0 then trend = pct .. "%"
    else trend = "--" end
    SetBoardCell(i, 0, c.name, 0.05)
    SetBoardCell(i, 1, FmtGold(PriceC[c.key]) .. "g", 0.045)
    SetBoardCell(i, 2, trend, 0.035)
    SetBoardCell(i, 3, tostring(CountAllGoods(StallRec, c.key)), 0.035)
  end
end

function InitBoard()
  Board = CreateMultiboard()
  MultiboardSetTitleText(Board, "Coinstead Market")
  MultiboardSetRowCount(Board, #COMMODITIES + 1)
  MultiboardSetColumnCount(Board, 4)
  SetBoardCell(0, 0, "Good", 0.05)
  SetBoardCell(0, 1, "Price", 0.045)
  SetBoardCell(0, 2, "Trend", 0.035)
  SetBoardCell(0, 3, "Stall", 0.035)
  UpdateBoard()
  MultiboardDisplay(Board, true)
  MultiboardMinimize(Board, false)
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
  skimmer  = { unit = UNIT_TOLLMAN_SKIMMER,   hp = 160,  bounty = 8,   leak = 1, steal = 25 },
  baron    = { unit = UNIT_TOLL_BARON,        hp = 2500, bounty = 150, leak = 5, boss = true },
}
-- every boss ENTRY draws one seeded affix, applied to each baron it fields
BOSS_AFFIXES = {
  { key = "ironclad", hpPct = 135 },              -- +35% hit points
  { key = "swift",    ms = 340 },                 -- +70 move speed over the 270 base
  { key = "greedy",   leak = 7, bounty = 250 },   -- worse leak, richer kill
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
  { { "cutpurse", 12 }, { "runner", 4 }, { "skimmer", 3 } },
  { { "sapper", 5 }, { "marauder", 3 } },
  { { "runner", 12 } },
  { { "marauder", 8 }, { "sapper", 2 } },
  { { "cutpurse", 16 }, { "marauder", 4 }, { "skimmer", 3 } },
  { { "sapper", 6 }, { "runner", 6 } },
  { { "marauder", 10 } },
  { { "runner", 10 }, { "sapper", 4 }, { "skimmer", 4 } },
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

function SpawnRaider(kind, wave, x, y, affix)
  local a = ARCHETYPES[kind]
  local u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), a.unit, x, y, 270.0)
  local hp = WaveHpOf(kind, wave < 1 and 1 or wave)
  local leak, bounty = a.leak, a.bounty
  if affix ~= nil then
    if affix.hpPct ~= nil then hp = (hp * affix.hpPct) // 100 end
    if affix.ms ~= nil then SetUnitMoveSpeed(u, affix.ms + 0.0) end
    if affix.leak ~= nil then leak = affix.leak end
    if affix.bounty ~= nil then bounty = affix.bounty end
  end
  BlzSetUnitMaxHP(u, hp)
  SetWidgetLife(u, hp)
  RaiderRec[u] = { kind = kind, wave = wave, leak = leak, bounty = bounty }
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
  if ContractOffer ~= nil then -- the board clears when the road gets loud
    LogRun("contract|lapsed|wave=" .. ContractOffer.wave)
    AnnounceAll("|cffaaaaaaThe contract board clears unsigned.|r")
    ContractOffer = nil
  end
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
    local affix = nil
    if ARCHETYPES[kind].boss then
      affix = BOSS_AFFIXES[RandInt(1, #BOSS_AFFIXES)]
      LogRun("wave|bossaffix|" .. affix.key)
    end
    for i = 1, count do
      -- fan the pack out along the edge, perpendicular to the approach
      local off = (i - 1) * 72.0 - (count - 1) * 36.0
      if edge == 1 or edge == 3 then
        SpawnRaider(kind, n, ex + off, ey, affix)
      else
        SpawnRaider(kind, n, ex, ey + off, affix)
      end
    end
    parts[#parts + 1] = kind .. ":" .. count
    if ARCHETYPES[kind].boss then
      AnnounceAll("|cffff4444The " .. affix.key .. " TOLL BARON rides with wave " .. n
        .. " -- leaking him costs " .. (affix.leak or 5) .. " lives.|r")
    end
  end
  -- the Trade Tariff's owed marauder squad rides the next wave out
  if ContractActive ~= nil and ContractActive.squadPending then
    local sqk, sqn = ContractActive.def.squad, ContractActive.def.squadN
    for i = 1, sqn do
      local off = (i - 1) * 72.0 + 420.0
      if edge == 1 or edge == 3 then
        SpawnRaider(sqk, n, ex + off, ey)
      else
        SpawnRaider(sqk, n, ex, ey + off)
      end
    end
    ContractActive.squadPending = false
    parts[#parts + 1] = "pact:" .. sqk .. ":" .. sqn
    AnnounceAll("|cffff8866The Tariff's price rides with them -- a marauder squad joins the wave.|r")
    CheckPactResolved()
  end
  local desc = table.concat(parts, ",")
  AnnounceAll("|cffffcc00Wave " .. n .. " from the " .. EDGE_NAMES[edge] .. " -- " .. desc .. ".|r")
  LogRun("wave|start|" .. n .. "|edge=" .. EDGE_NAMES[edge] .. "|" .. desc)
end

function WaveCleared()
  WavePhase = "gap"
  local bounty = WAVE_BOUNTY_BASE + WAVE_BOUNTY_PER * WaveNumber
  -- the Toll Concession's price: halved bounties while its waves run
  if ContractActive ~= nil and (ContractActive.bountyWaves or 0) > 0 then
    bounty = bounty // 2
    ContractActive.bountyWaves = ContractActive.bountyWaves - 1
  end
  for _, pid in ipairs(Users) do AddGold(pid, bounty) end
  AnnounceAll("|cff88ff88Wave " .. WaveNumber .. " broken -- +" .. bounty .. "g to every founder.|r")
  LogRun("wave|clear|" .. WaveNumber .. "|bounty=" .. bounty)
  ContractWaveCheck()
  if WaveNumber >= FINAL_WAVE and not EndlessMode and not VictoryPending then
    VictoryReached()
    return
  end
  if WaveNumber % 4 == 0 and WaveNumber < FINAL_WAVE then
    OfferContracts()
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
  local skim = ARCHETYPES[rec.kind].steal
  if skim ~= nil then -- the Skimmer robs every founder's purse on the way out
    for _, pid in ipairs(Users) do
      local g = GoldOf(pid) - skim
      if g < 0 then g = 0 end
      SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, g)
    end
    LogRun("steal|gold=" .. skim)
    AnnounceAll("|cffff8866The Skimmer makes off with " .. skim .. "g from every founder's purse.|r")
  end
  RaiderGone(u, false)
  RemoveUnit(u)
  if Lives <= 0 then
    DefeatRun("The raiders bled the company dry.")
  end
end

-- ------------------------------------------------------------ score/verdict

function ComputeScore()
  local gold, stockV, invested, forgeV = 0, 0, 0, 0
  for _, pid in ipairs(Users) do
    gold = gold + GoldOf(pid)
    invested = invested + (InvestedStanding[pid] or 0)
    forgeV = forgeV + ForgeTierOf(pid) * 100 -- each forged tier is worth 100
    for _, c in ipairs(COMMODITIES) do
      stockV = stockV + SellGoldFor(c.key, StockOf(pid, c.key))
    end
  end
  local pactV = ContractsDone * 75 - ContractsFailed * 25
  local total = gold + stockV + invested + Lives * SCORE_PER_LIFE + MarketProfit
    + forgeV + pactV
  return total, gold, stockV, invested, Lives * SCORE_PER_LIFE, MarketProfit, forgeV, pactV
end

function ScoreLine(verdict)
  local total, gold, stockV, invested, livesV, profit, forgeV, pactV = ComputeScore()
  ScoreFinal = total
  return "COINSTEAD -- " .. verdict .. ". Score " .. total
    .. " (coin " .. gold .. " + goods " .. stockV .. " + stakes " .. invested
    .. " + lives " .. livesV .. " + market " .. profit
    .. " + forge " .. forgeV .. " + pacts " .. pactV .. ")."
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

  -- a registered building: its stored goods spill, its routes are cut,
  -- and (for player buildings) production AND its income stake die with it
  local rec = Buildings[u]
  if rec ~= nil and not rec.dead then
    rec.dead = true
    Buildings[u] = nil
    TowerInert[u] = nil
    SpillStore(rec)
    CutLinksFor(u)
    if rec.def.kind == "store" then -- the Market Stall (the Depot never gets here)
      AnnounceAll("|cffff4444The Market Stall is rubble -- the market is CLOSED. Its stock spills into the street.|r")
      LogRun("building|lost|stall")
      BoardDirty = true
      return
    end
    InvestedStanding[rec.pid] = (InvestedStanding[rec.pid] or 0) - rec.def.cost
    if InvestedStanding[rec.pid] < 0 then InvestedStanding[rec.pid] = 0 end
    Tell(rec.pid, "|cffff8866Your " .. rec.name .. " is rubble -- its " .. rec.def.cost
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
    for _ = 1, ClockScale do PumpLinks() end -- one pump pass per virtual second
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
    if BoardDirty then UpdateBoard() end -- stall arrivals: refresh at most 1/s
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
  Tell(pid, "|cffaaddffGoods are PHYSICAL:|r every building stores its goods as item stacks (6 slots x "
    .. STACK_CAP .. "); a full building HALTS. Refiners eat inputs from their OWN slots; route goods with '-link <from> <to> [good]' ("
    .. PUMP_RATE .. "/s, " .. LINKS_OUT_MAX .. " routes out per building, range " .. math.floor(LINK_RANGE)
    .. "; '-links', '-unlink <from> <to>'). A razed building spills HALF its stock -- a Steward can courier spills back to the Depot.")
  Tell(pid, "|cffaaddffDividends every " .. CYCLE_TIME .. "s:|r " .. DIV_RATE_PCT
    .. "% of what you PRODUCED -- underwritten by your Depot reserve: min(produced, goods banked at the Depot) -- +1%/"
    .. COMMIT_PER_GOLD .. "g standing stake (max +"
    .. COMMIT_CAP_PCT .. "%), +" .. BREAD_BONUS_PCT .. "%/bread eaten from the Depot (max "
    .. BREAD_MAX_EAT .. "). Idle cash and parked goods alone earn nothing; a dead building takes its stake with it.")
  Tell(pid, "|cffaaddffMarket:|r the multiboard tracks prices live; -price, -buy <good> <qty>, -sell <good> <qty>. SELLING needs your goods AT the stall; buying lands them there. Shared prices, 10% spread; prices move 1% per "
    .. ELASTIC_PER_PLAYER .. "x(players) net units traded, hard-capped at "
    .. MOVE_CAP_PCT .. "%/cycle. No randomness.")
  Tell(pid, "|cffaaddffAmmo:|r watchtowers burn planks, cannon towers burn ingots -- 1 per shot from the tower's OWN rack; an empty rack = INERT tower until a route restocks it.")
  Tell(pid, "|cffaaddffToolwright:|r '-forge' shows the 3-tier ladder, '-forge buy' pays the next tier in GOODS from your Depot reserve (harvest +1, refine +1, every 2nd shot free).")
  Tell(pid, "|cffaaddffContracts:|r posted after every 4th wave -- '-contract' to read the board, '-contract a|b' to sign (one active max), '-deliver N' ships from your DEPOT stock.")
  Tell(pid, "|cffaaddffCommands:|r -help -price -eco -lives -buy -sell -link -unlink -links -forge -contract -deliver -seed N (until the first trade/wave) -endless (after victory) -test (debug).")
  Tell(pid, "|cff888888A map by Serendipity. Credits: adapted with credit from Economy TD (anonymous, EpicWar), Gold TD (EpicWar), Legion TD (AutoAttackGames), Line Tower Wars (Hive Workshop). Mechanics only; nothing copied.|r")
end

function ShowPrices(pid)
  Tell(pid, "|cffffcc00Market prices|r (buy 110% / sell 90%, cycle "
    .. CycleCount .. ", next move in " .. (CYCLE_TIME - CycleClock) .. "s):")
  for _, c in ipairs(COMMODITIES) do
    Tell(pid, "|cffccaa66" .. c.name .. "|r " .. FmtGold(PriceC[c.key])
      .. "g (buy " .. FmtGold(BuyUnitC(c.key)) .. " / sell " .. FmtGold(SellUnitC(c.key))
      .. ") net " .. NetFlow[c.key] .. ", stall " .. CountAllGoods(StallRec, c.key))
  end
end

function StoreSummary(rec, pid)
  local parts = {}
  for _, c in ipairs(COMMODITIES) do
    local n = CountGoods(rec, pid, c.key)
    if n > 0 then parts[#parts + 1] = c.key .. " x" .. n end
  end
  return #parts > 0 and table.concat(parts, ", ") or "empty"
end

function ShowEco(pid)
  Tell(pid, "|cffffcc00Your ledger|r (stake " .. InvestedOf(pid)
    .. "g, last dividend " .. DividendOf(pid) .. "g):")
  local any = false
  for _, rec in ipairs(BuildingList) do
    if not rec.dead and rec.pid == pid then
      any = true
      Tell(pid, "|cffaaddff" .. rec.name .. ":|r " .. StoreSummary(rec, pid)
        .. (rec.halted and " |cffff8866[FULL - halted]|r" or "")
        .. (TowerInert[rec.unit] and " |cffff8866[INERT]|r" or ""))
    end
  end
  if not any then Tell(pid, "|cffaaddffBuildings:|r none") end
  Tell(pid, "|cffaaddffdepot:|r " .. StoreSummary(DepotRec, pid)
    .. " (reserve " .. (DepotValueC(pid) // 100) .. "g underwrites your dividend)")
  Tell(pid, "|cffaaddffstall:|r " .. StoreSummary(StallRec, pid))
  local links = 0
  for _, ln in ipairs(LinkList) do
    if not ln.dead and ln.pid == pid then links = links + 1 end
  end
  Tell(pid, "|cffaaddffRoutes:|r " .. links .. " ('-links' to list, '-link <from> <to> [good]' to open).")
  local inert = TowerInertCount(pid)
  if inert > 0 then
    Tell(pid, "|cffff8866" .. inert .. " of your towers stand INERT -- route ammo to their racks.|r")
  end
  if ForgeTierOf(pid) > 0 then
    Tell(pid, "|cffaaddffToolwright:|r tier " .. ForgeTierOf(pid) .. " ("
      .. FORGE_TIERS[ForgeTierOf(pid)].name .. ").")
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
  if msg == "-forge" then ShowForge(pid) return end
  if msg == "-forge buy" then
    if GameOver then return end
    HandleForgeBuy(pid)
    return
  end
  if msg == "-contract" then ShowContract(pid) return end
  local slotArg = string.match(msg, "^%-contract%s+([ab])$")
  if slotArg ~= nil then
    if GameOver then return end
    AcceptContract(pid, slotArg)
    return
  end
  local delArg = string.match(msg, "^%-deliver%s+(%d+)$")
  if delArg ~= nil then
    if GameOver then return end
    HandleDeliver(pid, ParseNumArg(delArg))
    return
  end

  local tradeDir, tradeKey, tradeQty = string.match(msg, "^%-(buy)%s+(%a+)%s+(%d+)$")
  if tradeDir == nil then
    tradeDir, tradeKey, tradeQty = string.match(msg, "^%-(sell)%s+(%a+)%s+(%d+)$")
  end
  if tradeDir ~= nil then
    if GameOver then return end
    DoTrade(pid, tradeDir, tradeKey, ParseNumArg(tradeQty))
    return
  end

  if msg == "-links" then ShowLinks(pid) return end
  local linkFrom, linkTo, linkGood = string.match(msg, "^%-link%s+(%w+)%s+(%w+)%s+(%a+)$")
  if linkFrom == nil then
    linkFrom, linkTo = string.match(msg, "^%-link%s+(%w+)%s+(%w+)$")
  end
  if linkFrom ~= nil then
    if GameOver then return end
    HandleLink(pid, linkFrom, linkTo, linkGood)
    return
  end
  local unFrom, unTo = string.match(msg, "^%-unlink%s+(%w+)%s+(%w+)$")
  if unFrom ~= nil then
    if GameOver then return end
    HandleUnlink(pid, unFrom, unTo)
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
        .. " enabled -test debug mode.|r Commands: -gold N, -stock [bldg] <good> N, -build <key>, -wave, -wavejump N, -setlives N, -clearwave, -ff, -runlog")
    else
      AnnounceAll("|cffff88ff" .. GetPlayerName(Player(pid)) .. " disabled -test debug mode.|r")
    end
    return
  end

  local goldArg = string.match(msg, "^%-gold%s+(%d+)$")
  -- -stock [<building>] <good> <N>: set a stack (default building: depot)
  local stockName, stockKey, stockArg = string.match(msg, "^%-stock%s+(%w+)%s+(%a+)%s+(%d+)$")
  if stockName == nil then
    stockKey, stockArg = string.match(msg, "^%-stock%s+(%a+)%s+(%d+)$")
  end
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
    local rec = DepotRec
    if stockName ~= nil then
      rec = FindStorage(pid, stockName)
      if rec == nil then
        Tell(pid, "|cffaaaaaaNo storage of yours named '" .. stockName .. "' (see -eco; depot/stall work too).|r")
        return
      end
    end
    SetGoods(rec, pid, stockKey, ParseNumArg(stockArg) or 0)
    Tell(pid, "|cffff88ff" .. COMM[stockKey].name .. " at " .. rec.name .. " set to "
      .. CountGoods(rec, pid, stockKey) .. ".|r")
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

  -- spill recovery: a Steward picking up a spilled commodity stack
  local pickup = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(pickup, EVENT_PLAYER_UNIT_PICKUP_ITEM)
  TriggerAddAction(pickup, HandleItemPickup)

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
  QuestSetDescription(q, "Coinstead -- a map by Serendipity (wc3-map-toolkit). Design inspirations, adapted with credit, nothing copied:"
    .. " Economy TD (anonymous, EpicWar) -- the economy-first tower defense frame, income from production,"
    .. " goods as physical item stacks moved by transfer routes, and the live price multiboard;"
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
    AnnounceAll("|cffaaddffYour Steward builds the economy: harvesters feed refiners, refiners feed the stall, the Depot and your TOWERS -- goods are PHYSICAL stacks, moved by '-link' routes, and every shot burns planks or ingots from the tower's own rack. Dividends pay on what you PRODUCE, underwritten by your Depot reserve -- never on idle coin.|r")
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
    ProducedC[pid] = 0
    LastDividend[pid] = 0
    InvestedStanding[pid] = 0
    AmmoSpent[pid] = 0
    ForgeTier[pid] = 0
    ShotParity[pid] = 0
    SetPlayerState(Player(pid), PLAYER_STATE_RESOURCE_GOLD, START_GOLD)
  end

  -- the shared Depot (owned by the first seated founder) and one Steward
  -- per founder at their start location
  DepotUnit = CreateUnit(Player(Users[1]), UNIT_COINSTEAD_DEPOT, 0.0, 0.0, 270.0)
  for _, pid in ipairs(Users) do
    local x, y = StartPosOf(pid)
    Stewards[pid] = CreateUnit(Player(pid), UNIT_STEWARD, x, y, 270.0)
  end

  -- the shared storage recs (phase 3): the Depot, and the preplaced
  -- Market Stall (found among the neutral-passive units CreateAllUnits
  -- placed). Their stacks are tagged per founder; -link addresses them
  -- as "depot" and "stall".
  DepotRec = { unit = DepotUnit, key = "depot", name = "depot",
    def = { kind = "store" }, pid = nil, dead = false, store = {} }
  Buildings[DepotUnit] = DepotRec
  local ng = CreateGroup()
  GroupEnumUnitsOfPlayer(ng, Player(PLAYER_NEUTRAL_PASSIVE), nil)
  local nu = FirstOfGroup(ng)
  while nu ~= nil do
    if GetUnitTypeId(nu) == UNIT_MARKET_STALL then StallUnit = nu end
    GroupRemoveUnit(ng, nu)
    nu = FirstOfGroup(ng)
  end
  DestroyGroup(ng)
  StallRec = { unit = StallUnit, key = "stall", name = "stall",
    def = { kind = "store" }, pid = nil, dead = false, store = {} }
  Buildings[StallUnit] = StallRec

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
