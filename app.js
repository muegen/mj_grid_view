const viewModeSelect = document.getElementById("viewMode");
const columnCountSelect = document.getElementById("columnCount");
const renderBtn = document.getElementById("renderBtn");
const clearBtn = document.getElementById("clearBtn");
const labelAInput = document.getElementById("labelA");
const labelBInput = document.getElementById("labelB");
const labelCInput = document.getElementById("labelC");
const jobsAInput = document.getElementById("jobsA");
const jobsBInput = document.getElementById("jobsB");
const jobsCInput = document.getElementById("jobsC");
const statusEl = document.getElementById("status");
const comparisonsEl = document.getElementById("comparisons");
const zoomLevelSelect = document.getElementById("zoomLevel");
const zoomSizeSelect = document.getElementById("zoomSize");
const zoomEnabledInput = document.getElementById("zoomEnabled");
const zoomRequiresShiftInput = document.getElementById("zoomRequiresShift");
const shareBtn = document.getElementById("shareBtn");
const prevPairBtn = document.getElementById("prevPairBtn");
const nextPairBtn = document.getElementById("nextPairBtn");
const pairIndicatorEl = document.getElementById("pairIndicator");
const shareStatusEl = document.getElementById("shareStatus");
const toTopBtn = document.getElementById("toTopBtn");
const inputCardC = document.getElementById("inputCardC");

const IMAGE_COUNT = 4;
const pairRegistry = new Map();
const zoomPaneMap = { A: null, B: null, C: null };
const SIDE_CONFIG = {
  A: { labelInput: labelAInput, jobsInput: jobsAInput },
  B: { labelInput: labelBInput, jobsInput: jobsBInput },
  C: { labelInput: labelCInput, jobsInput: jobsCInput },
};
let zoomPreview = null;
let lastHover = null;
let pairCards = [];
let currentPairIndex = -1;
let shareStatusTimer = null;
let saveTimer = null;
let renderTimer = null;

const PLACEHOLDER_MESSAGES = {
  missing: "Missing job",
  error: "Image failed to load",
  empty: "Paste job IDs to start comparing",
};

