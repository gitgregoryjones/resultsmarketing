const http = require('node:http');
const crypto = require('node:crypto');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const url = require('node:url');
const { parse } = require('node-html-parser');
const { fetchServiceJson } = require('./services');

const DEFAULT_FILE = 'index.html';
const IS_NETLIFY_FUNCTION = process.env.NETLIFY === 'true' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

function findExistingProjectRoot(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (fsSync.existsSync(path.join(resolved, 'admin', DEFAULT_FILE))) {
      return resolved;
    }
  }
  return path.resolve(candidates.find(Boolean) || __dirname);
}

function defaultRuntimeRoot() {
  const configuredRoot = process.env.RUNTIME_DATA_DIR;
  if (configuredRoot) return path.resolve(configuredRoot);
  if (IS_NETLIFY_FUNCTION) {
    return path.join(process.env.TMPDIR || '/tmp', 'resultsmarketing-cms-runtime');
  }
  return SOURCE_ROOT;
}

const SOURCE_ROOT = findExistingProjectRoot([
  process.env.SOURCE_ROOT,
  __dirname,
  process.cwd(),
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '..', '..'),
  path.resolve(process.cwd(), '..'),
  path.resolve(process.cwd(), '..', '..'),
]);

function stripInlineEnvComment(value = '') {
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];
    if ((char === '"' || char === "'") && previous !== '\\') {
      quote = quote === char ? '' : quote || char;
    }
    if (char === '#' && !quote && /\s/.test(previous || '')) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

function parseEnvValue(rawValue = '') {
  const trimmed = stripInlineEnvComment(String(rawValue).trim());
  if (!trimmed) return '';
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    const unquoted = trimmed.slice(1, -1);
    if (quote === '"') {
      return unquoted
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return unquoted.replace(/\\'/g, "'");
  }
  return trimmed;
}

function loadDotEnvFile(envPath = path.join(SOURCE_ROOT, '.env')) {
  if (!fsSync.existsSync(envPath)) return;
  const contents = fsSync.readFileSync(envPath, 'utf8');
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const declaration = trimmed.startsWith('export ') ? trimmed.slice(7).trimStart() : trimmed;
    const equalsIndex = declaration.indexOf('=');
    if (equalsIndex <= 0) return;
    const key = declaration.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) return;
    process.env[key] = parseEnvValue(declaration.slice(equalsIndex + 1));
  });
}

loadDotEnvFile(process.env.DOTENV_CONFIG_PATH ? path.resolve(process.env.DOTENV_CONFIG_PATH) : undefined);

const PORT = process.env.PORT || 3000;
const ROOT = defaultRuntimeRoot();
const ADMIN_DIR = path.join(ROOT, 'admin');
const IMAGES_DIR = path.join(ROOT, 'images');
const BRANDS_DIR = path.join(ROOT, 'brands');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const AUTH_REQUIRED = SUPABASE_URL && SUPABASE_ANON_KEY;
const GITHUB_PAGES_REPO = process.env.GITHUB_PAGES_REPO || '';
const GITHUB_PAGES_BRANCH = process.env.GITHUB_PAGES_BRANCH || 'gh-pages';
const GITHUB_PAGES_PATH = (process.env.GITHUB_PAGES_PATH || '').replace(/^\/+|\/+$/g, '');
const GITHUB_PAGES_TOKEN = process.env.GITHUB_PAGES_TOKEN || process.env.GITHUB_TOKEN || '';
const GITHUB_COMMITTER_NAME = process.env.GITHUB_COMMITTER_NAME || 'Results Marketing CMS';
const GITHUB_COMMITTER_EMAIL = process.env.GITHUB_COMMITTER_EMAIL || 'cms@example.com';
const PUBLISH_DEBUG = /^(1|true|yes|on)$/i.test(process.env.PUBLISH_DEBUG || '');
const GITHUB_UPLOAD_CONCURRENCY = Math.max(1, Number.parseInt(process.env.GITHUB_UPLOAD_CONCURRENCY || '6', 10) || 6);
const DATA_ROOT = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const COMPONENTS_DIR = path.join(DATA_ROOT, 'components');
const STYLES_DIR = path.join(DATA_ROOT, 'styles');
const PUBLISH_TARGET = process.env.PUBLISH_LOCAL_DIR
  ? path.resolve(process.env.PUBLISH_LOCAL_DIR)
  : path.join(ROOT, 'published');


let runtimeReadyPromise;

async function copyRuntimeDir(name) {
  const source = path.join(SOURCE_ROOT, name);
  const target = path.join(ROOT, name);
  try {
    await fs.cp(source, target, { recursive: true });
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }
}

async function ensureRuntimeFiles() {
  if (ROOT === SOURCE_ROOT) return;
  if (!runtimeReadyPromise) {
    runtimeReadyPromise = (async () => {
      await ensureDir(ROOT);
      await Promise.all(['admin', 'data', 'images', 'brands'].map(copyRuntimeDir));
    })();
  }
  return runtimeReadyPromise;
}

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

function buildBlankAdminPage(title = 'New Page') {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/admin/cms.css" />
  </head>
  <body>
    <main class="page-wrapper">
      <section style="padding: 48px;">
        <h1>New page</h1>
        <p>Start building your layout.</p>
      </section>
    </main>
    <script src="/admin/cms.js"></script>
  </body>
</html>
`;
}

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    const message = err && err.message ? err.message : 'Unable to create directory';
    const error = new Error(`Unable to create directory: ${dirPath}. ${message}`);
    error.code = err && err.code ? err.code : 'DIR_CREATE_FAILED';
    throw error;
  }
}

function stripOutlineClasses(element) {
  if (!element || !element.classList) return;
  element.classList.remove('cms-outlined');
}

function parseJsonBody(body = '') {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (err) {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(body.slice(start, end + 1));
    }
    throw err;
  }
}

function sendJsonError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}


function getBearerToken(req) {
  const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!authHeader || typeof authHeader !== 'string') return '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function isPublicApiRoute(pathname) {
  return pathname === '/api/auth/config';
}

async function validateSupabaseToken(token) {
  if (!AUTH_REQUIRED) return null;
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

function normalizeRoleName(role = '') {
  return String(role || '').trim().toLowerCase();
}

function getSupabaseUserRoles(user = {}) {
  const appMetadata = user.app_metadata || {};
  const userMetadata = user.user_metadata || {};
  const candidates = [
    user.role,
    appMetadata.role,
    userMetadata.role,
    ...(Array.isArray(appMetadata.roles) ? appMetadata.roles : []),
    ...(Array.isArray(userMetadata.roles) ? userMetadata.roles : []),
  ];
  return candidates.map(normalizeRoleName).filter(Boolean);
}

function isAdminSupabaseUser(user = {}) {
  return getSupabaseUserRoles(user).includes('admin');
}

async function requireAuthenticatedRequest(req, res, pathname) {
  if (!AUTH_REQUIRED || isPublicApiRoute(pathname)) return true;
  try {
    const user = await validateSupabaseToken(getBearerToken(req));
    if (user && user.id) {
      req.cmsUser = user;
      req.cmsUserRoles = getSupabaseUserRoles(user);
      req.cmsIsAdmin = isAdminSupabaseUser(user);
      return true;
    }
  } catch (err) {
    console.warn('Unable to validate Supabase token', err);
  }
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Authentication required' }));
  return false;
}


function redactPublishDetails(value) {
  if (Array.isArray(value)) return value.map(redactPublishDetails);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((acc, [key, item]) => {
    if (/token|authorization|apikey|password|secret/i.test(key) && typeof item === 'string') {
      acc[key] = '[redacted]';
    } else {
      acc[key] = redactPublishDetails(item);
    }
    return acc;
  }, {});
}

function createPublishTrace(enabled = PUBLISH_DEBUG) {
  const id = `pub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date();
  const entries = [];
  const record = (step, details = {}, level = 'info') => {
    const safeDetails = redactPublishDetails(details);
    const entry = {
      id,
      step,
      level,
      at: new Date().toISOString(),
      ms: Date.now() - startedAt.getTime(),
      details: safeDetails,
    };
    entries.push(entry);
    const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logger(`[publish:${id}] ${step}`, safeDetails);
    return entry;
  };
  return {
    id,
    enabled,
    entries,
    info: (step, details) => record(step, details, 'info'),
    warn: (step, details) => record(step, details, 'warn'),
    error: (step, details) => record(step, details, 'error'),
    toJSON: () => ({ id, startedAt: startedAt.toISOString(), entries }),
  };
}

function githubApiHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${GITHUB_PAGES_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'resultsmarketing-cms',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function normalizeGitHubRepo(repo = '') {
  const normalized = String(repo || '').trim().replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  return normalized.includes('/') ? normalized : '';
}

function toBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}


function gitBlobSha(buffer) {
  const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]))
    .digest('hex');
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function walkFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, fullPath).replace(/\\/g, '/'));
    }
  }
  return files;
}

async function githubRequest(apiPath, options = {}, trace) {
  const { expectedStatuses = [], ...fetchOptions } = options;
  const method = fetchOptions.method || 'GET';
  const started = Date.now();
  trace?.info('github.request.start', { method, apiPath });
  const response = await fetch(`https://api.github.com${apiPath}`, {
    ...fetchOptions,
    headers: {
      ...githubApiHeaders(),
      ...(fetchOptions.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    trace?.error('github.request.invalid_json', {
      method,
      apiPath,
      status: response.status,
      elapsedMs: Date.now() - started,
      bodyPreview: text.slice(0, 300),
    });
    throw err;
  }
  const details = {
    method,
    apiPath,
    status: response.status,
    elapsedMs: Date.now() - started,
    rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
    requestId: response.headers.get('x-github-request-id'),
  };
  if (!response.ok) {
    const message = data && data.message ? data.message : response.statusText;
    if (expectedStatuses.includes(response.status)) {
      trace?.info('github.request.expected_status', { ...details, message });
      return { ...(data || {}), __status: response.status };
    }
    trace?.error('github.request.failed', { ...details, message });
    throw new Error(`GitHub API ${response.status}: ${message}`);
  }
  trace?.info('github.request.done', details);
  return data;
}

async function publishDirectoryToGitHubPages(sourceDir, publishedFiles = [], trace) {
  const repo = normalizeGitHubRepo(GITHUB_PAGES_REPO);
  if (!repo && !GITHUB_PAGES_TOKEN) {
    trace?.warn('github.publish.skipped', {
      reason: 'GITHUB_PAGES_REPO and GITHUB_PAGES_TOKEN are not configured',
    });
    return { enabled: false, uploaded: [], skipped: [], commits: [] };
  }
  if (!repo) throw new Error('GITHUB_PAGES_REPO must be set to owner/repo');
  if (!GITHUB_PAGES_TOKEN) throw new Error('GITHUB_PAGES_TOKEN or GITHUB_TOKEN must be set');

  trace?.info('github.publish.start', {
    strategy: 'git-tree-diff',
    repo,
    branch: GITHUB_PAGES_BRANCH,
    path: GITHUB_PAGES_PATH || '/',
    sourceDir,
    pages: publishedFiles.length,
    blobConcurrency: GITHUB_UPLOAD_CONCURRENCY,
  });

  const ref = await githubRequest(`/repos/${repo}/git/ref/heads/${encodeURIComponent(GITHUB_PAGES_BRANCH)}`, {
    method: 'GET',
  }, trace);
  const baseCommitSha = ref && ref.object ? ref.object.sha : '';
  if (!baseCommitSha) throw new Error(`Unable to resolve GitHub branch ${GITHUB_PAGES_BRANCH}`);
  trace?.info('github.branch.resolved', { branch: GITHUB_PAGES_BRANCH, commitSha: baseCommitSha });

  const baseCommit = await githubRequest(`/repos/${repo}/git/commits/${baseCommitSha}`, {
    method: 'GET',
  }, trace);
  const baseTreeSha = baseCommit && baseCommit.tree ? baseCommit.tree.sha : '';
  if (!baseTreeSha) throw new Error(`Unable to resolve GitHub tree for ${baseCommitSha}`);
  trace?.info('github.tree.base_resolved', { treeSha: baseTreeSha });

  const existingTree = await githubRequest(`/repos/${repo}/git/trees/${baseTreeSha}?recursive=1`, {
    method: 'GET',
  }, trace);
  const existingShaByPath = new Map(
    (existingTree.tree || [])
      .filter((entry) => entry.type === 'blob' && entry.path)
      .map((entry) => [entry.path, entry.sha])
  );
  trace?.info('github.tree.existing_loaded', {
    entries: existingShaByPath.size,
    truncated: Boolean(existingTree.truncated),
  });

  const sourceFiles = await walkFiles(sourceDir);
  trace?.info('github.publish.files_discovered', {
    count: sourceFiles.length,
    files: sourceFiles,
  });

  const changedFiles = [];
  const skipped = [];
  for (const relativeFile of sourceFiles) {
    const sourcePath = path.join(sourceDir, relativeFile);
    const targetPath = [GITHUB_PAGES_PATH, relativeFile].filter(Boolean).join('/');
    const buffer = await fs.readFile(sourcePath);
    const localSha = gitBlobSha(buffer);
    const existingSha = existingShaByPath.get(targetPath) || '';
    const stat = await fs.stat(sourcePath);
    if (existingSha === localSha) {
      skipped.push({ path: targetPath, bytes: stat.size, sha: localSha });
      continue;
    }
    changedFiles.push({
      relativeFile,
      sourcePath,
      targetPath,
      bytes: stat.size,
      localSha,
      existingSha,
      buffer,
      action: existingSha ? 'update' : 'create',
    });
  }

  trace?.info('github.diff.calculated', {
    total: sourceFiles.length,
    changed: changedFiles.length,
    skipped: skipped.length,
    changedFiles: changedFiles.map((file) => ({ path: file.targetPath, action: file.action, bytes: file.bytes })),
  });

  if (!changedFiles.length) {
    trace?.info('github.publish.no_changes', { repo, branch: GITHUB_PAGES_BRANCH, skipped: skipped.length });
    return {
      enabled: true,
      repo,
      branch: GITHUB_PAGES_BRANCH,
      path: GITHUB_PAGES_PATH,
      uploaded: [],
      skipped,
      commits: [],
      baseCommitSha,
      unchanged: true,
      pages: publishedFiles,
    };
  }

  const uploaded = await mapWithConcurrency(changedFiles, GITHUB_UPLOAD_CONCURRENCY, async (file) => {
    trace?.info('github.blob.create.start', {
      path: file.targetPath,
      action: file.action,
      bytes: file.bytes,
      localSha: file.localSha,
      previousSha: file.existingSha || '',
    });
    const blob = await githubRequest(`/repos/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: toBase64(file.buffer),
        encoding: 'base64',
      }),
    }, trace);
    const upload = {
      path: file.targetPath,
      action: file.action,
      bytes: file.bytes,
      previousSha: file.existingSha || '',
      contentSha: blob.sha || file.localSha,
    };
    trace?.info('github.blob.create.done', upload);
    return upload;
  });

  const newTree = await githubRequest(`/repos/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: uploaded.map((file) => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: file.contentSha,
      })),
    }),
  }, trace);
  trace?.info('github.tree.created', {
    treeSha: newTree.sha,
    entries: uploaded.length,
  });

  const commit = await githubRequest(`/repos/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `Publish CMS site (${uploaded.length} changed file${uploaded.length === 1 ? '' : 's'})`,
      tree: newTree.sha,
      parents: [baseCommitSha],
      committer: {
        name: GITHUB_COMMITTER_NAME,
        email: GITHUB_COMMITTER_EMAIL,
      },
    }),
  }, trace);
  const commitSha = commit.sha || '';
  const commitUrl = commit.html_url || (commitSha ? `https://github.com/${repo}/commit/${commitSha}` : '');
  trace?.info('github.commit.created', {
    commitSha,
    commitUrl,
    changedFiles: uploaded.length,
  });

  await githubRequest(`/repos/${repo}/git/refs/heads/${encodeURIComponent(GITHUB_PAGES_BRANCH)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitSha }),
  }, trace);

  const commits = commitSha ? [{ sha: commitSha, url: commitUrl, paths: uploaded.map((file) => file.path) }] : [];
  const uploadedWithCommit = uploaded.map((file) => ({ ...file, commitSha, commitUrl }));
  trace?.info('github.publish.done', {
    repo,
    branch: GITHUB_PAGES_BRANCH,
    uploaded: uploaded.length,
    skipped: skipped.length,
    commitSha,
    commitUrl,
  });

  return {
    enabled: true,
    repo,
    branch: GITHUB_PAGES_BRANCH,
    path: GITHUB_PAGES_PATH,
    uploaded: uploadedWithCommit,
    skipped,
    commits,
    baseCommitSha,
    commitSha,
    commitUrl,
    unchanged: false,
    pages: publishedFiles,
  };
}

function parseHexColor(value = '') {
  const hex = String(value || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return null;
  const normalized = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  const int = Number.parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function buildThemeVarsFromAccent(accent = '') {
  const rgb = parseHexColor(accent);
  if (!rgb) {
    return {
      accent,
      hover: accent,
      soft: accent,
      borderSoft: accent,
    };
  }
  const hover = `rgb(${clampColor(rgb.r * 0.87)}, ${clampColor(rgb.g * 0.87)}, ${clampColor(rgb.b * 0.87)})`;
  return {
    accent: `#${accent.trim().replace(/^#/, '')}`,
    hover,
    soft: `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`,
    borderSoft: `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`,
  };
}


function buildThemeCss(accent = '') {
  const theme = buildThemeVarsFromAccent(accent || '#ef4444');
  return `:root {
  --theme-accent: ${theme.accent};
  --theme-accent-hover: ${theme.hover};
  --theme-accent-soft: ${theme.soft};
  --theme-accent-border-soft: ${theme.borderSoft};
}
.text-red-500, .hover\\:text-red-500:hover { color: var(--theme-accent) !important; }
.hover\\:text-red-600:hover { color: var(--theme-accent-hover) !important; }
.bg-red-500, .bg-red-600, .bg-red-700, .sm\\:bg-red-500, .md\\:bg-red-500, .lg\\:bg-red-500, .sm\\:bg-red-600, .md\\:bg-red-600, .lg\\:bg-red-600, .sm\\:bg-red-700, .md\\:bg-red-700, .lg\\:bg-red-700 { background-color: var(--theme-accent) !important; }
.hover\\:bg-red-600:hover { background-color: var(--theme-accent-hover) !important; }
.bg-red-500\\/10 { background-color: var(--theme-accent-soft) !important; }
.border-red-500, .border-red-700, .focus\\:border-red-500:focus { border-color: var(--theme-accent) !important; }
.border-red-500\\/30 { border-color: var(--theme-accent-border-soft) !important; }
`;
}

function ensureThemeCssLink(html = '') {
  if (!html) return html;
  let updated = html.replace(/<style\b[^>]*\bid\s*=\s*(["'])dynamic-theme-colors\1[^>]*>[\s\S]*?<\/style>/gi, '');
  if (/id\s*=\s*(["'])dynamic-theme-colors\1/.test(updated) && /<link\b[^>]*href\s*=\s*(["'])theme\.css\1/i.test(updated)) {
    return updated;
  }
  if (/<head[^>]*>/i.test(updated)) {
    updated = updated.replace(/<\/head>/i, '  <link rel="stylesheet" href="theme.css" id="dynamic-theme-colors">\n</head>');
  }
  return updated;
}
function stripThemePickerArtifacts(html = '') {
  if (!html) return html;
  const withoutThemeScript = html.replace(/<script\b[^>]*\bid\s*=\s*(["'])dynamic-theme-picker-script\1[^>]*>[\s\S]*?<\/script>/gi, '');
  const root = parse(withoutThemeScript);
  root.querySelectorAll('#dynamic-theme-picker-script, #themeColorPickerPanel').forEach((el) => el.remove());
  return root.toString();
}

function componentFileName(componentId = '') {
  const safeId = String(componentId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safeId ? `${safeId}.html` : '';
}

function styleFileName(styleId = '') {
  const safeId = String(styleId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safeId ? `${safeId}.css` : '';
}

async function persistComponentSources(html = '') {
  const root = parse(html);
  const sources = root.querySelectorAll('[data-component-id]');
  if (!sources.length) return;
  await ensureDir(COMPONENTS_DIR);
  await Promise.all(
    sources.map(async (el) => {
      const componentId = el.getAttribute('data-component-id');
      const fileName = componentFileName(componentId);
      if (!fileName) return;
      stripOutlineClasses(el);
      await fs.writeFile(path.join(COMPONENTS_DIR, fileName), el.toString());
    })
  );
}

async function persistStyleSources(html = '') {
  const root = parse(html);
  const sources = root.querySelectorAll('style[data-style-id][data-style-source="true"]');
  if (!sources.length) return;
  await ensureDir(STYLES_DIR);
  await Promise.all(
    sources.map(async (el) => {
      const styleId = el.getAttribute('data-style-id');
      const fileName = styleFileName(styleId);
      if (!fileName) return;
      await fs.writeFile(path.join(STYLES_DIR, fileName), el.innerHTML || '');
    })
  );
}

async function loadComponentHtml(componentId) {
  const fileName = componentFileName(componentId);
  if (!fileName) return null;
  try {
    return await fs.readFile(path.join(COMPONENTS_DIR, fileName), 'utf8');
  } catch (err) {
    return null;
  }
}

async function loadStyleCss(styleId) {
  const fileName = styleFileName(styleId);
  if (!fileName) return null;
  try {
    return await fs.readFile(path.join(STYLES_DIR, fileName), 'utf8');
  } catch (err) {
    return null;
  }
}

async function applyComponentsToHtml(html = '') {
  const root = parse(html);
  const nodes = root.querySelectorAll('[data-component-id]');
  if (!nodes.length) return html;
  await ensureDir(COMPONENTS_DIR);
  for (const node of nodes) {
    const componentId = node.getAttribute('data-component-id');
    const componentHtml = await loadComponentHtml(componentId);
    if (!componentHtml) continue;
    const componentRoot = parse(componentHtml);
    const componentNode = componentRoot.firstChild;
    if (!componentNode) continue;
    componentNode.removeAttribute('data-component-source');
    componentNode.setAttribute('data-component-id', componentId);
    node.replaceWith(componentNode);
  }
  return root.toString();
}

async function applyStylesToHtml(html = '') {
  const root = parse(html);
  const nodes = root.querySelectorAll('style[data-style-id]');
  if (!nodes.length) return html;
  await ensureDir(STYLES_DIR);
  for (const node of nodes) {
    const styleId = node.getAttribute('data-style-id');
    const styleCss = await loadStyleCss(styleId);
    if (!styleCss) continue;
    node.set_content(styleCss);
    node.removeAttribute('data-style-source');
  }
  return root.toString();
}

async function listComponents() {
  try {
    const entries = await fs.readdir(COMPONENTS_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
      .map((entry) => path.basename(entry.name, '.html'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

async function listHtmlFiles() {
  const entries = await fs.readdir(ADMIN_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map((entry) => entry.name);
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

function replaceDataVideo(html, key, value) {
  try {
    const root = parse(html);
    const targets = root
      .querySelectorAll('[data-cms-video]')
      .filter((node) => node.getAttribute('data-cms-video') === key);
    if (!targets.length) return html;
    targets.forEach((target) => {
      const tagName = (target.tagName || '').toLowerCase();
      if (tagName === 'video') {
        target.setAttribute('src', value);
        return;
      }
      if (tagName === 'iframe') {
        target.setAttribute('src', value);
        return;
      }
      const nestedFrame = target.querySelector('iframe');
      if (nestedFrame) {
        nestedFrame.setAttribute('src', value);
        return;
      }
      const nestedVideo = target.querySelector('video');
      if (nestedVideo) {
        nestedVideo.setAttribute('src', value);
      }
    });
    return root.toString();
  } catch (err) {
    return html;
  }
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

function extensionForImageMime(mimeSubtype = '') {
  const normalized = String(mimeSubtype || '').toLowerCase();
  if (normalized === 'jpeg' || normalized === 'jpg') return '.jpg';
  if (normalized === 'svg+xml') return '.svg';
  if (normalized === 'x-icon' || normalized === 'vnd.microsoft.icon') return '.ico';
  if (normalized === 'webp') return '.webp';
  if (normalized === 'gif') return '.gif';
  return '.png';
}

function extensionForVideoMime(mimeSubtype = '') {
  const normalized = String(mimeSubtype || '').toLowerCase();
  if (normalized === 'mp4') return '.mp4';
  if (normalized === 'webm') return '.webm';
  if (normalized === 'ogg' || normalized === 'ogv') return '.ogv';
  if (normalized === 'quicktime') return '.mov';
  if (normalized === 'x-matroska') return '.mkv';
  return '.mp4';
}

async function writeBase64MediaToDisk(dataUrl, baseName = 'embedded') {
  if (typeof dataUrl !== 'string') return dataUrl;
  const trimmed = dataUrl.trim();
  const match = trimmed.match(
    /^data:(image|video)\/([a-zA-Z0-9.+-]+)(?:;[^;,=]+(?:=[^;,]+)?)*;base64,([\s\S]+)$/i
  );
  if (!match) return dataUrl;

  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const mediaType = String(match[1] || '').toLowerCase();
  const extension = mediaType === 'video'
    ? extensionForVideoMime(match[2])
    : extensionForImageMime(match[2]);
  const safeBase = String(baseName || 'embedded').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const filename = `${safeBase || 'embedded'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  const targetPath = path.join(IMAGES_DIR, filename);
  const base64Payload = match[3].replace(/\s+/g, '');
  await fs.writeFile(targetPath, Buffer.from(base64Payload, 'base64'));
  return `/images/${filename}`;
}

async function writeBase64ImageToDisk(dataUrl, baseName = 'embedded') {
  if (typeof dataUrl !== 'string') return dataUrl;
  if (!dataUrl.trim().toLowerCase().startsWith('data:image/')) return dataUrl;
  return writeBase64MediaToDisk(dataUrl, baseName);
}

async function localizeEmbeddedImagesInHtml(html, fileName = 'page') {
  if (!html || (!html.includes('data:image/') && !html.includes('data:video/'))) return html;
  const root = parse(html);
  const fileBase = path.basename(fileName, path.extname(fileName)) || 'page';
  let changed = false;

  const allElements = root.querySelectorAll('*');
  for (const element of allElements) {
    const src = element.getAttribute('src');
    if (typeof src === 'string' && /^data:(image|video)\//i.test(src.trim())) {
      const persistedSrc = await writeBase64MediaToDisk(src, fileBase);
      if (persistedSrc !== src) {
        element.setAttribute('src', persistedSrc);
        changed = true;
      }
    }

    const style = element.getAttribute('style');
    if (typeof style === 'string' && /data:(image|video)\//i.test(style)) {
      const matches = [...style.matchAll(/url\((['"]?)(data:(?:image|video)\/[a-zA-Z0-9.+-]+(?:;[^;,=]+(?:=[^;,]+)?)*;base64,[\s\S]+?)\1\)/gi)];
      let nextStyle = style;
      for (const [, quote, dataUrl] of matches) {
        const persistedSrc = await writeBase64MediaToDisk(dataUrl, fileBase);
        if (persistedSrc !== dataUrl) {
          const wrapped = `url(${quote || ''}${persistedSrc}${quote || ''})`;
          nextStyle = nextStyle.replace(`url(${quote || ''}${dataUrl}${quote || ''})`, wrapped);
          changed = true;
        }
      }
      if (nextStyle !== style) {
        element.setAttribute('style', nextStyle);
      }
    }
  }

  return changed ? root.toString() : html;
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
  root.querySelectorAll('[data-cms-video]').forEach((el) => {
    const key = el.getAttribute('data-cms-video');
    if (!key) return;
    if ((el.tagName || '').toLowerCase() === 'video') {
      values[key] = el.getAttribute('src') || '';
      return;
    }
    if ((el.tagName || '').toLowerCase() === 'iframe') {
      values[key] = el.getAttribute('src') || '';
      return;
    }
    const nestedFrame = el.querySelector('iframe');
    if (nestedFrame) {
      values[key] = nestedFrame.getAttribute('src') || '';
      return;
    }
    const nestedVideo = el.querySelector('video');
    values[key] = nestedVideo ? nestedVideo.getAttribute('src') || '' : '';
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
  element.removeAttribute('data-cms-video');
  if (type === 'image') {
    element.setAttribute('data-cms-image', key);
  } else if (type === 'background') {
    element.setAttribute('data-cms-bg', key);
  } else if (type === 'video') {
    element.setAttribute('data-cms-video', key);
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
  
  const hasValue = value !== undefined && value !== null;
  const resolvedValue = hasValue ? value : '';
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
          `[data-cms-text="${key}"], [data-cms-image="${key}"], [data-cms-bg="${key}"], [data-cms-video="${key}"]`
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

  if (key && hasValue) {
    if (type === 'image') {
      nextHtml = replaceDataImage(nextHtml, key, resolvedValue);
    } else if (type === 'background') {
      nextHtml = replaceDataBackground(nextHtml, key, resolvedValue);
    } else if (type === 'video') {
      nextHtml = replaceDataVideo(nextHtml, key, resolvedValue);
    } else {
      nextHtml = replaceDataText(nextHtml, key, resolvedValue);
    }
  }

  return nextHtml;
}

function removeElementFromHtml(html, { key, elementPath }) {
  try {
    const root = parse(html);
    let target = null;
    if (elementPath) {
      target = root.querySelector(elementPath);
    }
    if (!target && key) {
      target = root.querySelector(
        `[data-cms-text="${key}"], [data-cms-image="${key}"], [data-cms-bg="${key}"], [data-cms-video="${key}"]`
      );
    }
    if (target) {
      target.remove();
      return root.toString();
    }
  } catch (err) {
    console.warn('Unable to remove CMS element', err);
  }
  return html;
}

function stripCmsAssets(html) {
  const withoutCss = html.replace(/<link[^>]+href=["']cms\.css["'][^>]*>\s*/gi, '');
  return withoutCss.replace(/<script[^>]+src=["']cms\.js["'][^>]*>\s*<\/script>\s*/gi, '');
}

function stripCmsUi(html) {
  try {
    const root = parse(html);
    root.querySelectorAll('.cms-ui, .cms-outline').forEach((el) => el.remove());
    root.querySelectorAll('input.cms-quick-style-picker').forEach((el) => el.remove());
    const body = root.querySelector('body');
    if (body) {
      body.classList.remove('cms-wireframe');
      body.classList.remove('cms-drag-active');
    }
    return root.toString();
  } catch (err) {
    console.warn('Unable to strip CMS UI from HTML', err);
  }
  return html;
}

function stripContentEditable(html) {
  try {
    const root = parse(html);
    root.querySelectorAll('[contenteditable]').forEach((el) => {
      el.removeAttribute('contenteditable');
    });
    return root.toString();
  } catch (err) {
    console.warn('Unable to strip contenteditable attributes from HTML', err);
  }
  return html;
}

function stripDraggableAttributes(html) {
  try {
    const root = parse(html);
    root.querySelectorAll('[draggable]').forEach((el) => {
      el.removeAttribute('draggable');
    });
    return root.toString();
  } catch (err) {
    console.warn('Unable to strip draggable attributes from HTML', err);
  }
  return html;
}

function stripHiddenCmsElements(html) {
  try {
    const root = parse(html);
    root.querySelectorAll('[data-cms-hidden="true"]').forEach((el) => {
      el.remove();
    });
    return root.toString();
  } catch (err) {
    console.warn('Unable to strip hidden CMS elements from HTML', err);
  }
  return html;
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

async function copyDirIfExists(sourceDir, targetDir, trace) {
  try {
    await fs.access(sourceDir);
    await ensureDir(path.dirname(targetDir));
    await fs.cp(sourceDir, targetDir, { recursive: true });
    trace?.info('local.assets.copy_dir.done', { sourceDir, targetDir });
    console.log(`Copied Dir worked ${sourceDir} to ${targetDir}`);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      trace?.warn('local.assets.copy_dir.failed', { sourceDir, targetDir, message: err.message });
      console.warn(`Unable to copy ${sourceDir} to ${targetDir}`, err);
    }
  }
}

async function copyAdminAssets(trace) {
  try {
    trace?.info('local.assets.copy_admin.start', { sourceDir: ADMIN_DIR, targetDir: PUBLISH_TARGET });
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
    trace?.info('local.assets.copy_admin.done', { sourceDir: ADMIN_DIR, targetDir: PUBLISH_TARGET });
  } catch (err) {
    trace?.warn('local.assets.copy_admin.failed', { sourceDir: ADMIN_DIR, targetDir: PUBLISH_TARGET, message: err.message });
    console.warn('Unable to copy admin assets to root', err);
  }
}

async function publishSite(options = {}) {
  const trace = options.trace;
  trace?.info('local.publish.start', { targetDir: PUBLISH_TARGET, adminDir: ADMIN_DIR, themeAccent: options.themeAccent || '' });
  const publishThemeAccent = typeof options.themeAccent === 'string' ? options.themeAccent.trim() : '';
  const files = await listHtmlFiles();
  trace?.info('local.publish.files_listed', { count: files.length, files });
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

  trace?.info('local.publish.clean_target.start', { targetDir: PUBLISH_TARGET });
  await fs.rm(PUBLISH_TARGET, { recursive: true, force: true });
  await ensureDir(PUBLISH_TARGET);
  trace?.info('local.publish.clean_target.done', { targetDir: PUBLISH_TARGET });
  const themeCss = buildThemeCss(publishThemeAccent || '#ef4444');

  const publishedFiles = [];

  for (const file of files) {
    try {
      let html = await fs.readFile(htmlPathFor(file), 'utf8');
      const localizedHtml = await localizeEmbeddedImagesInHtml(html, file);
      if (localizedHtml !== html) {
        await fs.writeFile(htmlPathFor(file), localizedHtml);
      }
      html = localizedHtml;
      html = await applyComponentsToHtml(html);
      html = await applyStylesToHtml(html);
      if (siteName) {
        const root = parse(html);
        root.querySelectorAll('[data-cms-image], [data-cms-bg], [data-cms-video]').forEach((el) => {
          const src = el.getAttribute('src') || '';
          if (src) {
            el.setAttribute('src', prefixAssetPath(src, siteName));
          }
          if (el.hasAttribute('data-cms-video')) {
            const nestedVideo = el.querySelector('video');
            if (nestedVideo) {
              const nestedSrc = nestedVideo.getAttribute('src') || '';
              if (nestedSrc) nestedVideo.setAttribute('src', prefixAssetPath(nestedSrc, siteName));
            }
            const nestedFrame = el.querySelector('iframe');
            if (nestedFrame) {
              const nestedSrc = nestedFrame.getAttribute('src') || '';
              if (nestedSrc) nestedFrame.setAttribute('src', prefixAssetPath(nestedSrc, siteName));
            }
          }
        });
        root.querySelectorAll('[data-cms-image], [data-cms-bg]').forEach((el) => {
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
      html = stripThemePickerArtifacts(html);
      html = ensureThemeCssLink(html);
      html = wrapDataLinks(html);
      html = stripHiddenCmsElements(html);
      html = stripCmsUi(html);
      html = stripCmsAssets(html);
      html = stripContentEditable(html);
      html = stripDraggableAttributes(html);
      const outputPath = path.join(PUBLISH_TARGET, file);
      console.log(`Publishing ${file}... to ${PUBLISH_TARGET}`);
      await fs.writeFile(outputPath, html);
      const stat = await fs.stat(outputPath);
      trace?.info('local.publish.page_written', { file, outputPath, bytes: stat.size });
      publishedFiles.push(file);
    } catch (err) {
      trace?.warn('local.publish.page_failed', { file, message: err.message });
      console.warn(`Unable to publish ${file}`, err);
    }
  }

  await copyAdminAssets(trace);
  const themePath = path.join(PUBLISH_TARGET, 'theme.css');
  await fs.writeFile(themePath, themeCss);
  trace?.info('local.publish.theme_written', { outputPath: themePath, bytes: Buffer.byteLength(themeCss) });
  //await copyDirIfExists(IMAGES_DIR, path.join(PUBLISH_TARGET, 'images'));
  //await copyDirIfExists(BRANDS_DIR, path.join(PUBLISH_TARGET, 'brands'));
  trace?.info('local.publish.assets_start', { siteName: siteName || '' });
  console.log(`Publishing site assets for site name: ${siteName || '(none)'}`);
  if (siteName) {
    const siteRoot = path.join(PUBLISH_TARGET, siteName);
    console.log(`Publishing site assets to site name folder... ${siteRoot}`);
    await ensureDir(siteRoot);
    console.log(`siteRoot ensured: ${siteRoot}`);
    console.log(`Copying image to: ${path.join(siteRoot, 'images')}`);
    await copyDirIfExists(IMAGES_DIR, path.join(siteRoot, 'images'), trace);
    console.log(`Images copied to: ${path.join(siteRoot, 'images')}`);
    await copyDirIfExists(BRANDS_DIR, path.join(siteRoot, 'brands'), trace);
    console.log(`Brands copied to: ${path.join(siteRoot, 'brands')}`);
    
  } 


  trace?.info('local.publish.done', { targetDir: PUBLISH_TARGET, pages: publishedFiles.length, files: publishedFiles });
  return publishedFiles;
}





async function renderFile(fileName = DEFAULT_FILE) {
  const safeFile = sanitizeHtmlFile(fileName);
  const htmlPath = htmlPathFor(safeFile);
  let html = await fs.readFile(htmlPath, 'utf8');
  
  // Fetch and populate HTML with remote JSON data from meta tags
  html = await populateHtmlFromMetaTags(html);
  html = await applyComponentsToHtml(html);

  //write File back to disk for caching if needed   
  fs.writeFile(htmlPath, html);
  
  return html;
}

// Parse meta tags to extract JSON data source configurations
function parseJsonMetaTags(html) {
  const root = parse(html);
  const metaTags = root.querySelectorAll('meta[name][itemprop]');
  const dataSources = [];
  
  metaTags.forEach(meta => {
    const name = meta.getAttribute('name');
    const contentType = meta.getAttribute('itemtype') || 'GET';
    const content = meta.getAttribute('content');
    const itemprop = meta.getAttribute('itemprop');
    
    if (!name || !itemprop) return;
    
    try {
      // Check if content contains inline JSON
      let inlineData = null;
      if (content && content.trim().startsWith('{')) {
        try {
          inlineData = JSON.parse(content);
        } catch (e) {
          console.warn(`Failed to parse inline JSON in meta tag ${name}:`, e.message);
        }
      }
      
      dataSources.push({
        name,
        method: contentType,
        url: itemprop, // URL from itemprop attribute
        inlineData,
        selector: `[data-json-source="${name}"]`
      });
    } catch (err) {
      console.warn(`Error parsing meta tag ${name}:`, err.message);
    }
  });
  
  return dataSources;
}

// Main function to populate HTML from meta tag configurations
async function populateHtmlFromMetaTags(html) {
  try {
    const dataSources = parseJsonMetaTags(html);
    if (dataSources.length === 0) {
      return html;
    }
    
    const root = parse(html);
    
    // Process each data source
    for (const source of dataSources) {
      try {
        let jsonData;
        
        // Use inline data if available
        if (source.inlineData) {
          jsonData = source.inlineData;
        } else {
          // Fetch from remote URL
          jsonData = await fetchRemoteJsonDataWithCache(source.url);
        }
        console.log(`Processing data source: ${source.name} and data: ${JSON.stringify(jsonData)}`);  
        
        if (jsonData) {
          await processDataSource(root, jsonData, source);
          //write modified file back to disk for caching
          
        }
      } catch (err) {
        console.warn(`Failed to process data source ${source.name}:`, err.message);
      }
    }
    
    // Remove the meta tags after processing (optional)
    // root.querySelectorAll('meta[name][itemprop]').forEach(meta => meta.remove());
    
    return root.toString();
  } catch (err) {
    console.warn(`Error populating HTML from meta tags:`, err.message);
    return html;
  }
}

// Process a single data source
async function processDataSource(root, jsonData, source) {
  if (!jsonData || !root || !source) return;
  
  // Find all elements that reference this data source
  const targetElements = root.querySelectorAll(source.selector);
  
  if (targetElements.length === 0) {
    // If no specific targets, apply to whole document
    applyJsonDataToElement(root, jsonData, source.name);
    return;
  }
  
  // Process each target element
  targetElements.forEach(targetElement => {
    applyJsonDataToElement(targetElement, jsonData, source.name);
  });
}

// Apply JSON data to a specific element
function applyJsonDataToElement(element, jsonData, sourceName) {
  if (!element || !jsonData) return;
  
  // Check if this is a template element
  const isTemplate = element.hasAttribute('data-template-item');
  
  if (isTemplate && Array.isArray(jsonData)) {
    // Handle array data with template
    processTemplateWithArrayData(element, element, jsonData, sourceName);
  } else if (Array.isArray(jsonData)) {
    // Array data but no explicit template - find templates within
    processArrayDataInElement(element, jsonData, sourceName);
  } else if (typeof jsonData === 'object') {
    // Object data - update directly
    updateElementWithJsonData(element, jsonData, sourceName);
  }
}

// Process array data within an element
function processArrayDataInElement(container, dataArray, sourceName) {
  if (!container || !Array.isArray(dataArray) || dataArray.length === 0) return;
  
  // Look for template items within the container
  const templateElements = container.querySelectorAll('[data-template-item]');
  
  if (templateElements.length === 0) {
    // If no templates, update the container with first item
    updateElementWithJsonData(container, dataArray[0], sourceName);
    return;
  }
  
  // Process each template
  templateElements.forEach(templateElement => {
    const itemKey = templateElement.getAttribute('data-template-item');
    const itemData = dataArray.filter(item => 
      !itemKey || item._itemType === itemKey || item.itemType === itemKey
    );
    
    if (itemData.length > 0) {
      processTemplateWithArrayData(container, templateElement, itemData, sourceName);
    }
  });
}

// Process template with array data
function processTemplateWithArrayData(container, templateElement, dataArray, sourceName) {
  if (!container || !templateElement || !Array.isArray(dataArray) || dataArray.length === 0) return;
  
  // Determine if container is the template element itself
  const isContainerTemplate = container === templateElement;
  
  // Store original template
  const originalTemplate = templateElement.clone();
  
  // Clear existing siblings if specified
  const clearExisting = container.hasAttribute('data-clear-existing') || 
                       templateElement.hasAttribute('data-clear-existing');
  
  if (clearExisting && !isContainerTemplate) {
    Array.from(container.children).forEach(child => {
      if (child !== templateElement) {
        child.remove();
      }
    });
  }
  
  // Process each data item
  dataArray.forEach((data, index) => {
    let elementToUse;
    
    if (index === 0) {
      // Use original template for first item
      elementToUse = templateElement;
    } else {
      // Clone for subsequent items
      elementToUse = originalTemplate.clone();
      if (!isContainerTemplate) {
        container.appendChild(elementToUse);
      } else {
        // If container is the template, we need a parent to append to
        const parent = container.parentElement;
        if (parent) {
          parent.appendChild(elementToUse);
        }
      }
    }
    
    // Update with data
    updateElementWithJsonData(elementToUse, data, sourceName);
    
    // Clean up template attributes
    elementToUse.removeAttribute('data-template-item');
    elementToUse.removeAttribute('data-json-source');
  });
}

// REMOVE the function at line ~1420 and KEEP this one at line ~1656
function updateElementWithJsonData(element, jsonData, namespace = '') {
  if (!element || !jsonData) return;
  
  // Build selector prefix if namespace is provided
  const namespacePrefix = namespace ? `${namespace}.` : '';

  console.log(`Updating element with namespace: "${namespace}" and prefix: "${namespacePrefix}"`);
  
  // Update data-cms-text elements
  element.querySelectorAll('[data-server-text]').forEach(el => {
    const key = el.getAttribute('data-server-text');
    
    // Try namespaced key first, then regular key
    let value;
    if (namespace) {
      // Check for namespaced key (e.g., "hero.title" or "profiles.0.name")
      console.log(`Looking for text key: "${namespacePrefix}${key}"`);
      const namespacedKey = `${namespacePrefix}${key}`;
      value = getValueByPath(jsonData, namespacedKey);
      console.log(`Found value: "${value}" for key: "${key}"`); 
      // Also check dot notation in the key itself
      if (value === undefined && key.includes('.')) {
        console.log(`Looking for text key by dot notation: "${key}" on data ${JSON.stringify(jsonData)}`);
        value = getValueByPath(jsonData, key);
      }
    }
    
    // Fall back to direct key
    if (value === undefined) {
      value = jsonData[key];
    }
    
    if (value !== undefined) {
      // Find and replace the first text node
      const textNodes = Array.from(el.childNodes)
        .filter(node => node.nodeType === 3 && node.textContent.trim());
      
      if (textNodes.length > 0) {
        textNodes[0].textContent = value;
      } else {
        el.textContent = value;
      }
    }
  });
  
  // Update data-cms-bg elements
  element.querySelectorAll('[data-server-bg]').forEach(el => {
    const key = el.getAttribute('data-server-bg');
    
    let value;
    if (namespace) {
      const namespacedKey = `${namespacePrefix}${key}`;
      value = getValueByPath(jsonData, namespacedKey);
      console.log(`Looking for background key: "${namespacedKey}", found value: "${value}"`);
      if (value === undefined && key.includes('.')) {
        value = getValueByPath(jsonData, key);
      }
    }
    
    if (value === undefined) {
      value = jsonData[key];
    }
    
    if (value !== undefined) {
      const style = el.getAttribute('style') || '';
      const styleParts = style
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.toLowerCase().startsWith('background-image'))
        .filter(Boolean);
      
      styleParts.push(`background-image:url('${escapeHtml(value)}')`);
      el.setAttribute('style', styleParts.join('; '));
    }
  });
  
  // Update data-cms-image elements
  element.querySelectorAll('[data-server-image]').forEach(el => {
    const key = el.getAttribute('data-server-image');
    
    let value;
    if (namespace) {
      const namespacedKey = `${namespacePrefix}${key}`;
      value = getValueByPath(jsonData, namespacedKey);
      
      if (value === undefined && key.includes('.')) {
        value = getValueByPath(jsonData, key);
      }
    }
    
    if (value === undefined) {
      value = jsonData[key];
    }
    
    if (value !== undefined && el.tagName.toLowerCase() === 'img') {
      el.setAttribute('src', value);
    }
  });
  
  // Recursively process child elements
  Array.from(element.children || []).forEach(child => {
    updateElementWithJsonData(child, jsonData, namespace);
  });
}

// Helper function to get value by dot notation path
function getValueByPath(obj, path) {
  console.log(`Getting value by path: "${path}" from object.`);
  if (!obj || !path) return undefined;
  console.log(`Getting value by path: "${path}" from object. Object keys: ${Object.keys(obj).join(', ')}`);
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    
    // Handle array indices
    const numKey = parseInt(key, 10);
    if (!isNaN(numKey) && Array.isArray(current)) {
      return current[numKey];
    }
    
    return current[key];
  }, obj);
}

// Helper function to get value with namespace consideration
function getNamespacedValue(jsonData, key, namespace) {
  if (!key) return undefined;
  
  // Check for dot notation in key first (overrides namespace)
  if (key.includes('.')) {
    const value = getValueByPath(jsonData, key);
    if (value !== undefined) return value;
  }
  
  // Try with namespace prefix
  if (namespace) {
    const namespacedKey = `${namespace}.${key}`;
    const value = getValueByPath(jsonData, namespacedKey);
    if (value !== undefined) return value;
  }
  
  // Fall back to direct key
  return jsonData[key];
}

// Helper function to get value by dot notation path
function getValueByPath(obj, path) {
  if (!obj || !path) return undefined;
  
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    
    // Handle array indices
    const numKey = parseInt(key, 10);
    if (!isNaN(numKey) && Array.isArray(current)) {
      return current[numKey];
    }
    
    return current[key];
  }, obj);
}
// New function to populate HTML with remote JSON data

// Function to fetch JSON data from remote URL
async function fetchRemoteJsonData(url) {
  try {
    // Using node's native http/https modules
    const protocol = url.startsWith('https') ? require('https') : require('http');
    
    return new Promise((resolve, reject) => {
      protocol.get(url, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            console.log(`Fetched JSON data from ${url}:`, parsedData);
            resolve(parsedData);
          } catch (parseError) {
            console.warn(`Failed to parse JSON from ${url}:`, parseError.message);
            reject(new Error(`Failed to parse JSON: ${parseError.message}`));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Failed to fetch JSON: ${error.message}`));
      });
    });
  } catch (err) {
    console.warn(`Failed to fetch JSON from ${url}: ${err.message}`);
    return null;
  }
}

// Process array data (for templates/repeating elements)
async function processArrayData(root, dataArray) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    return;
  }
  
  // Find all elements with data-array-template attribute
  const templateContainers = root.querySelectorAll('[data-array-template]');
  
  if (templateContainers.length === 0) {
    // No template containers found, update elements directly with first data item
    updateElementWithJsonData(root, dataArray[0], '');
    return;
  }
  
  // Process each template container
  templateContainers.forEach(container => {
    const templateKey = container.getAttribute('data-array-template');
    
    // Filter data for this specific template (if key provided)
    const relevantData = templateKey 
      ? dataArray.filter(item => item._template === templateKey)
      : dataArray;
    
    if (relevantData.length === 0) return;
    
    // Find template element(s) within container
    // This could be the first child or elements with specific attributes
    const templateElements = container.querySelectorAll('[data-template-item]');
    
    if (templateElements.length === 0) {
      // If no explicit template items, use the first child element as template
      const firstChild = container.firstElementChild;
      if (!firstChild) return;
      
      processTemplateElement(container, firstChild, relevantData);
    } else {
      // Process each template element type
      templateElements.forEach(templateElement => {
        const itemKey = templateElement.getAttribute('data-template-item');
        const itemData = relevantData.filter(item => 
          !itemKey || item._itemType === itemKey
        );
        
        if (itemData.length > 0) {
          processTemplateElement(container, templateElement, itemData);
        }
      });
    }
  });
}

// Process a single template element with array data
function processTemplateElement(container, templateElement, dataArray) {
  // Store original template
  const originalTemplate = templateElement.clone();
  
  // Remove all children from container (optional - depends on your needs)
  // Or just remove the template element if it's marked for replacement
  if (templateElement.hasAttribute('data-replace-template')) {
    templateElement.remove();
  }
  
  // Process each data item
  dataArray.forEach((data, index) => {
    let elementToUse;
    
    if (index === 0 && !templateElement.hasAttribute('data-replace-template')) {
      // Use the original template for first item
      elementToUse = templateElement;
    } else {
      // Clone template for subsequent items
      elementToUse = originalTemplate.clone();
      container.appendChild(elementToUse);
    }
    
    // Update element with JSON data
    updateElementWithJsonData(elementToUse, data, '');
    
    // Remove template attributes
    elementToUse.removeAttribute('data-template-item');
    elementToUse.removeAttribute('data-replace-template');
  });
}




// Add caching functionality
const jsonCache = new Map();
const CACHE_TTL = 0; // 5 minutes cache TTL

// Enhanced fetch function with caching
async function fetchRemoteJsonDataWithCache(url) {
  const now = Date.now();
  const cached = jsonCache.get(url);
  
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const data = await fetchRemoteJsonData(url);
    if (data) {
      jsonCache.set(url, {
        data: data,
        timestamp: now
      });
    }
    return data;
  } catch (err) {
    // Return cached data even if expired if fetch fails
    if (cached) {
      console.log(`Using expired cache for ${url} due to fetch error: ${err.message}`);
      return cached.data;
    }
    throw err;
  }
}




// Helper function to get value by dot notation path
function getValueByPath(obj, path) {
  if (!obj || !path) return undefined;
  
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    
    // Handle array indices
    const numKey = parseInt(key, 10);
    if (!isNaN(numKey) && Array.isArray(current)) {
      return current[numKey];
    }
    
    return current[key];
  }, obj);
}

// Alternative: Data source configuration with more flexibility
const FLEXIBLE_JSON_SOURCES = {
  'index.html': [
    { 
      url: 'https://api.example.com/data/hero.json',
      selector: '[data-source="hero"]',
      namespace: 'hero'
    },
    { 
      url: 'https://api.example.com/data/stats.json',
      selector: '[data-source="stats"]',
      namespace: 'stats'
    },
    { 
      url: 'https://api.example.com/data/testimonials.json',
      selector: '.testimonials-container',
      namespace: 'testimonials'
    }
  ],
  'about.html': [
    { 
      url: 'https://api.example.com/data/team.json',
      selector: '[data-team-data]',
      namespace: 'team'
    },
    { 
      url: 'https://api.example.com/data/values.json',
      selector: '.values-section',
      namespace: 'values'
    }
  ]
};






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
  let safePath = path.normalize(filePath).replace(/^\/+/, '');

  const searchBases = [];

  if (safePath.startsWith('admin/')) {
    searchBases.push(ROOT);
  } else {
    searchBases.push(ADMIN_DIR, ROOT);
  }

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
        const payload = parseJsonBody(body);
        const {
          key,
          value,
          html,
          originalOuterHTML,
          updatedOuterHTML,
          path: elementPath,
          type,
          image,
          link,
          file,
          siteName,
          delete: deleteElement,
        } = payload;
        const sanitizedSiteName = siteName !== undefined ? sanitizeSiteName(siteName) : undefined;
        const linkValue = typeof link === 'string' ? link.trim() : '';
        if (!key && !html && sanitizedSiteName === undefined && !deleteElement) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Key is required' }));
          return;
        }

        const targetFile = sanitizeHtmlFile(file || fileName);
        const htmlPath = htmlPathFor(targetFile);
        let currentHtml = await fs.readFile(htmlPath, 'utf8');
        const { siteName: existingSiteName } = extractContentFromHtml(currentHtml);
        if (html) {
          currentHtml = stripContentEditable(stripCmsUi(html));
        }

        if (deleteElement) {
          if (!elementPath && !key) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Path or key is required to delete' }));
            return;
          }
          currentHtml = removeElementFromHtml(currentHtml, { key, elementPath });
          const cleanedHtml = stripContentEditable(currentHtml);
          await persistComponentSources(cleanedHtml);
          await persistStyleSources(cleanedHtml);
          await fs.writeFile(htmlPath, cleanedHtml);
          const { values, siteName: persistedSiteName } = extractContentFromHtml(cleanedHtml);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ content: values, tags: {}, siteName: persistedSiteName || existingSiteName })
          );
          return;
        }
        let storedValue = value ?? '';
        if (type === 'image' || type === 'background' || type === 'video') {
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

          storedValue = await writeBase64MediaToDisk(storedValue, targetFile.replace('.html', ''));

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
                const updated = stripContentEditable(updateSiteNameInHtml(html, finalSiteName));
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
          if (html) {
            if ((type === 'image' || type === 'background' || type === 'video') && storedValue !== value) {
              currentHtml = mergeContentIntoHtml(currentHtml, {
                key,
                type: type || 'text',
                value: storedValue,
              });
            }
          } else {
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
        }

        const cleanedHtml = stripContentEditable(currentHtml);
        const localizedHtml = await localizeEmbeddedImagesInHtml(cleanedHtml, targetFile);
        await persistComponentSources(localizedHtml);
        await persistStyleSources(localizedHtml);
        await fs.writeFile(htmlPath, localizedHtml);

        const { values, siteName: persistedSiteName } = extractContentFromHtml(localizedHtml);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: values, tags: {}, siteName: persistedSiteName || finalSiteName }));
      } catch (err) {
        const isSyntaxError = err instanceof SyntaxError;
        const message = isSyntaxError ? 'Invalid JSON payload' : err.message || 'Unable to save content';
        sendJsonError(res, isSyntaxError ? 400 : 500, message);
      }
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
}



