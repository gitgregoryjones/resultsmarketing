# WordPress Published Page Templates (Uploadable Theme Package)

These templates are based on the published files in the repository root:

- `index.html`
- `news.html`
- `contact-us.html`
- `services.html`

This folder now includes required WordPress theme files (`style.css`, `index.php`) so it can be uploaded as a theme zip on WordPress.com / WordPress.org.

## WordPress.com install steps (theme name: `results1.0`)

1. Keep this folder name as `results1.0` before zipping (or rename after unzipping in your local machine).
2. Inside the theme folder, create `published-html/`.
3. Copy these files into `published-html/`:
   - `index.html`
   - `news.html`
   - `contact-us.html`
   - `services.html`
4. Copy the full `images/` folder to: `results1.0/published-html/images/`.
5. Zip the `results1.0` folder.
6. In WordPress.com: **Appearance → Themes → Upload Theme** and upload the zip.
7. Activate the theme.
8. In WP Admin, assign each page template to the matching page.

## Why you saw “missing style.css”

WordPress only accepts uploads that are complete themes. A valid theme requires `style.css` with a theme header. This package now includes that file.

## How rendering works

The templates preserve plain HTML output by reading and printing the published HTML files directly.

For portability, each template searches these locations in order:

1. Child/active theme: `published-html/<file>.html`
2. Child/active theme root: `<file>.html`
3. Parent theme: `published-html/<file>.html`
4. Parent theme root: `<file>.html`
5. WordPress root: `<file>.html`

If the HTML does not already include a `<base>` tag, the template injects one dynamically so relative links/assets resolve correctly from WordPress page URLs.

## Dynamic placeholder data

Each template still includes placeholder repeater arrays and commented loop examples for future WordPress dynamic content, without removing current static content.
