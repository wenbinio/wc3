'use strict';
// war3map.w3i format v25 / v31 codec (read + write).
//
// Why this exists: wc3maptranslator@5 hardcodes w3i v33 (Reforged), but the
// strategy maps published 2023-2026 — including ones saved by the 1.36/2.0
// editors — ship w3i v31, and classic-era (TFT) maps ship v25. This codec
// makes those versions read/write citizens of the pipeline; lib/filemap.js
// routes war3map.w3i by the leading version dword (25/31 -> here,
// 33 -> upstream InfoTranslator).
//
// v31 <-> v33 DELTA (verified against mdx-m3-viewer-th's w3i parser,
// War3Net's MapInfo.cs/PlayerData.cs, and two real v31 maps):
//   v33 = v31 + three trailing i32s in the settings block, right after
//   gameDataVersion: forceDefaultCameraZoom + forceMaxCameraZoom (added in
//   v32) and forceMinCameraZoom (added in v33), plus the matching flag bits
//   0x100000/0x200000/0x400000. EVERYTHING else — including gameVersion
//   (4 ints, since v28), scriptLanguage (since v28), supportedModes +
//   gameDataVersion (since v31) and the per-player enemyLow/enemyHigh
//   priority masks (since v31) — is identical.
//
// v25 <-> v31 DELTA: v25 (classic TFT) additionally lacks gameVersion and
// scriptLanguage (both v28+), supportedModes/gameDataVersion and the
// per-player enemy priority masks (all v31+). Loading screen / prologue
// model paths and the fog/weather/sound/light/water block are already
// present in v25 (v25+ in every reference implementation).
//
// JSON DIALECT: exactly upstream InfoTranslator's v33 dialect (same keys,
// nesting, flag names, '0000' null-FourCC convention, player-color-name
// bitmask arrays) plus a top-level `"version": 25|31` marker. Fields that
// don't exist at the file's version are emitted with neutral defaults on
// read (gameVersion zeros, scriptLanguage 0, supportedModes 3 SD+HD,
// gameDataVersion 1 TFT, camera zooms 0) so downstream consumers see the
// full v33 shape; the write path simply doesn't serialize them below the
// version they appeared in.
//
// FIDELITY EXTENSIONS (all optional, emitted only when needed): the upstream
// dialect is lossy in two places, and real v31 maps hit both. Where the
// value reconstructed from the dialect would differ from the file's, the
// codec adds a raw passthrough that the write path uses verbatim:
//   - map.flagsUnknown  — flag bits with no named boolean (real maps carry
//     0x8, plus WE's always-set 0x400/0x4000 which upstream force-ORs on
//     write). flags = named-bits | flagsUnknown. ALWAYS emitted on read
//     (even 0) so read -> write reproduces the dword exactly; only when the
//     key is absent (hand-written JSON) does the writer mirror upstream and
//     force-set 0x400|0x4000|0x8000.
//   - playersMask on forces/upgrades/techtree records — the raw u32 player
//     bitmask, kept when it can't be rebuilt from the player-name array
//     (bits 24-31 and nonexistent-player bits are common in real files;
//     upstream can only reconstruct bits 0-23 and force-fills force #0).
//     Same mechanism on player priority masks (allyLowPriorityFlagsMask,
//     allyHighPriorityFlagsMask, enemyLowPriorityFlagsMask,
//     enemyHighPriorityFlagsMask).
// Strings are UTF-8 both ways (byte-exact for valid-UTF-8 files, latin1
// read fallback otherwise — same policy as lib/translator-fixes.js FIX A);
// floats are read exactly (no 3-decimal rounding) so the values written
// back are bit-identical. Read -> write is byte-faithful for the real v25
// and v31 samples (test/codecs.test.js).
//
// PROTECTOR-TRUNCATED FILES: a RangeError inside any TAIL section (players
// onward) is tolerated on read — missing sections become empty arrays and
// the JSON gains `_truncated: true` + `_truncatedAt: '<section>'`
// (+ `_truncatedTail: '<hex>'` for leftover bytes); the write path then
// emits only through the last complete section + the tail verbatim, keeping
// read -> write byte-faithful (real case: DracoL1ch DotA's w3i v25, cut off
// after the forces block at byte 640 with one stray byte). Truncation
// inside the settings block still throws (classicw3i fallback territory).

