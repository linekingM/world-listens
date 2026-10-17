# sun/fog minimal — implemented (executor, Grok edits did not land)

Grok 4.7 high issued search_replace tool calls but files on disk were unchanged; executor applied the same five plan items.

## Done
1. `src/world/sunLook.ts` — `physicalSunWarmth(elev, hour)` dawn≠dusk; `effectiveWarmth` passes hour
2. `src/scene/styles/cinematic/SkyA.tsx` — removed `nearDisc` hole-punch; hour into warmth; softer same-hue falloff
3. `SunRig.tsx` + `CityHaze.tsx` — mild haze × dawn/midday/cover/mist + mild day jitter
4. `SunDial.tsx` — pass hour; drop redundant live= line; keep presets/sliders/numeric readout
5. `npx tsc -b` clean; shots in `shots/qa-review/phys-sun/`; local `npm run build` for preview only — **NO deploy**

## Shot meta (auto / clear unless noted)
| shot | warmth | rgb | fogDens |
| 07:00 | 0.275 | soft rose-gold | 0.00154 |
| 15:05 | 0.000 | pale white | 0.00103 |
| 18:00 | 0.041 | still pale | 0.00123 |
| 18:40 | 0.442 | amber | 0.00129 |
| 07 mist | 0.275 | — | 0.00336 |

## Honest verdict
- 15:00 disc crop: single soft pale-white disc, no mustard core, no hole-punch ring (pixel Δrb ≈ +2).
- 18:00 stays pale; real warm only ~18:40 — matches brief.
- Dawn soft, not dusk-symmetric.
- Haze correlates (dawn↑ midday↓ mist↑); not chalk whiteout.
- Remaining bloom/godrays are Effects, not nearDisc.
- Did NOT change palette light keys, dial chrome redesign, or deploy.

Parent review before any deploy.
