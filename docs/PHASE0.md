# Phase 0 — environment, tools, style exploration

## Run
- `npm run dev` → http://localhost:5173/?style=a|b|c&t=<hour>   (t optional, e.g. 8, 18.5)
- `npm run build` / `npm run preview`
- Screenshots: `node scripts/shoot.mjs a:8 a:18.5 b:8 c:18.5 a:8:mobile` (BASE=http://127.0.0.1:4173 for preview build,
  EXTRA="&noclouds" to hide clouds). Uses system Chrome + SwiftShader WebGL (`--use-angle=swiftshader --enable-unsafe-swiftshader`).

## Structure
- `src/state/worldStore.ts` — zustand store (time of day, style); URL params seed it.
- `src/world/` — pure data/logic, no React: `sun.ts` (sun path + phases), `palette.ts` (lighting keyframes by sun elevation),
  `layout.ts` (shared composition: road curve, terrain height, trees, city, islands, clouds, lamps), `geometry.ts`
  (procedural builders with baked vertex colours, optional faceted low-poly output).
- `src/scene/common/` — `SunRig` (sun/moon light, hemi fill, fog, smoothed time), `WorldContent` (all scenery),
  `CameraRig` (orbit limits, portrait framing), `GradientSky`, `PuffyClouds`, `Waterfall`, env context.
- `src/scene/styles/{cinematic,painterly,diorama}/` — each art direction = palette + light keys + material factory + Sky + Clouds + Effects + camera.
- `src/ui/` — `TopBar` (title + style switch), `TimeDial` (drag the sun along its arc; keyboard ←/→).

## Tools on the box
- grok (Grok Build CLI, ~/.local/bin/grok, v1.0.46): works headless: `grok -m grok-4.7 --reasoning-effort high -p "..."`
  or `--prompt-file file.txt`; it can open PNGs with its own file tools (used for an art-direction critique).
  Pass `--disallowed-tools "Edit,Write,Bash"` for read-only consults. (`grok models` misleadingly prints "not authenticated".)
- agy (Antigravity CLI) WORKS WITHOUT PROXY: stop mihomo, unset *_PROXY, then e.g.
  `agy --model gemini-3.8-flash-high -p "..." --print-timeout 300s --dangerously-skip-permissions` (Gemini can open PNGs with its tools).
  Stitch MCP works through agy (15 tools: create_project, generate_screen_from_text, generate_variants, edit_screens, design systems...).
  Outputs: docs/gemini-review.md, docs/stitch/ (project projects/9279668890904761314, HUD render hud-render.png, hud.html).
- (Old note) agy-proxy via mihomo is BLOCKED. Requires `mihomo-start` (needed `uv venv /tmp/v7 && uv pip install pyyaml` first). Through JP CTCU nodes (exit IP 203.10.99.x, Cloudflare loc=JP)
  Google returns "FAILED_PRECONDITION: User location is not supported". All other nodes (HK/SG/US/UK/JP-CUCM/流媒体) fail with
  "REALITY authentication failed" → EOF. Proxy left on 🇯🇵日本高速09|BGP|CTCU.
- Network: npm registry, polyhaven, jsdelivr/unpkg, raw.githubusercontent, githack, Google Fonts reachable directly.
