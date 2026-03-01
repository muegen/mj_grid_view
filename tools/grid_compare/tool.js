import {
  createElement,
  createPlaceholder,
  isEditableTarget,
} from "../shared/dom.js";
import {
  parseJobIds,
  buildGridUrl,
  buildIndividualUrl,
} from "../shared/jobs.js";
import { copyText } from "../shared/clipboard.js";
import { createImageFrame } from "../shared/images.js";
import { createZoomManager } from "../shared/zoom.js";

const IMAGE_COUNT = 4;
const PLACEHOLDER_MESSAGES = {
  missing: "Missing job",
  error: "Image failed to load",
  empty: "Paste job IDs to start comparing",
};

export function init({ root }) {
  const viewModeSelect = root.querySelector("#viewMode");
  const columnCountSelect = root.querySelector("#columnCount");
  const renderBtn = root.querySelector("#renderBtn");
  const clearBtn = root.querySelector("#clearBtn");
  const labelAInput = root.querySelector("#labelA");
  const labelBInput = root.querySelector("#labelB");
  const labelCInput = root.querySelector("#labelC");
  const jobsAInput = root.querySelector("#jobsA");
  const jobsBInput = root.querySelector("#jobsB");
  const jobsCInput = root.querySelector("#jobsC");
  const statusEl = root.querySelector("#status");
  const comparisonsEl = root.querySelector("#comparisons");
  const zoomLevelSelect = root.querySelector("#zoomLevel");
  const zoomSizeSelect = root.querySelector("#zoomSize");
  const shareBtn = root.querySelector("#shareBtn");
  const pairIndicatorEl = root.querySelector("#pairIndicator");
  const shareStatusEl = root.querySelector("#shareStatus");
  const inputCardC = root.querySelector("#inputCardC");
  const favoritesBody = root.querySelector("#favoritesBody");
  const favoritesEmptyEl = root.querySelector("#favoritesEmpty");
  const favoritesCopyBtn = root.querySelector("#favoritesCopyBtn");
  const favoritesStatusEl = root.querySelector("#favoritesStatus");
  const shortcutsToggle = root.querySelector("#shortcutsToggle");
  const shortcutsPanel = root.querySelector("#shortcutsPanel");

  const pairRegistry = new Map();
  const favoritesMap = new Map();
  const zoomManager = createZoomManager();
  const SIDE_CONFIG = {
    A: { labelInput: labelAInput, jobsInput: jobsAInput },
    B: { labelInput: labelBInput, jobsInput: jobsBInput },
    C: { labelInput: labelCInput, jobsInput: jobsCInput },
  };

  let lastHoverImg = null;
  let pairCards = [];
  let currentPairIndex = -1;
  let shareStatusTimer = null;
  let saveTimer = null;
  let renderTimer = null;
  let favoritesStatusTimer = null;
  let scrollTicking = false;
  let zoomRequiresShift = true;

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

  function getZoomLevel() {
    const value = Number.parseFloat(zoomLevelSelect.value);
    return Number.isFinite(value) ? value : 3;
  }

  function getZoomSize() {
    const value = Number.parseFloat(zoomSizeSelect.value);
    return Number.isFinite(value) ? value : 200;
  }

  function shouldZoom(shiftKey) {
    if (zoomRequiresShift && !shiftKey) return false;
    return true;
  }

  function updateColumnVisibility() {
    const showThird = getSelectedColumnCount() === 3;
    if (inputCardC) {
      inputCardC.classList.toggle("is-hidden", !showThird);
      inputCardC.hidden = !showThird;
      inputCardC.setAttribute("aria-hidden", (!showThird).toString());
    }
    zoomManager.updateVisibility();
  }

  function getFavoriteKey(pairId, side) {
    if (!pairId || !side) return null;
    return `${pairId}::${side}`;
  }

  function buildLabelJobTotals() {
    const totals = new Map();
    Object.keys(SIDE_CONFIG).forEach((side) => {
      const label = getLabelForSide(side);
      const jobIds = getJobIdsForSide(side);
      if (!totals.has(label)) {
        totals.set(label, new Set());
      }
      const group = totals.get(label);
      jobIds.forEach((jobId) => group.add(jobId));
    });
    return totals;
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
      const ok = await copyText(text);
      if (!ok) throw new Error("Clipboard unavailable");
      showFavoritesStatus("Favorites copied.");
    } catch (error) {
      showFavoritesStatus("Copy failed. Favorites in console.", true);
      console.info("Favorites:\n", text);
    }
  }

  function toggleFavoriteForHover() {
    if (!lastHoverImg) return;
    const pairId = lastHoverImg.dataset.pairId;
    const side = lastHoverImg.dataset.side;
    const key = getFavoriteKey(pairId, side);
    if (!key) return;

    const pair = pairRegistry.get(pairId);
    const data = pair ? pair[side] : null;
    if (!data || data.status !== "ok" || !data.jobId) return;

    const card = lastHoverImg.closest(".side-card");
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

  function updateStatus() {
    const sideData = getActiveSideData();
    const jobCounts = sideData.map((entry) => entry.jobIds.length);
    const mode = getEffectiveMode(sideData.map((entry) => entry.jobIds));
    const pairCount = Math.max(0, ...jobCounts);
    const modeLabel = mode === "grid" ? "Grid" : "Individual";
    statusEl.textContent = `Pairs: ${pairCount} | Mode: ${modeLabel}`;
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
    return;
  }

  function getStickyOffset() {
    const controls = root.querySelector(".controls");
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
        pairCards[clamped].getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }
  }

  function refreshPairCards() {
    pairCards = Array.from(
      comparisonsEl.querySelectorAll(".comparison-card")
    );
    setActivePair(pairCards.length ? 0 : -1, false);
    updateActivePairFromScroll();
  }

  function updateActivePairFromScroll() {
    if (!pairCards.length) {
      currentPairIndex = -1;
      updatePairIndicator();
      return;
    }
    const offset = getStickyOffset();
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    pairCards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.top - offset);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = idx;
      }
    });
    if (bestIndex !== currentPairIndex) {
      setActivePair(bestIndex, false);
      return;
    }
    updatePairIndicator();
  }

  function handleScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(() => {
      scrollTicking = false;
      updateActivePairFromScroll();
    });
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

  function toggleViewMode() {
    const nextMode = viewModeSelect.value === "grid" ? "individual" : "grid";
    viewModeSelect.value = nextMode;
    renderComparisons();
    scheduleSave();
  }

  function handlePairNavigationKey(event) {
    if (isEditableTarget(event.target)) return;
    if (event.key === "/" || event.key === "?") {
      event.preventDefault();
      toggleShortcuts();
    }
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
    if (event.key === "h" || event.key === "H") {
      event.preventDefault();
      toggleZoomRequiresShift();
    }
    if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      toggleFavoriteForHover();
    }
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
        registry: pairRegistry,
        placeholderMessages: PLACEHOLDER_MESSAGES,
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
        registry: pairRegistry,
        placeholderMessages: PLACEHOLDER_MESSAGES,
      })
    );
    return cell;
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

  function renderComparisons() {
    const sideData = getActiveSideData();
    const mode = getEffectiveMode(sideData.map((entry) => entry.jobIds));
    const pairCount = Math.max(0, ...sideData.map((entry) => entry.jobIds.length));

    pairRegistry.clear();
    comparisonsEl.innerHTML = "";
    zoomManager.hide();

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
        card.appendChild(renderIndividualPair(sideData, i, pairId));
      }

      comparisonsEl.appendChild(card);
    }

    updateStatus();
    refreshPairCards();
    reconcileFavorites();
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
      zoomRequiresShift,
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
    if (typeof state.zoomRequiresShift === "boolean") {
      zoomRequiresShift = state.zoomRequiresShift;
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
    const keys = [
      "a",
      "b",
      "c",
      "la",
      "lb",
      "lc",
      "cols",
      "vm",
      "zl",
      "zs",
      "zk",
    ];
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
      zoomRequiresShift:
        params.get("zk") !== null
          ? params.get("zk") !== "0"
          : zoomRequiresShift,
    };
  }

  function getBaseUrl() {
    const href = window.location.href.split("?")[0];
    if (window.location.origin && window.location.origin !== "null") {
      return `${window.location.origin}${window.location.pathname}`;
    }
    return href;
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
    zoomManager.hide();
    clearFavorites();
    updateStatus();
    refreshPairCards();
    saveState();
  }

  function handleHover(event) {
    const target = event.target instanceof Element ? event.target : null;
    const img = target ? target.closest("img") : null;
    if (!img || !comparisonsEl.contains(img)) {
      lastHoverImg = null;
      return;
    }
    lastHoverImg = img;
  }

  const urlState = parseStateFromUrl();
  const storedState = urlState ? null : loadStateFromStorage();
  applyState(urlState || storedState);
  updateColumnVisibility();
  updateStatus();

  zoomManager.setConfig({
    getActiveSides,
    getSideLabel: getLabelForSide,
    getZoomLevel,
    getZoomSize,
    shouldZoom,
    getRegistry: () => pairRegistry,
    getDisplayOrder: () => getActiveSides(),
  });
  zoomManager.attach(comparisonsEl);
  zoomManager.updatePaneSize();

  const handleInputChange = () => {
    scheduleRender();
    scheduleSave();
  };

  renderBtn.addEventListener(
    "click",
    () => {
      renderComparisons();
      saveState();
    },
    { signal }
  );
  clearBtn.addEventListener("click", clearInputs, { signal });
  shareBtn.addEventListener("click", copyShareLink, { signal });
  if (favoritesCopyBtn) {
    favoritesCopyBtn.addEventListener("click", copyFavoritesSummary, { signal });
  }
  window.addEventListener("scroll", handleScroll, { signal, passive: true });

  viewModeSelect.addEventListener("change", handleInputChange, { signal });
  jobsAInput.addEventListener("input", handleInputChange, { signal });
  jobsBInput.addEventListener("input", handleInputChange, { signal });
  if (jobsCInput) jobsCInput.addEventListener("input", handleInputChange, { signal });
  labelAInput.addEventListener("input", handleInputChange, { signal });
  labelBInput.addEventListener("input", handleInputChange, { signal });
  if (labelCInput) labelCInput.addEventListener("input", handleInputChange, { signal });
  if (columnCountSelect) {
    columnCountSelect.addEventListener(
      "change",
      () => {
        zoomManager.hide();
        updateColumnVisibility();
        scheduleRender();
        scheduleSave();
      },
      { signal }
    );
  }

  comparisonsEl.addEventListener("mousemove", handleHover, { signal });
  comparisonsEl.addEventListener("mouseleave", () => {
    lastHoverImg = null;
  }, { signal });

  if (shortcutsToggle) {
    shortcutsToggle.addEventListener("click", handleShortcutsToggle, { signal });
    document.addEventListener("click", handleShortcutsOutside, { signal });
  }

  document.addEventListener("keydown", handlePairNavigationKey, { signal });

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

  if (jobsAInput.value.trim() || jobsBInput.value.trim()) {
    renderComparisons();
  } else {
    refreshPairCards();
  }
  updateFavoritesSummary();
  if (urlState) saveState();

  return {
    destroy: () => {
      controller.abort();
      if (shareStatusTimer) window.clearTimeout(shareStatusTimer);
      if (saveTimer) window.clearTimeout(saveTimer);
      if (renderTimer) window.clearTimeout(renderTimer);
      if (favoritesStatusTimer) window.clearTimeout(favoritesStatusTimer);
      zoomManager.destroy();
    },
  };
}
