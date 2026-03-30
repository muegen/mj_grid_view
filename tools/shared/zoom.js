import { createElement } from "./dom.js";

export function createZoomManager() {
  let preview = null;
  let paneMap = {};
  let lastHover = null;
  let lastCapture = null;
  let config = null;
  let container = null;
  let keyListening = false;
  let captureAspectOverride = null;
  let capturePaneSizeOverride = null;
  let captureInFlight = false;

  function getAllSides() {
    const sides = config?.getAllSides?.();
    return Array.isArray(sides) && sides.length ? sides : ["A", "B", "C"];
  }

  function ensurePreview() {
    if (preview) return;
    preview = createElement("div", "zoom-preview");
    paneMap = {};
    getAllSides().forEach((side) => {
      const pane = createElement("div", "zoom-pane");
      pane.dataset.side = side;
      const label = createElement("div", "zoom-pane-label");
      const labelText = createElement("span", "zoom-pane-label-text", side);
      const labelJob = createElement("span", "zoom-pane-label-job", "");
      label.appendChild(labelText);
      label.appendChild(labelJob);
      const image = createElement(
        "div",
        "zoom-pane-image is-empty",
        "Missing job"
      );
      pane.appendChild(label);
      pane.appendChild(image);
      preview.appendChild(pane);
      paneMap[side] = { container: pane, label, labelText, labelJob, image };
    });
    document.body.appendChild(preview);
  }

  function updateOrder() {
    if (!preview) return;
    const allSides = getAllSides();
    const desiredOrder = config?.getDisplayOrder?.() || allSides;
    const allowedSides = new Set(allSides);
    const seen = new Set();
    const finalOrder = [];

    desiredOrder.forEach((side) => {
      if (!allowedSides.has(side) || seen.has(side)) return;
      seen.add(side);
      finalOrder.push(side);
    });

    allSides.forEach((side) => {
      if (seen.has(side)) return;
      seen.add(side);
      finalOrder.push(side);
    });

    finalOrder.forEach((side) => {
      const pane = paneMap[side]?.container;
      if (pane) preview.appendChild(pane);
    });

    const actualOrder = Array.from(preview.querySelectorAll(".zoom-pane"))
      .map((pane) => pane.dataset.side)
      .filter(Boolean);
    if (actualOrder.join("|") !== finalOrder.join("|")) {
      console.warn("[zoom] Pane order mismatch.", {
        expected: finalOrder,
        actual: actualOrder,
      });
    }
  }

  function updateVisibility() {
    if (!preview || !config) return;
    const activeSides = new Set(config.getActiveSides?.() || getAllSides());
    Object.entries(paneMap).forEach(([side, pane]) => {
      if (!pane || !pane.container) return;
      pane.container.classList.toggle("is-hidden", !activeSides.has(side));
    });
  }

  function updatePaneSize() {
    if (!preview || !config) return;
    const size = config.getZoomSize?.();
    if (!size) return;
    preview.style.setProperty("--zoom-pane-size", `${size}px`);
  }

  function getPaneDimensions(data) {
    const paneWidth = Number.isFinite(capturePaneSizeOverride)
      ? capturePaneSizeOverride
      : config?.getZoomSize?.() || 200;
    if (Number.isFinite(captureAspectOverride) && captureAspectOverride > 0) {
      return {
        paneWidth,
        paneHeight: Math.max(1, paneWidth * captureAspectOverride),
      };
    }
    if (Number.isFinite(data?.aspect) && data.aspect > 0) {
      return {
        paneWidth,
        paneHeight: Math.max(1, paneWidth * data.aspect),
      };
    }
    if (!data || !data.img || data.img.dataset.loadError === "true") {
      return { paneWidth, paneHeight: paneWidth };
    }
    const sourceWidth = data.img.naturalWidth || data.img.clientWidth || 0;
    const sourceHeight = data.img.naturalHeight || data.img.clientHeight || 0;
    if (!sourceWidth || !sourceHeight) {
      return { paneWidth, paneHeight: paneWidth };
    }
    const aspect = sourceHeight / sourceWidth;
    return {
      paneWidth,
      paneHeight: Math.max(1, paneWidth * aspect),
    };
  }

  function getSourceDimensions(data) {
    if (!data?.img || data.img.dataset.loadError === "true") {
      return { sourceWidth: 0, sourceHeight: 0 };
    }
    return {
      sourceWidth: data.img.naturalWidth || data.img.clientWidth || 0,
      sourceHeight: data.img.naturalHeight || data.img.clientHeight || 0,
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getZoomGeometry(data, zoomLevel, viewportWidth, viewportHeight) {
    const safeViewportWidth = Math.max(1, viewportWidth || 0);
    const safeViewportHeight = Math.max(1, viewportHeight || 0);
    const safeZoomLevel =
      Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
    const { sourceWidth, sourceHeight } = getSourceDimensions(data);

    if (!sourceWidth || !sourceHeight) {
      return {
        sourceWidth,
        sourceHeight,
        fitScale: 1,
        baseWidth: safeViewportWidth,
        baseHeight: safeViewportHeight,
        scaledWidth: safeViewportWidth * safeZoomLevel,
        scaledHeight: safeViewportHeight * safeZoomLevel,
      };
    }

    const fitScale = Math.min(
      safeViewportWidth / sourceWidth,
      safeViewportHeight / sourceHeight
    );
    const baseWidth = sourceWidth * fitScale;
    const baseHeight = sourceHeight * fitScale;

    return {
      sourceWidth,
      sourceHeight,
      fitScale,
      baseWidth,
      baseHeight,
      scaledWidth: baseWidth * safeZoomLevel,
      scaledHeight: baseHeight * safeZoomLevel,
    };
  }

  function getJobIdDisplay(data) {
    const jobId = data?.jobId || "";
    if (!jobId) return "";
    const pairId = data?.pairId || data?.img?.dataset?.pairId || "";
    const match = pairId.match(/-img-(\d+)$/);
    if (!match) return jobId;
    const index = Number.parseInt(match[1], 10);
    if (!Number.isFinite(index)) return jobId;
    return `${jobId}_${index + 1}`;
  }

  function parsePixelValue(value, fallback = 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function parseCssLength(token, base) {
    if (!token) return base;
    if (token.endsWith("%")) {
      const percent = Number.parseFloat(token);
      return Number.isFinite(percent) ? (base * percent) / 100 : base;
    }
    if (token.endsWith("px")) {
      return parsePixelValue(token, base);
    }
    if (token === "auto") return base;
    const parsed = Number.parseFloat(token);
    return Number.isFinite(parsed) ? parsed : base;
  }

  function parseBackgroundSize(value, width, height) {
    if (!value || value === "cover" || value === "contain") {
      return { width, height };
    }
    const parts = value.split(/\s+/).filter(Boolean);
    if (!parts.length) return { width, height };
    const bgWidth = parseCssLength(parts[0], width);
    const bgHeight = parts[1] ? parseCssLength(parts[1], height) : height;
    return { width: bgWidth, height: bgHeight };
  }

  function parsePositionToken(token, size, bgSize) {
    if (!token || token === "center") return (size - bgSize) / 2;
    if (token === "left" || token === "top") return 0;
    if (token === "right" || token === "bottom") return size - bgSize;
    if (token.endsWith("%")) {
      const percent = Number.parseFloat(token);
      return Number.isFinite(percent) ? (size - bgSize) * (percent / 100) : 0;
    }
    if (token.endsWith("px")) {
      return parsePixelValue(token, 0);
    }
    const parsed = Number.parseFloat(token);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseBackgroundPosition(value, width, height, bgWidth, bgHeight) {
    if (!value) return { x: 0, y: 0 };
    const parts = value.split(/\s+/).filter(Boolean);
    const xToken = parts[0] || "center";
    const yToken = parts[1] || "center";
    return {
      x: parsePositionToken(xToken, width, bgWidth),
      y: parsePositionToken(yToken, height, bgHeight),
    };
  }

  function parseBackgroundUrl(value) {
    if (!value || value === "none") return "";
    const match = value.match(/url\(["']?(.*?)["']?\)/);
    return match ? match[1] : "";
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function isCaptureDebugEnabled() {
    try {
      return (
        window.__MJ_DEBUG_CAPTURE__ === true ||
        window.localStorage?.getItem("mj-debug-capture") === "1"
      );
    } catch (error) {
      return window.__MJ_DEBUG_CAPTURE__ === true;
    }
  }

  function logCaptureDebug(stage, payload) {
    if (!isCaptureDebugEnabled()) return;
    console.info("[zoom capture] " + stage, payload);
  }

  function buildRoundedRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
    ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
    ctx.arcTo(x, y + height, x, y, safeRadius);
    ctx.arcTo(x, y, x + width, y, safeRadius);
    ctx.closePath();
  }

  function fillRoundedRect(ctx, x, y, width, height, radius, color) {
    if (!color) return;
    buildRoundedRectPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function strokeRoundedRect(ctx, x, y, width, height, radius, color, lineWidth) {
    if (!color || !lineWidth) return;
    buildRoundedRectPath(ctx, x, y, width, height, radius);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function getFontString(style) {
    const fontStyle = style.fontStyle || "normal";
    const fontWeight = style.fontWeight || "400";
    const fontSize = style.fontSize || "12px";
    const fontFamily = style.fontFamily || "sans-serif";
    return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
  }

  function setConfig(nextConfig) {
    config = nextConfig;
    ensurePreview();
    updatePaneSize();
    updateOrder();
    updateVisibility();
  }

  function setCaptureState(state) {
    if (!preview) return;
    preview.classList.toggle("is-capturing", state === "capturing");
    preview.classList.toggle("is-captured", state === "done");
    preview.classList.toggle("is-capture-error", state === "error");
  }

  function setOutlineVisibility(data, visible) {
    if (!data || !data.outline) return;
    data.outline.classList.toggle("visible", Boolean(visible));
  }

  function hideAllOutlines(registry) {
    if (!registry) return;
    registry.forEach((pair) => {
      if (!pair) return;
      Object.values(pair).forEach((data) => {
        setOutlineVisibility(data, false);
      });
    });
  }

  function updateZoomOutline(data, xRatio, yRatio, zoomLevel) {
    if (
      !data ||
      !data.img ||
      data.status !== "ok" ||
      data.img.dataset.loadError === "true"
    ) {
      setOutlineVisibility(data, false);
      return;
    }

    const width = data.img.clientWidth || data.img.naturalWidth || 0;
    const height = data.img.clientHeight || data.img.naturalHeight || 0;
    if (!width || !height) {
      setOutlineVisibility(data, false);
      return;
    }

    const { paneWidth, paneHeight } = getPaneDimensions(data);
    const { sourceWidth, sourceHeight, fitScale } = getZoomGeometry(
      data,
      zoomLevel,
      paneWidth,
      paneHeight
    );
    if (!sourceWidth || !sourceHeight || !fitScale) {
      setOutlineVisibility(data, false);
      return;
    }

    const level = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
    const sourceWindowWidth = paneWidth / (fitScale * level);
    const sourceWindowHeight = paneHeight / (fitScale * level);
    const displayScaleX = width / sourceWidth;
    const displayScaleY = height / sourceHeight;
    const boxWidth = Math.min(sourceWindowWidth * displayScaleX, width);
    const boxHeight = Math.min(sourceWindowHeight * displayScaleY, height);

    const clampedX = clamp(xRatio, 0, 1);
    const clampedY = clamp(yRatio, 0, 1);
    const centerX = clampedX * width;
    const centerY = clampedY * height;

    const left = clamp(centerX - boxWidth / 2, 0, width - boxWidth);
    const top = clamp(centerY - boxHeight / 2, 0, height - boxHeight);

    data.outline.style.width = `${boxWidth}px`;
    data.outline.style.height = `${boxHeight}px`;
    data.outline.style.left = `${left}px`;
    data.outline.style.top = `${top}px`;
    setOutlineVisibility(data, true);
  }

  function updateZoomPane(side, data, xRatio, yRatio, zoomLevel) {
    const pane = paneMap[side];
    if (!pane) return;

    if (pane.labelText) {
      pane.labelText.textContent = config?.getSideLabel?.(side) || side;
    } else {
      pane.label.textContent = config?.getSideLabel?.(side) || side;
    }
    if (pane.labelJob) {
      pane.labelJob.textContent = getJobIdDisplay(data);
    }

    const { paneWidth, paneHeight } = getPaneDimensions(data);
    pane.image.style.height = `${paneHeight}px`;

    if (!data || !data.img || data.img.dataset.loadError === "true") {
      const message =
        data && data.status === "error" ? "Image failed to load" : "Missing job";
      pane.image.classList.add("is-empty");
      pane.image.style.backgroundImage = "none";
      pane.image.textContent = message;
      return;
    }

    const paneRect = pane.image.getBoundingClientRect();
    const viewportWidth = Math.max(1, paneRect.width || paneWidth);
    const viewportHeight = Math.max(1, paneRect.height || paneHeight);
    const level = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
    const { scaledWidth: bgWidth, scaledHeight: bgHeight } = getZoomGeometry(
      data,
      level,
      viewportWidth,
      viewportHeight
    );
    const clampedX = clamp(xRatio, 0, 1);
    const clampedY = clamp(yRatio, 0, 1);
    const bgX =
      bgWidth <= viewportWidth
        ? (viewportWidth - bgWidth) / 2
        : clamp(
            viewportWidth / 2 - clampedX * bgWidth,
            viewportWidth - bgWidth,
            0
          );
    const bgY =
      bgHeight <= viewportHeight
        ? (viewportHeight - bgHeight) / 2
        : clamp(
            viewportHeight / 2 - clampedY * bgHeight,
            viewportHeight - bgHeight,
            0
          );

    pane.image.classList.remove("is-empty");
    pane.image.textContent = "";
    pane.image.style.backgroundImage = `url("${data.url}")`;
    pane.image.style.backgroundSize = `${bgWidth}px ${bgHeight}px`;
    pane.image.style.backgroundPosition = `${bgX}px ${bgY}px`;
  }

  function positionZoomPreview(clientY, pair, hoveredImg) {
    if (!preview) return;
    const offset = 16;
    const rect = preview.getBoundingClientRect();
    let centerX = window.innerWidth / 2;

    if (pair && config?.getActiveSides) {
      const rects = config
        .getActiveSides()
        .map((side) => pair[side]?.img?.getBoundingClientRect())
        .filter(Boolean);
      if (rects.length) {
        const leftEdge = Math.min(...rects.map((rectItem) => rectItem.left));
        const rightEdge = Math.max(...rects.map((rectItem) => rectItem.right));
        centerX = (leftEdge + rightEdge) / 2;
      }
    } else if (hoveredImg) {
      const rectImg = hoveredImg.getBoundingClientRect();
      centerX = (rectImg.left + rectImg.right) / 2;
    }

    let left = centerX - rect.width / 2;
    let top = clientY + offset;

    if (top + rect.height > window.innerHeight) {
      top = clientY - rect.height - offset;
    }

    left = Math.max(12, Math.min(left, window.innerWidth - rect.width - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - rect.height - 12));

    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
  }

  function showZoomForImage(img, clientX, clientY, shiftKey) {
    if (!img || !img.dataset.pairId) return;
    if (!config?.shouldZoom?.(shiftKey)) {
      hide();
      return;
    }

    const registry = config?.getRegistry?.();
    if (!registry) return;
    const pair = registry.get(img.dataset.pairId);
    if (!pair) {
      hide();
      return;
    }

    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      hide();
      return;
    }

    const xRatio = (clientX - rect.left) / rect.width;
    const yRatio = (clientY - rect.top) / rect.height;
    const zoomLevel = config?.getZoomLevel?.() || 3;

    config?.getActiveSides?.().forEach((side) => {
      const data = pair[side];
      updateZoomPane(side, data, xRatio, yRatio, zoomLevel);
      updateZoomOutline(data, xRatio, yRatio, zoomLevel);
    });

    preview.classList.add("visible");
    positionZoomPreview(clientY, pair, img);
  }

  function hide() {
    if (!preview) return;
    preview.classList.remove("visible");
    hideAllOutlines(config?.getRegistry?.());
  }

  function handleZoomMove(event) {
    const target = event.target instanceof Element ? event.target : null;
    const img = target ? target.closest("img") : null;
    if (!img || !container || !container.contains(img)) {
      lastHover = null;
      hide();
      return;
    }

    lastHover = {
      img,
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
    };
    lastCapture = { ...lastHover };
    showZoomForImage(img, event.clientX, event.clientY, event.shiftKey);
  }

  function handleZoomLeave() {
    lastHover = null;
    hide();
  }

  function handleZoomKeyChange(event) {
    if (!lastHover) return;
    showZoomForImage(
      lastHover.img,
      lastHover.clientX,
      lastHover.clientY,
      event.shiftKey
    );
  }

  function attach(nextContainer) {
    ensurePreview();
    if (!nextContainer) return;
    if (container) detach();
    container = nextContainer;
    container.addEventListener("mousemove", handleZoomMove);
    container.addEventListener("mouseleave", handleZoomLeave);
    if (!keyListening) {
      document.addEventListener("keydown", handleZoomKeyChange);
      document.addEventListener("keyup", handleZoomKeyChange);
      keyListening = true;
    }
  }

  function detach() {
    if (container) {
      container.removeEventListener("mousemove", handleZoomMove);
      container.removeEventListener("mouseleave", handleZoomLeave);
      container = null;
    }
    if (keyListening) {
      document.removeEventListener("keydown", handleZoomKeyChange);
      document.removeEventListener("keyup", handleZoomKeyChange);
      keyListening = false;
    }
    hide();
  }

  function refresh() {
    if (!lastHover) return;
    showZoomForImage(
      lastHover.img,
      lastHover.clientX,
      lastHover.clientY,
      lastHover.shiftKey
    );
  }

  function renderPairPreview(pair, xRatio, yRatio, zoomLevel) {
    if (!pair || !config) return false;
    updateOrder();
    updateVisibility();
    const level = Number.isFinite(zoomLevel)
      ? zoomLevel
      : config?.getZoomLevel?.() || 3;
    const activeSides = config?.getActiveSides?.() || getAllSides();
    activeSides.forEach((side) => {
      updateZoomPane(side, pair[side], xRatio, yRatio, level);
    });
    return true;
  }

  function resolveAspectOverride(pair) {
    if (!pair) return null;
    const order =
      config?.getDisplayOrder?.() ||
      config?.getActiveSides?.() ||
      Object.keys(pair);
    const seen = new Set();
    const orderedEntries = [];
    order.forEach((side) => {
      const entry = pair[side];
      if (entry && !seen.has(entry)) {
        seen.add(entry);
        orderedEntries.push(entry);
      }
    });
    const entries = orderedEntries.length
      ? orderedEntries
      : Object.values(pair).filter(Boolean);
    for (const entry of entries) {
      if (Number.isFinite(entry?.aspect) && entry.aspect > 0) {
        return entry.aspect;
      }
      const img = entry?.img;
      if (img && img.naturalWidth && img.naturalHeight) {
        return img.naturalHeight / img.naturalWidth;
      }
    }
    return null;
  }

  async function capture(options = {}) {
    if (!preview || !config) return { ok: false, reason: "unavailable" };
    if (captureInFlight) return { ok: false, reason: "busy" };
    captureInFlight = true;
    const { pair, xRatio = 0.5, yRatio = 0.5, zoomLevel } = options || {};
    const wasVisible = preview.classList.contains("visible");
    const hasAspectOverride = Object.prototype.hasOwnProperty.call(
      options,
      "aspectOverride"
    );
    const nextAspectOverride = hasAspectOverride
      ? Number.isFinite(options.aspectOverride) && options.aspectOverride > 0
        ? options.aspectOverride
        : null
      : resolveAspectOverride(pair);
    const paneSizeOverride =
      Number.isFinite(options.paneSize) && options.paneSize > 0
        ? options.paneSize
        : null;
    const priorPaneSize = preview.style.getPropertyValue("--zoom-pane-size");
    const priorInlineStyles = {
      transition: preview.style.transition,
      transform: preview.style.transform,
      opacity: preview.style.opacity,
      visibility: preview.style.visibility,
    };

    try {
      if (pair) {
        captureAspectOverride = nextAspectOverride;
        capturePaneSizeOverride = paneSizeOverride;
        if (paneSizeOverride) {
          preview.style.setProperty("--zoom-pane-size", `${paneSizeOverride}px`);
        }
        const rendered = renderPairPreview(pair, xRatio, yRatio, zoomLevel);
        if (!rendered) return { ok: false, reason: "missing" };
        if (!wasVisible) preview.classList.add("visible");
      } else {
        if (!lastCapture) return { ok: false, reason: "no-hover" };
        showZoomForImage(
          lastCapture.img,
          lastCapture.clientX,
          lastCapture.clientY,
          lastCapture.shiftKey
        );

        if (!preview.classList.contains("visible")) {
          return { ok: false, reason: "hidden" };
        }
      }

      preview.style.transition = "none";
      preview.style.transform = "none";
      preview.style.opacity = "1";
      preview.style.visibility = "visible";
      await nextFrame();
      await nextFrame();

      const rect = preview.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return { ok: false, reason: "empty" };
      }

      const scale = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return { ok: false, reason: "no-context" };
      ctx.scale(scale, scale);

      const previewStyle = window.getComputedStyle(preview);
      logCaptureDebug("preview-layout", {
        pairMode: Boolean(pair),
        wasVisible,
        aspectOverride: nextAspectOverride,
        paneSizeOverride,
        scale,
        previewRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        computedTransform: previewStyle.transform,
        className: preview.className,
      });
      const previewRadius = parsePixelValue(previewStyle.borderRadius);
      const previewBorderWidth = parsePixelValue(previewStyle.borderWidth);
      const previewBorderColor = previewStyle.borderColor || "#000";
      const previewBackground = previewStyle.backgroundColor || "#fff";

      fillRoundedRect(ctx, 0, 0, rect.width, rect.height, previewRadius, previewBackground);
      strokeRoundedRect(
        ctx,
        0,
        0,
        rect.width,
        rect.height,
        previewRadius,
        previewBorderColor,
        previewBorderWidth
      );

      const panes = Array.from(preview.querySelectorAll(".zoom-pane")).filter(
        (pane) => !pane.classList.contains("is-hidden")
      );
      const paneDebug = [];
      const imageCache = new Map();
      const warnings = new Set();

      const loadImage = (url) => {
        if (imageCache.has(url)) return imageCache.get(url);
        const promise = new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Image failed to load"));
          img.src = url;
        });
        imageCache.set(url, promise);
        return promise;
      };

      for (const pane of panes) {
        const label = pane.querySelector(".zoom-pane-label");
        if (label) {
          const labelRect = label.getBoundingClientRect();
          const labelText = label.querySelector(".zoom-pane-label-text");
          const labelJob = label.querySelector(".zoom-pane-label-job");
          if (labelText) {
            const labelStyle = window.getComputedStyle(labelText);
            ctx.font = getFontString(labelStyle);
            ctx.fillStyle = labelStyle.color || "#000";
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            ctx.fillText(
              labelText.textContent || "",
              labelRect.left - rect.left,
              labelRect.top - rect.top
            );
          } else {
            const labelStyle = window.getComputedStyle(label);
            ctx.font = getFontString(labelStyle);
            ctx.fillStyle = labelStyle.color || "#000";
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            ctx.fillText(
              label.textContent || "",
              labelRect.left - rect.left,
              labelRect.top - rect.top
            );
          }
          if (labelJob) {
            const jobText = (labelJob.textContent || "").trim();
            if (jobText) {
              const jobStyle = window.getComputedStyle(labelJob);
              ctx.font = getFontString(jobStyle);
              ctx.fillStyle = jobStyle.color || "#000";
              ctx.textBaseline = "top";
              ctx.textAlign = "right";
              ctx.fillText(
                jobText,
                labelRect.right - rect.left,
                labelRect.top - rect.top
              );
            }
          }
        }

        const imageEl = pane.querySelector(".zoom-pane-image");
        if (!imageEl) continue;
        const imageRect = imageEl.getBoundingClientRect();
        const imageStyle = window.getComputedStyle(imageEl);
        const imageRadius = parsePixelValue(imageStyle.borderRadius);
        const imageX = imageRect.left - rect.left;
        const imageY = imageRect.top - rect.top;
        const imageWidth = imageRect.width;
        const imageHeight = imageRect.height;
        paneDebug.push({
          side: pane.dataset.side || "",
          imageRect: {
            left: imageRect.left,
            top: imageRect.top,
            width: imageWidth,
            height: imageHeight,
          },
          styleHeight: imageEl.style.height,
          backgroundSize: imageStyle.backgroundSize,
          backgroundPosition: imageStyle.backgroundPosition,
          backgroundImage: imageStyle.backgroundImage,
          text: (imageEl.textContent || "").trim(),
          isEmpty: imageEl.classList.contains("is-empty"),
        });

        fillRoundedRect(
          ctx,
          imageX,
          imageY,
          imageWidth,
          imageHeight,
          imageRadius,
          imageStyle.backgroundColor || "#eef1f6"
        );

        const textValue = (imageEl.textContent || "").trim();
        const isEmpty = imageEl.classList.contains("is-empty");
        const bgUrl = parseBackgroundUrl(imageStyle.backgroundImage);

        if (!bgUrl || isEmpty) {
          if (textValue) {
            ctx.font = getFontString(imageStyle);
            ctx.fillStyle = imageStyle.color || "#666";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
              textValue,
              imageX + imageWidth / 2,
              imageY + imageHeight / 2
            );
          }
          continue;
        }

        let image;
        try {
          image = await loadImage(bgUrl);
        } catch (error) {
          warnings.add("image-load");
          continue;
        }

        const { width: bgWidth, height: bgHeight } = parseBackgroundSize(
          imageStyle.backgroundSize,
          imageWidth,
          imageHeight
        );
        const { x: bgX, y: bgY } = parseBackgroundPosition(
          imageStyle.backgroundPosition,
          imageWidth,
          imageHeight,
          bgWidth,
          bgHeight
        );

        ctx.save();
        buildRoundedRectPath(ctx, imageX, imageY, imageWidth, imageHeight, imageRadius);
        ctx.clip();
        ctx.drawImage(image, imageX + bgX, imageY + bgY, bgWidth, bgHeight);
        ctx.restore();
      }

      logCaptureDebug("pane-layout", paneDebug);

      let blob = null;
      try {
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );
      } catch (error) {
        return { ok: false, reason: "tainted" };
      }

      if (!blob) return { ok: false, reason: "export-failed" };

      return {
        ok: true,
        blob,
        warnings: Array.from(warnings),
      };
    } finally {
      captureAspectOverride = null;
      capturePaneSizeOverride = null;
      preview.style.transition = priorInlineStyles.transition;
      preview.style.transform = priorInlineStyles.transform;
      preview.style.opacity = priorInlineStyles.opacity;
      preview.style.visibility = priorInlineStyles.visibility;
      preview.style.setProperty("--zoom-pane-size", priorPaneSize);
      if (pair && !wasVisible) preview.classList.remove("visible");
      captureInFlight = false;
    }
  }

  function destroy() {
    detach();
    if (preview) {
      preview.remove();
      preview = null;
      paneMap = {};
    }
  }

  return {
    setConfig,
    attach,
    detach,
    updateOrder,
    updateVisibility,
    updatePaneSize,
    refresh,
    setCaptureState,
    capture,
    hide,
    destroy,
  };
}
