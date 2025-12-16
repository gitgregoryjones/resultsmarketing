const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const url = require('node:url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DEFAULT_FILE = 'index.html';
const CONTENT_FILE = path.join(ROOT, 'content.json');
const IMAGES_DIR = path.join(ROOT, 'images');

function sanitizeHtmlFile(fileName = DEFAULT_FILE) {
  const base = path.basename(fileName);
  if (!base.toLowerCase().endsWith('.html')) {
    return `${base}.html`;
  }
  return base;
}

function htmlPathFor(fileName = DEFAULT_FILE) {
  return path.join(ROOT, sanitizeHtmlFile(fileName));
}

async function listHtmlFiles() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map((entry) => entry.name);
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
    }
    return acc;
  }, {});

  return { values, tags };
}

async function writeContent({ values, tags, fileName = DEFAULT_FILE }) {
  const safeFile = sanitizeHtmlFile(fileName);
  const raw = await readRawContent();
  const payload = { ...raw };
  const fileBlock = { ...values };

  if (tags && Object.keys(tags).length) {
    fileBlock.__tags = Object.entries(tags).reduce((acc, [path, entry]) => {
      if (!entry || !entry.key) return acc;
      acc[path] = { key: entry.key, type: entry.type || 'text' };
      return acc;
    }, {});
  }

  payload.__files = payload.__files && typeof payload.__files === 'object' ? payload.__files : {};
  payload.__files[safeFile] = fileBlock;

  if (safeFile === DEFAULT_FILE) {
    Object.keys(payload)
      .filter((key) => key !== '__files')
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

async function renderFile(fileName = DEFAULT_FILE) {
  const safeFile = sanitizeHtmlFile(fileName);
  const htmlPath = htmlPathFor(safeFile);
  const [html, { values }] = await Promise.all([
    fs.readFile(htmlPath, 'utf8'),
    readContent(safeFile),
  ]);
  return Object.entries(values).reduce((acc, [key, value]) => {
    if (acc.includes(`data-cms-image="${key}"`)) {
      return replaceDataImage(acc, key, value);
    }
    if (acc.includes(`data-cms-bg="${key}"`)) {
      return replaceDataBackground(acc, key, value);
    }
    return replaceDataText(acc, key, value);
  }, html);
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
  try {
    const safePath = path.normalize(filePath).replace(/^\/+/, '');
    const absolute = path.join(ROOT, safePath);
    const data = await fs.readFile(absolute);
    res.writeHead(200, { 'Content-Type': contentTypeFor(absolute) });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

async function handleApiContent(req, res, fileName = DEFAULT_FILE) {
  if (req.method === 'GET') {
    const { values, tags } = await readContent(fileName);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content: values, tags }));
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
        } = payload;
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Key is required' }));
          return;
        }

        const targetFile = sanitizeHtmlFile(file || fileName);
        const htmlPath = htmlPathFor(targetFile);
        const { values, tags } = await readContent(targetFile);
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

        values[key] = storedValue;
        if (elementPath) {
          tags[elementPath] = { key, type: type || 'text' };
        }
        await writeContent({ values, tags, fileName: targetFile });

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

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: values, tags }));
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
