# WordPress Published Page Templates

These templates are based on the published files in the repository root:

- `index.html`
- `news.html`
- `contact-us.html`
- `services.html`

## Installation (recommended)

1. Copy the `page-*.php` files into your active theme root (`wp-content/themes/<theme>/`).
2. In the same theme, create a `published-html/` directory.
3. Copy the four published HTML files above into `published-html/`.
4. Copy any required assets (for example `images/`) so relative references match your published HTML.
5. In WP Admin, assign each page template to the corresponding page.

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
