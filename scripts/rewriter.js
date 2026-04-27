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

// Existing general params appended to proxied images when no size-specific logic is used
const WSRV_DEFAULT_PARAMS =
  process.env.WSRV_DEFAULT_PARAMS || "";

// Responsive image params
const WSRV_IMAGE_PARAMS =
  process.env.WSRV_IMAGE_PARAMS || "&output=webp&q=75&il";

const RESPONSIVE_WIDTHS = (
  process.env.RESPONSIVE_WIDTHS || "320,480,640,768,960,1280,1600"
)
  .split(",")
  .map((v) => parseInt(v.trim(), 10))
  .filter(Number.isFinite)
  .sort((a, b) => a - b);

const DEFAULT_FALLBACK_WIDTH =
  parseInt(process.env.DEFAULT_FALLBACK_WIDTH || "640", 10);

const DEFAULT_IMG_SIZES =
  process.env.DEFAULT_IMG_SIZES || "100vw";

// Background image widths for inline style rewriting
const BG_MOBILE_WIDTH =
  parseInt(process.env.BG_MOBILE_WIDTH || "640", 10);

const BG_TABLET_WIDTH =
  parseInt(process.env.BG_TABLET_WIDTH || "1024", 10);

const BG_DESKTOP_WIDTH =
  parseInt(process.env.BG_DESKTOP_WIDTH || "1600", 10);

// Whether to proxy absolute external images too
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

function toWsrvBaseUrl(assetUrl) {
  if (!assetUrl || shouldSkipAssetUrl(assetUrl)) return assetUrl;

  if (!shouldRewriteAbsoluteUrl(assetUrl) && isAbsoluteHttp(assetUrl)) {
    return assetUrl;
  }

  return `${WSRV_BASE}${encodeURIComponent(assetUrl)}`;
}

function appendParams(url, params) {
  if (!params) return url;
  return `${url}${params}`;
}

function rewriteSingleUrl(rawUrl, currentFileRelativePath) {
  if (!rawUrl) return rawUrl;
  const absolute = toAbsoluteAssetUrl(rawUrl, currentFileRelativePath);
  const wsrvBase = toWsrvBaseUrl(absolute);
  return appendParams(wsrvBase, WSRV_DEFAULT_PARAMS);
}

function buildFallbackSrc(rawUrl, currentFileRelativePath) {
  const absolute = toAbsoluteAssetUrl(rawUrl, currentFileRelativePath);
  const base = toWsrvBaseUrl(absolute);

  if (base === absolute && !isAlreadyWsrv(base) && isAbsoluteHttp(base) && !shouldRewriteAbsoluteUrl(base)) {
    return base;
  }

  return appendParams(base, `&w=${DEFAULT_FALLBACK_WIDTH}${WSRV_IMAGE_PARAMS}`);
}

function buildResponsiveSrcset(rawUrl, currentFileRelativePath) {
  const absolute = toAbsoluteAssetUrl(rawUrl, currentFileRelativePath);
  const base = toWsrvBaseUrl(absolute);

  if (base === absolute && !isAlreadyWsrv(base) && isAbsoluteHttp(base) && !shouldRewriteAbsoluteUrl(base)) {
    return null;
  }

  return RESPONSIVE_WIDTHS.map((w) => {
    const candidate = appendParams(base, `&w=${w}${WSRV_IMAGE_PARAMS}`);
    return `${candidate} ${w}w`;
  }).join(", ");
}

