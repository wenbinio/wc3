# test/DouDizhu_EN.w3x

English translation of **小鸡-斗地主 (Chick Dou Dizhu)** — a real,
playable 3-player Dou Dizhu (Fight the Landlord) implementation in
Warcraft III, not a WC3-themed reskin. A 54-card deck is dealt into
unit inventory slots textured with actual playing-card art; each player
gets a hand-view camera rig; the full turn structure (bid 1/2/3 or no
bid → Landlord selection → play/pass loop → scoring and payout) is
scripted in JASS, with invisible dummy units hosting the Bid/Play/Pass/
Clear command-card buttons and hotkeys. 93 wts entries + 37 script
literals (60 occurrences) translated with standard English Dou Dizhu
vocabulary (Landlord, Peasants, Bid, Pass). The card textures carry NO
Chinese — the deck art is standard international (Arabic numerals,
J/Q/K/A, English "JOKER"), so no texture work was needed. The map's
only chat command is a developer leak-detector console on "?" (ASCII,
untouched); all gameplay is button- and hotkey-driven. Gameplay
byte-identical: 222 of 224 members byte-identical, only script + wts
differ; validate-map 86/89 PASS identical both sides; pjass output
byte-identical. The original ships no named author (未知), so the
author field reads "Unknown, translated by Serendipity". The empty
placeholder description was replaced with an English blurb explaining
the game — a deliberate content addition, noted here for honesty.

**Status**: owner-directed translation set (2026-08-08) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from all toolkit doctrine).
