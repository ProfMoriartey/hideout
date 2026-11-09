# Screenshots

Production build (`/hideout/` base), real clock, Chromium with software GL.
Desktop 1280x800 (1x), phone Pixel 7 portrait (2.625x). Colours reduced to a
256-colour palette to keep each file under 300 kB. Feeds are route-stubbed
(live mode, times relative to "now"); #3 uses `?demo=1&seed=2&origin=<now>`
and is captured at the glow peak of a real working -> done transition.

| # | Scene | Notes |
|---|-------|-------|
| 1 | Overview, all idle | `desktop-1-overview-idle`, `phone-1-overview-idle` |
| 2 | Several members working | dot markers on phone labels (verbs on desktop labels), mission banner 4/12, ticker |
| 3 | Done celebration | demo feed; the room glow is brief (about 3 s) |
| 4 | Stale room | working with no write for 4.5 h: "no recent update" and a "?" |
| 5 | Room panel open on a working member | Kortopi, progress 3 / 5 |
| 6 | Offline | both hosts refused: calm "Offline, retrying." |
| 7 | Sound toggle on | speaker icon lit, orange outline |

Honest notes per image (what looks good, what looks off):

- desktop-1: clean, whole hideout fitted, labels readable; nothing lit, as it should be.
- desktop-2: working rooms glow with verbs under role; banner and ticker clear. Labels sit inside their own room just above its floor, slightly smaller (11 px), and no longer hang into the room below.
- desktop-3: Pakunoda's room is warm, ticker lists "finished" lines; the demo feed puts many events at "just now".
- desktop-4: Phinks shows "no recent update" and a "?" above the character; subtle but legible.
- desktop-5: the zoom-in on the panel is strong; panel fields good. The Feitan label at bottom right is cut by the footer bar.
- desktop-6: no scene change when offline, only the footer note (a stray "- " before the note was fixed in this branch; this image is after the fix).
- desktop-7: toggle clearly on; no other visual change.
- phone-1: labels are name-only, one line, along each room's floor edge, 12 px text; they no longer crowd the rooms. The scene is still small with a large empty band above and below.
- phone-2: working members get an orange dot before the name; verbs and roles are no longer drawn (they stay in the DOM, visually hidden, and in the panel), so labels stay one line. ticker collapsed to "Activity".
- phone-3: two-line, four-row banner pushes down, no overlap with the scene; the ticker is collapsed.
- phone-4: Phinks and The Elders (working, no write for 4.5 h) get a dashed outline and a "?" in the label, much easier to see than the old tiny "?" over the figure (that one still shows next to Phinks). The dashed Phinks label sits tight against the figure's "?" and lantern; "no recent update" text is now only in the panel.
- phone-5: panel readable (name, role, plaque, state, verb, mission, running, tickets and bar); only the selected room's label (Kortopi, with its dot) stays visible, so the cut-off labels around the panel are gone. The zoomed room still shows the Phinks "?" prop and lanterns, which are part of the scene.
- phone-6: calm offline line at the bottom, after the fix.
- phone-7: toggle on, same as phone-2 otherwise.
- desktop-8 / phone-8: ticker. Phone shows the latest 3 events, one line each at 12 px (it used to start collapsed to "Activity"); desktop shows 10.
