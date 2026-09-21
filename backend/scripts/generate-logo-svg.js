const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const potrace = require("potrace");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "assets", "images", "icone", "logo.png");
const OUT = path.join(ROOT, "assets", "images", "icone", "logo.svg");
const TMP = path.join(ROOT, "assets", "images", "icone", "_logo-data-trace.png");

const SIZE = 512;
const TRACE_SIZE = 1024;
const CORNER_RADIUS = 112;
const WHITE_THRESHOLD = 235;

function isWhite(r, g, b) {
  return r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD;
}

function sampleOrange(data, width, height) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];
      if (pr > 200 && pg > 90 && pb < 90 && !isWhite(pr, pg, pb)) {
        r += pr;
        g += pg;
        b += pb;
        n += 1;
      }
    }
  }

  if (!n) return "#FF6C01";
  const hr = Math.round(r / n)
    .toString(16)
    .padStart(2, "0");
  const hg = Math.round(g / n)
    .toString(16)
    .padStart(2, "0");
  const hb = Math.round(b / n)
    .toString(16)
    .padStart(2, "0");
  return `#${hr}${hg}${hb}`.toUpperCase();
}

function buildMask(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    mask[i] = isWhite(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 1 : 0;
  }
  return mask;
}

function findComponents(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;

      const queue = [start];
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      let sumX = 0;
      let sumY = 0;

      while (queue.length) {
        const idx = queue.pop();
        const px = idx % width;
        const py = (idx / width) | 0;
        area += 1;
        sumX += px;
        sumY += py;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);

        for (const next of [idx - 1, idx + 1, idx - width, idx + width]) {
          if (next < 0 || next >= mask.length) continue;
          const nx = next % width;
          const ny = (next / width) | 0;
          if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) continue;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }

      components.push({
        area,
        minX,
        minY,
        maxX,
        maxY,
        cx: sumX / area,
        cy: sumY / area,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
    }
  }

  return components;
}

function quadrant(component, mid) {
  const xSide = component.cx < mid ? "L" : "R";
  const ySide = component.cy < mid ? "T" : "B";
  return xSide + ySide;
}

function pickFinder(components, corner, mid) {
  return (
    components
      .filter((component) => {
        if (component.area < 8000) return false;
        if (quadrant(component, mid) !== corner) return false;
        const aspect = component.width / component.height;
        return aspect > 0.75 && aspect < 1.33;
      })
      .sort((a, b) => b.area - a.area)[0] || null
  );
}

function eraseBox(mask, width, box, padding) {
  const minX = Math.max(0, Math.floor(box.minX - padding));
  const minY = Math.max(0, Math.floor(box.minY - padding));
  const maxX = Math.min(width - 1, Math.ceil(box.maxX + padding));
  const maxY = Math.min(width - 1, Math.ceil(box.maxY + padding));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      mask[y * width + x] = 0;
    }
  }
}

function scaleBox(box, factor) {
  return {
    minX: box.minX / factor,
    minY: box.minY / factor,
    maxX: box.maxX / factor,
    maxY: box.maxY / factor,
    cx: box.cx / factor,
    cy: box.cy / factor,
    width: box.width / factor,
    height: box.height / factor,
  };
}

function renderFinder(component, orange) {
  const size = Math.max(component.width, component.height);
  const x = Math.round(component.cx - size / 2);
  const y = Math.round(component.cy - size / 2);
  const outerRx = Math.round(size * 0.22);
  const innerSize = Math.round(size * 0.61);
  const innerOffset = Math.round((size - innerSize) / 2);
  const innerRx = Math.round(innerSize * 0.24);
  const dotR = Math.round(innerSize * 0.22);

  return [
    `<rect x="${x}" y="${y}" width="${Math.round(size)}" height="${Math.round(size)}" rx="${outerRx}"/>`,
    `<rect x="${x + innerOffset}" y="${y + innerOffset}" width="${innerSize}" height="${innerSize}" rx="${innerRx}" fill="${orange}"/>`,
    `<circle cx="${Math.round(component.cx)}" cy="${Math.round(component.cy)}" r="${dotR}"/>`,
  ];
}

