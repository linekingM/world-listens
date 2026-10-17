# Grok 4.7 high — sky / sun / dial QA (2026-10-17)

Headless runs hit max-turns before a final prose dump; findings below are from Grok’s reasoning traces + verified against code/shots by the executor.

## OK
- Collapsible time dial defaults collapsed (`data-open=0`, chip ~143px) — FINAL-day-11-path, FINAL-sun-17.
- Dusk sun disc readable orange→red (FINAL-sun-17 amber-orange circle; FINAL-sun-18 / tight deeper orange-red).
- Clear-day path shot no longer chalk-white horizon band (FINAL-day-11-path soft blue gradient).
- Bloom/shafts reduced so disc isn’t a cream blob.

## Clear bugs applied
1. **SunDial idle can stick open after mid-drag timeout** — med, high confidence  
   `src/ui/SunDial.tsx`: if IDLE timer fires while `drag.current` and pointer ends via cancel/lost without `touch()`, no re-arm → stays open.  
   Fix applied: re-arm while dragging; call `touch()` on cancel/lost capture.

## Clear bugs noted, not blocking deploy
2. Clock label uses store `time` while phase uses eased `shown` — can briefly disagree after big jumps (pre-existing pattern; low).
3. Auto-collapse doesn’t blur focus from SVG (a11y low).

## Test ideas (Grok)
- Expand dial → hold bead drag >4.5s → release → must still auto-collapse within IDLE_MS.
- Expand → pointercancel mid-drag after IDLE → must not stay open forever.
- At t=17.9 and 18.7, screenshot with sun unobstructed: disc angular size + hue (R≫G≫B).
