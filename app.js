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
const favoritesBody = document.getElementById("favoritesBody");
const favoritesEmptyEl = document.getElementById("favoritesEmpty");
const favoritesCopyBtn = document.getElementById("favoritesCopyBtn");
const favoritesStatusEl = document.getElementById("favoritesStatus");
const toolCards = Array.from(document.querySelectorAll("[data-tool-target]"));
const toolSections = Array.from(document.querySelectorAll(".tool-section"));
const rankViewModeSelect = document.getElementById("rankViewMode");
const rankColumnCountSelect = document.getElementById("rankColumnCount");
const rankZoomLevelSelect = document.getElementById("rankZoomLevel");
const rankZoomSizeSelect = document.getElementById("rankZoomSize");
const rankZoomEnabledInput = document.getElementById("rankZoomEnabled");
const rankZoomRequiresShiftInput = document.getElementById("rankZoomRequiresShift");
const rankLabelAInput = document.getElementById("rankLabelA");
const rankLabelBInput = document.getElementById("rankLabelB");
const rankLabelCInput = document.getElementById("rankLabelC");
const rankJobsAInput = document.getElementById("rankJobsA");
const rankJobsBInput = document.getElementById("rankJobsB");
const rankJobsCInput = document.getElementById("rankJobsC");
const rankStatusEl = document.getElementById("rankStatus");
const rankComparisonsEl = document.getElementById("rankComparisons");
const rankStartBtn = document.getElementById("rankStartBtn");
const rankClearBtn = document.getElementById("rankClearBtn");
const rankProgressEl = document.getElementById("rankProgress");
const rankSelectionStatusEl = document.getElementById("rankSelectionStatus");
const rankSummaryBody = document.getElementById("rankSummaryBody");
const rankSummaryEmptyEl = document.getElementById("rankSummaryEmpty");
const rankCopyBtn = document.getElementById("rankCopyBtn");
const rankSummaryStatusEl = document.getElementById("rankSummaryStatus");
const rankInputCardC = document.getElementById("rankInputCardC");

const IMAGE_COUNT = 4;
const pairRegistry = new Map();
const favoritesMap = new Map();
const zoomPaneMap = { A: null, B: null, C: null };
const SIDE_CONFIG = {
  A: { labelInput: labelAInput, jobsInput: jobsAInput },
  B: { labelInput: labelBInput, jobsInput: jobsBInput },
  C: { labelInput: labelCInput, jobsInput: jobsCInput },
};
const RANK_SIDE_CONFIG = {
  A: { labelInput: rankLabelAInput, jobsInput: rankJobsAInput },
  B: { labelInput: rankLabelBInput, jobsInput: rankJobsBInput },
  C: { labelInput: rankLabelCInput, jobsInput: rankJobsCInput },
};
const TOOL_IDS = ["compare", "rank"];
const ZOOM_CONFIGS = {
  compare: {
    zoomLevelSelect,
    zoomSizeSelect,
    zoomEnabledInput,
    zoomRequiresShiftInput,
  },
  rank: {
    zoomLevelSelect: rankZoomLevelSelect,
    zoomSizeSelect: rankZoomSizeSelect,
    zoomEnabledInput: rankZoomEnabledInput,
    zoomRequiresShiftInput: rankZoomRequiresShiftInput,
  },
};
const toolRegistry = {
  compare: {
    activate: () => {
      updateStatus();
      refreshPairCards();
      updateFavoritesSummary();
    },
  },
  rank: {
    activate: () => {
      updateRankStatus();
      updateRankSummary();
      renderRankRound();
    },
  },
};
let zoomPreview = null;
let lastHover = null;
let pairCards = [];
let currentPairIndex = -1;
let shareStatusTimer = null;
let saveTimer = null;
let renderTimer = null;
let favoritesStatusTimer = null;
let activeToolId = "compare";
let rankPairRegistry = new Map();
let rankSelections = new Map();
let rankOrder = [];
let rankOrderIndex = -1;
let rankDisplayOrder = [];
let rankSelectionStatusTimer = null;
let rankSummaryStatusTimer = null;
let rankSaveTimer = null;

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

function getSelectedColumnCountFrom(selectEl) {
  if (!selectEl) return 2;
  const value = Number.parseInt(selectEl.value, 10);
  return value === 3 ? 3 : 2;
}

function getActiveSidesFrom(selectEl) {
  return getSelectedColumnCountFrom(selectEl) === 3
    ? ["A", "B", "C"]
    : ["A", "B"];
}

function getLabelForSideFrom(sideConfig, side) {
  const input = sideConfig[side]?.labelInput;
  if (!input) return side;
  return input.value.trim() || side;
}

function getJobIdsForSideFrom(sideConfig, side) {
  const input = sideConfig[side]?.jobsInput;
  return parseJobIds(input ? input.value : "");
}

function getActiveSideDataFrom(sideConfig, selectEl) {
  return getActiveSidesFrom(selectEl).map((side) => ({
    side,
    label: getLabelForSideFrom(sideConfig, side),
    jobIds: getJobIdsForSideFrom(sideConfig, side),
  }));
}