const { fromPlayerBitfield, toPlayerBitfield } =
  require('wc3maptranslator/dist/src/PlayerBitfield');

const SUPPORTED_VERSIONS = [25, 31];

// upstream InfoTranslator's named flag bits (v33 dialect)
const NAMED_FLAGS = [
  ['hideMinimapInPreview', 0x1],
  ['modifyAllyPriorities', 0x2],
  ['isMeleeMap', 0x4],
  ['maskedPartiallyVisible', 0x10],
  ['fixedPlayerSetting', 0x20],
  ['useCustomForces', 0x40],
  ['useCustomTechtree', 0x80],
  ['useCustomAbilities', 0x100],
  ['useCustomUpgrades', 0x200],
  ['waterWavesOnCliffShores', 0x800],
  ['waterWavesOnRollingShores', 0x1000],
  ['useTerrainFog', 0x2000],
  ['useItemClassificationSystem', 0x8000],
  ['enableWaterTinting', 0x10000],
  ['useAccurateProbabilityForCalculations', 0x20000],
  ['useCustomAbilitySkins', 0x40000],
  ['disableDenyIcon', 0x80000],
  ['forceDefaultCameraZoom', 0x100000],
  ['forceMaxCameraZoom', 0x200000],
  ['forceMinCameraZoom', 0x400000],
];
const NAMED_FLAGS_MASK = NAMED_FLAGS.reduce((m, [, bit]) => m | bit, 0);

// ---------------------------------------------------------------- reading

class Cursor {
  constructor(buf) { this.buf = buf; this.off = 0; }
  need(n, what) {
    if (this.off + n > this.buf.length) {
      throw new RangeError(`w3i: truncated file (reading ${what} at byte ${this.off})`);
    }
  }
  i32(what) { this.need(4, what || 'int'); const v = this.buf.readInt32LE(this.off); this.off += 4; return v; }
  u32(what) { this.need(4, what || 'uint'); const v = this.buf.readUInt32LE(this.off); this.off += 4; return v; }
  f32(what) { this.need(4, what || 'float'); const v = this.buf.readFloatLE(this.off); this.off += 4; return v; }
  byte(what) { this.need(1, what || 'byte'); return this.buf[this.off++]; }
  // null-terminated string: UTF-8 when byte-exact under re-encode, else
  // latin1 (identical policy to the patched W3Buffer.readString, FIX A)
  str(what) {
    const start = this.off;
    let end = start;
    while (end < this.buf.length && this.buf[end] !== 0x00) end++;
    if (end >= this.buf.length) {
      throw new RangeError(`w3i: unterminated string (${what || 'string'}) at byte ${start}`);
    }
    this.off = end + 1;
    const bytes = this.buf.subarray(start, end);
    const utf8 = bytes.toString('utf8');
    if (Buffer.byteLength(utf8, 'utf8') === bytes.length && Buffer.from(utf8, 'utf8').equals(bytes)) {
      return utf8;
    }
    return bytes.toString('latin1');
  }
  // 4 chars, 0x00 bytes rendered as '0' (upstream readChars dialect)
  fourCC(what) {
    this.need(4, what || 'fourCC');
    let s = '';
    for (let i = 0; i < 4; i++) {
      const b = this.buf[this.off++];
      s += b === 0 ? '0' : String.fromCharCode(b);
    }
    return s;
  }
  char(what) {
    const b = this.byte(what);
    return b === 0 ? '0' : String.fromCharCode(b);
  }
}

// bitmask -> player-name array (+ raw `<key>Mask` passthrough whenever the
// write path couldn't rebuild the exact mask from the array). readFilter is
// what upstream uses on read (undefined for player priorities, the available
// player numbers everywhere else); writeFilter is always the available
// player numbers, mirroring upstream's jsonToWar.
function maskToJson(record, key, raw, readFilter, writeFilter, extraBits) {
  const players = fromPlayerBitfield(raw | 0, readFilter);
  record[key] = players;
  const rebuilt = (toPlayerBitfield(players, writeFilter) | (extraBits || 0)) >>> 0;
  if (rebuilt !== (raw >>> 0)) record[`${key}Mask`] = raw >>> 0;
}

