# Upstream issue drafts — wc3maptranslator (ChiefOfGxBxL/WC3MapTranslator)

Ready-to-file issue texts for the four upstream bugs this toolkit works
around at runtime. **These are DRAFTS awaiting maintainer filing — nothing
here has been submitted.** Each draft is self-contained: title, summary,
minimal repro (verified against `wc3maptranslator@5.0.0` on Node 22 before
drafting), expected/actual, suggested fix, and a pointer to our workaround.

The corresponding workarounds live in `lib/translator-fixes.js` (FIX A/B/C)
and `lib/wts.js`; each fix's header comments carry the full analysis. The
payoff of filing is shrinking that file over time — but the `5.0.0` pin
stays regardless (CLAUDE.md gotcha 1), and every workaround stays until an
upstream release actually fixes it AND the pin is deliberately bumped
(test/fixes.test.js pins the upstream bugs as canaries that must FAIL once
upstream fixes them).

| Draft | Upstream bug | Our workaround |
| --- | --- | --- |
| [issue-classic-doo-overread.md](issue-classic-doo-overread.md) | classic-layout `war3map.doo` misparse + read past buffer end (unconditional skinId read) | `lib/classicdoo.js` IDENTIFIES the signature (exact classic-layout walk) so validate-map WARNs + raw-copies instead of failing a working map; still no read (classic .doo stays read-only, `_viewer/` fallback) |
| [issue-utf8-string-handling.md](issue-utf8-string-handling.md) | UTF-8 mangled on binary-string READ and on wts WRITE | FIX A (`readString` patch) + `lib/wts.js` |
| [issue-falsy-zero-write-throughs.md](issue-falsy-zero-write-throughs.md) | legitimate `0` values silently replaced by defaults on write (`life: 0` → 100, ...) | FIX C (truthy zero stand-ins on a copy) |
| [issue-unbounded-readstring.md](issue-unbounded-readstring.md) | `readString` never checks the buffer end — infinite loop on truncated/garbage files | FIX B (bounded readString, catchable RangeError) |

Filing etiquette when these do get filed: one issue per draft (they are
independent bugs with independent fixes), repro first, no toolkit-internal
jargon beyond the linked workaround reference.
