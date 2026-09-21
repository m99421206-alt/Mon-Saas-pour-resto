const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const potrace = require("potrace");

const ROOT = path.join(__dirname, "..", "..");
/** Source raster interne (dev) — le logo public est logo.svg uniquement. */
const SRC = path.join(__dirname, "logo-source.png");
const OUT = path.join(ROOT, "assets", "images", "icone", "logo.svg");
const TMP = path.join(ROOT, "assets", "images", "icone", "_logo-data-trace.png");

const SIZE = 512;
const TRACE_SIZE = 1024;
const CORNER_RADIUS = 112;
const WHITE_THRESHOLD = 235;

function isWhite(r, g, b) {
  return r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD;
}

function isOrange(r, g, b, a) {
  return a > 20 && r > 200 && g > 90 && b < 90 && !isWhite(r, g, b);
}

function computePlacement(canvasSize, pngW, pngH) {
  const scale = Math.min(canvasSize / pngW, canvasSize / pngH);
  return {
    scale,
    offsetX: (canvasSize - pngW * scale) / 2,
    offsetY: (canvasSize - pngH * scale) / 2,
    drawW: pngW * scale,
    drawH: pngH * scale,
  };
}

function detectOrangeBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!isOrange(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function logoFrameFromBounds(bounds, placement) {
  return {
    x: placement.offsetX + bounds.minX * placement.scale,
    y: placement.offsetY + bounds.minY * placement.scale,
    width: bounds.width * placement.scale,
    height: bounds.height * placement.scale,
    rx: CORNER_RADIUS * ((bounds.width * placement.scale) / SIZE),
  };
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

function mapBox(box, fromPl, toPl) {
  const ratio = toPl.scale / fromPl.scale;
  return {
    minX: (box.minX - fromPl.offsetX) * ratio + toPl.offsetX,
    minY: (box.minY - fromPl.offsetY) * ratio + toPl.offsetY,
    maxX: (box.maxX - fromPl.offsetX) * ratio + toPl.offsetX,
    maxY: (box.maxY - fromPl.offsetY) * ratio + toPl.offsetY,
    cx: (box.cx - fromPl.offsetX) * ratio + toPl.offsetX,
    cy: (box.cy - fromPl.offsetY) * ratio + toPl.offsetY,
    width: box.width * ratio,
    height: box.height * ratio,
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

function transformPath(pathData, fromPl, toPl) {
  const ratio = toPl.scale / fromPl.scale;
  let axis = 0;

  return pathData.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (num) => {
    const value = Number(num);
    const mapped =
      axis % 2 === 0
        ? (value - fromPl.offsetX) * ratio + toPl.offsetX
        : (value - fromPl.offsetY) * ratio + toPl.offsetY;
    axis += 1;
    return String(Math.round(mapped * 100) / 100);
  });
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

function keepDataSubpath(subpath, frame) {
  const match = subpath.match(/^M\s*([-\d.]+)[,\s]+([-\d.]+)/i);
  if (!match) return false;
  const x = Number(match[1]);
  const y = Number(match[2]);
  const margin = Math.max(24, frame.width * 0.08);
  if (
    x < frame.x + margin ||
    y < frame.y + margin ||
    x > frame.x + frame.width - margin ||
    y > frame.y + frame.height - margin
  ) {
    return false;
  }
  if (y > frame.y + frame.height - margin * 2 && subpath.length < 260) {
    return false;
  }
  return subpath.length > 48;
}

function extractDataPaths(tracedSvg, tracePl, sizePl, frame) {
  const output = [];

  for (const match of tracedSvg.matchAll(/<path[^>]*d="([^"]+)"/gi)) {
    const mapped = transformPath(match[1], tracePl, sizePl);
    const subpaths = splitSubpaths(mapped).filter((subpath) =>
      keepDataSubpath(subpath, frame),
    );
    if (!subpaths.length) continue;
    output.push(`    <path d="${subpaths.join(" ")}" fill="#FFFFFF"/>`);
  }

  return output;
}

function roundFrame(frame) {
  return {
    x: Math.round(frame.x * 100) / 100,
    y: Math.round(frame.y * 100) / 100,
    width: Math.round(frame.width * 100) / 100,
    height: Math.round(frame.height * 100) / 100,
    rx: Math.round(frame.rx * 100) / 100,
  };
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(
      `Source introuvable : ${SRC}\n` +
        "Le logo public est logo.svg. Pour regénérer, placez une image source dans backend/scripts/logo-source.png.",
    );
    process.exit(1);
  }

  const meta = await sharp(SRC).metadata();
  const pngW = meta.width;
  const pngH = meta.height;

  const native = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const nativeBounds = detectOrangeBounds(native.data, pngW, pngH);
  const tracePl = computePlacement(TRACE_SIZE, pngW, pngH);
  const sizePl = computePlacement(SIZE, pngW, pngH);
  const frame = roundFrame(logoFrameFromBounds(nativeBounds, sizePl));

  const { data, info } = await sharp(SRC)
    .resize(TRACE_SIZE, TRACE_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
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
  const dataPaths = extractDataPaths(tracedSvg, tracePl, sizePl, frame);

  const finderShapes = [];
  for (const finder of [finderTL, finderTR, finderBL]) {
    if (finder) {
      finderShapes.push(...renderFinder(mapBox(finder, tracePl, sizePl), orange));
    }
  }

  const coverScale = Math.max(SIZE / frame.width, SIZE / frame.height);
  const coverTx =
    Math.round(((SIZE - frame.width * coverScale) / 2 - frame.x * coverScale) * 100) /
    100;
  const coverTy =
    Math.round(((SIZE - frame.height * coverScale) / 2 - frame.y * coverScale) * 100) /
    100;
  const coverScaleRounded = Math.round(coverScale * 10000) / 10000;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="AfricaMenu">
  <defs>
    <clipPath id="africamenu-logo-clip">
      <rect width="${SIZE}" height="${SIZE}" rx="${CORNER_RADIUS}"/>
    </clipPath>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="${CORNER_RADIUS}" fill="${orange}"/>
  <g clip-path="url(#africamenu-logo-clip)" fill="#FFFFFF" transform="translate(${coverTx} ${coverTy}) scale(${coverScaleRounded})">
    ${finderShapes.join("\n    ")}
    ${dataPaths.join("\n")}
  </g>
</svg>
`;

  fs.writeFileSync(OUT, svg, "utf8");
  fs.unlinkSync(TMP);
  console.log(
    `Logo SVG généré : ${OUT} (${svg.length} octets, orange ${orange}, cadre ${frame.width}x${frame.height}@${frame.x},${frame.y})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
