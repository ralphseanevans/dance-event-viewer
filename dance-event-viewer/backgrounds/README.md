# Share-poster seasonal backgrounds (optional drop-in)

The "Share several" poster (js/dance-poster.js) draws a **code-generated seasonal
gradient + motif** for each month — no image required, no external/AI API calls.

If you want a hand-made background for a specific month, drop a JPG here named by the
month the dances fall in:

    backgrounds/YYYY-MM.jpg      e.g.  backgrounds/2026-08.jpg  (August 2026)

When that file exists it is used as the **full-bleed poster background** (cover-fit,
with a dark scrim added automatically so the white text and cards stay readable).
When it is absent, the renderer silently falls back to the code gradient — a missing
file is not an error.

Recommended: 1080×1350 (4:5), fairly dark / low-contrast so the headline and event
cards read on top. The month is taken from the **soonest selected dance's date**.