function scalePath(pathData, factor) {
  return pathData.replace(
    /-?\d*\.?\d+(?:e[-+]?\d+)?/gi,
    (num) => String(Math.round((Number(num) / factor) * 100) / 100),
  );
}

function traceDataPaths() {
  return new Promise((resolve, reject) => {
    potrace.trace(
      TMP,
      {
        turdSize: 12,
        optTolerance: 0.18,
        threshold: 128,
        color: "#FFFFFF",
        background: "transparent",
      },
      (err, svg) => {
        if (err) reject(err);
        else resolve(svg);
      },
    );
  });
}

function splitSubpaths(pathData) {
  return pathData
    .split(/(?=M\s)/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function keepDataSubpath(subpath) {
  const match = subpath.match(/^M\s*([-\d.]+)[,\s]+([-\d.]+)/i);
  if (!match) return false;
  const x = Number(match[1]);
  const y = Number(match[2]);
  const margin = 54;
  if (x < margin || y < margin || x > SIZE - margin || y > SIZE - margin) {
    return false;
  }
  if (y > 472 && subpath.length < 260) return false;
  return subpath.length > 48;
}

function extractDataPaths(tracedSvg, factor) {
  const scale = TRACE_SIZE / SIZE;
  const output = [];

  for (const match of tracedSvg.matchAll(/<path[^>]*d="([^"]+)"/gi)) {
    const scaled = scalePath(match[1], scale);
    const subpaths = splitSubpaths(scaled).filter(keepDataSubpath);
    if (!subpaths.length) continue;
    output.push(`    <path d="${subpaths.join(" ")}" fill="#FFFFFF"/>`);
  }

  return output;
}

async function main() {
  const { data, info } = await sharp(SRC)
    .resize(TRACE_SIZE, TRACE_SIZE, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const orange = sampleOrange(data, info.width, info.height);
  const mask = buildMask(data, info.width, info.height);
  const allComponents = findComponents(mask, info.width, info.height);
  const mid = TRACE_SIZE / 2;

  const finderTL = pickFinder(allComponents, "LT", mid);
  const finderTR = pickFinder(allComponents, "RT", mid);
  const finderBL = pickFinder(allComponents, "LB", mid);

  for (const finder of [finderTL, finderTR, finderBL]) {
    if (finder) eraseBox(mask, info.width, finder, 16);
  }

  const edge = 8;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (
        x < edge ||
        y < edge ||
        x >= info.width - edge ||
        y >= info.height - edge
      ) {
        mask[y * info.width + x] = 0;
      }
    }
  }

  const dataPixels = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < mask.length; i += 1) {
    dataPixels[i] = mask[i] ? 0 : 255;
  }

  await sharp(dataPixels, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .png()
    .toFile(TMP);

  const tracedSvg = await traceDataPaths();
  const dataPaths = extractDataPaths(tracedSvg, TRACE_SIZE / SIZE);

  const finderShapes = [];
  for (const finder of [finderTL, finderTR, finderBL]) {
    if (finder) finderShapes.push(...renderFinder(scaleBox(finder, 2), orange));
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="AfricaMenu">
  <defs>
    <clipPath id="africamenu-logo-clip">
      <rect width="${SIZE}" height="${SIZE}" rx="${CORNER_RADIUS}"/>
    </clipPath>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="${CORNER_RADIUS}" fill="${orange}"/>
  <g clip-path="url(#africamenu-logo-clip)" fill="#FFFFFF">
    ${finderShapes.join("\n    ")}
    ${dataPaths.join("\n")}
  </g>
</svg>
`;

  fs.writeFileSync(OUT, svg, "utf8");
  fs.unlinkSync(TMP);
  console.log(
    `Logo SVG généré : ${OUT} (${svg.length} octets, orange ${orange})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