function warToJson(buffer) {
  const c = new Cursor(buffer);
  const version = c.i32('version');
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(`w3i31: unsupported version ${version} (this codec reads v25/v31; v33 belongs to the upstream translator)`);
  }

  const result = { version };
  result.saves = c.i32('saves');
  result.editorVersion = c.i32('editorVersion');
  result.gameVersion = version >= 28
    ? { major: c.i32(), minor: c.i32(), patch: c.i32(), build: c.i32() }
    : { major: 0, minor: 0, patch: 0, build: 0 };

  const map = {};
  map.name = c.str('map name');
  map.author = c.str('author');
  map.description = c.str('description');
  map.recommendedPlayers = c.str('recommendedPlayers');

  const camera = {
    bounds: Array.from({ length: 8 }, () => c.f32('camera bounds')),
    complements: Array.from({ length: 4 }, () => c.i32('camera complements')),
  };
  map.playableArea = { width: c.i32('playable width'), height: c.i32('playable height') };

  const flags = c.u32('flags');
  map.mainTileType = c.char('tileset');
  map.flags = {};
  for (const [name, bit] of NAMED_FLAGS) map.flags[name] = !!(flags & bit);
  // ALWAYS emitted on read (even when 0) so the write path reproduces the
  // exact flags dword — only hand-written JSON lacking the key gets
  // upstream's forced 0x400|0x4000|0x8000 bits.
  const flagsUnknown = (flags & ~NAMED_FLAGS_MASK) >>> 0;
  map.flagsUnknown = flagsUnknown;
  // key order parity with upstream (mainTileType read after flags, but the
  // upstream dialect nests flags under map after playableArea)
  result.map = {
    name: map.name, author: map.author, description: map.description,
    recommendedPlayers: map.recommendedPlayers, playableArea: map.playableArea,
    mainTileType: map.mainTileType, flags: map.flags,
    flagsUnknown: map.flagsUnknown,
  };

  result.loadingScreen = {
    background: c.i32('loading screen background'),
    path: c.str('loading screen model'),
    text: c.str('loading screen text'),
    title: c.str('loading screen title'),
    subtitle: c.str('loading screen subtitle'),
  };
  result.gameDataSet = c.i32('gameDataSet');
  result.prologue = {
    path: c.str('prologue model'),
    text: c.str('prologue text'),
    title: c.str('prologue title'),
    subtitle: c.str('prologue subtitle'),
  };
  result.fog = {
    type: c.i32('fog type'),
    startHeight: c.f32('fog start'),
    endHeight: c.f32('fog end'),
    density: c.f32('fog density'),
    color: [c.byte(), c.byte(), c.byte()],
  };
  c.byte('fog alpha'); // always written back as 255, like upstream
  result.globalWeather = c.fourCC('global weather');
  result.customSoundEnvironment = c.str('sound environment');
  result.customLightEnv = c.char('light environment');
  result.water = [c.byte(), c.byte(), c.byte()];
  c.byte('water alpha'); // always written back as 255, like upstream

  result.scriptLanguage = version >= 28 ? c.i32('script language') : 0;
  if (version >= 31) {
    result.supportedModes = c.i32('supported modes');
    result.gameDataVersion = c.i32('game data version');
  } else {
    result.supportedModes = 3; // SD+HD, upstream's "Both"
    result.gameDataVersion = 1; // TFT
  }
  // v32 added forceDefault+forceMax, v33 added forceMin — none exist here
  result.forceDefaultCameraZoom = 0;
  result.forceMaxCameraZoom = 0;
  result.forceMinCameraZoom = 0;

  // ---- tail sections, TOLERANT of protector truncation -------------------
  // Real protected classics ship w3i files cut off mid-tail (DracoL1ch DotA:
  // 641 bytes, ending after the forces block + 1 stray byte). A hard throw
  // here used to demote the whole file to the read-only classicw3i fallback;
  // instead, a RangeError inside any tail section now degrades to:
  //   - that section and everything after it -> empty-array defaults,
  //   - `_truncated: true` + `_truncatedAt: '<section>'` markers (same
  //     convention as lib/classicw3i.js),
  //   - `_truncatedTail: '<hex>'` holding any leftover bytes from the
  //     truncated section's start (partial entries / protector filler),
  // and jsonToWar (below) writes only through the last complete section and
  // re-appends the tail verbatim — so read -> write stays BYTE-FAITHFUL for
  // truncated originals, and re-reading our own write reproduces the same
  // JSON (the write is byte-identical, so the re-read truncates identically).
  // Truncation inside the settings block above still throws (nothing
  // byte-faithful can be written from half a settings block) — those files
  // keep falling back to lib/classicw3i.js diagnostics.
  result.players = [];
  result.forces = [];
  result.upgrades = [];
  result.techtree = [];
  result.randomGroupTable = [];
  result.randomItemTable = [];
  let availablePlayerNums = [];
  let truncatedAt = null;
  let truncatedTailStart = 0;

  const readPlayers = () => {
  const rawPriorities = []; // deferred: rebuild check needs the full player list
  const numPlayers = c.i32('player count');
  for (let i = 0; i < numPlayers; i++) {
    const playerNum = c.i32('player number');
    const type = c.i32('player type');
    const race = c.i32('player race');
    const fixed = c.i32('fixed start position') === 1;
    const name = c.str('player name');
    const x = c.f32('player start x');
    const y = c.f32('player start y');
    const player = { name, startingPos: { x, y, fixed }, playerNum, type, race };
    const prio = {
      allyLowPriorityFlags: c.u32('ally low priorities'),
      allyHighPriorityFlags: c.u32('ally high priorities'),
    };
    if (version >= 31) {
      prio.enemyLowPriorityFlags = c.u32('enemy low priorities');
      prio.enemyHighPriorityFlags = c.u32('enemy high priorities');
    }
    result.players.push(player);
    rawPriorities.push(prio);
  }
  availablePlayerNums = result.players.map((p) => p.playerNum);
  result.players.forEach((player, i) => {
    for (const [key, raw] of Object.entries(rawPriorities[i])) {
      // upstream reads priorities UNfiltered but writes them filtered by the
      // available player numbers — mirror both sides
      maskToJson(player, key, raw, undefined, availablePlayerNums);
    }
    if (version < 31) {
      player.enemyLowPriorityFlags = [];
      player.enemyHighPriorityFlags = [];
    }
  });
  };

  const readForces = () => {
  const numForces = c.i32('force count');
  for (let i = 0; i < numForces; i++) {
    const forceFlag = c.u32('force flags');
    const flagsObj = {
      allied: !!(forceFlag & 0x1),
      alliedVictory: !!(forceFlag & 0x2),
      shareVision: !!(forceFlag & 0x8),
      shareUnitControl: !!(forceFlag & 0x10),
      shareAdvUnitControl: !!(forceFlag & 0x20),
    };
    const rawMask = c.u32('force player mask');
    const name = c.str('force name');
    const force = { name, flags: flagsObj };
    // upstream fills force #0 with the bits of all nonexistent players 0-23
    let extraBits = 0;
    if (i === 0) {
      for (let p = 0; p < 24; p++) if (!availablePlayerNums.includes(p)) extraBits |= (1 << p);
    }
    maskToJson(force, 'players', rawMask, availablePlayerNums, availablePlayerNums, extraBits);
    result.forces.push(force);
  }
  };

  const readUpgrades = () => {
  const numUpgrades = c.i32('upgrade count');
  for (let i = 0; i < numUpgrades; i++) {
    const rawMask = c.u32('upgrade player mask');
    const upgrade = { id: c.fourCC('upgrade id') };
    upgrade.level = c.i32('upgrade level');
    upgrade.availability = c.i32('upgrade availability');
    maskToJson(upgrade, 'players', rawMask, availablePlayerNums, availablePlayerNums);
    // upstream key order: { id, players, level, availability }
    result.upgrades[i] = {
      id: upgrade.id, players: upgrade.players,
      ...(upgrade.playersMask !== undefined ? { playersMask: upgrade.playersMask } : {}),
      level: upgrade.level, availability: upgrade.availability,
    };
  }
  };

  const readTechtree = () => {
  const numTech = c.i32('techtree count');
  for (let i = 0; i < numTech; i++) {
    const rawMask = c.u32('tech player mask');
    const tech = {};
    maskToJson(tech, 'players', rawMask, availablePlayerNums, availablePlayerNums);
    tech.id = c.fourCC('tech id');
    result.techtree.push(tech);
  }
  };

  const readRandomGroupTable = () => {
  const numGroups = c.i32('random group count');
  for (let i = 0; i < numGroups; i++) {
    const group = { number: c.i32('group number'), name: c.str('group name'), positions: [], rows: [] };
    const numPositions = c.i32('group position count');
    for (let j = 0; j < numPositions; j++) group.positions.push(c.i32('position type'));
    const numRows = c.i32('group row count');
    for (let j = 0; j < numRows; j++) {
      const chance = c.i32('row chance');
      const entries = [];
      for (let k = 0; k < numPositions; k++) entries.push(c.fourCC('row entry'));
      group.rows.push({ chance, entries });
    }
    result.randomGroupTable.push(group);
  }
  };

  const readRandomItemTable = () => {
  const numItemTables = c.i32('random item table count');
  for (let i = 0; i < numItemTables; i++) {
    const number = c.i32('item table number');
    const name = c.str('item table name');
    const sets = [];
    const numSets = c.i32('item set count');
    for (let j = 0; j < numSets; j++) {
      const set = [];
      const numItems = c.i32('item count');
      for (let k = 0; k < numItems; k++) {
        set.push({ chance: c.i32('item chance'), id: c.fourCC('item id') });
      }
      sets.push(set);
    }
    result.randomItemTable.push({ name, number, sets });
  }
  };

  const sections = [
    ['players', readPlayers],
    ['forces', readForces],
    ['upgrades', readUpgrades],
    ['techtree', readTechtree],
    ['randomGroupTable', readRandomGroupTable],
    ['randomItemTable', readRandomItemTable],
  ];
  for (const [name, read] of sections) {
    const sectionStart = c.off;
    try {
      read();
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      // protector-truncated tail (see comment above): discard the partial
      // parse of THIS section, default it and everything after, keep the
      // undecodable bytes verbatim for a byte-faithful write.
      truncatedAt = name;
      truncatedTailStart = sectionStart;
      result[name] = [];
      if (name === 'players') availablePlayerNums = [];
      break;
    }
  }

  if (!truncatedAt && c.off !== buffer.length) {
    throw new Error(`w3i31: ${buffer.length - c.off} unexpected trailing byte(s) after the random item tables`);
  }

  // reorder to the upstream dialect's top-level key layout, version first
  const truncMarkers = {};
  if (truncatedAt) {
    truncMarkers._truncated = true;      // same convention as lib/classicw3i.js
    truncMarkers._truncatedAt = truncatedAt;
    const tail = buffer.subarray(truncatedTailStart);
    if (tail.length > 0) truncMarkers._truncatedTail = tail.toString('hex');
  }
  return {
    json: {
      version,
      map: result.map,
      loadingScreen: result.loadingScreen,
      prologue: result.prologue,
      fog: result.fog,
      camera,
      players: result.players,
      forces: result.forces,
      upgrades: result.upgrades,
      techtree: result.techtree,
      randomGroupTable: result.randomGroupTable,
      randomItemTable: result.randomItemTable,
      saves: result.saves,
      editorVersion: result.editorVersion,
      gameDataVersion: result.gameDataVersion,
      gameDataSet: result.gameDataSet,
      scriptLanguage: result.scriptLanguage,
      supportedModes: result.supportedModes,
      gameVersion: result.gameVersion,
      globalWeather: result.globalWeather,
      customSoundEnvironment: result.customSoundEnvironment,
      customLightEnv: result.customLightEnv,
      water: result.water,
      forceDefaultCameraZoom: result.forceDefaultCameraZoom,
      forceMaxCameraZoom: result.forceMaxCameraZoom,
      forceMinCameraZoom: result.forceMinCameraZoom,
      ...truncMarkers,
    },
  };
}

