const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const url = require('node:url');
const { parse } = require('node-html-parser');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ADMIN_DIR = path.join(ROOT, 'admin');
const DEFAULT_FILE = 'index.html';
const CONTENT_FILE = path.join(ADMIN_DIR, 'content.json');
const IMAGES_DIR = path.join(ROOT, 'images');
const BRANDS_DIR = path.join(ROOT, 'brands');
const PUBLISH_TARGET = ROOT;

function sanitizeSiteName(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function sanitizeHtmlFile(fileName = DEFAULT_FILE) {
  const base = path.basename(fileName);
  if (!base.toLowerCase().endsWith('.html')) {
    return `${base}.html`;
  }
  return base;
}

function htmlPathFor(fileName = DEFAULT_FILE) {
  return path.join(ADMIN_DIR, sanitizeHtmlFile(fileName));
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function listHtmlFiles() {
  const entries = await fs.readdir(ADMIN_DIR, { withFileTypes: true });
  const discovered = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map((entry) => entry.name);

  // Include any file keys present in content.json that still exist on disk so
  // we can publish them even if they were added before the current server run.
  try {
    const raw = await readRawContent();
    const fileKeys = raw && raw.__files && typeof raw.__files === 'object' ? Object.keys(raw.__files) : [];
    for (const key of fileKeys) {
      const safe = sanitizeHtmlFile(key);
      const candidate = path.join(ADMIN_DIR, safe);
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile() && safe.toLowerCase().endsWith('.html') && !discovered.includes(safe)) {
          discovered.push(safe);
        }
      } catch (err) {
        // skip missing files
      }
    }
  } catch (err) {
    console.warn('Unable to merge file list from content.json', err);
  }

  return discovered;
}