function getEffectiveModeFor(selectEl, jobIdsBySide) {
  if (!selectEl) return "grid";
  const selected = selectEl.value;
  if (selected !== "auto") return selected;
  return jobIdsBySide.some((ids) => ids.length <= 1) ? "individual" : "grid";
}

function getSelectedColumnCount() {
  return getSelectedColumnCountFrom(columnCountSelect);
}

function getActiveSides() {
  return getActiveSidesFrom(columnCountSelect);
}

function getLabelForSide(side) {
  return getLabelForSideFrom(SIDE_CONFIG, side);
}

function getJobIdsForSide(side) {
  return getJobIdsForSideFrom(SIDE_CONFIG, side);
}

function getActiveSideData() {
  return getActiveSideDataFrom(SIDE_CONFIG, columnCountSelect);
}

function getEffectiveMode(jobIdsBySide) {
  return getEffectiveModeFor(viewModeSelect, jobIdsBySide);
}

function getRankSelectedColumnCount() {
  return getSelectedColumnCountFrom(rankColumnCountSelect);
}

function getRankActiveSides() {
  return getActiveSidesFrom(rankColumnCountSelect);
}

function getRankLabelForSide(side) {
  return getLabelForSideFrom(RANK_SIDE_CONFIG, side);
}

function getRankJobIdsForSide(side) {
  return getJobIdsForSideFrom(RANK_SIDE_CONFIG, side);
}

function getRankActiveSideData() {
  return getActiveSideDataFrom(RANK_SIDE_CONFIG, rankColumnCountSelect);
}

function getRankEffectiveMode(jobIdsBySide) {
  return getEffectiveModeFor(rankViewModeSelect, jobIdsBySide);
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

function normalizeToolId(toolId) {
  return TOOL_IDS.includes(toolId) ? toolId : "compare";
}

function getToolFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeToolId(params.get("tool"));
}

function updateToolInUrl(toolId) {
  const nextTool = normalizeToolId(toolId);
  const params = new URLSearchParams(window.location.search);
  params.set("tool", nextTool);
  const href = `${getBaseUrl()}?${params.toString()}`;
  window.history.replaceState({}, "", href);
}

function getActiveSidesForTool() {
  return activeToolId === "rank" ? getRankActiveSides() : getActiveSides();
}

function getActivePairRegistry() {
  return activeToolId === "rank" ? rankPairRegistry : pairRegistry;
}

function getActiveZoomConfig() {
  return ZOOM_CONFIGS[activeToolId] || ZOOM_CONFIGS.compare;
}

function getRankOptionLabel(side) {
  const index = rankDisplayOrder.indexOf(side);
  if (index < 0) return "Option";
  return `Option ${index + 1}`;
}

function getActiveSideLabel(side) {
  if (activeToolId === "rank") return getRankOptionLabel(side);
  return getLabelForSide(side);
}

function getFavoriteKey(pairId, side) {
  if (!pairId || !side) return null;
  return `${pairId}::${side}`;
}

function buildLabelJobTotalsFrom(sideConfig) {
  const totals = new Map();
  Object.keys(sideConfig).forEach((side) => {
    const label = getLabelForSideFrom(sideConfig, side);
    const jobIds = getJobIdsForSideFrom(sideConfig, side);
    if (!totals.has(label)) {
      totals.set(label, new Set());
    }
    const group = totals.get(label);
    jobIds.forEach((jobId) => group.add(jobId));
  });
  return totals;
}

function buildLabelJobTotals() {
  return buildLabelJobTotalsFrom(SIDE_CONFIG);
}

function buildFavoriteGroups() {
  const totals = buildLabelJobTotals();
  const groups = new Map();
  favoritesMap.forEach((entry) => {
    const label = getLabelForSide(entry.side);
    if (!groups.has(label)) {
      groups.set(label, { label, count: 0, jobIds: new Set() });
    }
    const group = groups.get(label);
    group.count += 1;
    if (entry.jobId) group.jobIds.add(entry.jobId);
  });
  return Array.from(groups.values()).map((group) => ({
    label: group.label,
    count: group.count,
    totalCount: totals.get(group.label)?.size ?? 0,
    jobIds: Array.from(group.jobIds),
  }));
}

function updateFavoritesSummary() {
  if (!favoritesBody || !favoritesEmptyEl || !favoritesCopyBtn) return;
  favoritesBody.innerHTML = "";

  const groups = buildFavoriteGroups().sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const hasFavorites = groups.length > 0;

  favoritesEmptyEl.hidden = hasFavorites;
  favoritesCopyBtn.disabled = !hasFavorites;

  if (!hasFavorites) return;

  groups.forEach((group) => {
    const row = document.createElement("tr");
    row.appendChild(createElement("td", null, group.label));
    row.appendChild(createElement("td", null, `${group.count}`));
    favoritesBody.appendChild(row);
  });
}

function showFavoritesStatus(message, isError = false) {
  if (!favoritesStatusEl) return;
  if (favoritesStatusTimer) window.clearTimeout(favoritesStatusTimer);
  favoritesStatusEl.textContent = message;
  favoritesStatusEl.classList.toggle("is-error", Boolean(isError));
  favoritesStatusTimer = window.setTimeout(() => {
    favoritesStatusEl.textContent = "";
    favoritesStatusEl.classList.remove("is-error");
  }, 2000);
}

