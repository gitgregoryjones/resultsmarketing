const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const SRC_DIR = process.cwd();
const OUT_DIR = path.join(process.cwd(), "dist");

const SKIP_NAMES = new Set([
  "dist",
  ".git",
  ".github",
  "node_modules",
  "scripts"
]);

const SKIP_FILES = new Set([
  "package.json",
  "package-lock.json",
  ".gitignore",
  "README.md"
]);

const SITE_BASE =
  process.env.SITE_BASE || "https://gitgregoryjones.github.io/resultsmarketing/";

const WSRV_BASE =
  process.env.WSRV_BASE || "https://wsrv.nl/?url=";

const WSRV_DEFAULT_PARAMS = process.env.WSRV_DEFAULT_PARAMS || "";

const REWRITE_EXTERNAL_IMAGES =
  String(process.env.REWRITE_EXTERNAL_IMAGES || "false").toLowerCase() === "true";

const COPY_DOTFILES =
  String(process.env.COPY_DOTFILES || "false").toLowerCase() === "true";

function log(...args) {
  console.log("[rewriter]", ...args);
}

function normalizeBase(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isAbsoluteHttp(url) {
  return /^https?:\/\//i.test(url);
}

function isProtocolRelative(url) {
  return /^\/\//.test(url);
}

function isSpecialUrl(url) {
  return /^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(url);
}

function isAlreadyWsrv(url) {
  return /(^https?:)?\/\/wsrv\.nl\/\?url=/i.test(url);
}

function shouldSkipAssetUrl(url) {
  return !url || isSpecialUrl(url) || isAlreadyWsrv(url);
}

function getSiteOrigin() {
  return new URL(normalizeBase(SITE_BASE)).origin;
}

function isSameOriginAsSiteBase(absoluteUrl) {
  try {
    return new URL(absoluteUrl).origin === getSiteOrigin();
  } catch {
    return false;
  }
}

function toAbsoluteAssetUrl(rawUrl, currentFileRelativePath = "") {
  if (!rawUrl) return rawUrl;

  const url = rawUrl.trim();

  if (shouldSkipAssetUrl(url)) return url;

  if (isProtocolRelative(url)) {
    return `https:${url}`;
  }

  if (isAbsoluteHttp(url)) {
    return url;
  }

  const siteBase = normalizeBase(SITE_BASE);

  if (url.startsWith("/")) {
    return new URL(url, getSiteOrigin()).toString();
  }

  const currentDir = currentFileRelativePath
    ? path.posix.dirname(currentFileRelativePath.replace(/\\/g, "/"))
    : ".";

  const currentPublicBase =
    currentDir === "."
      ? siteBase
      : new URL(`${currentDir}/`, siteBase).toString();

  return new URL(url, currentPublicBase).toString();
}

function shouldRewriteAbsoluteUrl(absoluteUrl) {
  if (!absoluteUrl) return false;
  if (shouldSkipAssetUrl(absoluteUrl)) return false;

  if (REWRITE_EXTERNAL_IMAGES) return true;

  return isSameOriginAsSiteBase(absoluteUrl);
}

function toWsrvUrl(assetUrl) {
  if (!assetUrl || shouldSkipAssetUrl(assetUrl)) return assetUrl;

  if (!shouldRewriteAbsoluteUrl(assetUrl) && isAbsoluteHttp(assetUrl)) {
    return assetUrl;
  }

  return `${WSRV_BASE}${encodeURIComponent(assetUrl)}${WSRV_DEFAULT_PARAMS}`;
}

function rewriteSingleUrl(rawUrl, currentFileRelativePath) {
  if (!rawUrl) return rawUrl;

  const absolute = toAbsoluteAssetUrl(rawUrl, currentFileRelativePath);
  return toWsrvUrl(absolute);
}

function rewriteSrcset(srcsetValue, currentFileRelativePath) {
  if (!srcsetValue || !srcsetValue.trim()) return srcsetValue;

  return srcsetValue
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return trimmed;

      const parts = trimmed.split(/\s+/);
      const rawUrl = parts[0];
      const descriptor = parts.slice(1).join(" ");

      const rewritten = rewriteSingleUrl(rawUrl, currentFileRelativePath);
      return descriptor ? `${rewritten} ${descriptor}` : rewritten;
    })
    .join(", ");
}

