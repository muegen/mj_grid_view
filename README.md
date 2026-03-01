# MJ Grid Tools

Simple, static web tool suite for comparing and ranking Midjourney jobs. Runs
locally in your browser.

## Features

- Compare two or three job sets side-by-side.
- Rank job sets blindly with a shuffled order and exportable summary.
- Paste job IDs or full CDN URLs (grid or individual URLs both work).
- Auto view mode: individual images for single inputs, grids for multi inputs.
- Manual view mode toggle to force grid or individual views.
- Synchronized hover zoom panel for paired images (optional Shift modifier).
- Adjustable zoom panel size and zoom level.
- Optional outline highlights the zoomed region on images.
- Session persistence (restores last inputs and settings).
- Shareable links with all settings and job IDs.
- Pair navigation with J/K keys and scroll tracking.
- Clean layout optimized for quick visual scans.

## Usage (Local)

Serve the project over HTTP so ES modules and tool templates can load
(`python -m http.server` from the repo root, then visit `http://localhost:8000`).
When you are done, stop the server with Ctrl+C in the terminal.

1. Paste job IDs into A and B (one per line or comma-separated).
2. Optional: set labels for A and B.
3. Choose a view mode (Auto / Individual / Grid).
4. Adjust zoom level and panel size as needed.
5. Comparisons update automatically as you type (Render button still works).
6. Hover an image to see the zoom panel (hold Shift if enabled).
7. Press **J/K** to jump between pairs.
8. Press **G** to toggle view mode (grid/individual).
9. Press **Z** to cycle zoom levels.
10. Press **S** to cycle zoom panel sizes.
11. Press **H** to toggle the Hold Shift requirement.
12. Click **Copy link** to generate a shareable URL.

Use the **/** button to see shortcuts for each tool. Rank selections use **1/2**
(**3** for three columns) and **4** to skip.

Jobs are paired by order: A1 <-> B1, A2 <-> B2, etc. If the counts differ, unmatched
items show as missing.