function buildFavoritesCopyText() {
  const groups = buildFavoriteGroups().sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  if (!groups.length) return "";
  const header = groups.map((group) => group.label).join("\t");
  const maxRows = Math.max(
    ...groups.map((group) => group.jobIds.length),
    0
  );
  const lines = [header];
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = groups.map((group) => group.jobIds[rowIndex] ?? "");
    lines.push(row.join("\t"));
  }
  return lines.join("\n");
}

async function copyFavoritesSummary() {
  const text = buildFavoritesCopyText();
  if (!text) {
    showFavoritesStatus("No favorites to copy.", true);
    return;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      showFavoritesStatus("Favorites copied.");
      return;
    }
    if (fallbackCopyText(text)) {
      showFavoritesStatus("Favorites copied.");
      return;
    }
    throw new Error("Clipboard unavailable");
  } catch (error) {
    showFavoritesStatus("Copy failed. Favorites in console.", true);
    console.info("Favorites:\n", text);
  }
}

function buildRankSummaryGroups() {
  const totals = buildLabelJobTotalsFrom(RANK_SIDE_CONFIG);
  const groups = new Map();
  rankSelections.forEach((entry) => {
    const label = getRankLabelForSide(entry.side);
    if (!groups.has(label)) {
      groups.set(label, { label, count: 0, jobIds: new Set() });
    }
    const group = groups.get(label);
    group.count += 1;
    if (entry.jobId) group.jobIds.add(entry.jobId);
  });
  return Array.from(groups.values()).map((group) => ({
    label: group.label,
    count: group.count,
    totalCount: totals.get(group.label)?.size ?? 0,
    jobIds: Array.from(group.jobIds),
  }));
}

function updateRankSummary() {
  if (!rankSummaryBody || !rankSummaryEmptyEl || !rankCopyBtn) return;
  rankSummaryBody.innerHTML = "";

  const groups = buildRankSummaryGroups().sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const hasSelections = groups.length > 0;

  rankSummaryEmptyEl.hidden = hasSelections;
  rankCopyBtn.disabled = !hasSelections;

  if (!hasSelections) return;

  groups.forEach((group) => {
    const row = document.createElement("tr");
    row.appendChild(createElement("td", null, group.label));
    row.appendChild(createElement("td", null, `${group.count}`));
    rankSummaryBody.appendChild(row);
  });
}

function showRankSummaryStatus(message, isError = false) {
  if (!rankSummaryStatusEl) return;
  if (rankSummaryStatusTimer) window.clearTimeout(rankSummaryStatusTimer);
  rankSummaryStatusEl.textContent = message;
  rankSummaryStatusEl.classList.toggle("is-error", Boolean(isError));
  rankSummaryStatusTimer = window.setTimeout(() => {
    rankSummaryStatusEl.textContent = "";
    rankSummaryStatusEl.classList.remove("is-error");
  }, 2000);
}

function buildRankCopyText() {
  const groups = buildRankSummaryGroups().sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  if (!groups.length) return "";
  const header = groups.map((group) => group.label).join("\t");
  const maxRows = Math.max(
    ...groups.map((group) => group.jobIds.length),
    0
  );
  const lines = [header];
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = groups.map((group) => group.jobIds[rowIndex] ?? "");
    lines.push(row.join("\t"));
  }
  return lines.join("\n");
}

async function copyRankSummary() {
  const text = buildRankCopyText();
  if (!text) {
    showRankSummaryStatus("No selections to copy.", true);
    return;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      showRankSummaryStatus("Summary copied.");
      return;
    }
    if (fallbackCopyText(text)) {
      showRankSummaryStatus("Summary copied.");
      return;
    }
    throw new Error("Clipboard unavailable");
  } catch (error) {
    showRankSummaryStatus("Copy failed. Summary in console.", true);
    console.info("Ranking summary:\n", text);
  }
}

function toggleFavoriteForHover() {
  const hovered = lastHover?.img;
  if (!hovered) return;

  const pairId = hovered.dataset.pairId;
  const side = hovered.dataset.side;
  const key = getFavoriteKey(pairId, side);
  if (!key) return;

  const pair = pairRegistry.get(pairId);
  const data = pair ? pair[side] : null;
  if (!data || data.status !== "ok" || !data.jobId) return;

  const card = hovered.closest(".side-card");
  if (!card) return;

  if (favoritesMap.has(key)) {
    favoritesMap.delete(key);
    card.classList.remove("is-favorite");
  } else {
    favoritesMap.set(key, { pairId, side, jobId: data.jobId, card });
    card.classList.add("is-favorite");
  }

  updateFavoritesSummary();
}

