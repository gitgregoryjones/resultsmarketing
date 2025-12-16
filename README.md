# Results Marketing Inline CMS Demo

A tiny tag-and-hydrate CMS MVP built with plain HTML, CSS, and JavaScript. Content is hydrated from `content.json` and can be overridden locally in the browser via `localStorage`.

## How it works
1. Static HTML contains elements with `data-cms-text="key"` attributes.
2. On load, `cms.js` fetches `content.json`, merges any overrides stored in `localStorage`, and swaps text content for each tagged element.
3. A floating **Edit** button toggles edit mode. While enabled you can click any text, assign a key, edit its value in the sidebar, and save the override locally.

## Local development
Because browsers block `fetch` on `file://`, run a simple HTTP server from the repo root:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your browser to view and edit the page.

## Files
- `index.html` – Demo page using tagged text elements.
- `content.json` – Default content values keyed by `data-cms-text`.
- `cms.js` – Inline CMS logic (hydration, edit mode, sidebar UI, overrides).
- `cms.css` – Styling for the editor controls.

## Notes
- Local overrides are stored under the `cmsContentOverrides` key in `localStorage`.
- Auto-tagged elements persist between reloads via `cmsTaggedElements` (paths mapped to their keys).
- Saving a new key will auto-adjust duplicates (e.g., `key`, `key-2`, ...).
- The editor only supports plain text (`textContent`) for this MVP.
