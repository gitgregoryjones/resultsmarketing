# Results Marketing Inline CMS Demo

A tiny tag-and-hydrate CMS MVP backed by a Node.js server. Templates and CMS assets live in `/admin`, and edits persist by writing changes directly into the HTML files on disk via a simple API.

## How it works
1. HTML contains elements with `data-cms-text="key"`, `data-cms-image="key"`, or `data-cms-bg="key"` (for background images) attributes.
2. The Node server serves the HTML file directly so content is visible to crawlers and users on first paint.
3. The floating **Edit** button toggles edit mode. While enabled you can click any text or image, assign a key, edit its value in the sidebar (type, text, upload file, paste URL, or set a background), and save the changes back to the HTML file through `/api/content?file=<html>`.
4. Newly tagged elements persist because the server rewrites the requested HTML file with the added CMS attribute.
5. When Supabase environment variables are configured, admin API access requires a valid Supabase user session.
6. The admin **Publish** button renders the static pages locally and uploads the rendered output to the GitHub Pages repository/branch/path configured in environment variables.

## Local development
Run the lightweight Node server from the repo root:

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser to view and edit the page.

## Netlify deployment
This repo includes `netlify.toml` and `netlify/functions/server.js`, which route Netlify traffic through the existing Node request handler.

For local development, copy `.env.example` to `.env` and fill in the values you want to use. `node server.js` automatically loads `.env` from the repo root before reading Supabase, GitHub Pages, port, and publish settings. If you need a different env file, set `DOTENV_CONFIG_PATH=/path/to/file.env` before starting the server.

Set these environment variables in Netlify:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL, for example `https://xxxx.supabase.co`. |
| `SUPABASE_ANON_KEY` | Supabase anon key used by the browser login form and server token validation. |
| `GITHUB_PAGES_REPO` | GitHub Pages target repo in `owner/repo` form. |
| `GITHUB_PAGES_BRANCH` | Branch to publish to, usually `gh-pages` or `main`. Defaults to `gh-pages`. |
| `GITHUB_PAGES_PATH` | Optional subfolder inside the target branch. Leave blank to publish at the branch root. |
| `GITHUB_PAGES_TOKEN` | GitHub fine-grained or classic token with `contents:write` permission for the target repo. |
| `GITHUB_COMMITTER_NAME` | Optional commit author name for publish commits. |
| `GITHUB_COMMITTER_EMAIL` | Optional commit author email for publish commits. |
| `PUBLISH_LOCAL_DIR` | Optional local/serverless render directory before upload. Defaults to `published`. |
| `PUBLISH_DEBUG` | Optional `true`/`false` flag. When true, publish responses include a step-by-step trace in addition to server logs. |

Create/invite users in Supabase Auth to manage who can sign in. Once `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, `/api/*` routes require a Supabase bearer token, and the CMS displays a Supabase email/password login before loading admin data.

> Note: Netlify Functions have ephemeral writable storage. The publish flow still renders to a local directory first, but long-term published output is the configured GitHub Pages repo. Keep source HTML edits in your repo workflow if you need them persisted across Netlify function cold starts/redeploys.


### Publish debugging
Every publish request now gets a trace id like `pub-lxyz123-abc456`. The server logs each local render step, each GitHub API request, each uploaded file, and the GitHub commit SHA/URL returned by the Contents API. Set `PUBLISH_DEBUG=true` in `.env` (or in Netlify) to include the full trace in the `/api/publish` JSON response. For one-off browser debugging without changing `.env`, run this in the browser console before clicking Publish:

```js
localStorage.setItem('publishDebug', 'true')
```

The admin publish response is also logged to the browser console as `[PUBLISH TRACE][admin response]`, including `traceId`, uploaded file paths, and GitHub commit metadata.

## Files
- `/admin/index.html` – Demo page using tagged text, image, and background-image elements.
- `/admin/cms.js` – Inline CMS logic (hydration, edit mode, Supabase login overlay, sidebar UI, image uploads/URLs, server sync, background image editing, publish action).
- `/admin/cms.css` – Styling for the editor controls and authentication overlay.
- `server.js` – Minimal Node server that serves `.html` files in `/admin`, validates Supabase tokens when configured, persists edits, exposes CMS APIs, and publishes static output to GitHub Pages.
- `netlify/functions/server.js` – Netlify Function adapter for the Node request handler.
- `netlify.toml` – Netlify function and redirect configuration.

## API
- `GET /api/auth/config` – Returns whether Supabase auth is enabled plus the public Supabase URL/anon key for the login form.
- `GET /api/content?file=index.html` – Returns `{ content, tags, siteName }` for the requested HTML file.
- `POST /api/content?file=index.html` – Accepts `{ key, value, path, type, image, originalOuterHTML, updatedOuterHTML, file, siteName }` where `type` is `text`, `image`, `background`, or `video`; saves uploaded media to `/images`, merges values immediately into the HTML file on disk, and persists a global `siteName` (lowercase, spaces removed) on every HTML file when sent.
- `GET /api/files` – Lists available `.html` files in `/admin` for quick switching in the CMS sidebar.
- `POST /api/publish` – Prepares every `.html` file from `/admin` by stripping CMS assets, copying needed local assets, prefixing published image/background URLs with `/<siteName>` when set, saving static HTML to `PUBLISH_LOCAL_DIR`/`published`, and uploading that directory to the configured GitHub Pages repo.

## Notes
- Content persists to disk in the HTML files themselves during local development.
- Server-side rendering keeps the hydrated text in the HTML response for SEO.
- Auto-tagged elements are stored by rewriting the active HTML file so they survive reloads in environments with persistent disk.
- Images and backgrounds can be swapped by uploading a file (persisted to `/images`) or pasting a remote URL.
- The sidebar can be docked to the left, right, top, or bottom via the Dock controls; top and bottom docking shrink the panel height while keeping every control scrollable.
- Use **Publish static site** in the sidebar (or `POST /api/publish`) to write fully merged HTML files to the configured GitHub Pages location without any CMS assets.
- If no site name exists yet, enter one (lowercase, no spaces) in the sidebar before publishing; it is stored globally in the HTML files and used to prefix published asset URLs.

## Editing different HTML files
- The file dropdown in the CMS sidebar lists all `.html` files in `/admin` (from `/api/files`).
- Switching files updates the URL to the selected HTML path (for example, `/contact-us.html`) and reloads the page rendered with that file's stored content and tags.
