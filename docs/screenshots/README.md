# Screenshots

Production build (`/hideout/` base), real clock, Chromium with software GL.
Desktop 1280x800 (1x), phone Pixel 7 portrait (2.625x). Colours reduced to a
256-colour palette to keep each file under 300 kB. Feeds are route-stubbed
(live mode, times relative to "now"); #3 uses `?demo=1&seed=2&origin=<now>`
and is captured at the glow peak of a real working -> done transition.

| # | Scene | Notes |
|---|-------|-------|
| 1 | Overview, all idle | `desktop-1-overview-idle`, `phone-1-overview-idle` |
| 2 | Several members working | verbs on labels, mission banner 4/12, ticker |
| 3 | Done celebration | demo feed; the room glow is brief (about 3 s) |
| 4 | Stale room | working with no write for 4.5 h: "no recent update" and a "?" |
| 5 | Room panel open on a working member | Kortopi, progress 3 / 5 |
| 6 | Offline | both hosts refused: calm "Offline, retrying." |
| 7 | Sound toggle on | speaker icon lit, orange outline |

Honest notes per image (what looks good, what looks off):

- desktop-1: clean, whole hideout fitted, labels readable; nothing lit, as it should be.
- desktop-2: working rooms glow with verbs under role; banner and ticker clear. The labels for working members grow taller and cover a little of the room below them.
- desktop-3: Pakunoda's room is warm, ticker lists "finished" lines; the demo feed puts many events at "just now".
- desktop-4: Phinks shows "no recent update" and a "?" above the character; subtle but legible.
- desktop-5: the zoom-in on the panel is strong; panel fields good. The Feitan label at bottom right is cut by the footer bar.
- desktop-6: no scene change when offline, only the footer note (a stray "- " before the note was fixed in this branch; this image is after the fix).
- desktop-7: toggle clearly on; no other visual change.
- phone-1: scene is small with a large empty band above and below; labels are big for the rooms they sit on.
- phone-2: verbs make labels three lines tall and they crowd the rooms; ticker collapsed to "Activity".
- phone-3: two-line, four-row banner pushes down, no overlap with the scene; the ticker is collapsed.
- phone-4: "?" over the Elders/Phinks rooms is tiny; the "no recent update" label is the clear signal.
- phone-5: panel readable; labels of other rooms show cut-off behind and beside it ("que", "Pla"), and the tiny labels over the zoomed room are noise.
- phone-6: calm offline line at the bottom, after the fix.
- phone-7: toggle on, same as phone-2 otherwise.
