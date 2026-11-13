# Rehearsal and review

Every board was rendered to a still with headless Chrome at its design width (and at 390 px for desktop boards), with the shipped fonts loaded from Google Fonts, after entry animations settled. The stills are in `frames/`.

## Fixes made after the first render

- Search fields inside cards and form fields stretched to 320 px tall (flex basis in a column). Fixed.
- Form grids inside cards collapsed to one column. Card-level grids now use 150 px and 210 px minimums.
- Option rows squeezed their label when the control was wide. Option rows now wrap.
- Chart value badges clipped longer values. Badge width now follows the text.
- The overview's floating New machine button covered the Appliance card. Removed; the header button stays.
- Sliders inside column cards grew tall and lost their thumb position. Fixed.
- The first key of the two-key confirmations did not look turned. It now shows a filled check.
- Long select values ran into the next field. They now end with an ellipsis.
- The whole look was redone after the first pass read as dated: dark-first Material 3 Expressive, glass bars, gradient buttons with shape morph, connected button groups, tonal icon tiles and display-size type.

## Open, with reasons

- QR codes on the boards are placeholders; the real ones are generated on the appliance.
- VM screen previews are flat gradients; real boards show live thumbnails.
- At 390 px the desktop boards wrap into a long single column; the dedicated phone boards show the intended phone layout (bottom navigation, bottom sheets, cards for tables).
- Stageshow's film gate (`scripts/film.mjs --gate`) was not run: it targets animated marketing demos, and these are static product screens.
