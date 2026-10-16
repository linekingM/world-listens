### Stitch Project & Screen Generation Report

#### 1. Project & Screen Identifiers
* **Project Resource Name:** `projects/9279668890904761314`
* **Project Title:** `如果世界听你的 – UI concepts`
* **Device Target:** `DESKTOP` (2560 × 2048 canvas)
* **Design System:** `Aetheria Glass` (`assets/571aeb35b6f74eccb9cd307333f16662`)
* **Screens Generated:**
  1. **Spatial HUD Screen (Primary UI):**
     * **Screen ID:** `eae5c4130e954b75a34a1ed0313bee34`
     * **Resource Name:** `projects/9279668890904761314/screens/eae5c4130e954b75a34a1ed0313bee34`
     * **Screen Type:** `DESIGN`
  2. **Cinematic 3D Fantasy Landscape Canvas (Background Plate):**
     * **Screen ID:** `6989b3f588014db19851c1e1d3a7f720`
     * **Resource Name:** `projects/9279668890904761314/screens/6989b3f588014db19851c1e1d3a7f720`
     * **Screen Type:** `IMAGE`

---

#### 2. Generated Media & Code URLs
* **HUD Screen Render Preview (Screenshot):**  
  [View High-Res UI Screenshot](https://lh3.googleusercontent.com/aida/AEtjO1VoU1g4eblIQ4kD-s8KLT0BQWH2T6p7F4Ujosg8i9TU3uDGF3-U56vsdxjDc0rPJ5bExHi91bAKgTXuQuvoEGcPhpaEQE_tNGvcJH1GszEDKWy2aNaI4BROj1MWv3JB1qc1c4ks2HbM_woPDhNN-NhF2zSQ1aA0w16GTRYJC8U-XN3XTb7f8sjYA5gyvlrXvS2TfNVpG0XNBaldCF229WqOuMIRrcQWqD_4EeVe5Iv10TpG6YHnWlNIJq4)
* **HUD Screen HTML Source Code:**  
  [Download HTML / Tailwind Implementation](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzBkODNiYzI3N2IyYzQ3ZGJhNjE2NDYzYzhmYTY1NGY4EgsSBxCE9IL5xhwYAZIBIwoKcHJvamVjdF9pZBIVQhM5Mjc5NjY4ODkwOTA0NzYxMzE0&filename=&opi=96797242)
* **Full-Bleed 3D Fantasy Background Image:**  
  [View Fantasy Landscape Image](https://lh3.googleusercontent.com/aida/AEtjO1XyIblubOBsLfuqGLPKn2axq-aXOb7V4Sot6BVGvZOtMEuYo9ZP2A6EMoNVS3DqPd-O5Jqx0wdKrryxjJi63yNEgf59GBions23TxqMZ7dOGM6q-ebZaklxTPwU5Djcxk1MQI3FOOM-riSSddhGsdt65XmUmpljTRpXGZ0I0FCuN4wlBkrLm-Rv6uYEZHUiiPD6A8E14fXs2kCL392ZsLo9iTiUGKcCCAKkRIAL1_pvUV2NPIuMTz74Xq0)

---

#### 3. Detailed Textual Design Specification

##### A. Spatial Layout & Viewport Occupancy
* **Peripheral Anchoring:** All interactive HUD elements hug the extreme edges of the viewport (top header, bottom-center dock, bottom-left rail, and bottom-right micro telemetry), leaving over 88% of the central canvas unobstructed (< 12% total UI area occupancy).
* **Full-Bleed Canvas:** The 3D fantasy background (`object-cover w-full h-full inset-0 fixed -z-10`) features bright morning skies, floating grassy islands with plunging waterfalls, and a distant utopian palace bathed in golden morning sunbeams.
* **Atmospheric Vignette:** A gradient overlay (`from-[#0b1326]/40 via-transparent to-[#0b1326]/30`) ensures contrast behind floating glass capsules without compromising transparency.

##### B. Component Dimensions & Hierarchy
1. **Top Header Bar (`fixed top-6 left-0 right-0 px-8 flex justify-between`):**
   * **Left Branding:** Contains the serif title and English subtitle, accompanied by a floating micro-chip (`px-3 py-1`) with a 6px golden beacon dot displaying `IMMERSIVE SPHERE 1.0`.
   * **Right Pill Action:** Single horizontal pill (`py-1.5 px-3`) housing **Save (保存)** and **Share (分享)** actions separated by a 1px vertical hairline divider (`w-px h-3.5`).
2. **Bottom-Center Time Scrub Control (`fixed bottom-8 left-1/2 -translate-x-1/2`):**
   * **Dimensions:** Min-width `340px`, padding `px-8 py-3.5`.
   * **Top Readout Row:** Houses a dawn indicator badge (`清晨 · DAWN`, with a micro sun icon) and a large thin time readout `08:00 AM`.
   * **Celestial Arc SVG Path:** 280 × 34px curved quadratic bezier path (`M 10 26 Q 140 -2 270 26`) with a dashed track, gradient morning sunlight stroke (`#FDE047` to `#ffb95f`), and subtle hour marks (`06:00 黎明`, `12:00 正午`, `18:00 黄昏`, `24:00 子夜`).
   * **Draggable Sun Handle:** A 16 × 16px (`w-4 h-4`) glowing amber sun bead with a 32 × 32px diffused corona halo (`blur-md`), pulsing breathing glow (`pulse-amber` animation), and central white core.
3. **Bottom-Left Vertical Tool Rail (`fixed bottom-8 left-8`):**
   * **Rail Container:** Compact vertical pill (`p-2`, width ~60px) collapsed by default.
   * **Buttons:** 4 circular tool buttons (`w-11 h-11`, 44 × 44px):
     * *Weather (天气)*: Sun/cloud routine icon (active state with soft amber halo).
     * *Add Object (物件)*: Plus circle icon.
     * *Gravity (重力)*: Orbital globe/gravity icon.
     * *Hairline separator* (`w-6 h-px`).
     * *Reset View (重置视角)*: Center-focus target/reticle icon.
   * **Tooltips:** Hover-activated frosted glass HUD tags (`left-14`, uppercase tracking).
4. **Bottom-Right Ambient Telemetry:**
   * Frosted pill capsule (`px-4 py-2.5`) with a 28 × 28px miniature compass dial oriented to North, vector coordinates (`AER-310° / EL 1420M`), wind/mist stats (`WIND 3.2 M/S · MIST 14%`), and a calibration toggle icon.

##### C. Color Palette (Hex & Alpha Values)
* **Canvas & Surface Base:**
  * Background / Base Surface: `#0b1326` (Abyssal Slate)
  * Surface Low: `#131b2e` | Surface Container: `#171f33` | Surface High: `#222a3d`
  * Surface Bright: `#31394d` | Surface Variant: `#2d3449`
* **Dawn Lighting & Golden Accents:**
  * Primary Container / Dawn Sun: `#fde047`
  * Primary Fixed / Amber Glint: `#ffe24c`
  * Secondary Sun Flare / Ochre: `#ffb95f` | Secondary Container: `#ee9800`
  * Tertiary Morning Cream: `#fffbff` / `#f0e27e`
* **Text & Readout Colors:**
  * Primary Text / Headings: `#fffcff` (pure luminous white with subtle text-shadow)
  * On-Surface / Subtitle Body: `#dae2fd`
  * On-Surface Variant (Muted HUD): `#cec6ad`
* **Glass Matrix & Borders:**
  * Glass Fill: `rgba(11, 19, 38, 0.10)` to `rgba(255, 255, 255, 0.10)` with `backdrop-filter: blur(16px)` to `blur(24px)`.
  * Specular Bevel Border: 1px hairline `rgba(255, 255, 255, 0.20)` to `rgba(75, 71, 52, 0.30)` (`outline-variant`).
  * Specular Inner Rim: `inset 0 1px 1px 0 rgba(254, 240, 138, 0.35)`.
  * Soft Ambient Shadows: `0 8px 32px 0 rgba(0, 0, 0, 0.18)` and `0 12px 36px rgba(0, 0, 0, 0.25)`.

##### D. Typography
* **Serif Headings (Noto Serif):**
  * `如果世界听你的`: `headline-md` (22px, line-height 30px, letter-spacing `0.01em`, weight 400), with soft text drop shadow `0 2px 12px rgba(255,252,255,0.3)`.
  * Time Display (`08:00`): `display-lg` rendered at 28px, light weight (300), tight letter spacing.
* **Sans-Serif HUD Metadata (Inter):**
  * Subtitle (`YOUR IMAGINATION, OUR WORLD`): `label-sm` (9px, line-height 12px, weight 600, ultra-wide tracking `0.18em` to `0.28em`, uppercase).
  * Phase Badge (`清晨 · DAWN`): `label-sm` (9px, weight 600, uppercase).
  * Action Labels (`Save`, `Share`): `label-md` (11px, line-height 16px, weight 500, letter-spacing `0.12em`).
  * Epoch Markers (`06:00 黎明`, etc.): 8px, letter-spacing `0.20em`.

##### E. Corner Radii & Geometry
* **Pills & Buttons:** Continuous capsule geometry `rounded-full` (`border-radius: 9999px`) on the top action bar, tool rail, individual tool buttons, and status chips.
* **Center Dock:** `rounded-3xl` (`border-radius: 1.5rem` / 24px) providing a smooth squircle enclosure.
* **Hover Tooltips:** `rounded-lg` (`border-radius: 0.5rem` / 8px).

##### F. Spacing & Rhythm
* **Margins:** 48px (`3rem`) peripheral canvas margins on desktop.
* **Internal Padding:** `space-sm` (8px / `0.5rem`) to `space-md` (14px / `0.875rem`) for compact pills; `px-8 py-3.5` for the time dock.
* **Gaps:** 12px to 16px between navigation actions; 10px vertical gap between tool rail icons.

##### G. Iconography Style
* **Icon Library:** Material Symbols Outlined (`wght 300`, `opsz 20`, default fill `0`).
* **Visual Treatment:** Delicate 1.25px to 1.5px stroke weight in luminous white/cream (`#fffcff` and `#dae2fd`).
* **Active Glow:** Active icons shift to fill `1` with a diffuse ambient amber glow (`shadow-[0_0_12px_rgba(253,224,71,0.35)]`).
