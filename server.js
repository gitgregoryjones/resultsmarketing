const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const url = require('node:url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, 'index.html');
const CONTENT_FILE = path.join(ROOT, 'content.json');

async function readContent() {
  try {
    const raw = await fs.readFile(CONTENT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (err) {
    console.warn('Unable to read content.json, falling back to empty object', err);
    return {};
  }
}

async function writeContent(content) {
  await fs.writeFile(CONTENT_FILE, JSON.stringify(content, null, 2));
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

async function renderIndex() {
  const [html, content] = await Promise.all([
    fs.readFile(INDEX_FILE, 'utf8'),
    readContent(),
  ]);
  return Object.entries(content).reduce((acc, [key, value]) => replaceDataText(acc, key, value), html);
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

async function handleApiContent(req, res) {
  if (req.method === 'GET') {
    const content = await readContent();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content }));
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
        const { key, value, originalOuterHTML, updatedOuterHTML } = payload;
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Key is required' }));
          return;
        }

        const content = await readContent();
        content[key] = value ?? '';
        await writeContent(content);

        if (originalOuterHTML && updatedOuterHTML) {
          try {
            let currentHtml = await fs.readFile(INDEX_FILE, 'utf8');
            if (currentHtml.includes(originalOuterHTML)) {
              currentHtml = currentHtml.replace(originalOuterHTML, updatedOuterHTML);
              await fs.writeFile(INDEX_FILE, currentHtml);
            }
          } catch (err) {
            console.warn('Unable to persist new tag in index.html', err);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content }));
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
    return handleApiContent(req, res);
  }

  if (pathname === '/' && req.method === 'GET') {
    try {
      const html = await renderIndex();
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Failed to render page');
    }
    return;
  }

  return serveStatic(res, pathname === '/' ? 'index.html' : pathname.slice(1));
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
