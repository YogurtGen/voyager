# Voyager website

Updated 14 November 2026. Live URL: `https://yogurtgen.github.io/voyager/`.

The owner's latest instruction is to copy the WaterConsole website exactly. This supersedes the earlier custom spacecraft/shader/disc-carousel concept and the previous website design gate.

## Source

- Repository: `https://github.com/YogurtGen/WaterConsole`
- Revision: `e54bfefdc8e16f2b2987f3a7b1941d2f77755968`
- CSS and JavaScript are copied byte-for-byte, including layout, palette, animations, preview tabs and the interactive phone/lab.
- HTML changes are confined to Voyager identity, product screenshots and their true dimensions, version 0.1.0, support wording and relevant documentation/download URLs.
- MIT and Inter font notices are retained in the website assets; exact file hashes are in `website/SOURCE.json`.

The Controller Studio screenshot is 1920 × 1080. WaterConsole's original `.studio-release > img` rule uses `width: 100%; height: auto`, so it preserves that ratio. The previous custom layout incorrectly left the HTML height fixed while scaling width; that layout is removed.

## Verification

`node scripts/check-website.mjs` checks source identity, asset/anchor references, both download/support groups, Voyager release metadata and the natural image-ratio rule. `node scripts/build-website.mjs` creates the public artifact and checks versioned references. Application typecheck remains required; application source and library data are unchanged.

The website retains WaterConsole's original design intentionally, following the owner's exact-copy instruction. This includes original copy and styling that differ from the earlier draft PRD. Browser and deployment verification for the revised page are recorded in the task result; native gameplay is outside website validation.

Checks completed for the copied version:

- Source identity, asset/anchor checks, build and application typecheck passed.
- Browser preview: Home/Pair phones/Controller Lab tabs, keyboard Home, two/four-view selection, A jump and B reset worked; no console errors or warnings were recorded.
- The Studio image loaded at 1920 × 1080 and rendered at 1160 × 653 px including its border, preserving its proportions.
- At viewport widths 360, 390, 768 and 1366 px there was no document overflow; the Studio image preserved its natural ratio at each width.
