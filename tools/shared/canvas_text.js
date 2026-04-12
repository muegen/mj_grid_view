export function getFontString(style) {
  const fontStyle = style.fontStyle || "normal";
  const fontWeight = style.fontWeight || "400";
  const fontSize = style.fontSize || "12px";
  const fontFamily = style.fontFamily || "sans-serif";
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

export function lineHeightPx(style) {
  const fs = parseFloat(style.fontSize) || 12;
  const lh = style.lineHeight;
  if (!lh || lh === "normal") return fs * 1.2;
  const parsed = parseFloat(lh);
  if (String(lh).endsWith("px")) return parsed;
  return parsed * fs;
}

export function wrapTextToLines(ctx, text, maxWidth) {
  const normalized = String(text ?? "").trim();
  if (!normalized) return [];
  const max = Math.max(1, maxWidth);
  if (ctx.measureText(normalized).width <= max) return [normalized];

  const words = normalized.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= max) {
      line = test;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    if (ctx.measureText(word).width <= max) {
      line = word;
    } else {
      let chunk = "";
      for (const ch of word) {
        const t = chunk + ch;
        if (ctx.measureText(t).width <= max) {
          chunk = t;
        } else {
          if (chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            lines.push(ch);
          }
        }
      }
      line = chunk;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [normalized];
}

function normalizeTextAlign(style) {
  const ta = style.textAlign || "left";
  if (ta === "start") return "left";
  if (ta === "end") return "right";
  return ta;
}

/**
 * Draw text in a box with word wrapping to match CSS layout (fillText is single-line only).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {{ left: number, top: number, width: number, height: number }} box - canvas coordinates
 * @param {CSSStyleDeclaration} style
 * @param {{ colorFallback?: string }} [options]
 */
export function fillWrappedText(ctx, text, box, style, options = {}) {
  const { left, top, width, height } = box;
  const colorFallback = options.colorFallback ?? "#111";
  ctx.font = getFontString(style);
  ctx.fillStyle = style.color || colorFallback;
  ctx.textBaseline = "top";
  const maxWidth = Math.max(1, width);
  const lines = wrapTextToLines(ctx, text, maxWidth);
  if (!lines.length) return;
  const lh = lineHeightPx(style);
  const totalH = lines.length * lh;
  let y = top;
  const alignItems = style.alignItems || "";
  if (alignItems === "center" && Number.isFinite(height) && height > totalH) {
    y = top + (height - totalH) / 2;
  }
  let ta = normalizeTextAlign(style);
  if (
    (ta === "left" || style.textAlign === "start") &&
    style.display === "flex" &&
    style.justifyContent === "center"
  ) {
    ta = "center";
  }
  for (let i = 0; i < lines.length; i++) {
    let x = left;
    if (ta === "center") x = left + maxWidth / 2;
    else if (ta === "right") x = left + maxWidth;
    ctx.textAlign =
      ta === "center" ? "center" : ta === "right" ? "right" : "left";
    ctx.fillText(lines[i], x, y + i * lh);
  }
  ctx.textAlign = "left";
}
