# Results Marketing Inline CMS Demo

A tiny tag-and-hydrate CMS MVP now backed by a Node.js server. Templates and CMS assets live in `/admin`, and edits persist by writing changes directly into the HTML files on disk via a simple API.

## How it works
1. HTML contains elements with `data-cms-text="key"`, `data-cms-image="key"`, or `data-cms-bg="key"` (for background images) attributes.
2. The Node server serves the HTML file directly so content is visible to crawlers and users on first paint.
3. The floating **Edit** button toggles edit mode. While enabled you can click any text or image, assign a key, edit its value in the sidebar (type, text, upload file, paste URL, or set a background), and save the changes back to the HTML file through `/api/content?file=<html>`.
4. Newly tagged elements persist because the server rewrites the requested HTML file with the added CMS attribute.

## Local development
Run the lightweight Node server from the repo root:

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser to view and edit the page.

## Files
- `/admin/index.html` – Demo page using tagged text, image, and background-image elements.
- `/admin/cms.js` – Inline CMS logic (hydration, edit mode, sidebar UI, image uploads/URLs, server sync, background image editing).
- `/admin/cms.css` – Styling for the editor controls.
- `server.js` – Minimal Node server that serves `.html` files in `/admin`, persists edits, and exposes `/api/content` and `/api/files`.

## API
- `GET /api/content?file=index.html` – Returns `{ content, tags, siteName }` for the requested HTML file.
- `POST /api/content?file=index.html` – Accepts `{ key, value, path, type, image, originalOuterHTML, updatedOuterHTML, file, siteName }` where `type` is `text`, `image`, or `background`; saves uploaded images to `/images`, merges text/image/background values immediately into the HTML file on disk (including any new CMS tag attributes), and persists a global `siteName` (lowercase, spaces removed) on every HTML file when sent.
- `GET /api/files` – Lists available `.html` files in `/admin` for quick switching in the CMS sidebar.
- `POST /api/publish` – Prepares every `.html` file from `/admin` by stripping `cms.js`/`cms.css`, copying needed local assets (e.g., `images`, `brands`, non-CMS assets from `/admin`), prefixing published image/background URLs with `/<siteName>` when set, and saving static HTML into the project root (plus `/siteName` asset folders) without deleting existing exports.

## Notes
- Content persists to disk in the HTML files themselves; no `localStorage` is used.
- Server-side rendering keeps the hydrated text in the HTML response for SEO.
- Auto-tagged elements are stored by rewriting the active HTML file so they survive reloads.
- Images and backgrounds can be swapped by uploading a file (persisted to `/images`) or pasting a remote URL.
- The sidebar can be docked to the left, right, top, or bottom via the Dock controls; top and bottom docking shrink the panel height while keeping every control scrollable.
- Use **Publish static site** in the sidebar (or `POST /api/publish`) to write fully merged HTML files to the project root without any CMS assets for hosting-ready output; existing files are not deleted. Set a site name in the sidebar to prefix published image URLs (assets are copied into `/[siteName]/images` and `/[siteName]/brands`).
- If no site name exists yet, enter one (lowercase, no spaces) in the sidebar before publishing; it is stored globally in the HTML files.

## Editing different HTML files
- The file dropdown in the CMS sidebar lists all `.html` files in `/admin` (from `/api/files`).
- Switching files updates the URL to the selected HTML path (for example, `/contact-us.html`) and reloads the page rendered with that file's stored content and tags.
