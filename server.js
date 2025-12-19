const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const url = require('node:url');
const { parse } = require('node-html-parser');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ADMIN_DIR = path.join(ROOT, 'admin');
const DEFAULT_FILE = 'index.html';
const IMAGES_DIR = path.join(ROOT, 'images');
const BRANDS_DIR = path.join(ROOT, 'brands');
const PUBLISH_TARGET = ROOT;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

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
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map((entry) => entry.name);
}

function isRemoteImageUrl(value = '') {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(https?:)?\/\//i.test(trimmed);
}

async function listUploadedImages() {
  try {
    const entries = await fs.readdir(IMAGES_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => `/images/${entry.name}`)
      .sort();
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn('Unable to read images directory', err);
    }
    return [];
  }
}

async function listRemoteImagesFromContent() {
  const files = await listHtmlFiles();
  const remoteUrls = new Set();
  await Promise.all(
    files.map(async (file) => {
      try {
        const html = await fs.readFile(htmlPathFor(file), 'utf8');
        const { values } = extractContentFromHtml(html);
        Object.values(values).forEach((value) => {
          if (isRemoteImageUrl(value)) {
            remoteUrls.add(value.trim());
          }
        });
      } catch (err) {
        console.warn(`Unable to read ${file} for remote images`, err);
      }
    })
  );
  return Array.from(remoteUrls).sort();
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

function extractBackgroundImage(style = '') {
  if (!style) return '';
  const match = style.match(/background-image\s*:\s*url\(["']?(.*?)["']?\)/i);
  return match ? match[1] : '';
}

function updateBackgroundStyle(style = '', value = '') {
  const parts = style
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.toLowerCase().startsWith('background-image'));
  if (value) {
    parts.push(`background-image:url('${escapeHtml(value)}')`);
  }
  return parts.join('; ');
}

function extractContentFromHtml(html) {
  const root = parse(html);
  const values = {};
  root.querySelectorAll('[data-cms-text]').forEach((el) => {
    const key = el.getAttribute('data-cms-text');
    if (key) values[key] = el.text;
  });
  root.querySelectorAll('[data-cms-image]').forEach((el) => {
    const key = el.getAttribute('data-cms-image');
    if (!key) return;
    if ((el.tagName || '').toLowerCase() === 'img') {
      values[key] = el.getAttribute('src') || '';
      return;
    }
    const style = el.getAttribute('style') || '';
    values[key] = extractBackgroundImage(style);
  });
  root.querySelectorAll('[data-cms-bg]').forEach((el) => {
    const key = el.getAttribute('data-cms-bg');
    if (!key) return;
    const style = el.getAttribute('style') || '';
    values[key] = extractBackgroundImage(style);
  });
  const htmlEl = root.querySelector('html');
  const bodyEl = root.querySelector('body');
  const siteName =
    sanitizeSiteName(htmlEl && htmlEl.getAttribute('data-site-name')) ||
    sanitizeSiteName(bodyEl && bodyEl.getAttribute('data-site-name')) ||
    '';
  return { values, siteName };
}

async function readContent(fileName = DEFAULT_FILE) {
  const safeFile = sanitizeHtmlFile(fileName);
  const htmlPath = htmlPathFor(safeFile);
  const html = await fs.readFile(htmlPath, 'utf8');
  const { values, siteName } = extractContentFromHtml(html);
  if (siteName || safeFile === DEFAULT_FILE) {
    return { values, tags: {}, siteName };
  }
  try {
    const fallbackHtml = await fs.readFile(htmlPathFor(DEFAULT_FILE), 'utf8');
    const fallbackSite = extractContentFromHtml(fallbackHtml).siteName;
    return { values, tags: {}, siteName: fallbackSite };
  } catch (err) {
    return { values, tags: {}, siteName: '' };
  }
}

function updateSiteNameInHtml(html, siteName) {
  const root = parse(html);
  const htmlEl = root.querySelector('html');
  if (!htmlEl) return html;
  if (siteName) {
    htmlEl.setAttribute('data-site-name', siteName);
  } else {
    htmlEl.removeAttribute('data-site-name');
  }
  return root.toString();
}

function setCmsAttributes(element, { key, type, link }) {
  element.removeAttribute('data-cms-text');
  element.removeAttribute('data-cms-image');
  element.removeAttribute('data-cms-bg');
  if (type === 'image') {
    element.setAttribute('data-cms-image', key);
  } else if (type === 'background') {
    element.setAttribute('data-cms-bg', key);
  } else {
    element.setAttribute('data-cms-text', key);
  }
  if (link) {
    element.setAttribute('data-link', link);
  } else {
    element.removeAttribute('data-link');
  }
}

function mergeContentIntoHtml(html, { key, type, value, elementPath, link, originalOuterHTML, updatedOuterHTML }) {
  const resolvedValue = value ?? '';
  let nextHtml = html;
  let didReplaceOuter = false;
  if (originalOuterHTML && updatedOuterHTML && nextHtml.includes(originalOuterHTML)) {
    nextHtml = nextHtml.replace(originalOuterHTML, updatedOuterHTML);
    didReplaceOuter = true;
  }

  if (!didReplaceOuter && (elementPath || key)) {
    try {
      const root = parse(nextHtml);
      let target = null;
      if (elementPath) {
        target = root.querySelector(elementPath);
      }
      if (!target && key) {
        target = root.querySelector(
          `[data-cms-text="${key}"], [data-cms-image="${key}"], [data-cms-bg="${key}"]`
        );
      }
      if (target && key) {
        setCmsAttributes(target, { key, type: type || 'text', link });
        nextHtml = root.toString();
      }
    } catch (err) {
      console.warn('Unable to update CMS tag in HTML', err);
    }
  }

  if (key) {
    if (type === 'image') {
      nextHtml = replaceDataImage(nextHtml, key, resolvedValue);
    } else if (type === 'background') {
      nextHtml = replaceDataBackground(nextHtml, key, resolvedValue);
    } else {
      nextHtml = replaceDataText(nextHtml, key, resolvedValue);
    }
  }

  return nextHtml;
}

function stripCmsAssets(html) {
  const withoutCss = html.replace(/<link[^>]+href=["']cms\.css["'][^>]*>\s*/gi, '');
  return withoutCss.replace(/<script[^>]+src=["']cms\.js["'][^>]*>\s*<\/script>\s*/gi, '');
}

function ensureAnchorStyles(element) {
  const styleAttr = element.getAttribute('style') || '';
  const declarations = styleAttr
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, declaration) => {
      const [prop, ...rest] = declaration.split(':');
      if (prop && rest.length) {
        acc[prop.trim().toLowerCase()] = rest.join(':').trim();
      }
      return acc;
    }, {});

  if (!declarations.color) declarations.color = 'inherit';
  if (!declarations['text-decoration']) declarations['text-decoration'] = 'none';

  const merged = Object.entries(declarations)
    .map(([prop, value]) => `${prop}: ${value}`)
    .join('; ');

  element.setAttribute('style', merged);
}

function wrapDataLinks(html) {
  try {
    const root = parse(html);
    root.querySelectorAll('[data-link]').forEach((el) => {
      const href = (el.getAttribute('data-link') || '').trim();
      if (!href) return;

      const parent = el.parentNode;
      const tagName = (el.tagName || '').toLowerCase();

      if (tagName === 'a') {
        el.setAttribute('href', escapeHtml(href));
        ensureAnchorStyles(el);
        return;
      }

      if (parent && parent.tagName && parent.tagName.toLowerCase() === 'a') {
        parent.setAttribute('href', escapeHtml(href));
        ensureAnchorStyles(parent);
        return;
      }

      const anchor = parse(`<a href="${escapeHtml(href)}"></a>`).firstChild;
      ensureAnchorStyles(anchor);
      if (typeof el.replaceWith === 'function') {
        el.replaceWith(anchor);
      } else if (parent && typeof parent.insertBefore === 'function' && typeof parent.removeChild === 'function') {
        parent.insertBefore(anchor, el);
        parent.removeChild(el);
      }
      anchor.appendChild(el);
    });

    return root.toString();
  } catch (err) {
    console.warn('Unable to wrap data-link elements', err);
    return html;
  }
}

async function copyDirIfExists(sourceDir, targetDir) {
  try {
    await fs.access(sourceDir);
    await ensureDir(path.dirname(targetDir));
    await fs.cp(sourceDir, targetDir, { recursive: true });
    console.log(`Copied Dir worked ${sourceDir} to ${targetDir}`);
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
        if (base === 'cms.js' || base === 'cms.css') return false;
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
  let siteName = '';
  for (const file of [DEFAULT_FILE, ...files]) {
    try {
      const html = await fs.readFile(htmlPathFor(file), 'utf8');
      siteName = extractContentFromHtml(html).siteName;
      if (siteName) break;
    } catch (err) {
      // continue to next file
    }
  }

  // Do not remove any existing published output; simply overwrite the files we
  // render so older exports remain available if needed.
  await ensureDir(PUBLISH_TARGET);

  const publishedFiles = [];

  for (const file of files) {
    try {
      let html = await fs.readFile(htmlPathFor(file), 'utf8');
      if (siteName) {
        const root = parse(html);
        root.querySelectorAll('[data-cms-image]').forEach((el) => {
          const src = el.getAttribute('src') || '';
          if (!src) return;
          el.setAttribute('src', prefixAssetPath(src, siteName));
        });
        root.querySelectorAll('[data-cms-bg]').forEach((el) => {
          const style = el.getAttribute('style') || '';
          const current = extractBackgroundImage(style);
          if (!current) return;
          const updatedStyle = updateBackgroundStyle(style, prefixAssetPath(current, siteName));
          if (updatedStyle) {
            el.setAttribute('style', updatedStyle);
          } else {
            el.removeAttribute('style');
          }
        });
        html = root.toString();
      }
      html = wrapDataLinks(html);
      html = stripCmsAssets(html);
      console.log(`Publishing ${file}... to ${PUBLISH_TARGET}`);
      await fs.writeFile(path.join(PUBLISH_TARGET, file), html);
      publishedFiles.push(file);
    } catch (err) {
      console.warn(`Unable to publish ${file}`, err);
    }
  }

  await copyAdminAssets();
  //await copyDirIfExists(IMAGES_DIR, path.join(PUBLISH_TARGET, 'images'));
  //await copyDirIfExists(BRANDS_DIR, path.join(PUBLISH_TARGET, 'brands'));
 console.log(`Loo at Without ADMIN name root Publishing site assets to site name folder... ${siteName}`);
  if (siteName) {
    const siteRoot = path.join(PUBLISH_TARGET, siteName);
    console.log(`Publishing site assets to site name folder... ${siteRoot}`);
    await ensureDir(siteRoot);
    console.log(`siteRoot ensured: ${siteRoot}`);
    console.log(`Copying image to: ${path.join(siteRoot, 'images')}`);
    await copyDirIfExists(IMAGES_DIR, path.join(siteRoot, 'images'));
    console.log(`Images copied to: ${path.join(siteRoot, 'images')}`);
    await copyDirIfExists(BRANDS_DIR, path.join(siteRoot, 'brands'));
    console.log(`Brands copied to: ${path.join(siteRoot, 'brands')}`);
    
  } 


  return publishedFiles;
}

async function renderFile(fileName = DEFAULT_FILE) {
  const safeFile = sanitizeHtmlFile(fileName);
  const htmlPath = htmlPathFor(safeFile);
  return fs.readFile(htmlPath, 'utf8');
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
          link,
          file,
          siteName,
        } = payload;
        const sanitizedSiteName = siteName !== undefined ? sanitizeSiteName(siteName) : undefined;
        const linkValue = typeof link === 'string' ? link.trim() : '';
        if (!key && sanitizedSiteName === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Key is required' }));
          return;
        }

        const targetFile = sanitizeHtmlFile(file || fileName);
        const htmlPath = htmlPathFor(targetFile);
        let currentHtml = await fs.readFile(htmlPath, 'utf8');
        const { siteName: existingSiteName } = extractContentFromHtml(currentHtml);
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

        const finalSiteName =
          sanitizedSiteName !== undefined ? sanitizedSiteName : existingSiteName || sanitizeSiteName(siteName);

        if (siteName !== undefined && !finalSiteName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Site name cannot be empty' }));
          return;
        }

        if (siteName !== undefined) {
          const files = await listHtmlFiles();
          await Promise.all(
            files.map(async (file) => {
              try {
                const filePath = htmlPathFor(file);
                const html = file === targetFile ? currentHtml : await fs.readFile(filePath, 'utf8');
                const updated = updateSiteNameInHtml(html, finalSiteName);
                await fs.writeFile(filePath, updated);
                if (file === targetFile) {
                  currentHtml = updated;
                }
              } catch (err) {
                console.warn(`Unable to update site name in ${file}`, err);
              }
            })
          );
        }

        if (key) {
          currentHtml = mergeContentIntoHtml(currentHtml, {
            key,
            type: type || 'text',
            value: storedValue,
            elementPath,
            link: linkValue,
            originalOuterHTML,
            updatedOuterHTML,
          });
        }

        await fs.writeFile(htmlPath, currentHtml);

        const { values, siteName: persistedSiteName } = extractContentFromHtml(currentHtml);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: values, tags: {}, siteName: persistedSiteName || finalSiteName }));
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
      console.log(`Triggering site publish...`);
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

  if (pathname === '/api/images' && req.method === 'GET') {
    try {
      const [uploads, remote] = await Promise.all([listUploadedImages(), listRemoteImagesFromContent()]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ uploads, remote }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unable to list images' }));
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