function rewriteStyleUrls(styleValue, currentFileRelativePath) {
  if (!styleValue || !styleValue.includes("url(")) return styleValue;

  return styleValue.replace(
    /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
    (fullMatch, quote, innerUrl) => {
      const trimmed = (innerUrl || "").trim();
      if (!trimmed) return fullMatch;

      const rewritten = rewriteSingleUrl(trimmed, currentFileRelativePath);
      return `url("${rewritten}")`;
    }
  );
}

function shouldTreatAsHtml(fileName) {
  return /\.(html?|xhtml)$/i.test(fileName);
}

function copyFile(inputPath, outputPath) {
  ensureDir(path.dirname(outputPath));
  fs.copyFileSync(inputPath, outputPath);
}

function processHtmlFile(inputPath, outputPath, currentFileRelativePath) {
  const html = fs.readFileSync(inputPath, "utf8");
  const $ = cheerio.load(html, {
    decodeEntities: false
  });

  $("img[src]").each((_, el) => {
    const current = $(el).attr("src");
    const rewritten = rewriteSingleUrl(current, currentFileRelativePath);
    if (rewritten) $(el).attr("src", rewritten);
  });

  $("img[srcset]").each((_, el) => {
    const current = $(el).attr("srcset");
    const rewritten = rewriteSrcset(current, currentFileRelativePath);
    if (rewritten) $(el).attr("srcset", rewritten);
  });

  $("source[src]").each((_, el) => {
    const current = $(el).attr("src");
    const rewritten = rewriteSingleUrl(current, currentFileRelativePath);
    if (rewritten) $(el).attr("src", rewritten);
  });

  $("source[srcset]").each((_, el) => {
    const current = $(el).attr("srcset");
    const rewritten = rewriteSrcset(current, currentFileRelativePath);
    if (rewritten) $(el).attr("srcset", rewritten);
  });

  $("video[poster]").each((_, el) => {
    const current = $(el).attr("poster");
    const rewritten = rewriteSingleUrl(current, currentFileRelativePath);
    if (rewritten) $(el).attr("poster", rewritten);
  });

  $("[style]").each((_, el) => {
    const current = $(el).attr("style");
    const rewritten = rewriteStyleUrls(current, currentFileRelativePath);
    if (rewritten !== current) {
      $(el).attr("style", rewritten);
    }
  });

  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, $.html(), "utf8");
}

function walkDir(currentSrc, currentOut, relativeDir = "") {
  ensureDir(currentOut);

  const entries = fs.readdirSync(currentSrc, { withFileTypes: true });

  for (const entry of entries) {
    if (!COPY_DOTFILES && entry.name.startsWith(".")) {
      continue;
    }

    const srcPath = path.join(currentSrc, entry.name);
    const outPath = path.join(currentOut, entry.name);
    const relPath = relativeDir
      ? path.posix.join(relativeDir, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      if (SKIP_NAMES.has(entry.name)) {
        continue;
      }

      walkDir(srcPath, outPath, relPath);
      continue;
    }

    if (!entry.isFile()) continue;

    if (SKIP_FILES.has(entry.name)) {
      continue;
    }

    if (shouldTreatAsHtml(entry.name)) {
      processHtmlFile(srcPath, outPath, relPath);
    } else {
      copyFile(srcPath, outPath);
    }
  }
}

function validate() {
  try {
    new URL(normalizeBase(SITE_BASE));
  } catch {
    throw new Error(`Invalid SITE_BASE: ${SITE_BASE}`);
  }
}

function main() {
  validate();

  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }

  walkDir(SRC_DIR, OUT_DIR);

  log("Build complete");
  log("SITE_BASE =", SITE_BASE);
  log("WSRV_BASE =", WSRV_BASE);
  log("WSRV_DEFAULT_PARAMS =", WSRV_DEFAULT_PARAMS || "(none)");
  log("REWRITE_EXTERNAL_IMAGES =", REWRITE_EXTERNAL_IMAGES);
  log("Output =", OUT_DIR);
}

main();