function extractJobId(token) {
  if (!token) return null;
  let value = token.trim();
  if (!value) return null;

  const urlMatch = value.match(/cdn\.midjourney\.com\/([^/?#\s]+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  if (value.includes("/")) {
    value = value.split("/")[0];
  }

  value = value.split("?")[0].split("#")[0];
  return value || null;
}

function parseJobIds(raw) {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map(extractJobId)
    .filter(Boolean);
}

function getSelectedColumnCount() {
  if (!columnCountSelect) return 2;
  const value = Number.parseInt(columnCountSelect.value, 10);
  return value === 3 ? 3 : 2;
}

function getActiveSides() {
  return getSelectedColumnCount() === 3 ? ["A", "B", "C"] : ["A", "B"];
}

function getLabelForSide(side) {
  const input = SIDE_CONFIG[side]?.labelInput;
  if (!input) return side;
  return input.value.trim() || side;
}

function getJobIdsForSide(side) {
  const input = SIDE_CONFIG[side]?.jobsInput;
  return parseJobIds(input ? input.value : "");
}

function getActiveSideData() {
  return getActiveSides().map((side) => ({
    side,
    label: getLabelForSide(side),
    jobIds: getJobIdsForSide(side),
  }));
}

function getEffectiveMode(jobIdsBySide) {
  const selected = viewModeSelect.value;
  if (selected !== "auto") return selected;
  return jobIdsBySide.some((ids) => ids.length <= 1) ? "individual" : "grid";
}

function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

function createPlaceholder(message) {
  return createElement("div", "placeholder", message);
}

function registerPairImage(pairId, side, data) {
  if (!pairId || !side) return;
  if (!pairRegistry.has(pairId)) {
    pairRegistry.set(pairId, {});
  }
  const entry = pairRegistry.get(pairId);
  entry[side] = data;
}

function createZoomPreview() {
  const preview = createElement("div", "zoom-preview");
  ["A", "B", "C"].forEach((side) => {
    const pane = createElement("div", "zoom-pane");
    const label = createElement("div", "zoom-pane-label", side);
    const image = createElement(
      "div",
      "zoom-pane-image is-empty",
      PLACEHOLDER_MESSAGES.missing
    );
    pane.appendChild(label);
    pane.appendChild(image);
    preview.appendChild(pane);
    zoomPaneMap[side] = { container: pane, label, image };
  });
  return preview;
}

function updateZoomPreviewVisibility() {
  const activeSides = new Set(getActiveSides());
  Object.entries(zoomPaneMap).forEach(([side, pane]) => {
    if (!pane || !pane.container) return;
    pane.container.classList.toggle("is-hidden", !activeSides.has(side));
  });
}

function updateColumnVisibility() {
  const showThird = getSelectedColumnCount() === 3;
  if (inputCardC) {
    inputCardC.classList.toggle("is-hidden", !showThird);
    inputCardC.hidden = !showThird;
    inputCardC.setAttribute("aria-hidden", (!showThird).toString());
  }
  updateZoomPreviewVisibility();
}

function createImageFrame({ url, altText, pairId, side, jobId }) {
  const frame = createElement("div", "image-frame");
  if (!url) {
    registerPairImage(pairId, side, {
      img: null,
      url: "",
      jobId,
      status: "missing",
      outline: null,
    });
    frame.appendChild(createPlaceholder(PLACEHOLDER_MESSAGES.missing));
    return frame;
  }

  const img = new Image();
  img.src = url;
  img.alt = altText;
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.dataset.pairId = pairId;
  img.dataset.side = side;
  img.dataset.jobId = jobId;

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.appendChild(img);

  const wrapper = createElement("div", "image-wrap");
  const outline = createElement("div", "zoom-outline");
  wrapper.appendChild(link);
  wrapper.appendChild(outline);

  registerPairImage(pairId, side, {
    img,
    url,
    jobId,
    status: "ok",
    outline,
  });

  img.addEventListener("error", () => {
    img.dataset.loadError = "true";
    const entry = pairRegistry.get(pairId);
    if (entry && entry[side]) {
      entry[side].status = "error";
      if (entry[side].outline) {
        entry[side].outline.classList.remove("visible");
      }
    }
    frame.innerHTML = "";
    frame.appendChild(createPlaceholder(PLACEHOLDER_MESSAGES.error));
  });

  frame.appendChild(wrapper);
  return frame;
}

function getState() {
  return {
    columnCount: columnCountSelect ? columnCountSelect.value : "2",
    labelA: labelAInput.value,
    labelB: labelBInput.value,
    labelC: labelCInput ? labelCInput.value : "",
    jobsA: jobsAInput.value,
    jobsB: jobsBInput.value,
    jobsC: jobsCInput ? jobsCInput.value : "",
    viewMode: viewModeSelect.value,
    zoomLevel: zoomLevelSelect.value,
    zoomSize: zoomSizeSelect.value,
    zoomEnabled: zoomEnabledInput.checked,
    zoomRequiresShift: zoomRequiresShiftInput.checked,
  };
}

function applyState(state) {
  if (!state) return;
  if (state.columnCount && columnCountSelect) {
    columnCountSelect.value = state.columnCount;
  }
  if (state.labelA !== undefined) labelAInput.value = state.labelA;
  if (state.labelB !== undefined) labelBInput.value = state.labelB;
  if (state.labelC !== undefined && labelCInput) labelCInput.value = state.labelC;
  if (state.jobsA !== undefined) jobsAInput.value = state.jobsA;
  if (state.jobsB !== undefined) jobsBInput.value = state.jobsB;
  if (state.jobsC !== undefined && jobsCInput) jobsCInput.value = state.jobsC;
  if (state.viewMode) viewModeSelect.value = state.viewMode;
  if (state.zoomLevel) zoomLevelSelect.value = state.zoomLevel;
  if (state.zoomSize) zoomSizeSelect.value = state.zoomSize;
  if (typeof state.zoomEnabled === "boolean") {
    zoomEnabledInput.checked = state.zoomEnabled;
  }
  if (typeof state.zoomRequiresShift === "boolean") {
    zoomRequiresShiftInput.checked = state.zoomRequiresShift;
  }
}

function saveState() {
  try {
    const state = getState();
    localStorage.setItem("mj-grid-compare-state", JSON.stringify(state));
  } catch (error) {
    // Ignore storage failures (private mode, disabled, etc).
  }
}

function scheduleSave() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveState, 200);
}

