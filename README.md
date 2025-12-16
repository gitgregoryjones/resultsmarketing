# Results Marketing Inline CMS Demo

A tiny tag-and-hydrate CMS MVP now backed by a Node.js server. Content is hydrated server-side from `content.json` and edits persist by writing back to that file via a simple API.

## How it works
1. HTML contains elements with `data-cms-text="key"`, `data-cms-image="key"`, or `data-cms-bg="key"` (for background images) attributes.
2. The Node server reads `content.json` and renders the page with matching text replacements and image/background sources so content is visible to crawlers and users on first paint.
3. The floating **Edit** button toggles edit mode. While enabled you can click any text or image, assign a key, edit its value in the sidebar (type, text, upload file, paste URL, or set a background), and save the changes back to `content.json` through `/api/content?file=<html>`.
4. Newly tagged elements persist because the server rewrites the requested HTML file with the added CMS attribute while also storing their selectors and types in `content.json` under the file-specific `__tags` entry.

## Local development
Run the lightweight Node server from the repo root:

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser to view and edit the page.

## Files
- `index.html` – Demo page using tagged text, image, and background-image elements.
- `content.json` – Content values keyed by CMS attributes, persisted on save with per-file entries in `__files` (each with its own `__tags`).
- `cms.js` – Inline CMS logic (hydration, edit mode, sidebar UI, image uploads/URLs, server sync, background image editing).
- `cms.css` – Styling for the editor controls.
- `server.js` – Minimal Node server that renders any `.html` file in the root with content and exposes `/api/content` and `/api/files`.

## API
- `GET /api/content?file=index.html` – Returns `{ content, tags }` for the requested HTML file.
- `POST /api/content?file=index.html` – Accepts `{ key, value, path, type, image, originalOuterHTML, updatedOuterHTML, file }` where `type` is `text`, `image`, or `background`; updates `content.json` (including tag selectors and type under the file's `__tags`), saves uploaded images to `/images`, and rewrites the matching HTML file with new tags when provided.
- `GET /api/files` – Lists available `.html` files in the repository root for quick switching in the CMS sidebar.

## Notes
- Content persists to disk in `content.json`; no `localStorage` is used.
- Server-side rendering keeps the hydrated text in the HTML response for SEO.
- Auto-tagged elements are stored by rewriting the active HTML file so they survive reloads.
- Images and backgrounds can be swapped by uploading a file (persisted to `/images`) or pasting a remote URL.
- The sidebar can be docked to the left, right, top, or bottom via the Dock controls; top and bottom docking shrink the panel height while keeping every control scrollable.

## Editing different HTML files
- The file dropdown in the CMS sidebar lists all `.html` files at the project root (from `/api/files`).
- Switching files updates the URL to the selected HTML path (for example, `/contact-us.html`) and reloads the page rendered with that file's stored content and tags.
