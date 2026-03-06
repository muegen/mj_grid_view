import { createElement } from "./dom.js";

export function createZoomManager() {
  let preview = null;
  let paneMap = {};
  let lastHover = null;
  let config = null;
  let container = null;
  let keyListening = false;

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
      const label = createElement("div", "zoom-pane-label", side);
      const image = createElement(
        "div",
        "zoom-pane-image is-empty",
        "Missing job"
      );
      pane.appendChild(label);
      pane.appendChild(image);
      preview.appendChild(pane);
      paneMap[side] = { container: pane, label, image };
    });
    document.body.appendChild(preview);
  }

  function updateOrder() {
    if (!preview) return;
    const order = config?.getDisplayOrder?.() || getAllSides();
    order.forEach((side) => {
      const pane = paneMap[side]?.container;
      if (pane) preview.appendChild(pane);
    });
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

  function setConfig(nextConfig) {
    config = nextConfig;
    ensurePreview();
    updatePaneSize();
    updateOrder();
    updateVisibility();
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

    const paneSize = config?.getZoomSize?.() || 200;
    const rawSize = paneSize / zoomLevel;
    const boxWidth = Math.min(rawSize, width);
    const boxHeight = Math.min(rawSize, height);

    const clampedX = Math.min(Math.max(xRatio, 0), 1);
    const clampedY = Math.min(Math.max(yRatio, 0), 1);
    const centerX = clampedX * width;
    const centerY = clampedY * height;

    const left = Math.min(
      Math.max(centerX - boxWidth / 2, 0),
      width - boxWidth
    );
    const top = Math.min(
      Math.max(centerY - boxHeight / 2, 0),
      height - boxHeight
    );

    data.outline.style.width = `${boxWidth}px`;
    data.outline.style.height = `${boxHeight}px`;
    data.outline.style.left = `${left}px`;
    data.outline.style.top = `${top}px`;
    setOutlineVisibility(data, true);
  }

  function updateZoomPane(side, data, xRatio, yRatio, zoomLevel) {
    const pane = paneMap[side];
    if (!pane) return;

    pane.label.textContent = config?.getSideLabel?.(side) || side;

    if (!data || !data.img || data.img.dataset.loadError === "true") {
      const message =
        data && data.status === "error" ? "Image failed to load" : "Missing job";
      pane.image.classList.add("is-empty");
      pane.image.style.backgroundImage = "none";
      pane.image.textContent = message;
      return;
    }

    const rect = data.img.getBoundingClientRect();
    const paneRect = pane.image.getBoundingClientRect();
    const sourceWidth = rect.width || data.img.naturalWidth || 1;
    const sourceHeight = rect.height || data.img.naturalHeight || 1;

    const bgWidth = sourceWidth * zoomLevel;
    const bgHeight = sourceHeight * zoomLevel;

    const clampedX = Math.min(Math.max(xRatio, 0), 1);
    const clampedY = Math.min(Math.max(yRatio, 0), 1);

    const bgX = -(clampedX * bgWidth - paneRect.width / 2);
    const bgY = -(clampedY * bgHeight - paneRect.height / 2);

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
    hide,
    destroy,
  };
}