// ---------------------------------------------------------------- writing

class Writer {
  constructor() { this.chunks = []; }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v | 0); this.chunks.push(b); }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); this.chunks.push(b); }
  f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); this.chunks.push(b); }
  byte(v) { this.chunks.push(Buffer.from([v & 0xff])); }
  str(s) { this.chunks.push(Buffer.from(String(s ?? ''), 'utf8'), Buffer.from([0])); }
  chars(s) { this.chunks.push(Buffer.from(String(s), 'latin1')); }
  buffer() { return Buffer.concat(this.chunks); }
}

function maskFromJson(record, key, availablePlayerNums, extraBits) {
  const maskKey = `${key === 'players' ? 'players' : key}Mask`;
  if (record[maskKey] !== undefined) return record[maskKey] >>> 0;
  return (toPlayerBitfield(record[key] || [], availablePlayerNums) | (extraBits || 0)) >>> 0;
}

function jsonToWar(json) {
  const version = json && json.version;
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error('w3i31: jsonToWar expects info JSON with "version": 25 or 31 (v33 belongs to the upstream translator)');
  }
  const w = new Writer();
  w.i32(version);
  w.i32(json.saves || 0);
  w.i32(json.editorVersion || 0);
  if (version >= 28) {
    const gv = json.gameVersion || {};
    w.i32(gv.major || 0); w.i32(gv.minor || 0); w.i32(gv.patch || 0); w.i32(gv.build || 0);
  }
  w.str(json.map.name);
  w.str(json.map.author);
  w.str(json.map.description);
  w.str(json.map.recommendedPlayers);
  for (let i = 0; i < 8; i++) w.f32(json.camera.bounds[i]);
  for (let i = 0; i < 4; i++) w.i32(json.camera.complements[i]);
  w.i32(json.map.playableArea.width);
  w.i32(json.map.playableArea.height);

  let flags = 0;
  const f = json.map.flags || {};
  for (const [name, bit] of NAMED_FLAGS) if (f[name]) flags |= bit;
  if (json.map.flagsUnknown !== undefined) flags |= json.map.flagsUnknown;
  else flags |= 0x400 | 0x4000 | 0x8000; // hand-written JSON: mirror upstream's forced bits
  w.u32(flags);

  // single chars: the read dialect renders a 0x00 byte as '0' (no real
  // tileset/light letter is '0'), so map it back to the original null byte
  const oneChar = (v, dflt) => {
    const s = String(v || dflt).slice(0, 1);
    if (s === '0') w.byte(0); else w.chars(s);
  };
  oneChar(json.map.mainTileType, 'L');
  w.i32(json.loadingScreen.background);
  w.str(json.loadingScreen.path);
  w.str(json.loadingScreen.text);
  w.str(json.loadingScreen.title);
  w.str(json.loadingScreen.subtitle);
  w.i32(json.gameDataSet || 0);
  w.str(json.prologue.path);
  w.str(json.prologue.text);
  w.str(json.prologue.title);
  w.str(json.prologue.subtitle);
  w.i32(json.fog.type);
  w.f32(json.fog.startHeight);
  w.f32(json.fog.endHeight);
  w.f32(json.fog.density);
  w.byte(json.fog.color[0]); w.byte(json.fog.color[1]); w.byte(json.fog.color[2]); w.byte(255);
  const gw = json.globalWeather;
  if (!gw || gw === '0000' || gw === '    ' || String(gw).toLowerCase() === 'none') w.i32(0);
  else w.chars(gw);
  w.str(json.customSoundEnvironment || '');
  oneChar(json.customLightEnv, 'L');
  w.byte(json.water[0]); w.byte(json.water[1]); w.byte(json.water[2]); w.byte(255);

  if (version >= 28) w.i32(json.scriptLanguage || 0);
  if (version >= 31) {
    w.i32(json.supportedModes ?? 3);
    w.i32(json.gameDataVersion ?? 1);
  }
  // forceDefault/Max/MinCameraZoom exist only from v32/v33 — not serialized

  // Truncated originals (see warToJson): write only through the last section
  // present in the file, then re-append the undecodable tail verbatim — the
  // output is byte-identical to the truncated original.
  const TAIL_SECTIONS = ['players', 'forces', 'upgrades', 'techtree',
    'randomGroupTable', 'randomItemTable'];
  const stopAt = json._truncated ? TAIL_SECTIONS.indexOf(json._truncatedAt) : TAIL_SECTIONS.length;
  if (json._truncated && stopAt === -1) {
    throw new Error(`w3i31: _truncatedAt must be one of ${TAIL_SECTIONS.join('/')} (got ${JSON.stringify(json._truncatedAt)})`);
  }
  const wants = (section) => TAIL_SECTIONS.indexOf(section) < stopAt;
  const finish = () => {
    if (json._truncated && json._truncatedTail) {
      w.chunks.push(Buffer.from(json._truncatedTail, 'hex'));
    }
    return { buffer: w.buffer() };
  };

  if (!wants('players')) return finish();
  const availablePlayerNums = json.players.map((p) => p.playerNum);
  w.i32(json.players.length);
  for (const player of json.players) {
    w.i32(player.playerNum);
    w.i32(player.type);
    w.i32(player.race);
    w.i32(player.startingPos.fixed ? 1 : 0);
    w.str(player.name);
    w.f32(player.startingPos.x);
    w.f32(player.startingPos.y);
    w.u32(maskFromJson(player, 'allyLowPriorityFlags', availablePlayerNums));
    w.u32(maskFromJson(player, 'allyHighPriorityFlags', availablePlayerNums));
    if (version >= 31) {
      w.u32(maskFromJson(player, 'enemyLowPriorityFlags', availablePlayerNums));
      w.u32(maskFromJson(player, 'enemyHighPriorityFlags', availablePlayerNums));
    }
  }

  if (!wants('forces')) return finish();
  w.i32(json.forces.length);
  json.forces.forEach((force, i) => {
    let forceFlags = 0;
    if (force.flags.allied) forceFlags |= 0x1;
    if (force.flags.alliedVictory) forceFlags |= 0x2;
    if (force.flags.shareVision) forceFlags |= 0x8;
    if (force.flags.shareUnitControl) forceFlags |= 0x10;
    if (force.flags.shareAdvUnitControl) forceFlags |= 0x20;
    w.u32(forceFlags);
    let extraBits = 0;
    if (i === 0) {
      for (let p = 0; p < 24; p++) if (!availablePlayerNums.includes(p)) extraBits |= (1 << p);
    }
    w.u32(maskFromJson(force, 'players', availablePlayerNums, extraBits));
    w.str(force.name);
  });

  if (!wants('upgrades')) return finish();
  w.i32(json.upgrades.length);
  for (const upgrade of json.upgrades) {
    w.u32(maskFromJson(upgrade, 'players', availablePlayerNums));
    w.chars(upgrade.id);
    w.i32(upgrade.level);
    w.i32(upgrade.availability);
  }

  if (!wants('techtree')) return finish();
  w.i32(json.techtree.length);
  for (const tech of json.techtree) {
    w.u32(maskFromJson(tech, 'players', availablePlayerNums));
    w.chars(tech.id);
  }

  if (!wants('randomGroupTable')) return finish();
  w.i32(json.randomGroupTable.length);
  for (const group of json.randomGroupTable) {
    w.i32(group.number);
    w.str(group.name);
    w.i32(group.positions.length);
    for (const position of group.positions) w.i32(position);
    w.i32(group.rows.length);
    for (const row of group.rows) {
      w.i32(row.chance);
      for (const entry of row.entries) w.chars(entry);
    }
  }

  if (!wants('randomItemTable')) return finish();
  w.i32(json.randomItemTable.length);
  for (const itemTable of json.randomItemTable) {
    w.i32(itemTable.number);
    w.str(itemTable.name);
    w.i32(itemTable.sets.length);
    for (const itemSet of itemTable.sets) {
      w.i32(itemSet.length);
      for (const item of itemSet) {
        w.i32(item.chance);
        w.chars(item.id);
      }
    }
  }

  return finish();
}

// Cheap format sniff used by lib/filemap.js routing.
function isSupported(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 &&
    SUPPORTED_VERSIONS.includes(buffer.readInt32LE(0));
}

module.exports = { warToJson, jsonToWar, isSupported, SUPPORTED_VERSIONS };