function buildBackgroundUrl(rawUrl, currentFileRelativePath, width) {
  const absolute = toAbsoluteAssetUrl(rawUrl, currentFileRelativePath);
  const base = toWsrvBaseUrl(absolute);

  if (base === absolute && !isAlreadyWsrv(base) && isAbsoluteHttp(base) && !shouldRewriteAbsoluteUrl(base)) {
    return base;
  }

  return appendParams(base, `&w=${width}${WSRV_IMAGE_PARAMS}`);
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

      const rewritten = buildBackgroundUrl(
        trimmed,
        currentFileRelativePath,
        BG_DESKTOP_WIDTH
      );

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

function escapeForCssDoubleQuotedUrl(url) {
  return String(url).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function injectResponsiveBackgroundStyles($, currentFileRelativePath) {
  let cssBlocks = [];
  let counter = 0;

  $("[style]").each((_, el) => {
    const current = $(el).attr("style");
    if (!current || !current.includes("url(")) return;

    const match = current.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
    if (!match || !match[2]) return;

    const originalUrl = match[2].trim();
    if (!originalUrl || shouldSkipAssetUrl(originalUrl)) return;

    const mobileUrl = buildBackgroundUrl(
      originalUrl,
      currentFileRelativePath,
      BG_MOBILE_WIDTH
    );
    const tabletUrl = buildBackgroundUrl(
      originalUrl,
      currentFileRelativePath,
      BG_TABLET_WIDTH
    );
    const desktopUrl = buildBackgroundUrl(
      originalUrl,
      currentFileRelativePath,
      BG_DESKTOP_WIDTH
    );

    const className = `wsrv-bg-${counter++}-${Math.random().toString(36).substr(2, 5)}`;

    const rewrittenInlineStyle = rewriteStyleUrls(current, currentFileRelativePath);
    $(el).attr("style", rewrittenInlineStyle);

    const existingClass = ($(el).attr("class") || "").trim();
    $(el).attr(
      "class",
      existingClass ? `${existingClass} ${className}` : className
    );

    cssBlocks.push(`
.${className} {
  background-image: url("${escapeForCssDoubleQuotedUrl(mobileUrl)}") !important;
}
@media (min-width: 768px) {
  .${className} {
    background-image: url("${escapeForCssDoubleQuotedUrl(tabletUrl)}") !important;
  }
}
@media (min-width: 1200px) {
  .${className} {
    background-image: url("${escapeForCssDoubleQuotedUrl(desktopUrl)}") !important;
  }
}
`);
  });

  if (!cssBlocks.length) return;

  const styleTag = `<style id="wsrv-responsive-backgrounds">\n${cssBlocks.join("\n")}\n</style>`;

  if ($("head").length) {
    $("head").append(styleTag);
  } else {
    $.root().prepend(styleTag);
  }
}

function processHtmlFile(inputPath, outputPath, currentFileRelativePath) {
  const html = fs.readFileSync(inputPath, "utf8");
  const $ = cheerio.load(html, {
    decodeEntities: false
  });

  // img[src] -> add responsive src/srcset/sizes
  $("img[src]").each((_, el) => {
    const current = $(el).attr("src");
    if (!current) return;

    const authorProvidedSrcset = $(el).attr("srcset");
    const shouldSkipLazy =
      $(el).attr("data-no-lazy") !== undefined ||
      String($(el).attr("fetchpriority") || "").toLowerCase() === "high";

    const fallbackSrc = buildFallbackSrc(current, currentFileRelativePath);
    if (fallbackSrc) {
      $(el).attr("src", fallbackSrc);
    }

    if (!authorProvidedSrcset) {
      const generatedSrcset = buildResponsiveSrcset(current, currentFileRelativePath);
      if (generatedSrcset) {
        $(el).attr("srcset", generatedSrcset);
      }
    } else {
      $(el).attr(
        "srcset",
        rewriteSrcset(authorProvidedSrcset, currentFileRelativePath)
      );
    }

    if (!$(el).attr("sizes")) {
      $(el).attr("sizes", DEFAULT_IMG_SIZES);
    }

    if (!$(el).attr("decoding")) {
      $(el).attr("decoding", "async");
    }

    if (!shouldSkipLazy && !$(el).attr("loading")) {
      $(el).attr("loading", "lazy");
    }
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
    if (!current) return;
    const rewritten = buildBackgroundUrl(
      current,
      currentFileRelativePath,
      DEFAULT_FALLBACK_WIDTH
    );
    if (rewritten) $(el).attr("poster", rewritten);
  });

  // First rewrite inline styles to desktop default
  $("[style]").each((_, el) => {
    const current = $(el).attr("style");
    const rewritten = rewriteStyleUrls(current, currentFileRelativePath);
    if (rewritten !== current) {
      $(el).attr("style", rewritten);
    }
  });

  // Then inject responsive media-query overrides for those backgrounds
  injectResponsiveBackgroundStyles($, currentFileRelativePath);

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
    if (SKIP_FILES.has(entry.name)) continue;

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
  log("WSRV_IMAGE_PARAMS =", WSRV_IMAGE_PARAMS);
  log("RESPONSIVE_WIDTHS =", RESPONSIVE_WIDTHS.join(","));
  log("DEFAULT_FALLBACK_WIDTH =", DEFAULT_FALLBACK_WIDTH);
  log("DEFAULT_IMG_SIZES =", DEFAULT_IMG_SIZES);
  log("BG widths =", BG_MOBILE_WIDTH, BG_TABLET_WIDTH, BG_DESKTOP_WIDTH);
  log("REWRITE_EXTERNAL_IMAGES =", REWRITE_EXTERNAL_IMAGES);
  log("Output =", OUT_DIR);
}

main();