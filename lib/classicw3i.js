'use strict';
// Tolerant reader for CLASSIC (pre-Reforged) war3map.w3i, format versions 18
// (RoC) and 25 (TFT). Map protectors often truncate the w3i tail; strict
// parsers (wc3maptranslator AND mdx-m3-viewer-th) then reject the entire
// file. This reader parses the header through the forces block and simply
// stops at the first premature end, returning everything read so far with
// { _truncated: true, _truncatedAt: '<field>' }. READ-ONLY diagnostics —
// used for the second-tier _viewer/ fallback in lib/source.js; NOT the
// build-source dialect, cannot be compiled back.

const EOF = Symbol('classic-w3i EOF');

class Cursor {
  constructor(buf) { this.buf = buf; this.off = 0; }
  need(n) { if (this.off + n > this.buf.length) throw EOF; }
  i32() { this.need(4); const v = this.buf.readInt32LE(this.off); this.off += 4; return v; }
  f32() { this.need(4); const v = this.buf.readFloatLE(this.off); this.off += 4; return v; }
  u8() { this.need(1); return this.buf.readUInt8(this.off++); }
  char() { return String.fromCharCode(this.u8()); }
  str() { // null-terminated
    const end = this.buf.indexOf(0, this.off);
    if (end < 0) throw EOF;
    const v = this.buf.toString('utf8', this.off, end);
    this.off = end + 1;
    return v;
  }
  rgba() { return [this.u8(), this.u8(), this.u8(), this.u8()]; }
}

// Returns a plain-JSON object; throws only when the buffer is not a classic
// w3i at all (unsupported version — Reforged w3i belongs to the translator).
function readClassicW3i(buf) {
  const c = new Cursor(buf);
  const out = { _truncated: false };
  let field = 'version';
  const grab = (name, fn) => { field = name; out[name] = fn(); };
  try {
    grab('version', () => c.i32());
    if (out.version !== 18 && out.version !== 25) {
      throw new Error(`not a classic w3i (version ${out.version}; expected 18/RoC or 25/TFT)`);
    }
    const tft = out.version === 25;
    grab('saves', () => c.i32());
    grab('editorVersion', () => c.i32());
    grab('name', () => c.str());
    grab('author', () => c.str());
    grab('description', () => c.str());
    grab('recommendedPlayers', () => c.str());
    grab('cameraBounds', () => Array.from({ length: 8 }, () => c.f32()));
    grab('cameraBoundsComplements', () => Array.from({ length: 4 }, () => c.i32()));
    grab('playableWidth', () => c.i32());
    grab('playableHeight', () => c.i32());
    grab('flags', () => c.i32());
    grab('tileset', () => c.char());
    grab('loadingScreenBackground', () => c.i32());
    if (tft) grab('loadingScreenModel', () => c.str());
    grab('loadingScreenText', () => c.str());
    grab('loadingScreenTitle', () => c.str());
    grab('loadingScreenSubtitle', () => c.str());
    if (tft) {
      grab('gameDataSet', () => c.i32());
      grab('prologueScreenModel', () => c.str());
    } else {
      grab('loadingScreenNumber', () => c.i32());
    }
    grab('prologueText', () => c.str());
    grab('prologueTitle', () => c.str());
    grab('prologueSubtitle', () => c.str());
    if (tft) {
      grab('fogStyle', () => c.i32());
      grab('fogStartZ', () => c.f32());
      grab('fogEndZ', () => c.f32());
      grab('fogDensity', () => c.f32());
      grab('fogColor', () => c.rgba());
      grab('globalWeatherId', () => c.i32());
      grab('soundEnvironment', () => c.str());
      grab('lightTileset', () => c.char());
      grab('waterColor', () => c.rgba());
    }
    grab('players', () => {
      const n = c.i32();
      const players = [];
      for (let i = 0; i < n; i++) {
        const p = {};
        p.number = c.i32();
        p.type = c.i32();
        p.race = c.i32();
        p.fixedStartPosition = c.i32();
        p.name = c.str();
        p.startX = c.f32();
        p.startY = c.f32();
        p.allyLowPriorities = c.i32();
        p.allyHighPriorities = c.i32();
        players.push(p); // pushed per player: a truncated list keeps the rest
        out.players = players;
      }
      return players;
    });
    grab('forces', () => {
      const n = c.i32();
      const forces = [];
      for (let i = 0; i < n; i++) {
        const f = {};
        f.flags = c.i32();
        f.playerMasks = c.i32();
        f.name = c.str();
        forces.push(f);
        out.forces = forces;
      }
      return forces;
    });
    // upgrade/tech availability and random tables follow — out of scope
  } catch (e) {
    if (e !== EOF) throw e;
    out._truncated = true;
    out._truncatedAt = field;
    out._bytesTotal = buf.length;
  }
  return out;
}

module.exports = { readClassicW3i };
