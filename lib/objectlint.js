'use strict';
// Semantic lint of translated object data — WARNINGS only, never failures.
// Each rule encodes an in-game playtest lesson (CLAUDE.md gotchas 22/23/25);
// they are heuristics about game SEMANTICS, not format validity, so
// validate-map prints them as WARN lines and still exits 0.
//
//  a) gotcha 22 — object-data model fields (umdl/dfil/bfil/ifil) must use
//     the `.mdl` extension (the engine swaps to `.mdx` at load; a literal
//     `.mdx` value renders an invisible unit). Additionally, a
//     `war3mapImported\` model reference must resolve to an actual archive
//     member after `.mdl` <-> `.mdx` normalization.
//  b) gotcha 23 — an item overriding `unam` without `ifil` (model) or
//     `iico` (icon) leaks the base item's art in-game ("deer drops
//     cheese"). Deliberately scoped to ITEMS: a renamed unit that keeps
//     its base art (e.g. a re-labelled hero) is common and intentional.
//  c) gotcha 25 — a unit with a build list (`ubui`) whose OVERRIDDEN
//     `uabi` contains no repair-family ability starts buildings that never
//     finish (human construction only progresses via Repair). Accepted
//     repair ids: Ahrp (human) / Arep (orc) / Aetr (night elf) / Awha
//     (undead). Limitation: only the human pair (AHbu+Ahrp) is
//     playtest-verified; the others are accepted as per-race equivalents.
//     Units that DON'T override uabi are skipped — the base unit's default
//     ability set is not visible in the map's object data.

const MODEL_FIELD = { units: 'umdl', items: 'ifil', destructables: 'bfil', doodads: 'dfil' };
const REPAIR_ABILITIES = new Set(['Ahrp', 'Arep', 'Aetr', 'Awha']);

function normPath(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

// objectFiles: [{ war, objectType, json }] where json is the
//   wc3maptranslator ObjectsTranslator shape: { original: {id: [mods]},
//   custom: {"newid:baseid": [mods]} } and each mod is
//   { id, type, level, column, value }.
// archiveMembers: iterable of archive member paths (either slash style).
// Returns [{ file, objectId, message }] — order follows the input.
function lintObjectData(objectFiles, archiveMembers) {
  const members = new Set(Array.from(archiveMembers || [], normPath));
  const warnings = [];
  const warn = (file, objectId, message) => warnings.push({ file, objectId, message });

  for (const of_ of objectFiles || []) {
    const modelField = MODEL_FIELD[of_.objectType];
    for (const scope of ['original', 'custom']) {
      const objects = (of_.json && of_.json[scope]) || {};
      for (const objectId of Object.keys(objects)) {
        const mods = objects[objectId];
        if (!Array.isArray(mods)) continue;
        const values = (fid) => mods
          .filter((m) => m && m.id === fid && typeof m.value === 'string')
          .map((m) => m.value);

        // (a) model-field extension + import resolution (gotcha 22)
        if (modelField) {
          for (const v of values(modelField)) {
            if (v === '') continue;
            const n = normPath(v);
            if (n.endsWith('.mdx')) {
              warn(of_.war, objectId,
                `${modelField} "${v}" ends in .mdx — model fields must use the .mdl extension `
                + '(the engine swaps to .mdx at load; a literal .mdx renders an invisible unit, gotcha 22)');
            }
            if (n.startsWith('war3mapimported/')) {
              const candidates = [n, n.replace(/\.mdl$/, '.mdx'), n.replace(/\.mdx$/, '.mdl')];
              if (!candidates.some((c) => members.has(c))) {
                warn(of_.war, objectId,
                  `${modelField} "${v}" matches no archive member (checked .mdl<->.mdx) — `
                  + 'the model will not render in-game');
              }
            }
          }
        }

        // (b) items renamed without re-arting (gotcha 23)
        if (of_.objectType === 'items'
            && values('unam').length > 0
            && values('ifil').length === 0 && values('iico').length === 0) {
          warn(of_.war, objectId,
            'overrides unam but neither ifil (model) nor iico (icon) — the base item\'s art '
            + 'leaks through in-game ("deer drops cheese", gotcha 23)');
        }

        // (c) builder with a build list but no repair ability (gotcha 25)
        if (of_.objectType === 'units') {
          const ubui = values('ubui').filter((v) => v.trim() !== '');
          const uabi = values('uabi');
          if (ubui.length > 0 && uabi.length > 0) {
            const abilities = uabi.flatMap((v) => v.split(',')).map((s) => s.trim());
            if (!abilities.some((a) => REPAIR_ABILITIES.has(a))) {
              warn(of_.war, objectId,
                `has a build list (ubui "${ubui[0]}") but its uabi override `
                + `("${uabi[0]}") has no repair ability (Ahrp/Arep/Aetr/Awha) — `
                + 'construction will start but never progress (gotcha 25; only the '
                + 'human AHbu+Ahrp pair is playtest-verified)');
            }
          }
        }
      }
    }
  }
  return warnings;
}

module.exports = { lintObjectData, MODEL_FIELD, REPAIR_ABILITIES };