function reconcileFavorites() {
  if (!favoritesMap.size) {
    updateFavoritesSummary();
    return;
  }
  const nextMap = new Map();

  favoritesMap.forEach((entry, key) => {
    const pair = pairRegistry.get(entry.pairId);
    if (!pair) return;
    const data = pair[entry.side];
    if (!data || data.status !== "ok" || data.jobId !== entry.jobId) return;
    const card = data.img ? data.img.closest(".side-card") : null;
    if (!card) return;
    card.classList.add("is-favorite");
    nextMap.set(key, { ...entry, card });
  });

  favoritesMap.clear();
  nextMap.forEach((value, key) => favoritesMap.set(key, value));
  updateFavoritesSummary();
}

function clearFavorites() {
  favoritesMap.forEach((entry) => {
    if (entry.card) entry.card.classList.remove("is-favorite");
  });
  favoritesMap.clear();
  updateFavoritesSummary();
}

function registerPairImage(pairId, side, data, registry = pairRegistry) {
  if (!pairId || !side) return;
  if (!registry.has(pairId)) {
    registry.set(pairId, {});
  }
  const entry = registry.get(pairId);
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

function updateZoomPreviewOrder() {
  if (!zoomPreview) return;
  const order =
    activeToolId === "rank" && rankDisplayOrder.length
      ? rankDisplayOrder
      : ["A", "B", "C"];
  order.forEach((side) => {
    const pane = zoomPaneMap[side]?.container;
    if (pane) zoomPreview.appendChild(pane);
  });
}

function updateZoomPreviewVisibility() {
  const activeSides = new Set(getActiveSidesForTool());
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

function updateRankColumnVisibility() {
  const showThird = getRankSelectedColumnCount() === 3;
  if (rankInputCardC) {
    rankInputCardC.classList.toggle("is-hidden", !showThird);
    rankInputCardC.hidden = !showThird;
    rankInputCardC.setAttribute("aria-hidden", (!showThird).toString());
  }
  updateZoomPreviewVisibility();
}

function createImageFrame({
  url,
  altText,
  pairId,
  side,
  jobId,
  registry = pairRegistry,
  linkEnabled = true,
}) {
  const frame = createElement("div", "image-frame");
  if (!url) {
    registerPairImage(
      pairId,
      side,
      {
        img: null,
        url: "",
        jobId,
        status: "missing",
        outline: null,
      },
      registry
    );
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

  const wrapper = createElement("div", "image-wrap");
  const outline = createElement("div", "zoom-outline");
  if (linkEnabled) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.appendChild(img);
    wrapper.appendChild(link);
  } else {
    wrapper.appendChild(img);
  }
  wrapper.appendChild(outline);

  registerPairImage(
    pairId,
    side,
    {
      img,
      url,
      jobId,
      status: "ok",
      outline,
    },
    registry
  );

  img.addEventListener("error", () => {
    img.dataset.loadError = "true";
    const entry = registry.get(pairId);
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

function getRankState() {
  return {
    columnCount: rankColumnCountSelect ? rankColumnCountSelect.value : "2",
    labelA: rankLabelAInput ? rankLabelAInput.value : "",
    labelB: rankLabelBInput ? rankLabelBInput.value : "",
    labelC: rankLabelCInput ? rankLabelCInput.value : "",
    jobsA: rankJobsAInput ? rankJobsAInput.value : "",
    jobsB: rankJobsBInput ? rankJobsBInput.value : "",
    jobsC: rankJobsCInput ? rankJobsCInput.value : "",
    viewMode: rankViewModeSelect ? rankViewModeSelect.value : "auto",
    zoomLevel: rankZoomLevelSelect ? rankZoomLevelSelect.value : "3",
    zoomSize: rankZoomSizeSelect ? rankZoomSizeSelect.value : "300",
    zoomEnabled: rankZoomEnabledInput ? rankZoomEnabledInput.checked : true,
    zoomRequiresShift: rankZoomRequiresShiftInput
      ? rankZoomRequiresShiftInput.checked
      : true,
  };
}

function applyRankState(state) {
  if (!state) return;
  if (state.columnCount && rankColumnCountSelect) {
    rankColumnCountSelect.value = state.columnCount;
  }
  if (rankLabelAInput && state.labelA !== undefined) {
    rankLabelAInput.value = state.labelA;
  }
  if (rankLabelBInput && state.labelB !== undefined) {
    rankLabelBInput.value = state.labelB;
  }
  if (rankLabelCInput && state.labelC !== undefined) {
    rankLabelCInput.value = state.labelC;
  }
  if (rankJobsAInput && state.jobsA !== undefined) {
    rankJobsAInput.value = state.jobsA;
  }
  if (rankJobsBInput && state.jobsB !== undefined) {
    rankJobsBInput.value = state.jobsB;
  }
  if (rankJobsCInput && state.jobsC !== undefined) {
    rankJobsCInput.value = state.jobsC;
  }
  if (state.viewMode && rankViewModeSelect) {
    rankViewModeSelect.value = state.viewMode;
  }
  if (state.zoomLevel && rankZoomLevelSelect) {
    rankZoomLevelSelect.value = state.zoomLevel;
  }
  if (state.zoomSize && rankZoomSizeSelect) {
    rankZoomSizeSelect.value = state.zoomSize;
  }
  if (typeof state.zoomEnabled === "boolean" && rankZoomEnabledInput) {
    rankZoomEnabledInput.checked = state.zoomEnabled;
  }
  if (
    typeof state.zoomRequiresShift === "boolean" &&
    rankZoomRequiresShiftInput
  ) {
    rankZoomRequiresShiftInput.checked = state.zoomRequiresShift;
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

function saveRankState() {
  try {
    const state = getRankState();
    localStorage.setItem("mj-grid-rank-state", JSON.stringify(state));
  } catch (error) {
    // Ignore storage failures (private mode, disabled, etc).
  }
}

function scheduleRankSave() {
  if (rankSaveTimer) window.clearTimeout(rankSaveTimer);
  rankSaveTimer = window.setTimeout(saveRankState, 200);
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

function loadRankStateFromStorage() {
  try {
    const raw = localStorage.getItem("mj-grid-rank-state");
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

  params.set("tool", "compare");
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

function showRankSelectionStatus(message, isError = false) {
  if (!rankSelectionStatusEl) return;
  if (rankSelectionStatusTimer) window.clearTimeout(rankSelectionStatusTimer);
  rankSelectionStatusEl.textContent = message;
  rankSelectionStatusEl.classList.toggle("is-error", Boolean(isError));
  rankSelectionStatusTimer = window.setTimeout(() => {
    rankSelectionStatusEl.textContent = "";
    rankSelectionStatusEl.classList.remove("is-error");
  }, 2000);
}

function updateRankStatus() {
  if (!rankStatusEl) return;
  const sideData = getRankActiveSideData();
  const jobCounts = sideData.map((entry) => entry.jobIds.length);
  const pairCount = Math.max(0, ...jobCounts);
  if (pairCount === 0) {
    rankStatusEl.textContent = "Paste job IDs to start ranking.";
    return;
  }
  const mode = getRankEffectiveMode(sideData.map((entry) => entry.jobIds));
  const modeLabel = mode === "grid" ? "Grid" : "Individual";
  const mismatch = jobCounts.some((count) => count !== jobCounts[0])
    ? "Counts differ; unmatched jobs will show as missing."
    : "";
  const countLabel = sideData
    .map((entry) => `${entry.side}: ${entry.jobIds.length} job(s)`)
    .join(" | ");
  rankStatusEl.textContent = `${countLabel} | Mode: ${modeLabel}. ${mismatch}`.trim();
}

function updateRankProgress() {
  if (!rankProgressEl) return;
  const totalRounds = rankOrder.length || getRankPairCount();
  if (!totalRounds || rankOrderIndex < 0) {
    rankProgressEl.textContent = `Round 0 of ${totalRounds}`;
    return;
  }
  const current = Math.min(rankOrderIndex + 1, totalRounds);
  rankProgressEl.textContent = `Round ${current} of ${totalRounds}`;
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
    zoomPreview.style.setProperty(
      "--zoom-pane-size",
      `${getZoomSizeFrom(zoomSizeSelect)}px`
    );
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
  if (activeToolId !== "compare") return;
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
  if (event.key === "f" || event.key === "F") {
    event.preventDefault();
    toggleFavoriteForHover();
  }
}

function getZoomLevelFrom(selectEl) {
  const value = Number.parseFloat(selectEl?.value ?? "");
  return Number.isFinite(value) ? value : 3;
}

function getZoomSizeFrom(selectEl) {
  const value = Number.parseFloat(selectEl?.value ?? "");
  return Number.isFinite(value) ? value : 200;
}

function getActiveZoomLevel() {
  const { zoomLevelSelect: selectEl } = getActiveZoomConfig();
  return getZoomLevelFrom(selectEl);
}

function getActiveZoomSize() {
  const { zoomSizeSelect: selectEl } = getActiveZoomConfig();
  return getZoomSizeFrom(selectEl);
}

function shouldZoom(shiftKey) {
  const {
    zoomEnabledInput: enabledInput,
    zoomRequiresShiftInput: shiftInput,
  } = getActiveZoomConfig();
  if (!enabledInput?.checked) return false;
  if (shiftInput?.checked && !shiftKey) return false;
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

  const paneSize = getActiveZoomSize();
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

function hideAllOutlines(registry = getActivePairRegistry()) {
  registry.forEach((pair) => {
    if (!pair) return;
    Object.values(pair).forEach((data) => {
      setOutlineVisibility(data, false);
    });
  });
}

function updateZoomPane(side, data, xRatio, yRatio, zoomLevel) {
  const pane = zoomPaneMap[side];
  if (!pane) return;

  pane.label.textContent = getActiveSideLabel(side);

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
    const rects = getActiveSidesForTool()
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

  const pair = getActivePairRegistry().get(img.dataset.pairId);
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
  const zoomLevel = getActiveZoomLevel();

  getActiveSidesForTool().forEach((side) => {
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
  const container = event.currentTarget instanceof Element ? event.currentTarget : null;
  if (
    !img ||
    !container ||
    !container.contains(img) ||
    container.dataset.tool !== activeToolId
  ) {
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

function handleZoomLeave(event) {
  const container =
    event?.currentTarget instanceof Element ? event.currentTarget : null;
  if (container && container.dataset.tool && container.dataset.tool !== activeToolId) {
    return;
  }
  lastHover = null;
  hideZoomPreview();
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
    clearFavorites();
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
  reconcileFavorites();
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

function shuffleArray(items) {
  const array = Array.from(items);
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getRankPairCount() {
  const sideData = getRankActiveSideData();
  const jobCounts = sideData.map((entry) => entry.jobIds.length);
  return Math.max(0, ...jobCounts);
}

function updateRankStartButton() {
  if (!rankStartBtn) return;
  const pairCount = getRankPairCount();
  rankStartBtn.disabled = pairCount === 0;
  rankStartBtn.textContent =
    rankOrder.length > 0 ? "Restart ranking" : "Start ranking";
}

function resetRankSession({ keepOrder = false } = {}) {
  rankSelections.clear();
  rankPairRegistry.clear();
  rankDisplayOrder = [];
  rankOrderIndex = -1;
  if (!keepOrder) rankOrder = [];
  if (rankComparisonsEl) {
    rankComparisonsEl.innerHTML = "";
  }
  hideZoomPreview();
  updateRankSummary();
  updateRankProgress();
  updateRankStatus();
  updateRankStartButton();
  renderRankRound();
  updateZoomPreviewOrder();
  updateZoomPreviewVisibility();
}

function startRankSession() {
  const pairCount = getRankPairCount();
  rankSelections.clear();
  rankPairRegistry.clear();
  rankDisplayOrder = [];
  rankOrder = buildRankOrder(pairCount);
  rankOrderIndex = pairCount ? 0 : -1;
  renderRankRound();
  updateRankSummary();
  updateRankProgress();
  updateRankStatus();
  updateRankStartButton();
}

function buildRankOrder(pairCount) {
  return shuffleArray(Array.from({ length: pairCount }, (_, i) => i));
}

function createRankOptionCard({ jobId, imageUrl, pairId, side }) {
  const card = createElement("div", "side-card rank-option");
  card.dataset.side = side;
  card.dataset.jobId = jobId || "";
  card.appendChild(
    createElement("div", "rank-option-label", getRankOptionLabel(side))
  );
  card.appendChild(
    createImageFrame({
      url: imageUrl,
      altText: "Rank option",
      pairId,
      side,
      jobId,
      registry: rankPairRegistry,
      linkEnabled: false,
    })
  );
  card.classList.toggle("is-missing", !jobId);
  return card;
}

function createRankImageCell({ index, jobId, pairId, side }) {
  const cell = createElement("div", "side-card rank-option");
  cell.dataset.side = side;
  cell.dataset.jobId = jobId || "";
  cell.appendChild(
    createElement("div", "rank-option-label", getRankOptionLabel(side))
  );
  cell.appendChild(
    createImageFrame({
      url: buildIndividualUrl(jobId, index),
      altText: "Rank option image",
      pairId,
      side,
      jobId,
      registry: rankPairRegistry,
      linkEnabled: false,
    })
  );
  cell.classList.toggle("is-missing", !jobId);
  return cell;
}

function renderRankGridPair(sideData, pairIndex) {
  const grid = createElement("div", "pair-grid rank-grid");
  const pairId = `rank-pair-${pairIndex}`;
  rankDisplayOrder.forEach((side) => {
    const entry = sideData.find((item) => item.side === side);
    const jobId = entry?.jobIds[pairIndex] || "";
    grid.appendChild(
      createRankOptionCard({
        jobId,
        imageUrl: buildGridUrl(jobId),
        pairId,
        side,
      })
    );
  });
  return grid;
}

function renderRankIndividualPair(sideData, pairIndex) {
  const container = createElement("div", "image-rows rank-rows");
  for (let index = 0; index < IMAGE_COUNT; index += 1) {
    const row = createElement("div", "image-row");
    const rowPairId = `rank-pair-${pairIndex}-img-${index}`;
    rankDisplayOrder.forEach((side) => {
      const entry = sideData.find((item) => item.side === side);
      const jobId = entry?.jobIds[pairIndex] || "";
      row.appendChild(
        createRankImageCell({
          index,
          jobId,
          pairId: rowPairId,
          side,
        })
      );
    });
    container.appendChild(row);
  }
  return container;
}

function renderRankRound() {
  if (!rankComparisonsEl) return;
  rankComparisonsEl.innerHTML = "";
  rankPairRegistry.clear();
  hideZoomPreview();

  const sideData = getRankActiveSideData();
  const pairCount = Math.max(0, ...sideData.map((entry) => entry.jobIds.length));

  if (pairCount === 0) {
    rankComparisonsEl.appendChild(
      createPlaceholder("Paste job IDs to start ranking.")
    );
    updateRankProgress();
    updateRankStartButton();
    return;
  }

  if (!rankOrder.length) {
    rankComparisonsEl.appendChild(
      createPlaceholder("Press Start ranking to begin.")
    );
    updateRankProgress();
    updateRankStartButton();
    return;
  }

  if (rankOrderIndex < 0 || rankOrderIndex >= rankOrder.length) {
    rankComparisonsEl.appendChild(
      createElement(
        "div",
        "rank-complete",
        "Ranking complete. Review the summary to export."
      )
    );
    updateRankProgress();
    updateRankStartButton();
    return;
  }

  const pairIndex = rankOrder[rankOrderIndex];
  const mode = getRankEffectiveMode(sideData.map((entry) => entry.jobIds));
  rankDisplayOrder = shuffleArray(getRankActiveSides());
  updateZoomPreviewOrder();
  updateZoomPreviewVisibility();

  const card = createElement("div", "comparison-card rank-card");
  const header = createElement("div", "comparison-header");
  header.appendChild(
    createElement(
      "div",
      "pair-title",
      `Round ${rankOrderIndex + 1} of ${rankOrder.length}`
    )
  );
  header.appendChild(
    createElement(
      "div",
      "pair-meta",
      `Mode: ${mode === "grid" ? "Grid" : "Individual images"}`
    )
  );
  card.appendChild(header);

  if (mode === "grid") {
    card.appendChild(renderRankGridPair(sideData, pairIndex));
  } else {
    card.appendChild(renderRankIndividualPair(sideData, pairIndex));
  }

  rankComparisonsEl.appendChild(card);
  updateRankProgress();
  updateRankStartButton();
}

function getRankJobIdForSide(pairIndex, side) {
  const entry = getRankActiveSideData().find((item) => item.side === side);
  return entry?.jobIds[pairIndex] || "";
}

function selectRankOption(side) {
  if (!rankOrder.length || rankOrderIndex < 0) return;
  if (rankOrderIndex >= rankOrder.length) return;
  const pairIndex = rankOrder[rankOrderIndex];
  const jobId = getRankJobIdForSide(pairIndex, side);
  if (!jobId) {
    showRankSelectionStatus("Missing job for that option.", true);
    return;
  }
  rankSelections.set(pairIndex, { side, jobId });
  updateRankSummary();
  rankOrderIndex += 1;
  renderRankRound();
  showRankSelectionStatus("Selection saved.");
}

function handleRankSelectionClick(event) {
  if (activeToolId !== "rank") return;
  const card = event.target.closest(".rank-option");
  if (!card || !rankComparisonsEl?.contains(card)) return;
  if (event.target.closest("a")) return;
  const side = card.dataset.side;
  if (!side) return;
  selectRankOption(side);
}

function skipRankSelection() {
  if (!rankOrder.length || rankOrderIndex < 0) return;
  if (rankOrderIndex >= rankOrder.length) return;
  rankOrderIndex += 1;
  renderRankRound();
  showRankSelectionStatus("Skipped.");
}

function handleRankShortcutKey(event) {
  if (activeToolId !== "rank") return;
  if (isEditableTarget(event.target)) return;
  const indexMap = { "1": 0, "2": 1, "3": 2 };
  if (event.key in indexMap) {
    const side = rankDisplayOrder[indexMap[event.key]];
    if (side) {
      event.preventDefault();
      selectRankOption(side);
    }
  }
  if (event.key === "4") {
    event.preventDefault();
    skipRankSelection();
  }
}

function clearRankInputs() {
  if (rankLabelAInput) rankLabelAInput.value = "";
  if (rankLabelBInput) rankLabelBInput.value = "";
  if (rankLabelCInput) rankLabelCInput.value = "";
  if (rankJobsAInput) rankJobsAInput.value = "";
  if (rankJobsBInput) rankJobsBInput.value = "";
  if (rankJobsCInput) rankJobsCInput.value = "";
  resetRankSession();
  saveRankState();
}

function updateToolVisibility(nextTool) {
  toolSections.forEach((section) => {
    const isActive = section.dataset.tool === nextTool;
    section.classList.toggle("is-active", isActive);
    section.hidden = !isActive;
    section.setAttribute("aria-hidden", (!isActive).toString());
  });

  toolCards.forEach((card) => {
    const isActive = card.dataset.toolTarget === nextTool;
    card.classList.toggle("is-active", isActive);
    card.setAttribute("aria-selected", isActive.toString());
  });
}

function syncToolZoom() {
  updateZoomPreviewOrder();
  updateZoomPreviewVisibility();
  if (zoomPreview) {
    zoomPreview.style.setProperty(
      "--zoom-pane-size",
      `${getActiveZoomSize()}px`
    );
  }
}

function setActiveTool(toolId, { updateUrl = true } = {}) {
  const nextTool = normalizeToolId(toolId);
  activeToolId = nextTool;
  updateToolVisibility(nextTool);
  document.body.dataset.tool = nextTool;
  if (updateUrl) updateToolInUrl(nextTool);

  lastHover = null;
  hideZoomPreview();
  hideAllOutlines(pairRegistry);
  hideAllOutlines(rankPairRegistry);
  syncToolZoom();

  const handler = toolRegistry[nextTool]?.activate;
  if (handler) handler();
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
  clearFavorites();
  updateStatus();
  refreshPairCards();
  saveState();
}

function init() {
  const urlState = parseStateFromUrl();
  const storedState = urlState ? null : loadStateFromStorage();
  applyState(urlState || storedState);
  applyRankState(loadRankStateFromStorage());
  updateColumnVisibility();
  updateRankColumnVisibility();
  updateStatus();
  resetRankSession();

  zoomPreview = createZoomPreview();
  document.body.appendChild(zoomPreview);
  updateZoomPreviewOrder();
  updateZoomPreviewVisibility();

  const handleInputChange = () => {
    scheduleRender();
    scheduleSave();
  };
  const handleRankInputChange = () => {
    scheduleRankSave();
    resetRankSession();
  };

  toolCards.forEach((card) => {
    card.addEventListener("click", () => {
      setActiveTool(card.dataset.toolTarget);
    });
  });

  renderBtn.addEventListener("click", () => {
    renderComparisons();
    saveState();
  });
  clearBtn.addEventListener("click", clearInputs);
  if (shareBtn) shareBtn.addEventListener("click", copyShareLink);
  if (favoritesCopyBtn) {
    favoritesCopyBtn.addEventListener("click", copyFavoritesSummary);
  }
  if (rankCopyBtn) {
    rankCopyBtn.addEventListener("click", copyRankSummary);
  }
  if (rankStartBtn) {
    rankStartBtn.addEventListener("click", () => {
      startRankSession();
      saveRankState();
    });
  }
  if (rankClearBtn) {
    rankClearBtn.addEventListener("click", clearRankInputs);
  }
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
  if (rankViewModeSelect) {
    rankViewModeSelect.addEventListener("change", handleRankInputChange);
  }
  if (rankJobsAInput) rankJobsAInput.addEventListener("input", handleRankInputChange);
  if (rankJobsBInput) rankJobsBInput.addEventListener("input", handleRankInputChange);
  if (rankJobsCInput) rankJobsCInput.addEventListener("input", handleRankInputChange);
  if (rankLabelAInput) rankLabelAInput.addEventListener("input", handleRankInputChange);
  if (rankLabelBInput) rankLabelBInput.addEventListener("input", handleRankInputChange);
  if (rankLabelCInput) rankLabelCInput.addEventListener("input", handleRankInputChange);
  if (columnCountSelect) {
    columnCountSelect.addEventListener("change", () => {
      hideZoomPreview();
      updateColumnVisibility();
      scheduleRender();
      scheduleSave();
    });
  }
  if (rankColumnCountSelect) {
    rankColumnCountSelect.addEventListener("change", () => {
      hideZoomPreview();
      updateRankColumnVisibility();
      handleRankInputChange();
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
  if (rankZoomEnabledInput) {
    rankZoomEnabledInput.addEventListener("change", () => {
      if (activeToolId === "rank") hideZoomPreview();
      scheduleRankSave();
    });
  }
  if (rankZoomRequiresShiftInput) {
    rankZoomRequiresShiftInput.addEventListener("change", () => {
      if (activeToolId === "rank") hideZoomPreview();
      scheduleRankSave();
    });
  }

  comparisonsEl.addEventListener("mousemove", handleZoomMove);
  comparisonsEl.addEventListener("mouseleave", handleZoomLeave);
  if (rankComparisonsEl) {
    rankComparisonsEl.addEventListener("mousemove", handleZoomMove);
    rankComparisonsEl.addEventListener("mouseleave", handleZoomLeave);
    rankComparisonsEl.addEventListener("click", handleRankSelectionClick);
  }
  document.addEventListener("keydown", handleZoomKeyChange);
  document.addEventListener("keyup", handleZoomKeyChange);
  document.addEventListener("keydown", handlePairNavigationKey);
  document.addEventListener("keydown", handleRankShortcutKey);

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
    zoomPreview.style.setProperty(
      "--zoom-pane-size",
      `${getZoomSizeFrom(zoomSizeSelect)}px`
    );
    if (!lastHover) return;
    showZoomForImage(
      lastHover.img,
      lastHover.clientX,
      lastHover.clientY,
      lastHover.shiftKey
    );
  });
  if (rankZoomLevelSelect) {
    rankZoomLevelSelect.addEventListener("change", () => {
      scheduleRankSave();
      if (!lastHover || activeToolId !== "rank") return;
      showZoomForImage(
        lastHover.img,
        lastHover.clientX,
        lastHover.clientY,
        lastHover.shiftKey
      );
    });
  }
  if (rankZoomSizeSelect) {
    rankZoomSizeSelect.addEventListener("change", () => {
      scheduleRankSave();
      if (!zoomPreview) return;
      zoomPreview.style.setProperty(
        "--zoom-pane-size",
        `${getZoomSizeFrom(rankZoomSizeSelect)}px`
      );
      if (!lastHover || activeToolId !== "rank") return;
      showZoomForImage(
        lastHover.img,
        lastHover.clientX,
        lastHover.clientY,
        lastHover.shiftKey
      );
    });
  }

  if (jobsAInput.value.trim() || jobsBInput.value.trim()) {
    renderComparisons();
  } else {
    refreshPairCards();
  }
  updateFavoritesSummary();
  updateRankSummary();
  updateRankStartButton();
  setActiveTool(getToolFromUrl(), { updateUrl: false });
  if (urlState) saveState();
}

init();
