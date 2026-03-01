# Tools Folder

Each tool lives in its own folder so you can add or edit tools without touching
the hub layout.

## Structure

- `tools/<tool_id>/view.html` — tool markup injected into `#toolMount`.
- `tools/<tool_id>/tool.js` — tool logic (exports `init({ root })`).
- `tools/shared/` — shared helpers (DOM, jobs, clipboard, zoom, etc.).

## Adding a New Tool

1. Create a new folder: `tools/<tool_id>/`.
2. Add `view.html` with your tool markup.
3. Add `tool.js` that exports `init({ root })` and returns `{ destroy }`.
4. Register the tool in `app.js` under `TOOL_CONFIG`.
5. Add a hub card in `index.html` with `data-tool-target="<tool_id>"`.

## Notes

- Tools are loaded via `fetch` and ES module imports, so run a local HTTP server.
- Keep shared behavior in `tools/shared/` to avoid duplication.
- Use `?tool=<tool_id>` in the URL to deep-link to a tool (e.g. `?tool=rank`).