async function readRawContent() {
  try {
    const raw = await fs.readFile(CONTENT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Unable to read content.json, falling back to empty object', err);
    return {};
  }
}

async function readContent(fileName = DEFAULT_FILE) {
  const parsed = await readRawContent();
  const siteName = sanitizeSiteName(parsed.siteName || '');
  const safeFile = sanitizeHtmlFile(fileName);
  const hasFileMap = parsed && parsed.__files && typeof parsed.__files === 'object';
  const fileBlock = hasFileMap ? parsed.__files[safeFile] || null : null;

  const block =
    fileBlock && typeof fileBlock === 'object'
      ? fileBlock
      : hasFileMap
        ? {}
        : parsed && typeof parsed === 'object'
          ? parsed
          : {};

  const rawTags = block && typeof block.__tags === 'object' ? block.__tags : {};
  const values = block && typeof block === 'object' ? { ...block } : {};
  delete values.__tags;

  const tags = Object.entries(rawTags).reduce((acc, [path, entry]) => {
    if (typeof entry === 'string') {
      acc[path] = { key: entry, type: 'text' };
    } else if (entry && typeof entry === 'object' && entry.key) {
      acc[path] = { key: entry.key, type: entry.type || 'text' };
      if (entry.link) acc[path].link = entry.link;
    }
    return acc;
  }, {});

  return { values, tags, siteName };
}

async function writeContent({ values, tags, siteName, fileName = DEFAULT_FILE }) {
  const safeFile = sanitizeHtmlFile(fileName);
  const raw = await readRawContent();
  const payload = { ...raw };
  const fileBlock = { ...values };

  if (siteName !== undefined) {
    payload.siteName = sanitizeSiteName(siteName);
  }

  if (tags && Object.keys(tags).length) {
    fileBlock.__tags = Object.entries(tags).reduce((acc, [path, entry]) => {
      if (!entry || !entry.key) return acc;
      acc[path] = { key: entry.key, type: entry.type || 'text' };
      if (entry.link) acc[path].link = entry.link;
      return acc;
    }, {});
  }

  payload.__files = payload.__files && typeof payload.__files === 'object' ? payload.__files : {};
  payload.__files[safeFile] = fileBlock;

  if (safeFile === DEFAULT_FILE) {
    Object.keys(payload)
      .filter((key) => key !== '__files' && key !== 'siteName')
      .forEach((key) => delete payload[key]);
    Object.assign(payload, fileBlock);
  }

  await fs.writeFile(CONTENT_FILE, JSON.stringify(payload, null, 2));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replaceDataText(html, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<([a-zA-Z0-9-]+)([^>]*)\\sdata-cms-text=["']${escapedKey}["']([^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'g'
  );
  return html.replace(pattern, (_match, tag, before, after) => {
    return `<${tag}${before} data-cms-text="${key}"${after}>${escapeHtml(value)}</${tag}>`;
  });
}

function replaceDataImage(html, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<img([^>]*?)\\sdata-cms-image=["']${escapedKey}["']([^>]*?)\\/?>`,
    'g'
  );

  return html.replace(pattern, (_match, before, after) => {
    let cleanedBefore = before.replace(/\s?src=["'][^"']*["']/, '');
    let cleanedAfter = after.replace(/\s?src=["'][^"']*["']/, '');
    return `<img${cleanedBefore} data-cms-image="${key}" src="${escapeHtml(value)}"${cleanedAfter}>`;
  });
}

function replaceDataBackground(html, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<([a-zA-Z0-9-]+)([^>]*?)\\sdata-cms-bg=["']${escapedKey}["']([^>]*)>`,
    'g'
  );

  return html.replace(pattern, (_match, tag, before, after) => {
    let attrs = `${before} data-cms-bg="${key}"${after}`;
    const stylePattern = /style=["']([^"']*)["']/;
    const bgStyle = `background-image:url('${escapeHtml(value)}')`;

    if (stylePattern.test(attrs)) {
      const current = attrs.match(stylePattern)[1];
      const styleParts = current
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !s.toLowerCase().startsWith('background-image'));
      styleParts.push(bgStyle);
      const newStyle = styleParts.join('; ');
      attrs = attrs.replace(stylePattern, `style="${newStyle}"`);
    } else {
      attrs = `${attrs} style="${bgStyle}"`;
    }

    return `<${tag}${attrs}>`;
  });
}

function prefixAssetPath(value, siteName) {
  if (!siteName || !value || typeof value !== 'string') return value;
  const trimmedSite = siteName.startsWith('/') ? siteName : `/${siteName}`;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:')) return value;
  if (value.startsWith(trimmedSite)) return value;
  if (value.startsWith('/')) return `${trimmedSite}${value}`;
  return `${trimmedSite}/${value}`;
}

function stripCmsAssets(html) {
  const withoutCss = html.replace(/<link[^>]+href=["']cms\.css["'][^>]*>\s*/gi, '');
  return withoutCss.replace(/<script[^>]+src=["']cms\.js["'][^>]*>\s*<\/script>\s*/gi, '');
}

function applyTagsToHtml(html, tags = {}) {
  if (!tags || !Object.keys(tags).length) return html;

  try {
    const root = parse(html);

    function wrapWithLink(target, href) {
      if (!target || !href) return;
      const parent = target.parentNode;
      if (!parent) return;

      const wrapperRoot = parse('<a></a>');
      const wrapper = wrapperRoot.querySelector('a');
      wrapper.setAttribute('href', href.trim());
      wrapper.setAttribute('data-cms-link-wrapper', 'true');

      const siblings = parent.childNodes || [];
      const index = siblings.indexOf(target);

      if (index >= 0) {
        siblings.splice(index, 1);
      }

      wrapper.appendChild(target);
      wrapper.parentNode = parent;

      if (index >= 0) {
        siblings.splice(index, 0, wrapper);
      } else {
        siblings.push(wrapper);
      }
    }

    Object.entries(tags).forEach(([selector, entry]) => {
      const key = typeof entry === 'string' ? entry : entry && entry.key;
      const type = entry && entry.type ? entry.type : 'text';
      const link = entry && entry.link ? String(entry.link) : '';
      if (!key) return;

      const target = root.querySelector(selector);
      if (!target) return;

      if (type === 'image') {
        target.setAttribute('data-cms-image', key);
      } else if (type === 'background') {
        target.setAttribute('data-cms-bg', key);
      } else {
        target.setAttribute('data-cms-text', key);
      }

      if (link) {
        const parent = target.parentNode;
        const isAnchorParent = parent && parent.tagName && parent.tagName.toLowerCase() === 'a';
        if (isAnchorParent) {
          parent.setAttribute('href', link.trim());
          return;
        }
        wrapWithLink(target, link);
      }
    });

    return root.toString();
  } catch (err) {
    console.warn('Unable to apply stored tags to HTML', err);
    return html;
  }
}

async function copyDirIfExists(sourceDir, targetDir) {
  try {
    await fs.access(sourceDir);
    await ensureDir(path.dirname(targetDir));
    await fs.cp(sourceDir, targetDir, { recursive: true });
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn(`Unable to copy ${sourceDir} to ${targetDir}`, err);
    }
  }
}

async function copyAdminAssets() {
  try {
    await fs.cp(ADMIN_DIR, PUBLISH_TARGET, {
      recursive: true,
      filter: (src) => {
        const relative = path.relative(ADMIN_DIR, src);
        if (!relative) return true;
        const base = path.basename(src);
        if (base === 'content.json' || base === 'cms.js' || base === 'cms.css') return false;
        if (relative.toLowerCase().endsWith('.html')) return false;
        return true;
      },
    });
  } catch (err) {
    console.warn('Unable to copy admin assets to root', err);
  }
}

async function publishSite() {
  const files = await listHtmlFiles();
  const rawContent = await readRawContent();
  const siteName = sanitizeSiteName(rawContent.siteName || '');

  // Do not remove any existing published output; simply overwrite the files we
  // render so older exports remain available if needed.
  await ensureDir(PUBLISH_TARGET);

  const publishedFiles = [];

  for (const file of files) {
    try {
      let html = await renderFile(file, { prefixImagesWithSiteName: Boolean(siteName), siteName });
      html = stripCmsAssets(html);
      await fs.writeFile(path.join(PUBLISH_TARGET, file), html);
      publishedFiles.push(file);
    } catch (err) {
      console.warn(`Unable to publish ${file}`, err);
    }
  }

  await copyAdminAssets();
  await copyDirIfExists(IMAGES_DIR, path.join(PUBLISH_TARGET, 'images'));
  await copyDirIfExists(BRANDS_DIR, path.join(PUBLISH_TARGET, 'brands'));

  if (siteName) {
    const siteRoot = path.join(PUBLISH_TARGET, siteName);
    await ensureDir(siteRoot);
    await copyDirIfExists(IMAGES_DIR, path.join(siteRoot, 'images'));
    await copyDirIfExists(BRANDS_DIR, path.join(siteRoot, 'brands'));
  }

  return publishedFiles;
}

async function renderFile(fileName = DEFAULT_FILE, options = {}) {
  const safeFile = sanitizeHtmlFile(fileName);
  const htmlPath = htmlPathFor(safeFile);
  const [html, { values, tags, siteName }] = await Promise.all([
    fs.readFile(htmlPath, 'utf8'),
    readContent(safeFile),
  ]);

  const hydratedHtml = applyTagsToHtml(html, tags);

  const typeByKey = Object.values(tags || {}).reduce((acc, entry) => {
    const key = typeof entry === 'string' ? entry : entry && entry.key;
    const type = entry && entry.type ? entry.type : 'text';
    if (key) acc[key] = type;
    return acc;
  }, {});

  const prefixedValues = Object.entries(values).reduce((acc, [key, value]) => {
    let inferredType = typeByKey[key];
    if (!inferredType && options.prefixImagesWithSiteName) {
      if (hydratedHtml.includes(`data-cms-image="${key}"`)) inferredType = 'image';
      if (hydratedHtml.includes(`data-cms-bg="${key}"`)) inferredType = 'background';
    }

    if (options.prefixImagesWithSiteName && (inferredType === 'image' || inferredType === 'background')) {
      acc[key] = prefixAssetPath(value, options.siteName || siteName);
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});

  return Object.entries(prefixedValues).reduce((acc, [key, value]) => {
    if (acc.includes(`data-cms-image="${key}"`)) {
      return replaceDataImage(acc, key, value);
    }
    if (acc.includes(`data-cms-bg="${key}"`)) {
      return replaceDataBackground(acc, key, value);
    }
    return replaceDataText(acc, key, value);
  }, hydratedHtml);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.js':
      return 'application/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'text/html';
  }
}

async function serveStatic(res, filePath) {
  const safePath = path.normalize(filePath).replace(/^\/+/, '');
  const searchBases = [ADMIN_DIR, ROOT];

  for (const base of searchBases) {
    try {
      const absolute = path.join(base, safePath);
      const data = await fs.readFile(absolute);
      res.writeHead(200, { 'Content-Type': contentTypeFor(absolute) });
      res.end(data);
      return;
    } catch (err) {
      // continue to next base
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

async function handleApiContent(req, res, fileName = DEFAULT_FILE) {
  if (req.method === 'GET') {
    const { values, tags, siteName } = await readContent(fileName);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content: values, tags, siteName }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const {
          key,
          value,
          originalOuterHTML,
          updatedOuterHTML,
          path: elementPath,
          type,
          image,
          file,
          siteName,
          link,
        } = payload;
        const sanitizedSiteName = siteName !== undefined ? sanitizeSiteName(siteName) : undefined;
        if (!key && sanitizedSiteName === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Key is required' }));
          return;
        }

        const targetFile = sanitizeHtmlFile(file || fileName);
        const htmlPath = htmlPathFor(targetFile);
        const { values, tags, siteName: existingSiteName } = await readContent(targetFile);
        let storedValue = value ?? '';
        if (type === 'image' || type === 'background') {
          try {
            await fs.mkdir(IMAGES_DIR, { recursive: true });
          } catch (err) {
            console.warn('Unable to ensure images directory', err);
          }

          if (image && image.sourceType === 'upload' && image.data && image.name) {
            const extension = path.extname(image.name) || '.png';
            const safeBase = path.basename(image.name, extension).replace(/[^a-z0-9_-]/gi, '_');
            const filename = `${safeBase || 'uploaded'}-${Date.now()}${extension}`;
            const targetPath = path.join(IMAGES_DIR, filename);
            const base64 = image.data.includes(',') ? image.data.split(',')[1] : image.data;
            await fs.writeFile(targetPath, Buffer.from(base64, 'base64'));
            storedValue = `/images/${filename}`;
          }

          if (image && image.sourceType === 'url' && image.url) {
            storedValue = image.url;
          }
        }

        if (key) {
          values[key] = storedValue;
          if (elementPath) {
            const existingTag = tags[elementPath] || {};
            tags[elementPath] = { ...existingTag, key, type: type || 'text' };
            if (link !== undefined) {
              if (link) {
                tags[elementPath].link = link;
              } else {
                delete tags[elementPath].link;
              }
            }
          }

          if (originalOuterHTML && updatedOuterHTML) {
            try {
              let currentHtml = await fs.readFile(htmlPath, 'utf8');
              if (currentHtml.includes(originalOuterHTML)) {
                currentHtml = currentHtml.replace(originalOuterHTML, updatedOuterHTML);
                await fs.writeFile(htmlPath, currentHtml);
              }
            } catch (err) {
              console.warn(`Unable to persist new tag in ${targetFile}`, err);
            }
          }
        }

        const finalSiteName =
          sanitizedSiteName !== undefined ? sanitizedSiteName : existingSiteName || sanitizeSiteName(siteName);

        if (siteName !== undefined && !finalSiteName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Site name cannot be empty' }));
          return;
        }

        await writeContent({ values, tags, fileName: targetFile, siteName: finalSiteName });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: values, tags, siteName: finalSiteName }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || '/';

  if (pathname === '/api/content') {
    return handleApiContent(req, res, parsedUrl.query.file || DEFAULT_FILE);
  }

  if (pathname === '/api/publish' && req.method === 'POST') {
    try {
      const published = await publishSite();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ published }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unable to publish site' }));
    }
    return;
  }

  if (pathname === '/api/files' && req.method === 'GET') {
    try {
      const files = await listHtmlFiles();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unable to list files' }));
    }
    return;
  }

  if (req.method === 'GET' && (pathname === '/' || pathname.toLowerCase().endsWith('.html'))) {
    const targetFile =
      pathname === '/'
        ? sanitizeHtmlFile(parsedUrl.query.file || DEFAULT_FILE)
        : sanitizeHtmlFile(path.basename(pathname));
    try {
      await fs.access(htmlPathFor(targetFile));
      const html = await renderFile(targetFile);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end(status === 404 ? 'Page not found' : 'Failed to render page');
    }
    return;
  }

  return serveStatic(res, pathname === '/' ? DEFAULT_FILE : pathname.slice(1));
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
