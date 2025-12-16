# Results Marketing Inline CMS Demo

A tiny tag-and-hydrate CMS MVP now backed by a Node.js server. Content is hydrated server-side from `content.json` and edits persist by writing back to that file via a simple API.

## How it works
1. HTML contains elements with `data-cms-text="key"`, `data-cms-image="key"`, or `data-cms-bg="key"` (for background images) attributes.
2. The Node server reads `content.json` and renders the page with matching text replacements and image/background sources so content is visible to crawlers and users on first paint.
3. The floating **Edit** button toggles edit mode. While enabled you can click any text or image, assign a key, edit its value in the sidebar (type, text, upload file, or paste URL), and save the changes back to `content.json` through `/api/content`.
4. Newly tagged elements persist because the server rewrites `index.html` with the added CMS attribute while also storing their selectors and types in `content.json` under `__tags`.

## Local development
Run the lightweight Node server from the repo root:

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser to view and edit the page.

## Files
- `index.html` – Demo page using tagged text, image, and background-image elements.
- `content.json` – Content values keyed by CMS attributes, persisted on save (plus `__tags` for selectors/type metadata).
- `cms.js` – Inline CMS logic (hydration, edit mode, sidebar UI, image uploads/URLs, server sync, background image editing).
- `cms.css` – Styling for the editor controls.
- `server.js` – Minimal Node server that renders `index.html` with content and exposes `/api/content`.

## API
- `GET /api/content` – Returns `{ content, tags }` from `content.json`.
- `POST /api/content` – Accepts `{ key, value, path, type, image, originalOuterHTML, updatedOuterHTML }` where `type` is `text`, `image`, or `background`; updates `content.json` (including tag selectors and type under `__tags`), saves uploaded images to `/images`, and rewrites `index.html` with new tags when provided.

## Notes
- Content persists to disk in `content.json`; no `localStorage` is used.
- Server-side rendering keeps the hydrated text in the HTML response for SEO.
- Auto-tagged elements are stored by rewriting `index.html` so they survive reloads.
- Images and backgrounds can be swapped by uploading a file (persisted to `/images`) or pasting a remote URL.
