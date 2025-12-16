# Results Marketing Inline CMS Demo

A tiny tag-and-hydrate CMS MVP now backed by a Node.js server. Content is hydrated server-side from `content.json` and edits persist by writing back to that file via a simple API.

## How it works
1. HTML contains elements with `data-cms-text="key"` attributes.
2. The Node server reads `content.json` and renders the page with matching text replacements so content is visible to crawlers and users on first paint.
3. The floating **Edit** button toggles edit mode. While enabled you can click any text, assign a key, edit its value in the sidebar, and save the changes back to `content.json` through `/api/content`.
4. Newly tagged elements persist because the server rewrites `index.html` with the added `data-cms-text` attribute and latest text.

## Local development
Run the lightweight Node server from the repo root:

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser to view and edit the page.

## Files
- `index.html` – Demo page using tagged text elements.
- `content.json` – Content values keyed by `data-cms-text`, persisted on save.
- `cms.js` – Inline CMS logic (hydration, edit mode, sidebar UI, server sync).
- `cms.css` – Styling for the editor controls.
- `server.js` – Minimal Node server that renders `index.html` with content and exposes `/api/content`.

## API
- `GET /api/content` – Returns `{ content }` from `content.json`.
- `POST /api/content` – Accepts `{ key, value, originalOuterHTML, updatedOuterHTML }`, updates `content.json`, and rewrites `index.html` with new tags when provided.

## Notes
- Content persists to disk in `content.json`; no `localStorage` is used.
- Server-side rendering keeps the hydrated text in the HTML response for SEO.
- Auto-tagged elements are stored by rewriting `index.html` so they survive reloads.
- The editor only supports plain text (`textContent`) for this MVP.
