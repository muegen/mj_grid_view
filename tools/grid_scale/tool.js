import {
  createElement,
  createPlaceholder,
  isEditableTarget,
} from "../shared/dom.js";
import {
  extractJobId,
  buildGridUrl,
  buildIndividualUrl,
} from "../shared/jobs.js";
import { copyText } from "../shared/clipboard.js";
import { createImageFrame } from "../shared/images.js";
import { createZoomManager } from "../shared/zoom.js";
import { detectDelimiter, parseTable } from "../shared/table.js";

const IMAGE_COUNT = 4;
const DEFAULT_ROW_LIMIT = 10;
const DEFAULT_GRID_DENSITY = 10;

export function init({ root }) {
  const viewModeSelect = root.querySelector("#scaleViewMode");
  const imageIndexControl = root.querySelector("#scaleImageIndexControl");
  const imageIndexSelect = root.querySelector("#scaleImageIndex");
  const axisXSelect = root.querySelector("#scaleAxisX");
  const axisYSelect = root.querySelector("#scaleAxisY");
  const swapAxesBtn = root.querySelector("#scaleSwapAxes");
  const rowLimitControl = root.querySelector("#scaleRowLimitControl");
  const rowLimitInput = root.querySelector("#scaleRowLimit");
  const gridDensityControl = root.querySelector("#scaleGridDensityControl");
  const gridDensityInput = root.querySelector("#scaleGridDensity");
  const zoomLevelSelect = root.querySelector("#scaleZoomLevel");
  const zoomSizeSelect = root.querySelector("#scaleZoomSize");
  const clearBtn = root.querySelector("#scaleClearBtn");
  const shareBtn = root.querySelector("#scaleShareBtn");
  const statusEl = root.querySelector("#scaleStatus");
  const shareStatusEl = root.querySelector("#scaleShareStatus");
  const dataInput = root.querySelector("#scaleDataInput");
  const filtersBody = root.querySelector("#scaleFiltersBody");
  const gridEl = root.querySelector("#scaleGrid");
  const shortcutsToggle = root.querySelector("#scaleShortcutsToggle");
  const shortcutsPanel = root.querySelector("#scaleShortcutsPanel");

  const pairRegistry = new Map();
  const zoomManager = createZoomManager();

  let records = [];
  let paramHeaders = [];
  let paramValues = new Map();
  let filterSelections = {};
  let zoomRequiresShift = true;
  let preferredAxisX = "";
  let preferredAxisY = "";
  let parseTimer = null;
  let saveTimer = null;
  let shareStatusTimer = null;

  const controller = new AbortController();
  const { signal } = controller;

  function setShortcutsOpen(isOpen) {
    if (!shortcutsPanel || !shortcutsToggle) return;
    shortcutsPanel.hidden = !isOpen;
    shortcutsToggle.setAttribute("aria-expanded", isOpen.toString());
  }

  function toggleShortcuts() {
    if (!shortcutsPanel) return;
    setShortcutsOpen(shortcutsPanel.hidden);
  }

  function handleShortcutsToggle(event) {
    event.stopPropagation();
    toggleShortcuts();
  }

  function handleShortcutsOutside(event) {
    if (!shortcutsPanel || shortcutsPanel.hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (shortcutsPanel.contains(target) || shortcutsToggle?.contains(target)) {
      return;
    }
    setShortcutsOpen(false);
  }

  function normalizeHeader(header) {
    return (header || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function isJobIdHeader(header) {
    const normalized = normalizeHeader(header);
    return normalized === "jobid" || normalized === "job" || normalized === "uuid";
  }

  function isNumericValue(value) {
    if (value === null || value === undefined) return false;
    if (value === "") return false;
    return Number.isFinite(Number(value));
  }

  function sortValues(values) {
    if (!values.length) return values;
    const numeric = values.every((value) => isNumericValue(value));
    if (!numeric) return values.slice().sort((a, b) => a.localeCompare(b));
    return values.slice().sort((a, b) => Number(a) - Number(b));
  }

  function getNumberInputValue(input, fallback) {
    const value = Number.parseInt(input?.value, 10);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return value;
  }

  function getImageIndex() {
    const value = Number.parseInt(imageIndexSelect?.value, 10);
    if (!Number.isFinite(value) || value < 0 || value >= IMAGE_COUNT) return 0;
    return value;
  }

  function getZoomLevel() {
    const value = Number.parseFloat(zoomLevelSelect?.value);
    return Number.isFinite(value) ? value : 3;
  }

  function getZoomSize() {
    const value = Number.parseFloat(zoomSizeSelect?.value);
    return Number.isFinite(value) ? value : 200;
  }

  function shouldZoom(shiftKey) {
    if (zoomRequiresShift && !shiftKey) return false;
    return true;
  }

  function isTwoAxis() {
    return Boolean(axisYSelect?.value);
  }

  function updateStatus({
    recordCount = 0,
    xValues = [],
    yValues = [],
    sampledX = [],
    sampledY = [],
    duplicates = 0,
  } = {}) {
    if (!statusEl) return;
    if (!recordCount) {
      statusEl.textContent = "Paste TSV data to begin.";
      return;
    }
    const parts = [`Rows: ${recordCount}`];
    if (axisXSelect?.value) {
      const label = axisXSelect.value;
      const suffix =
        sampledX.length && sampledX.length !== xValues.length
          ? ` (${sampledX.length} shown)`
          : "";
      parts.push(`${label}: ${xValues.length}${suffix}`);
    }
    if (axisYSelect?.value) {
      const label = axisYSelect.value;
      const suffix =
        sampledY.length && sampledY.length !== yValues.length
          ? ` (${sampledY.length} shown)`
          : "";
      parts.push(`${label}: ${yValues.length}${suffix}`);
    }
    if (duplicates) {
      parts.push(`Duplicates: ${duplicates}`);
    }
    statusEl.textContent = parts.join(" | ");
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

  function setSelectOptions(select, options, includeNoneLabel) {
    if (!select) return;
    select.innerHTML = "";
    if (includeNoneLabel) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = includeNoneLabel;
      select.appendChild(option);
    }
    options.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function parseData() {
    const raw = dataInput?.value || "";
    records = [];
    paramHeaders = [];
    paramValues = new Map();
    if (!raw.trim()) {
      updateStatus({ recordCount: 0 });
      renderScale();
      return;
    }

    const delimiter = detectDelimiter(raw);
    const { headers, rows } = parseTable(raw, delimiter);
    const jobIdIndex = headers.findIndex((header) => isJobIdHeader(header));

    if (jobIdIndex < 0) {
      updateStatus({ recordCount: 0 });
      renderScale("Missing job_id column.");
      return;
    }

    const paramColumns = headers
      .map((header, idx) => ({ header: header.trim(), idx }))
      .filter((entry) => entry.idx !== jobIdIndex && entry.header);
    paramHeaders = paramColumns.map((entry) => entry.header);

    rows.forEach((cells) => {
      const jobId = extractJobId(cells[jobIdIndex] || "");
      const params = {};
      paramColumns.forEach(({ header, idx }) => {
        const value = cells[idx] ?? "";
        params[header] = value.trim();
        if (params[header]) {
          if (!paramValues.has(header)) {
            paramValues.set(header, new Set());
          }
          paramValues.get(header).add(params[header]);
        }
      });

      const hasData = jobId || Object.values(params).some((value) => value);
      if (!hasData) return;
      records.push({ jobId, params });
    });

    refreshAxisSelectors();
    refreshFilterControls();
    renderScale();
  }

  function refreshAxisSelectors() {
    const availableParams = paramHeaders;
    setSelectOptions(axisXSelect, availableParams);
    setSelectOptions(axisYSelect, availableParams, "None (1D)");

    if (availableParams.length) {
      const nextX = preferredAxisX || axisXSelect.value;
      const nextY = preferredAxisY || axisYSelect.value;
      axisXSelect.value = availableParams.includes(nextX)
        ? nextX
        : availableParams[0];
      axisYSelect.value = availableParams.includes(nextY)
        ? nextY
        : availableParams[1] || "";
    } else {
      axisXSelect.value = "";
      axisYSelect.value = "";
    }
    updateLayoutVisibility();
  }

  function refreshFilterControls() {
    if (!filtersBody) return;
    filtersBody.innerHTML = "";
    const xParam = axisXSelect?.value || "";
    const yParam = axisYSelect?.value || "";
    const filterParams = paramHeaders.filter(
      (param) => param !== xParam && param !== yParam
    );

    if (!filterParams.length) {
      filtersBody.appendChild(
        createElement("div", "placeholder", "No filters available.")
      );
      return;
    }

    filterParams.forEach((param) => {
      const values = sortValues(Array.from(paramValues.get(param) || []));
      const label = createElement("label", "control");
      label.textContent = param;
      const select = document.createElement("select");
      select.dataset.param = param;
      const allOption = document.createElement("option");
      allOption.value = "__all__";
      allOption.textContent = "All values";
      select.appendChild(allOption);
      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
      select.value = filterSelections[param] || "__all__";
      label.appendChild(select);
      filtersBody.appendChild(label);

      select.addEventListener(
        "change",
        () => {
          filterSelections[param] = select.value;
          scheduleSave();
          renderScale();
        },
        { signal }
      );
    });
  }

  function getFilteredRecords() {
    const xParam = axisXSelect?.value || "";
    const yParam = axisYSelect?.value || "";
    const activeFilters = Object.entries(filterSelections).filter(
      ([param, value]) =>
        value && value !== "__all__" && param !== xParam && param !== yParam
    );

    if (!activeFilters.length) return records;
    return records.filter((record) =>
      activeFilters.every(([param, value]) => record.params[param] === value)
    );
  }

  function getAxisValues(filteredRecords, param) {
    if (!param) return [];
    const values = new Set();
    filteredRecords.forEach((record) => {
      const value = record.params[param];
      if (value) values.add(value);
    });
    return sortValues(Array.from(values));
  }

  function sampleValues(values, target) {
    if (!values.length) return [];
    if (target >= values.length) return values.slice();
    if (target <= 1) return [values[0]];
    const step = (values.length - 1) / (target - 1);
    const sampled = [];
    for (let i = 0; i < target; i += 1) {
      const index = Math.round(i * step);
      sampled.push(values[index]);
    }
    return Array.from(new Set(sampled));
  }

  function renderScale(message) {
    if (!gridEl) return;
    gridEl.innerHTML = "";
    pairRegistry.clear();
    zoomManager.hide();

    if (message) {
      gridEl.appendChild(createPlaceholder(message));
      return;
    }

    if (!records.length) {
      gridEl.appendChild(createPlaceholder("Paste TSV data to preview a scale."));
      updateStatus({ recordCount: 0 });
      return;
    }

    const xParam = axisXSelect?.value;
    const yParam = axisYSelect?.value;
    if (!xParam) {
      gridEl.appendChild(createPlaceholder("Select an X axis to render."));
      updateStatus({ recordCount: records.length });
      return;
    }

    const filteredRecords = getFilteredRecords();
    const xValues = getAxisValues(filteredRecords, xParam);
    const yValues = getAxisValues(filteredRecords, yParam);
    if (!xValues.length) {
      gridEl.appendChild(createPlaceholder("No matching values found."));
      updateStatus({ recordCount: filteredRecords.length });
      return;
    }
    if (yParam && !yValues.length) {
      gridEl.appendChild(createPlaceholder("No matching values found."));
      updateStatus({ recordCount: filteredRecords.length });
      return;
    }

    if (!yParam) {
      renderOneAxis(filteredRecords, xParam, xValues);
      updateStatus({ recordCount: filteredRecords.length, xValues });
      return;
    }

    renderTwoAxis(filteredRecords, xParam, yParam, xValues, yValues);
  }

  function renderOneAxis(filteredRecords, xParam, xValues) {
    const rowLimit = getNumberInputValue(rowLimitInput, DEFAULT_ROW_LIMIT);
    const valueMap = new Map();
    filteredRecords.forEach((record) => {
      const xValue = record.params[xParam];
      if (!xValue || valueMap.has(xValue)) return;
      valueMap.set(xValue, record);
    });

    const grid = createElement("div", "scale-grid scale-grid-single");
    grid.style.gridTemplateColumns = `repeat(${rowLimit}, minmax(160px, 1fr))`;

    xValues.forEach((value, index) => {
      const record = valueMap.get(value);
      const cell = createElement("div", "scale-cell");
      cell.appendChild(createElement("div", "scale-cell-label", value));
      const jobId = record?.jobId || "";
      const imageUrl =
        viewModeSelect.value === "individual"
          ? buildIndividualUrl(jobId, getImageIndex())
          : buildGridUrl(jobId);
      cell.appendChild(
        createImageFrame({
          url: imageUrl,
          altText: `${xParam} ${value}`,
          pairId: `scale-1d-${index}`,
          side: "A",
          jobId,
          registry: pairRegistry,
        })
      );
      grid.appendChild(cell);
    });

    gridEl.appendChild(grid);
  }

  function renderTwoAxis(filteredRecords, xParam, yParam, xValues, yValues) {
    const gridDensity = getNumberInputValue(
      gridDensityInput,
      DEFAULT_GRID_DENSITY
    );
    const sampledX = sampleValues(xValues, gridDensity);
    const sampledY = sampleValues(yValues, gridDensity);
    const recordMap = new Map();
    let duplicates = 0;

    filteredRecords.forEach((record) => {
      const xValue = record.params[xParam];
      const yValue = record.params[yParam];
      if (!xValue || !yValue) return;
      const key = `${xValue}||${yValue}`;
      if (recordMap.has(key)) {
        duplicates += 1;
        return;
      }
      recordMap.set(key, record);
    });

    const grid = createElement("div", "scale-grid");
    grid.style.gridTemplateColumns = `minmax(120px, 160px) repeat(${sampledX.length}, minmax(160px, 1fr))`;

    grid.appendChild(createElement("div", "scale-axis scale-axis-corner", ""));
    sampledX.forEach((value) => {
      grid.appendChild(createElement("div", "scale-axis scale-axis-x", value));
    });

    sampledY.forEach((yValue, rowIndex) => {
      grid.appendChild(createElement("div", "scale-axis scale-axis-y", yValue));
      sampledX.forEach((xValue, colIndex) => {
        const key = `${xValue}||${yValue}`;
        const record = recordMap.get(key);
        const cell = createElement("div", "scale-cell");
        const jobId = record?.jobId || "";
        const imageUrl =
          viewModeSelect.value === "individual"
            ? buildIndividualUrl(jobId, getImageIndex())
            : buildGridUrl(jobId);
        cell.appendChild(
          createImageFrame({
            url: imageUrl,
            altText: `${xValue} / ${yValue}`,
            pairId: `scale-${rowIndex}-${colIndex}`,
            side: "A",
            jobId,
            registry: pairRegistry,
          })
        );
        grid.appendChild(cell);
      });
    });

    gridEl.appendChild(grid);
    updateStatus({
      recordCount: filteredRecords.length,
      xValues,
      yValues,
      sampledX,
      sampledY,
      duplicates,
    });
  }

  function updateLayoutVisibility() {
    const twoAxis = isTwoAxis();
    if (rowLimitControl) {
      rowLimitControl.classList.toggle("is-hidden", twoAxis);
    }
    if (gridDensityControl) {
      gridDensityControl.classList.toggle("is-hidden", !twoAxis);
    }
  }

  function updateImageIndexVisibility() {
    const isIndividual = viewModeSelect.value === "individual";
    if (imageIndexControl) {
      imageIndexControl.classList.toggle("is-hidden", !isIndividual);
    }
  }

  function toggleViewMode() {
    viewModeSelect.value =
      viewModeSelect.value === "grid" ? "individual" : "grid";
    updateImageIndexVisibility();
    renderScale();
    scheduleSave();
  }

  function toggleZoomLevel() {
    if (!zoomLevelSelect.options.length) return;
    const nextIndex =
      (zoomLevelSelect.selectedIndex + 1) % zoomLevelSelect.options.length;
    zoomLevelSelect.selectedIndex = nextIndex;
    scheduleSave();
    zoomManager.refresh();
  }

  function toggleZoomSize() {
    if (!zoomSizeSelect.options.length) return;
    const nextIndex =
      (zoomSizeSelect.selectedIndex + 1) % zoomSizeSelect.options.length;
    zoomSizeSelect.selectedIndex = nextIndex;
    scheduleSave();
    zoomManager.updatePaneSize();
    zoomManager.refresh();
  }

  function toggleZoomRequiresShift() {
    zoomRequiresShift = !zoomRequiresShift;
    zoomManager.hide();
    scheduleSave();
  }

  function handleShortcutKey(event) {
    if (isEditableTarget(event.target)) return;
    if (event.key === "/" || event.key === "?") {
      event.preventDefault();
      toggleShortcuts();
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
    if (event.key === "h" || event.key === "H") {
      event.preventDefault();
      toggleZoomRequiresShift();
    }
    if (event.key >= "1" && event.key <= "4") {
      event.preventDefault();
      const index = Number.parseInt(event.key, 10) - 1;
      if (index >= 0 && index < IMAGE_COUNT) {
        imageIndexSelect.value = String(index);
        updateImageIndexVisibility();
        renderScale();
        scheduleSave();
      }
    }
  }

  function scheduleParse() {
    if (parseTimer) window.clearTimeout(parseTimer);
    parseTimer = window.setTimeout(parseData, 200);
  }

  function getState() {
    return {
      rawInput: dataInput?.value || "",
      viewMode: viewModeSelect.value,
      imageIndex: imageIndexSelect.value,
      xParam: axisXSelect.value,
      yParam: axisYSelect.value,
      rowLimit: rowLimitInput.value,
      gridDensity: gridDensityInput.value,
      zoomLevel: zoomLevelSelect.value,
      zoomSize: zoomSizeSelect.value,
      zoomRequiresShift,
      filters: filterSelections,
    };
  }

  function applyState(state) {
    if (!state) return;
    if (state.rawInput !== undefined && dataInput) {
      dataInput.value = state.rawInput;
    }
    if (state.viewMode) viewModeSelect.value = state.viewMode;
    if (state.imageIndex && imageIndexSelect) {
      imageIndexSelect.value = state.imageIndex;
    }
    if (state.xParam) preferredAxisX = state.xParam;
    if (state.yParam !== undefined) preferredAxisY = state.yParam;
    if (state.rowLimit && rowLimitInput) rowLimitInput.value = state.rowLimit;
    if (state.gridDensity && gridDensityInput) {
      gridDensityInput.value = state.gridDensity;
    }
    if (state.zoomLevel && zoomLevelSelect) {
      zoomLevelSelect.value = state.zoomLevel;
    }
    if (state.zoomSize && zoomSizeSelect) {
      zoomSizeSelect.value = state.zoomSize;
    }
    if (typeof state.zoomRequiresShift === "boolean") {
      zoomRequiresShift = state.zoomRequiresShift;
    }
    if (state.filters && typeof state.filters === "object") {
      filterSelections = state.filters;
    }
  }

  function saveState() {
    try {
      const state = getState();
      localStorage.setItem("mj-grid-scale-state", JSON.stringify(state));
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function scheduleSave() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveState, 200);
  }

  function parseStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const keys = ["x", "y", "vm", "ii", "rl", "gd", "zl", "zs", "zk", "f"];
    const hasAny = keys.some((key) => params.has(key));
    if (!hasAny) return null;
    let filters = {};
    try {
      filters = params.get("f") ? JSON.parse(params.get("f")) : {};
    } catch (error) {
      filters = {};
    }
    return {
      xParam: params.get("x") ?? "",
      yParam: params.get("y") ?? "",
      viewMode: params.get("vm") ?? "grid",
      imageIndex: params.get("ii") ?? "0",
      rowLimit: params.get("rl") ?? String(DEFAULT_ROW_LIMIT),
      gridDensity: params.get("gd") ?? String(DEFAULT_GRID_DENSITY),
      zoomLevel: params.get("zl") ?? "3",
      zoomSize: params.get("zs") ?? "300",
      zoomRequiresShift: params.get("zk") !== null ? params.get("zk") !== "0" : true,
      filters,
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
    params.set("tool", "scale");
    if (state.xParam) params.set("x", state.xParam);
    if (state.yParam) params.set("y", state.yParam);
    params.set("vm", state.viewMode);
    params.set("ii", state.imageIndex);
    params.set("rl", state.rowLimit);
    params.set("gd", state.gridDensity);
    params.set("zl", state.zoomLevel);
    params.set("zs", state.zoomSize);
    params.set("zk", state.zoomRequiresShift ? "1" : "0");
    const filters = Object.entries(state.filters || {}).reduce((acc, [key, value]) => {
      if (value && value !== "__all__") acc[key] = value;
      return acc;
    }, {});
    if (Object.keys(filters).length) {
      params.set("f", JSON.stringify(filters));
    }
    return `${getBaseUrl()}?${params.toString()}`;
  }

  async function copyShareLink() {
    const link = buildShareUrl();
    try {
      const ok = await copyText(link);
      if (!ok) throw new Error("Clipboard unavailable");
      showShareStatus("Share link copied.");
    } catch (error) {
      showShareStatus("Copy failed. Link in console.", true);
      console.info("Share link:", link);
    }
  }

  function handleAxisChange() {
    preferredAxisX = axisXSelect.value;
    preferredAxisY = axisYSelect.value;
    refreshFilterControls();
    updateLayoutVisibility();
    renderScale();
    scheduleSave();
  }

  function clearData() {
    if (dataInput) dataInput.value = "";
    records = [];
    paramHeaders = [];
    paramValues = new Map();
    filterSelections = {};
    renderScale();
    scheduleSave();
  }

  const urlState = parseStateFromUrl();
  const storedState = urlState ? null : loadStateFromStorage();
  applyState(urlState || storedState);

  zoomManager.setConfig({
    getActiveSides: () => ["A"],
    getSideLabel: () => "Zoom",
    getZoomLevel,
    getZoomSize,
    shouldZoom,
    getRegistry: () => pairRegistry,
    getDisplayOrder: () => ["A"],
  });
  zoomManager.attach(gridEl);
  zoomManager.updatePaneSize();

  parseData();
  updateImageIndexVisibility();

  function loadStateFromStorage() {
    try {
      const raw = localStorage.getItem("mj-grid-scale-state");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  if (dataInput) {
    dataInput.addEventListener("input", () => {
      scheduleParse();
      scheduleSave();
    }, { signal });
  }

  axisXSelect.addEventListener("change", handleAxisChange, { signal });
  axisYSelect.addEventListener("change", handleAxisChange, { signal });
  swapAxesBtn.addEventListener(
    "click",
    () => {
      if (!axisYSelect.value) return;
      const currentX = axisXSelect.value;
      axisXSelect.value = axisYSelect.value;
      axisYSelect.value = currentX;
      handleAxisChange();
    },
    { signal }
  );

  viewModeSelect.addEventListener(
    "change",
    () => {
      updateImageIndexVisibility();
      renderScale();
      scheduleSave();
    },
    { signal }
  );
  imageIndexSelect.addEventListener(
    "change",
    () => {
      renderScale();
      scheduleSave();
    },
    { signal }
  );
  rowLimitInput.addEventListener(
    "change",
    () => {
      renderScale();
      scheduleSave();
    },
    { signal }
  );
  gridDensityInput.addEventListener(
    "change",
    () => {
      renderScale();
      scheduleSave();
    },
    { signal }
  );
  zoomLevelSelect.addEventListener(
    "change",
    () => {
      scheduleSave();
      zoomManager.refresh();
    },
    { signal }
  );
  zoomSizeSelect.addEventListener(
    "change",
    () => {
      scheduleSave();
      zoomManager.updatePaneSize();
      zoomManager.refresh();
    },
    { signal }
  );

  clearBtn.addEventListener("click", clearData, { signal });
  shareBtn.addEventListener("click", copyShareLink, { signal });

  if (shortcutsToggle) {
    shortcutsToggle.addEventListener("click", handleShortcutsToggle, { signal });
    document.addEventListener("click", handleShortcutsOutside, { signal });
  }

  document.addEventListener("keydown", handleShortcutKey, { signal });

  if (urlState) scheduleSave();

  return {
    destroy: () => {
      controller.abort();
      if (parseTimer) window.clearTimeout(parseTimer);
      if (saveTimer) window.clearTimeout(saveTimer);
      if (shareStatusTimer) window.clearTimeout(shareStatusTimer);
      zoomManager.destroy();
    },
  };
}
