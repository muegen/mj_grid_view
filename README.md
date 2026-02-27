# MJ Grid Compare

Simple, static web tool for A/B image evaluation of Midjourney jobs. Runs
locally in your browser.

## Features

- Compare two jobs side-by-side (A vs B).
- Paste job IDs or full CDN URLs (grid or individual URLs both work).
- Auto view mode: individual images for single inputs, grids for multi inputs.
- Manual view mode toggle to force grid or individual views.
- Synchronized hover zoom panel for paired images (optional Shift modifier).
- Adjustable zoom panel size and zoom level.
- Optional outline highlights the zoomed region on images.
- Session persistence (restores last inputs and settings).
- Shareable links with all settings and job IDs.
- Pair navigation with buttons and J/K keys.
- Clean layout optimized for quick visual scans.

## Usage (Local)

1. Paste job IDs into A and B (one per line or comma-separated).
2. Optional: set labels for A and B.
3. Choose a view mode (Auto / Individual / Grid).
4. Adjust zoom level and panel size as needed.
5. Comparisons update automatically as you type (Render button still works).
6. Hover an image to see the zoom panel (hold Shift if enabled).
7. Use **Previous/Next pair** or press **J/K** to jump between pairs.
8. Press **G** to toggle view mode (grid/individual).
9. Press **Z** to cycle zoom levels.
10. Press **S** to cycle zoom panel sizes.
11. Press **P** to toggle zoom preview.
12. Press **H** to toggle the Hold Shift requirement.
13. Click **Copy link** to generate a shareable URL.

Jobs are paired by order: A1 <-> B1, A2 <-> B2, etc. If the counts differ, unmatched
items show as missing.


