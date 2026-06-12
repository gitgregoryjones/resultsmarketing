const fs = require("fs");
const path = require("path");

const ADMIN_DIR = path.join(process.cwd(), "admin");
const IMAGES_DIR = path.join(process.cwd(), "images");

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".avif"
]);

function walk(dir, filterFn) {
  if (!fs.existsSync(dir)) return [];

  const results = [];

  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...walk(fullPath, filterFn));
    } else if (!filterFn || filterFn(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

const htmlFiles = walk(ADMIN_DIR, file =>
  file.toLowerCase().endsWith(".html")
);

const imageFiles = walk(IMAGES_DIR, file =>
  IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())
);

const htmlText = htmlFiles
  .map(file => fs.readFileSync(file, "utf8"))
  .join("\n");

let deleted = 0;
let kept = 0;

for (const imagePath of imageFiles) {
  const imageName = path.basename(imagePath);

  if (htmlText.includes(imageName)) {
    kept++;
    console.log(`KEEP: ${imageName}`);
  } else {
    fs.unlinkSync(imagePath);
    deleted++;
    console.log(`DELETE: ${imageName}`);
  }
}

console.log("\nCleanup complete");
console.log(`HTML files scanned: ${htmlFiles.length}`);
console.log(`Images checked: ${imageFiles.length}`);
console.log(`Images kept: ${kept}`);
console.log(`Images deleted: ${deleted}`);