function scheduleRender() {
  if (renderTimer) window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderComparisons, 200);
}

function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem("mj-grid-compare-state");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function parseStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const keys = ["a", "b", "c", "la", "lb", "lc", "cols", "vm", "zl", "zs", "ze", "zk"];
  const hasAny = keys.some((key) => params.has(key));
  if (!hasAny) return null;

  return {
    jobsA: params.get("a") ?? "",
    jobsB: params.get("b") ?? "",
    jobsC: params.get("c") ?? "",
    labelA: params.get("la") ?? "",
    labelB: params.get("lb") ?? "",
    labelC: params.get("lc") ?? "",
    columnCount: params.get("cols") || (columnCountSelect ? columnCountSelect.value : "2"),
    viewMode: params.get("vm") || viewModeSelect.value,
    zoomLevel: params.get("zl") || zoomLevelSelect.value,
    zoomSize: params.get("zs") || zoomSizeSelect.value,
    zoomEnabled:
      params.get("ze") !== null
        ? params.get("ze") !== "0"
        : zoomEnabledInput.checked,
    zoomRequiresShift:
      params.get("zk") !== null
        ? params.get("zk") !== "0"
        : zoomRequiresShiftInput.checked,
  };
}

function getBaseUrl() {
  const href = window.location.href.split("?")[0];
  if (window.location.origin && window.location.origin !== "null") {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return href;
}

function buildShareUrl() {
  const state = getState();
  const params = new URLSearchParams();

  if (state.jobsA) params.set("a", state.jobsA.trim());
  if (state.jobsB) params.set("b", state.jobsB.trim());
  if (state.columnCount === "3" && state.jobsC) {
    params.set("c", state.jobsC.trim());
  }
  if (state.labelA) params.set("la", state.labelA.trim());
  if (state.labelB) params.set("lb", state.labelB.trim());
  if (state.columnCount === "3" && state.labelC) {
    params.set("lc", state.labelC.trim());
  }
  params.set("cols", state.columnCount || "2");
  params.set("vm", state.viewMode);
  params.set("zl", state.zoomLevel);
  params.set("zs", state.zoomSize);
  params.set("ze", state.zoomEnabled ? "1" : "0");
  params.set("zk", state.zoomRequiresShift ? "1" : "0");

  return `${getBaseUrl()}?${params.toString()}`;
}

function showShareStatus(message, isError = false) {
  if (!shareStatusEl) return;
  if (shareStatusTimer) window.clearTimeout(shareStatusTimer);
  shareStatusEl.textContent = message;
  shareStatusEl.classList.toggle("is-error", Boolean(isError));
  shareStatusTimer = window.setTimeout(() => {
    shareStatusEl.textContent = "";
    shareStatusEl.classList.remove("is-error");
  }, 2000);
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (error) {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

async function copyShareLink() {
  const link = buildShareUrl();
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(link);
      showShareStatus("Share link copied.");
      return;
    }
    if (fallbackCopyText(link)) {
      showShareStatus("Share link copied.");
      return;
    }
    throw new Error("Clipboard unavailable");
  } catch (error) {
    showShareStatus("Copy failed. Link in console.", true);
    console.info("Share link:", link);
  }
}

function updateStatus() {
  const sideData = getActiveSideData();
  const jobCounts = sideData.map((entry) => entry.jobIds.length);
  const mode = getEffectiveMode(sideData.map((entry) => entry.jobIds));
  const pairCount = Math.max(0, ...jobCounts);

  if (pairCount === 0) {
    statusEl.textContent = PLACEHOLDER_MESSAGES.empty;
    return;
  }

  const modeLabel = mode === "grid" ? "Grid" : "Individual";
  const mismatch = jobCounts.some((count) => count !== jobCounts[0])
    ? "Counts differ; unmatched jobs will show as missing."
    : "";
  const countLabel = sideData
    .map((entry) => `${entry.side}: ${entry.jobIds.length} job(s)`)
    .join(" | ");

  statusEl.textContent = `${countLabel} | Mode: ${modeLabel}. ${mismatch}`.trim();
}

function isEditableTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function updatePairIndicator() {
  if (!pairIndicatorEl) return;
  if (!pairCards.length || currentPairIndex < 0) {
    pairIndicatorEl.textContent = "Pair 0 of 0";
    return;
  }
  pairIndicatorEl.textContent = `Pair ${currentPairIndex + 1} of ${pairCards.length}`;
}

function updatePairControls() {
  if (!prevPairBtn || !nextPairBtn) return;
  const hasPairs = pairCards.length > 0;
  prevPairBtn.disabled = !hasPairs || currentPairIndex <= 0;
  nextPairBtn.disabled =
    !hasPairs || currentPairIndex >= pairCards.length - 1;
}

function getStickyOffset() {
  const controls = document.querySelector(".controls");
  if (!controls) return 0;
  const rect = controls.getBoundingClientRect();
  const style = window.getComputedStyle(controls);
  const top = Number.parseFloat(style.top) || 0;
  const marginBottom = Number.parseFloat(style.marginBottom) || 0;
  return rect.height + top + marginBottom + 8;
}

function setActivePair(index, scrollIntoView = true) {
  if (!pairCards.length) {
    currentPairIndex = -1;
    updatePairIndicator();
    updatePairControls();
    return;
  }

  const clamped = Math.min(Math.max(index, 0), pairCards.length - 1);
  pairCards.forEach((card, idx) => {
    card.classList.toggle("is-active", idx === clamped);
  });
  currentPairIndex = clamped;
  updatePairIndicator();
  updatePairControls();

  if (scrollIntoView) {
    const offset = getStickyOffset();
    const targetTop =
      pairCards[clamped].getBoundingClientRect().top +
      window.scrollY -
      offset;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }
}

function refreshPairCards() {
  pairCards = Array.from(
    comparisonsEl.querySelectorAll(".comparison-card")
  );
  setActivePair(pairCards.length ? 0 : -1, false);
}

function toggleZoomLevel() {
  if (!zoomLevelSelect.options.length) return;
  const nextIndex =
    (zoomLevelSelect.selectedIndex + 1) % zoomLevelSelect.options.length;
  zoomLevelSelect.selectedIndex = nextIndex;
  scheduleSave();
  if (!lastHover) return;
  showZoomForImage(
    lastHover.img,
    lastHover.clientX,
    lastHover.clientY,
    lastHover.shiftKey
  );
}

function toggleZoomSize() {
  if (!zoomSizeSelect.options.length) return;
  const nextIndex =
    (zoomSizeSelect.selectedIndex + 1) % zoomSizeSelect.options.length;
  zoomSizeSelect.selectedIndex = nextIndex;
  scheduleSave();
  if (zoomPreview) {
    zoomPreview.style.setProperty("--zoom-pane-size", `${getZoomSize()}px`);
  }
  if (!lastHover) return;
  showZoomForImage(
    lastHover.img,
    lastHover.clientX,
    lastHover.clientY,
    lastHover.shiftKey
  );
}

function toggleZoomEnabled() {
  zoomEnabledInput.checked = !zoomEnabledInput.checked;
  hideZoomPreview();
  scheduleSave();
}

function toggleZoomRequiresShift() {
  zoomRequiresShiftInput.checked = !zoomRequiresShiftInput.checked;
  hideZoomPreview();
  scheduleSave();
}

function toggleViewMode() {
  const nextMode =
    viewModeSelect.value === "grid" ? "individual" : "grid";
  viewModeSelect.value = nextMode;
  renderComparisons();
  scheduleSave();
}

function handlePairNavigationKey(event) {
  if (isEditableTarget(event.target)) return;
  if (event.key === "k" || event.key === "K") {
    event.preventDefault();
    setActivePair(currentPairIndex + 1);
  }
  if (event.key === "j" || event.key === "J") {
    event.preventDefault();
    setActivePair(currentPairIndex - 1);
  }
  if (event.key === "g" || event.key === "G") {
    event.preventDefault();
    toggleViewMode();
  }
  if (event.key === "z" || event.key === "Z") {
    event.preventDefault();
    toggleZoomLevel();
  }
  if (event.key === "s" || event.key === "S") {
    event.preventDefault();
    toggleZoomSize();
  }
  if (event.key === "p" || event.key === "P") {
    event.preventDefault();
    toggleZoomEnabled();
  }
  if (event.key === "h" || event.key === "H") {
    event.preventDefault();
    toggleZoomRequiresShift();
  }
}

function getZoomLevel() {
  const value = Number.parseFloat(zoomLevelSelect.value);
  return Number.isFinite(value) ? value : 3;
}

function getZoomSize() {
  const value = Number.parseFloat(zoomSizeSelect.value);
  return Number.isFinite(value) ? value : 200;
}

function shouldZoom(shiftKey) {
  if (!zoomEnabledInput.checked) return false;
  if (zoomRequiresShiftInput.checked && !shiftKey) return false;
  return true;
}

function setOutlineVisibility(data, visible) {
  if (!data || !data.outline) return;
  data.outline.classList.toggle("visible", Boolean(visible));
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

  const paneSize = getZoomSize();
  const rawSize = paneSize / zoomLevel;
  const boxWidth = Math.min(rawSize, width);
  const boxHeight = Math.min(rawSize, height);

  const clampedX = Math.min(Math.max(xRatio, 0), 1);
  const clampedY = Math.min(Math.max(yRatio, 0), 1);
  const centerX = clampedX * width;
  const centerY = clampedY * height;

  const left = Math.min(Math.max(centerX - boxWidth / 2, 0), width - boxWidth);
  const top = Math.min(Math.max(centerY - boxHeight / 2, 0), height - boxHeight);

  data.outline.style.width = `${boxWidth}px`;
  data.outline.style.height = `${boxHeight}px`;
  data.outline.style.left = `${left}px`;
  data.outline.style.top = `${top}px`;
  setOutlineVisibility(data, true);
}

function hideAllOutlines() {
  pairRegistry.forEach((pair) => {
    if (!pair) return;
    Object.values(pair).forEach((data) => {
      setOutlineVisibility(data, false);
    });
  });
}

function updateZoomPane(side, data, xRatio, yRatio, zoomLevel) {
  const pane = zoomPaneMap[side];
  if (!pane) return;

  pane.label.textContent = getLabelForSide(side);

  if (!data || !data.img || data.img.dataset.loadError === "true") {
    const message =
      data && data.status === "error"
        ? PLACEHOLDER_MESSAGES.error
        : PLACEHOLDER_MESSAGES.missing;
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
  if (!zoomPreview) return;
  const offset = 16;
  const rect = zoomPreview.getBoundingClientRect();
  let centerX = window.innerWidth / 2;

  if (pair) {
    const rects = getActiveSides()
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

  zoomPreview.style.left = `${left}px`;
  zoomPreview.style.top = `${top}px`;
}

function showZoomForImage(img, clientX, clientY, shiftKey) {
  if (!img || !img.dataset.pairId) return;
  if (!shouldZoom(shiftKey)) {
    hideZoomPreview();
    return;
  }

  const pair = pairRegistry.get(img.dataset.pairId);
  if (!pair) {
    hideZoomPreview();
    return;
  }

  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    hideZoomPreview();
    return;
  }

  const xRatio = (clientX - rect.left) / rect.width;
  const yRatio = (clientY - rect.top) / rect.height;
  const zoomLevel = getZoomLevel();

  getActiveSides().forEach((side) => {
    const data = pair[side];
    updateZoomPane(side, data, xRatio, yRatio, zoomLevel);
    updateZoomOutline(data, xRatio, yRatio, zoomLevel);
  });

  zoomPreview.classList.add("visible");
  positionZoomPreview(clientY, pair, img);
}

function hideZoomPreview() {
  if (!zoomPreview) return;
  zoomPreview.classList.remove("visible");
  hideAllOutlines();
}

function handleZoomMove(event) {
  const target = event.target instanceof Element ? event.target : null;
  const img = target ? target.closest("img") : null;
  if (!img || !comparisonsEl.contains(img)) {
    lastHover = null;
    hideZoomPreview();
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

function handleZoomKeyChange(event) {
  if (!lastHover) return;
  showZoomForImage(
    lastHover.img,
    lastHover.clientX,
    lastHover.clientY,
    event.shiftKey
  );
}

function renderComparisons() {
  const sideData = getActiveSideData();
  const mode = getEffectiveMode(sideData.map((entry) => entry.jobIds));
  const pairCount = Math.max(0, ...sideData.map((entry) => entry.jobIds.length));

  pairRegistry.clear();
  comparisonsEl.innerHTML = "";
  hideZoomPreview();

  if (pairCount === 0) {
    updateStatus();
    refreshPairCards();
    return;
  }

  for (let i = 0; i < pairCount; i += 1) {
    const card = createElement("div", "comparison-card");

    const header = createElement("div", "comparison-header");
    header.appendChild(createElement("div", "pair-title", `Pair ${i + 1}`));
    header.appendChild(
      createElement(
        "div",
        "pair-meta",
        `Mode: ${mode === "grid" ? "Grid" : "Individual images"}`
      )
    );
    card.appendChild(header);

    const pairId = `pair-${i}`;
    if (mode === "grid") {
      card.appendChild(renderGridPair(sideData, i, pairId));
    } else {
      card.appendChild(
        renderIndividualPair(sideData, i, pairId)
      );
    }

    comparisonsEl.appendChild(card);
  }

  updateStatus();
  refreshPairCards();
}

function renderGridPair(sideData, pairIndex, pairId) {
  const grid = createElement("div", "pair-grid");
  sideData.forEach((entry) => {
    const jobId = entry.jobIds[pairIndex] || "";
    grid.appendChild(
      createSideCard(entry.label, jobId, buildGridUrl(jobId), pairId, entry.side)
    );
  });
  return grid;
}

function renderIndividualPair(sideData, pairIndex, pairId) {
  const container = createElement("div", "image-rows");

  for (let index = 0; index < IMAGE_COUNT; index += 1) {
    const row = createElement("div", "image-row");
    const rowPairId = `${pairId}-img-${index}`;
    sideData.forEach((entry) => {
      const jobId = entry.jobIds[pairIndex] || "";
      row.appendChild(
        createImageCell(
          entry.label,
          index,
          jobId,
          buildIndividualUrl(jobId, index),
          rowPairId,
          entry.side
        )
      );
    });
    container.appendChild(row);
  }

  return container;
}

function createSideCard(label, jobId, imageUrl, pairId, side) {
  const sideCard = createElement("div", "side-card");
  sideCard.appendChild(createElement("div", "side-label", label));
  sideCard.appendChild(createElement("div", "job-id", jobId || "Missing job"));
  sideCard.appendChild(
    createImageFrame({
      url: imageUrl,
      altText: `${label} grid`,
      pairId,
      side,
      jobId,
    })
  );
  return sideCard;
}

function createImageCell(label, index, jobId, imageUrl, pairId, side) {
  const cell = createElement("div", "side-card");
  const caption = `${label} - Image ${index + 1}`;
  cell.appendChild(createElement("div", "image-caption", caption));
  cell.appendChild(createElement("div", "job-id", jobId || "Missing job"));
  cell.appendChild(
    createImageFrame({
      url: imageUrl,
      altText: `${label} image ${index + 1}`,
      pairId,
      side,
      jobId,
    })
  );
  return cell;
}

function buildGridUrl(jobId) {
  return jobId ? `https://cdn.midjourney.com/${jobId}/grid_0.png` : "";
}

function buildIndividualUrl(jobId, index) {
  return jobId
    ? `https://cdn.midjourney.com/${jobId}/0_${index}.png`
    : "";
}

function clearInputs() {
  labelAInput.value = "";
  labelBInput.value = "";
  if (labelCInput) labelCInput.value = "";
  jobsAInput.value = "";
  jobsBInput.value = "";
  if (jobsCInput) jobsCInput.value = "";
  comparisonsEl.innerHTML = "";
  pairRegistry.clear();
  hideZoomPreview();
  updateStatus();
  refreshPairCards();
  saveState();
}

function init() {
  const urlState = parseStateFromUrl();
  const storedState = urlState ? null : loadStateFromStorage();
  applyState(urlState || storedState);
  updateColumnVisibility();
  updateStatus();

  zoomPreview = createZoomPreview();
  zoomPreview.style.setProperty("--zoom-pane-size", `${getZoomSize()}px`);
  document.body.appendChild(zoomPreview);
  updateZoomPreviewVisibility();

  const handleInputChange = () => {
    scheduleRender();
    scheduleSave();
  };

  renderBtn.addEventListener("click", () => {
    renderComparisons();
    saveState();
  });
  clearBtn.addEventListener("click", clearInputs);
  if (shareBtn) shareBtn.addEventListener("click", copyShareLink);
  if (toTopBtn) {
    toTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  if (prevPairBtn) {
    prevPairBtn.addEventListener("click", () =>
      setActivePair(currentPairIndex - 1)
    );
  }
  if (nextPairBtn) {
    nextPairBtn.addEventListener("click", () =>
      setActivePair(currentPairIndex + 1)
    );
  }

  viewModeSelect.addEventListener("change", handleInputChange);
  jobsAInput.addEventListener("input", handleInputChange);
  jobsBInput.addEventListener("input", handleInputChange);
  if (jobsCInput) jobsCInput.addEventListener("input", handleInputChange);
  labelAInput.addEventListener("input", handleInputChange);
  labelBInput.addEventListener("input", handleInputChange);
  if (labelCInput) labelCInput.addEventListener("input", handleInputChange);
  if (columnCountSelect) {
    columnCountSelect.addEventListener("change", () => {
      hideZoomPreview();
      updateColumnVisibility();
      scheduleRender();
      scheduleSave();
    });
  }
  zoomEnabledInput.addEventListener("change", () => {
    hideZoomPreview();
    scheduleSave();
  });
  zoomRequiresShiftInput.addEventListener("change", () => {
    hideZoomPreview();
    scheduleSave();
  });

  comparisonsEl.addEventListener("mousemove", handleZoomMove);
  comparisonsEl.addEventListener("mouseleave", hideZoomPreview);
  document.addEventListener("keydown", handleZoomKeyChange);
  document.addEventListener("keyup", handleZoomKeyChange);
  document.addEventListener("keydown", handlePairNavigationKey);

  zoomLevelSelect.addEventListener("change", () => {
    scheduleSave();
    if (!lastHover) return;
    showZoomForImage(
      lastHover.img,
      lastHover.clientX,
      lastHover.clientY,
      lastHover.shiftKey
    );
  });
  zoomSizeSelect.addEventListener("change", () => {
    scheduleSave();
    if (!zoomPreview) return;
    zoomPreview.style.setProperty("--zoom-pane-size", `${getZoomSize()}px`);
    if (!lastHover) return;
    showZoomForImage(
      lastHover.img,
      lastHover.clientX,
      lastHover.clientY,
      lastHover.shiftKey
    );
  });

  if (jobsAInput.value.trim() || jobsBInput.value.trim()) {
    renderComparisons();
  } else {
    refreshPairCards();
  }
  if (urlState) saveState();
}

init();
