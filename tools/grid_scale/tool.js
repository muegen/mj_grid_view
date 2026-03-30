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
import { captureZoomPanel, finalizeCapture } from "../shared/zoom_capture.js";
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
  const captureZoomBtn = root.querySelector("#scaleCaptureZoomBtn");
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
  let previewFitToPanel = false;
  let previewOverlay = null;
  let previewPanel = null;
  let previewInner = null;
  let previewCaptureBtn = null;
  let previewFitBtn = null;
  let previewStatusEl = null;
  let previewStatusTimer = null;
  let previewOpen = false;
  let lastScaleLayout = null;
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
    return normalized === "id";
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
      renderScale("Missing id column.");
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
    lastScaleLayout = null;

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
      const label = createElement("div", "scale-cell-label scale-cell-label-single");
      const key = createElement("span", "scale-cell-label-key", xParam);
      const val = createElement("span", "scale-cell-label-value", value);
      label.appendChild(key);
      label.appendChild(val);
      cell.appendChild(label);
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
    refreshScalePreview();
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
    const containerWidth =
      gridEl?.clientWidth || gridEl?.parentElement?.clientWidth || 0;
    const columnGap = 6;
    const labelCandidates = [
      `X: ${xParam}`,
      `Y: ${yParam}`,
      ...sampledY.map((value) => String(value)),
    ];
    const longestLabel = labelCandidates.reduce(
      (max, label) => Math.max(max, label.length),
      0
    );
    const axisColWidth = Math.min(120, Math.max(36, longestLabel * 7 + 12));
    const availableWidth = Math.max(
      0,
      containerWidth - axisColWidth - columnGap * sampledX.length
    );
    const minCellWidth =
      sampledX.length > 0 ? Math.max(48, Math.floor(availableWidth / sampledX.length)) : 120;

    grid.style.gridTemplateColumns = `minmax(32px, ${axisColWidth}px) repeat(${sampledX.length}, minmax(${minCellWidth}px, 1fr))`;
    const cellPadding = Math.max(2, Math.min(4, Math.floor(minCellWidth / 12)));
    const framePadding = Math.max(2, cellPadding - 2);
    grid.style.setProperty("--scale-cell-padding", `${cellPadding}px`);
    grid.style.setProperty("--scale-frame-padding", `${framePadding}px`);

    const corner = createElement("div", "scale-axis scale-axis-corner");
    corner.appendChild(createElement("div", "scale-axis-label", `X: ${xParam}`));
    corner.appendChild(createElement("div", "scale-axis-label", `Y: ${yParam}`));
    grid.appendChild(corner);
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
    lastScaleLayout = { xParam, yParam, sampledX, sampledY };
    refreshScalePreview();
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

  function parsePixelValue(value, fallback = 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
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

  function isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number.parseFloat(style.opacity) === 0) return false;
    return true;
  }

  function updatePreviewFitToggle() {
    if (!previewFitBtn) return;
    previewFitBtn.classList.toggle("is-active", previewFitToPanel);
    previewFitBtn.setAttribute("aria-pressed", previewFitToPanel.toString());
    previewFitBtn.textContent = previewFitToPanel ? "Fit: On" : "Fit: Off";
  }

  function togglePreviewFit() {
    previewFitToPanel = !previewFitToPanel;
    updatePreviewFitToggle();
    refreshScalePreview();
  }

  function showPreviewStatus(message, isError = false, hold = false) {
    if (!previewStatusEl) return;
    if (previewStatusTimer) window.clearTimeout(previewStatusTimer);
    previewStatusEl.textContent = message;
    previewStatusEl.classList.toggle("is-error", Boolean(isError));
    previewStatusEl.classList.toggle("is-pending", Boolean(hold && !isError));
    if (!message || hold) return;
    previewStatusTimer = window.setTimeout(() => {
      previewStatusEl.textContent = "";
      previewStatusEl.classList.remove("is-error", "is-pending");
    }, 2000);
  }

  function getPreviewScale() {
    const base = getZoomLevel();
    return Math.max(1, base / 3);
  }

  function ensureScalePreview() {
    if (previewOverlay) return;
    previewOverlay = createElement("div", "scale-preview-overlay");
    const backdrop = createElement("div", "scale-preview-backdrop");
    previewPanel = createElement("div", "scale-preview-panel");
    const header = createElement("div", "scale-preview-header");
    const meta = createElement("div", "scale-preview-meta");
    meta.appendChild(createElement("div", "scale-preview-title", "Scale Preview"));
    previewStatusEl = createElement("div", "scale-preview-status");
    meta.appendChild(previewStatusEl);
    header.appendChild(meta);
    const actions = createElement("div", "scale-preview-actions");
    previewFitBtn = createElement("button", "secondary");
    previewFitBtn.type = "button";
    previewFitBtn.addEventListener("click", togglePreviewFit);
    updatePreviewFitToggle();
    previewCaptureBtn = createElement("button", "secondary", "Capture");
    previewCaptureBtn.type = "button";
    previewCaptureBtn.addEventListener("click", () => captureScalePreviewPanel());
    const closeBtn = createElement("button", "secondary");
    closeBtn.type = "button";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => setPreviewOpen(false));
    actions.appendChild(previewFitBtn);
    actions.appendChild(previewCaptureBtn);
    actions.appendChild(closeBtn);
    header.appendChild(actions);
    previewInner = createElement("div", "scale-preview-inner");
    previewPanel.appendChild(header);
    previewPanel.appendChild(previewInner);
    previewOverlay.appendChild(backdrop);
    previewOverlay.appendChild(previewPanel);
    document.body.appendChild(previewOverlay);
    backdrop.addEventListener("click", () => setPreviewOpen(false));
  }

  function refreshScalePreview() {
    if (!previewOpen || !previewInner) return;
    previewInner.innerHTML = "";
    const content = gridEl?.firstElementChild;
    if (!content) return;
    const clone = content.cloneNode(true);
    let scale = getPreviewScale();
    const targetAxisFontSize = 10;
    if (clone.classList.contains("scale-grid") && lastScaleLayout) {
      const previewWidth = previewInner.clientWidth || 0;
      const columnGap = 4;
      const labelCandidates = [
        `X: ${lastScaleLayout.xParam}`,
        `Y: ${lastScaleLayout.yParam}`,
        ...lastScaleLayout.sampledY.map((value) => String(value)),
      ];
      const longestLabel = labelCandidates.reduce(
        (max, label) => Math.max(max, label.length),
        0
      );
      const labelCharWidth = Math.max(7, Math.round(targetAxisFontSize * 0.75));
      const axisColWidth = Math.min(
        140,
        Math.max(56, Math.round(longestLabel * labelCharWidth + 16))
      );
      const availableWidth = Math.max(
        0,
        previewWidth - axisColWidth - columnGap * lastScaleLayout.sampledX.length
      );
      const minCellWidth =
        lastScaleLayout.sampledX.length > 0
          ? Math.max(
              48,
              Math.floor(availableWidth / lastScaleLayout.sampledX.length)
            )
          : 120;
      clone.style.gridTemplateColumns = `minmax(24px, ${axisColWidth}px) repeat(${lastScaleLayout.sampledX.length}, minmax(${minCellWidth}px, 1fr))`;
    }
    const axisFontSize = previewFitToPanel
      ? targetAxisFontSize
      : targetAxisFontSize / scale;
    clone.style.setProperty(
      "--scale-preview-axis-font",
      `${Math.round(axisFontSize * 10) / 10}px`
    );
    previewInner.appendChild(clone);
    if (previewFitToPanel) {
      const availableWidth = previewInner.clientWidth || 0;
      const availableHeight = previewInner.clientHeight || 0;
      const naturalRect = clone.getBoundingClientRect();
      const naturalWidth = naturalRect.width || 0;
      const naturalHeight = naturalRect.height || 0;
      if (availableWidth && availableHeight && naturalWidth && naturalHeight) {
        scale = Math.min(
          availableWidth / naturalWidth,
          availableHeight / naturalHeight
        );
      }
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    }
    clone.style.transform = `scale(${scale})`;
    clone.style.transformOrigin = "top left";
  }

  function setPreviewOpen(isOpen) {
    ensureScalePreview();
    previewOpen = isOpen;
    if (!previewOverlay) return;
    previewOverlay.classList.toggle("is-visible", previewOpen);
    if (previewOpen) {
      refreshScalePreview();
    }
  }

  function toggleScalePreview() {
    setPreviewOpen(!previewOpen);
  }

  async function captureScalePreviewPanel() {
    if (!previewOpen || !previewPanel || !previewInner) {
      showShareStatus("Open the scale preview first.", true);
      showPreviewStatus("Open the scale preview first.", true);
      return;
    }

    refreshScalePreview();
    const panelRect = previewPanel.getBoundingClientRect();
    if (!panelRect.width || !panelRect.height) {
      showShareStatus("Scale preview is empty.", true);
      showPreviewStatus("Scale preview is empty.", true);
      return;
    }

    showPreviewStatus("Capturing scale preview...", false, true);
    console.info("[scale] Capturing scale preview...");

    const content = previewInner.firstElementChild;
    const innerRect = previewInner.getBoundingClientRect();
    const innerStyle = window.getComputedStyle(previewInner);
    const paddingLeft = parsePixelValue(innerStyle.paddingLeft);
    const paddingRight = parsePixelValue(innerStyle.paddingRight);
    const paddingTop = parsePixelValue(innerStyle.paddingTop);
    const paddingBottom = parsePixelValue(innerStyle.paddingBottom);
    const contentRect = content ? content.getBoundingClientRect() : innerRect;
    const contentWidth = contentRect.width || innerRect.width;
    const contentHeight = contentRect.height || innerRect.height;

    const innerFullWidth = Math.max(
      innerRect.width,
      contentWidth + paddingLeft + paddingRight
    );
    const innerFullHeight = Math.max(
      innerRect.height,
      contentHeight + paddingTop + paddingBottom
    );
    const innerOffsetX = innerRect.left - panelRect.left;
    const innerOffsetY = innerRect.top - panelRect.top;
    const extraRight = panelRect.right - innerRect.right;
    const extraBottom = panelRect.bottom - innerRect.bottom;
    const fullWidth = Math.max(panelRect.width, innerOffsetX + innerFullWidth + extraRight);
    const fullHeight = Math.max(panelRect.height, innerOffsetY + innerFullHeight + extraBottom);
    const contentStartX = innerOffsetX + paddingLeft;
    const contentStartY = innerOffsetY + paddingTop;

    const scale = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(fullWidth * scale));
    canvas.height = Math.max(1, Math.round(fullHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      showShareStatus("Scale preview capture failed.", true);
      showPreviewStatus("Scale preview capture failed.", true);
      return;
    }
    ctx.scale(scale, scale);

    const panelStyle = window.getComputedStyle(previewPanel);
    const panelRadius = parsePixelValue(panelStyle.borderRadius);
    const panelBorderWidth = parsePixelValue(panelStyle.borderWidth);
    const panelBorderColor = panelStyle.borderColor || "#000";
    const panelBackground = panelStyle.backgroundColor || "#fff";
    fillRoundedRect(ctx, 0, 0, fullWidth, fullHeight, panelRadius, panelBackground);
    strokeRoundedRect(
      ctx,
      0,
      0,
      fullWidth,
      fullHeight,
      panelRadius,
      panelBorderColor,
      panelBorderWidth
    );

    const innerRadius = parsePixelValue(innerStyle.borderRadius);
    const innerBackground = innerStyle.backgroundColor || "#f5f7fb";
    fillRoundedRect(
      ctx,
      innerOffsetX,
      innerOffsetY,
      innerFullWidth,
      innerFullHeight,
      innerRadius,
      innerBackground
    );

    const warnings = new Set();
    const imageCache = new Map();
    const images = Array.from(previewPanel.querySelectorAll("img"));
    const imageEntries = images
      .map((img) => ({
        src: img.currentSrc || img.src,
        rect: img.getBoundingClientRect(),
        inPreview: previewInner.contains(img),
      }))
      .filter((entry) => entry.src && entry.rect.width && entry.rect.height);

    const loadImage = (src) => {
      if (imageCache.has(src)) return imageCache.get(src);
      const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Image failed to load"));
        image.src = src;
      });
      imageCache.set(src, promise);
      return promise;
    };

    const resolvedImages = await Promise.all(
      imageEntries.map(async (entry) => {
        try {
          const image = await loadImage(entry.src);
          return { ...entry, image };
        } catch (error) {
          warnings.add("image-load");
          return { ...entry, image: null };
        }
      })
    );

    resolvedImages.forEach((entry) => {
      if (!entry.image) return;
      const x = entry.inPreview
        ? contentStartX + (entry.rect.left - contentRect.left)
        : entry.rect.left - panelRect.left;
      const y = entry.inPreview
        ? contentStartY + (entry.rect.top - contentRect.top)
        : entry.rect.top - panelRect.top;
      ctx.drawImage(entry.image, x, y, entry.rect.width, entry.rect.height);
    });

    const textSelectors = [
      ".scale-preview-title",
      ".scale-axis",
      ".scale-axis-label",
      ".scale-cell-label-key",
      ".scale-cell-label-value",
      ".image-caption",
      ".placeholder",
    ];
    const textElements = Array.from(
      previewPanel.querySelectorAll(textSelectors.join(","))
    ).filter((element) => element.childElementCount === 0);

    textElements.forEach((element) => {
      if (!isElementVisible(element)) return;
      const text = (element.textContent || "").trim();
      if (!text) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const style = window.getComputedStyle(element);
      ctx.font = getFontString(style);
      ctx.fillStyle = style.color || "#111";
      ctx.textBaseline = "top";
      const inPreview = previewInner.contains(element);
      let x = inPreview
        ? contentStartX + (rect.left - contentRect.left)
        : rect.left - panelRect.left;
      let y = inPreview
        ? contentStartY + (rect.top - contentRect.top)
        : rect.top - panelRect.top;
      const align = style.textAlign || "left";
      if (align === "center") {
        x += rect.width / 2;
      } else if (align === "right" || align === "end") {
        x += rect.width;
      }
      ctx.textAlign = align === "center" ? "center" : align === "right" || align === "end" ? "right" : "left";
      ctx.fillText(text, x, y);
    });

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) {
      showShareStatus("Capture blocked by browser. Use system snip.", true);
      showPreviewStatus("Capture blocked by browser. Use system snip.", true);
      return;
    }

    await finalizeCapture({
      blob,
      warnings: Array.from(warnings),
      setStatus: (message, isError) => {
        showShareStatus(message, isError);
        showPreviewStatus(message, isError);
        console.info("[scale] " + message);
      },
      filePrefix: "scale-preview",
      label: "Scale preview",
    });
  }

  async function handleCapturePanel() {
    if (previewOpen) {
      await captureScalePreviewPanel();
      return;
    }
    showShareStatus("Capturing zoom panel...");
    console.info("[scale] Capturing zoom panel...");
    await captureZoomPanel({
      zoomManager,
      setStatus: (message, isError) => {
        showShareStatus(message, isError);
        console.info("[scale] " + message);
      },
      filePrefix: "scale-zoom",
    });
  }

  function handleShortcutKey(event) {
    if (isEditableTarget(event.target)) return;
    if (event.key === "Escape" && previewOpen) {
      event.preventDefault();
      setPreviewOpen(false);
    }
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
    if (event.key === "p" || event.key === "P") {
      event.preventDefault();
      toggleScalePreview();
    }
    if (event.key === "c" || event.key === "C") {
      event.preventDefault();
      handleCaptureZoomPanel();
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
    const keys = ["x", "y", "vm", "ii", "rl", "gd", "zl", "zs", "zk", "f", "d"];
    const hasAny = keys.some((key) => params.has(key));
    if (!hasAny) return null;
    let filters = {};
    try {
      filters = params.get("f") ? JSON.parse(params.get("f")) : {};
    } catch (error) {
      filters = {};
    }
    return {
      rawInput: decodeShareData(params.get("d")),
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

  function encodeShareData(raw) {
    try {
      return btoa(unescape(encodeURIComponent(raw)));
    } catch (error) {
      return "";
    }
  }

  function decodeShareData(raw) {
    if (!raw) return "";
    try {
      return decodeURIComponent(escape(atob(raw)));
    } catch (error) {
      return "";
    }
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
    if (state.rawInput) {
      const encoded = encodeShareData(state.rawInput);
      if (encoded) params.set("d", encoded);
    }
    return `${getBaseUrl()}?${params.toString()}`;
  }

  async function copyShareLink() {
    const link = buildShareUrl();
    try {
      const ok = await copyText(link);
      if (!ok) throw new Error("Clipboard unavailable");
      if (link.length > 4000) {
        showShareStatus("Share link copied (large).");
      } else {
        showShareStatus("Share link copied.");
      }
    } catch (error) {
      showShareStatus("Copy failed. Link in console.", true);
      console.info("Share link:", link);
    }
  }

  async function handleCaptureZoomPanel() {
    await handleCapturePanel();
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
  if (captureZoomBtn) {
    captureZoomBtn.addEventListener("click", handleCaptureZoomPanel, { signal });
  }
  shareBtn.addEventListener("click", copyShareLink, { signal });

  if (shortcutsToggle) {
    shortcutsToggle.addEventListener("click", handleShortcutsToggle, { signal });
    document.addEventListener("click", handleShortcutsOutside, { signal });
  }

  document.addEventListener("keydown", handleShortcutKey, { signal });
  window.addEventListener("beforeunload", saveState, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") saveState();
    },
    { signal }
  );

  if (urlState) scheduleSave();

  return {
    destroy: () => {
      controller.abort();
      if (parseTimer) window.clearTimeout(parseTimer);
      if (saveTimer) window.clearTimeout(saveTimer);
      if (shareStatusTimer) window.clearTimeout(shareStatusTimer);
      if (previewOverlay) previewOverlay.remove();
      zoomManager.destroy();
    },
  };
}
