# Voyager public website

Built 14 November 2026 for `https://yogurtgen.github.io/voyager/`. Source is in `website/`; GitHub Pages uploads only that directory through `.github/workflows/pages.yml`.

## Direction

Voyager is the upgrade to WaterConsole. The website follows the application's space black, navy, action blue and restrained record gold. Its progression is product introduction, physical disc collection, real product screenshots, connection steps, browser controller demo, Controller Studio, AI workflow, downloads and FAQ.

ENERGY 3 / RHYTHM 3 / MOTION 2. The spacecraft and procedural blue background establish the space identity. Disc depth demonstrates the collection. Signal animation explains local connections. Content reveals and tab transitions connect sections/states. Copy and actions stay stable and readable.

The hero and download section both place **Support us immediately beside Download for Windows**, using `https://yapp.ink/fensulix`. Support is optional. Font, screenshots, SVG artwork and effect code are served locally. See [credits](../website/CREDITS.md).

## Checks performed

- `node scripts/check-website.mjs`: passed. Checks local assets/anchors, support URL/placement, honest demo/bundled-content wording, JavaScript syntax, screenshot transfer sizes, deployment folder scope, carousel wrapping, finite poses, spring settling and bounded swipe destinations.
- TypeScript: the application's unchanged source passed `tsc --project tsconfig.json --noEmit` using installed dependencies. The website itself is static HTML/CSS and native JavaScript modules.
- Browser QA in the Codex in-app browser: desktop hero, all three screenshot tabs, keyboard tab selection, previous/next discs and drag gestures, keyboard/pointer demo movement, A jump, B reset, prompt clipboard success, all eight FAQs, pause/resume and mobile menu/Escape focus return.
- Responsive layout measurements at 360, 390, 768, 1024, 1366 and 1920 px: document scroll width did not exceed its client width. D-pad targets measured 44 × 44 px.
- No browser console errors or warnings were recorded in the completed local interaction checks. All inspected product images loaded successfully.
- Solid contrast calculations: main text on action blue 5.49:1; secondary text on panel 8.52:1; signal blue on space black 8.33:1; control edge on panel 4.40:1. Hero copy sits over an opaque/darkened region rather than over the spacecraft.

The preview is a browser simulation, not real phone pairing or native game input. Physical phone gameplay, hardware haptics, field Core Web Vitals, CPU/GPU profiling and OS-level reduced-motion emulation were not performed. Reduced-motion, disabled WebGL and cleanup behavior were reviewed in source; the visible pause/resume path was exercised in browser.

## Design delivery gate

PASS below is scoped to the stated evidence, not a claim of unperformed device testing.

| Rule | Result and evidence |
| --- | --- |
| R-01 | PASS: background gradient/shader establishes space depth; scrim protects text |
| R-02 | PASS: authored product copy has no em dash; checker enforces it |
| R-03 | PASS: six responsive widths measured without horizontal overflow |
| R-04 | PASS: icons denote Windows, downloads, GitHub, support and playback |
| R-05 | PASS: collection, screenshot, diagram, demo, editor and guide have distinct compositions |
| R-06 | PASS: locally hosted Inter follows the app; no decorative display monospace |
| R-07 | PASS: orbital paths and connection lines express the product's space/local-network identity |
| R-08 | PASS: arrows are limited to navigation and directional actions |
| R-09 | PASS: no fabricated trust badges or adoption claims |
| R-10 | PASS: panels are solid; frosted surfaces are not repeated throughout the page |
| R-11 | PASS: buttons/panels use defined radii; discs alone are circular |
| R-12 | PASS: depth shadows are reserved for physical discs and the player object |
| R-13 | PASS: atmospheric light remains in the hero; buttons/cards have no repeated glow |
| R-14 | PASS: content uses diagrams, full-width screenshots and prose rather than uniform feature cards |
| R-15 | PASS: Download for Windows, Support us, Copy prompt and Read the AI workflow have concrete actions |
| R-16 | PASS: copy states the actual PC/phone, game-library and controller workflow |
| R-17 | PASS: four slots and published release data are sourced; no adoption/latency numbers invented |
| R-18 | PASS: no testimonials are fabricated |
| R-19 | PASS: decorative loops have pause/offscreen controls; functional input remains direct |
| R-20 | PASS: Voyager palette, spacecraft, original mark and disc collection make the site product-specific |
| R-21 | PASS: dark default follows the requested Voyager brand |
| R-22 | PASS: actual app screenshots and custom spacecraft replace stock illustrations |
| R-23 | PASS: mark/screenshots already belong to the project; new spacecraft follows the accepted PRD brief |
| R-24 | PASS: internal anchor/asset checker passed; external paths use the public repository/release |
| R-25 | PASS: text/control color pairs calculated as listed above; copy is shielded from animated art |
| R-26 | PASS: implemented tabs, demo, clipboard, menu, FAQ and motion control were exercised |
| R-27 | PASS: release API failure retains verified links; clipboard failure has manual-copy text; WebGL failure retains CSS art |
| R-28 | PASS: FAQs address Voyager setup, bundle, source, input and multiplayer limits |
| R-29 | PASS: navy/blue core, neutral text and limited gold accent |
| R-30 | PASS: requested references adapted to Voyager; carousel source attribution is bundled |
| R-31 | PASS: visual and motion purposes are stated in Direction and credits |
| R-32 | PASS: tab keys, menu Escape/focus, semantic links/buttons and visible focus are implemented; keyboard paths checked |
| R-33 | PASS: source files are authored directly; formatter only reformats them |
| R-34 | N/A: fixed brand theme, no theme toggle |
| R-35 | PASS: static site served and interacted with in browser; source checks/typecheck passed |
| R-36 | PASS: no unmeasured security/performance promises or invented customer claims |
| R-37 | PASS: direction and ENERGY/RHYTHM/MOTION dials declared |
| R-38 | PASS: public build screenshots and simulated feature discs are labeled honestly |
| Liveliness | PASS: spacecraft focal point, varied section rhythm, structural spacing and recurring orbital motif |
| C-1 | PASS: palette, typography, composition and animation purposes recorded |
| C-2 | PASS: interactive controls and fallback feedback implemented |
| C-3 | PASS: every section explains or enables a real visitor task |
| C-4 | PASS within tested browser scope: responsive, focus, input release and menu recovery checked; hardware limits listed |
| C-5 | PASS: real release links, isolated screenshots and explicit simulation labeling |
