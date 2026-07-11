'use strict';
// war3map.wts (TRIGSTR string table) parser + serializer.
//
// WHY THIS EXISTS (and not wc3maptranslator's StringsTranslator):
// upstream's warToJson re-stringifies the ENTIRE buffer on every regex exec
// iteration (`regex.exec(buffer.toString('utf8'))` inside the while loop) —
// a fresh MB-scale string per match, ~10k times on production maps, plus a
// backtracking-prone `((?:.|\r?\n)*?)` pattern. On real 1-2MB wts files
// (~10k STRING blocks) that is an uncatchable multi-GB heap death. This
// module is a linear single-pass parser (one decode, index scanning, no
// regex over the body) and handles the same files in milliseconds.
//
// It also fixes CLAUDE.md gotcha 16 for wts: upstream's jsonToWar emits
// `charCodeAt(i) & 0xFF` per JS char (mangling any non-ASCII), while its
// reader decodes UTF-8. Here BOTH directions are real UTF-8, so wts values
// may safely contain non-ASCII (em dashes, accents, CJK, ...).
//
// JSON SHAPE — exactly wc3maptranslator@5's StringsTranslator dialect:
//   { "<id>": { "value": "...", "comment"?: "// ...\r\n" } }
// Notes on the dialect (kept bug-for-bug so existing strings.json sources
// keep working byte-identically through jsonToWar):
//   - ids are the literal digits after "STRING" (string keys);
//   - `comment` is the raw "//..." line INCLUDING its trailing \r?\n (the
//     serializer writes it verbatim between the id line and the "{");
//   - a duplicate STRING id keeps the LAST occurrence;
//   - blocks the upstream regex would not match (e.g. "STRING x" without
//     digits, or a block with no "{" + newline) are skipped the same way.
//
// FILE GRAMMAR (as accepted by upstream's regex, reproduced linearly):
//   [BOM]  ( 'STRING ' digits  [\r?\n]  [ '//' comment-line [\r?\n] ]
//            '{' \r?\n  value  \r?\n '}' )*
// value runs to the FIRST newline that is immediately followed by '}'
// (lazy match semantics), so values may contain blank lines, '{', and even
// 'STRING n' text; anything between blocks is ignored.

// ---- parse (war -> json) --------------------------------------------------

function isDigit(c) {
  return c >= '0' && c <= '9';
}

function warToJson(buffer) {
  // One decode of the whole file; everything below is index arithmetic on
  // this single string (no per-block re-decoding, no regex backtracking).
  const text = buffer.toString('utf8');
  const n = text.length;
  const json = {};

  let pos = 0;
  while (pos < n) {
    const start = text.indexOf('STRING ', pos);
    if (start === -1) break;
    let p = start + 7;

    // digits (the id — kept as the literal string, matching upstream keys)
    const d0 = p;
    while (p < n && isDigit(text[p])) p++;
    if (p === d0) { pos = start + 7; continue; } // "STRING x" — not a block
    const id = text.slice(d0, p);

    // at most one optional \r?\n after the id (upstream: `\r?\n?`)
    if (text[p] === '\r') p++;
    if (text[p] === '\n') p++;

    // optional single comment line: `(\/\/.*\r?\n?)?` — captured RAW,
    // including its trailing newline (that's the upstream JSON dialect).
    let comment;
    let bracePos = -1;
    if (text.startsWith('//', p)) {
      let eol = p;
      while (eol < n && text[eol] !== '\r' && text[eol] !== '\n') eol++;
      let afterNl = eol;
      if (text[afterNl] === '\r') afterNl++;
      if (text[afterNl] === '\n') afterNl++;
      if (text[afterNl] === '{') {
        // normal case: comment line, newline, then '{'
        comment = text.slice(p, afterNl);
        bracePos = afterNl;
      } else if (eol - 1 > p + 1 && text[eol - 1] === '{') {
        // upstream backtracking case: the comment line itself ends with '{'
        // ("//...{\r\n<value>") — the '{' is the opening brace.
        comment = text.slice(p, eol - 1);
        bracePos = eol - 1;
      }
    } else if (text[p] === '{') {
      bracePos = p;
    }
    if (bracePos === -1) { pos = start + 7; continue; } // no block — skip

    // '{' must be followed by \r?\n
    let v = bracePos + 1;
    if (text[v] === '\r') v++;
    if (text[v] !== '\n') { pos = start + 7; continue; }
    v++;

    // value: lazily up to the first newline followed by '}' (upstream:
    // `((?:.|\r?\n)*?)\r?\n}` — first '\n}' wins).
    const end = text.indexOf('\n}', v);
    if (end === -1) { pos = start + 7; continue; } // unterminated — skip
    let value = text.slice(v, end);
    if (value.endsWith('\r')) value = value.slice(0, -1);

    const entry = { value };
    if (comment) entry.comment = comment;
    json[id] = entry; // duplicate id: last occurrence wins (upstream too)

    pos = end + 2; // resume after the closing '}'
  }

  return { json };
}

// ---- serialize (json -> war) ----------------------------------------------

// Byte-identical to upstream's jsonToWar for ASCII content: per entry
//   STRING <id> CRLF [comment-verbatim] { CRLF <value> CRLF } CRLF CRLF
// (no BOM, no null terminator). Non-ASCII is where we deliberately differ:
// upstream truncates each char to one byte; we emit correct UTF-8.
function jsonToWar(json) {
  const parts = [];
  for (const id of Object.keys(json)) {
    const entry = json[id];
    parts.push('STRING ', id, '\r\n');
    if (entry.comment) parts.push(entry.comment);
    parts.push('{\r\n', entry.value, '\r\n}\r\n\r\n');
  }
  return { buffer: Buffer.from(parts.join(''), 'utf8') };
}

module.exports = { warToJson, jsonToWar };