async function handleRequest(req, res) {
  await ensureRuntimeFiles();
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || '/';

  if (pathname === '/api/auth/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled: Boolean(AUTH_REQUIRED),
      supabaseUrl: AUTH_REQUIRED ? SUPABASE_URL : '',
      supabaseAnonKey: AUTH_REQUIRED ? SUPABASE_ANON_KEY : '',
    }));
    return;
  }

  if (pathname.startsWith('/api/') && !(await requireAuthenticatedRequest(req, res, pathname))) {
    return;
  }

  if (pathname === '/api/content') {
    return handleApiContent(req, res, parsedUrl.query.file || DEFAULT_FILE);
  }

  if (pathname === '/api/publish' && req.method === 'POST') {
    if (AUTH_REQUIRED && !req.cmsIsAdmin) {
      sendJsonError(res, 403, 'Admin role required to publish');
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      let trace;
      try {
        console.log(`Triggering site publish...`);
        let payload = {};
        try {
          payload = body ? JSON.parse(body) : {};
        } catch (e) {
          payload = {};
        }
        trace = createPublishTrace(PUBLISH_DEBUG || Boolean(payload.debug));
        trace.info('request.publish.received', {
          authenticatedUser: req.cmsUser && (req.cmsUser.email || req.cmsUser.id) ? (req.cmsUser.email || req.cmsUser.id) : '',
          debugResponse: trace.enabled,
          hasGithubRepo: Boolean(GITHUB_PAGES_REPO),
          hasGithubToken: Boolean(GITHUB_PAGES_TOKEN),
        });
        const published = await publishSite({ themeAccent: payload.themeAccent, trace });
        const github = await publishDirectoryToGitHubPages(PUBLISH_TARGET, published, trace);
        trace.info('request.publish.done', {
          pages: published.length,
          githubEnabled: Boolean(github.enabled),
          githubUploads: Array.isArray(github.uploaded) ? github.uploaded.length : 0,
        });
        const responsePayload = { published, github, target: PUBLISH_TARGET, traceId: trace.id };
        if (trace.enabled) responsePayload.trace = trace.toJSON();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responsePayload));
      } catch (err) {
        trace = trace || createPublishTrace(true);
        trace.error('request.publish.failed', { message: err.message, stack: err.stack });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unable to publish site', detail: err.message, traceId: trace.id, trace: trace.toJSON() }));
      }
    });
    return;
  }

  if (pathname === '/api/layout' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = parseJsonBody(body);
        const { html, file } = payload;
        if (!html) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'HTML is required' }));
          return;
        }
        const targetFile = sanitizeHtmlFile(file || DEFAULT_FILE);
        const htmlPath = htmlPathFor(targetFile);
        const cleanedHtml = stripContentEditable(stripCmsUi(html));
        await persistComponentSources(cleanedHtml);
        await persistStyleSources(cleanedHtml);
        await fs.writeFile(htmlPath, cleanedHtml);
        const { values, siteName } = extractContentFromHtml(cleanedHtml);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: values, tags: {}, siteName }));
      } catch (err) {
        const isSyntaxError = err instanceof SyntaxError;
        const message = isSyntaxError ? 'Invalid JSON payload' : err.message || 'Unable to save layout';
        sendJsonError(res, isSyntaxError ? 400 : 500, message);
      }
    });
    return;
  }

  if (pathname === '/api/files') {
    if (req.method === 'GET') {
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
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = parseJsonBody(body);
          const targetFile = sanitizeHtmlFile(payload.file || '');
          if (!targetFile) {
            sendJsonError(res, 400, 'File name is required');
            return;
          }
          const htmlPath = htmlPathFor(targetFile);
          try {
            await fs.access(htmlPath);
            sendJsonError(res, 409, 'File already exists');
            return;
          } catch (err) {
            if (err && err.code !== 'ENOENT') throw err;
          }
          const title = targetFile.replace(/\.html$/i, '').replace(/[-_]/g, ' ');
          await fs.writeFile(htmlPath, buildBlankAdminPage(title));
          const files = await listHtmlFiles();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ files }));
        } catch (err) {
          sendJsonError(res, 500, err.message || 'Unable to create file');
        }
      });
      return;
    }
    if (req.method === 'DELETE') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = parseJsonBody(body);
          const targetFile = sanitizeHtmlFile(payload.file || '');
          if (!targetFile) {
            sendJsonError(res, 400, 'File name is required');
            return;
          }
          if (targetFile === DEFAULT_FILE) {
            sendJsonError(res, 400, 'Default page cannot be deleted');
            return;
          }
          const htmlPath = htmlPathFor(targetFile);
          await fs.unlink(htmlPath);
          const files = await listHtmlFiles();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ files }));
        } catch (err) {
          if (err && err.code === 'ENOENT') {
            sendJsonError(res, 404, 'File not found');
            return;
          }
          sendJsonError(res, 500, 'Unable to delete file');
        }
      });
      return;
    }
  }

  if (pathname === '/api/components' && req.method === 'GET') {
    const componentId = parsedUrl.query.id;
    if (componentId) {
      try {
        const html = await loadComponentHtml(componentId);
        if (!html) {
          sendJsonError(res, 404, 'Component not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ html }));
      } catch (err) {
        sendJsonError(res, 500, err.message || 'Unable to load component');
      }
      return;
    }
    try {
      const components = await listComponents();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ components }));
    } catch (err) {
      sendJsonError(res, 500, err.message || 'Unable to list components');
    }
    return;
  }

  if (pathname === '/api/services' && req.method === 'GET') {
    const serviceUrl = parsedUrl.query.url;
    if (!serviceUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service URL is required' }));
      return;
    }
    try {
      const data = await fetchServiceJson(serviceUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unable to fetch service data' }));
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
      //read any json files needed here to populate the html before sending
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
}

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = { handleRequest, publishSite };
