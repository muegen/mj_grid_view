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

export function init({ root }) {
  const rankViewModeSelect = root.querySelector("#rankViewMode");
  const rankColumnCountSelect = root.querySelector("#rankColumnCount");
  const rankZoomLevelSelect = root.querySelector("#rankZoomLevel");
  const rankZoomSizeSelect = root.querySelector("#rankZoomSize");
  const rankZoomEnabledInput = root.querySelector("#rankZoomEnabled");
  const rankZoomRequiresShiftInput = root.querySelector(
    "#rankZoomRequiresShift"
  );
  const rankLabelAInput = root.querySelector("#rankLabelA");
  const rankLabelBInput = root.querySelector("#rankLabelB");
  const rankLabelCInput = root.querySelector("#rankLabelC");
  const rankJobsAInput = root.querySelector("#rankJobsA");
  const rankJobsBInput = root.querySelector("#rankJobsB");
  const rankJobsCInput = root.querySelector("#rankJobsC");
  const rankStatusEl = root.querySelector("#rankStatus");
  const rankComparisonsEl = root.querySelector("#rankComparisons");
  const rankStartBtn = root.querySelector("#rankStartBtn");
  const rankClearBtn = root.querySelector("#rankClearBtn");
  const rankProgressEl = root.querySelector("#rankProgress");
  const rankSelectionStatusEl = root.querySelector("#rankSelectionStatus");
  const rankSummaryBody = root.querySelector("#rankSummaryBody");
  const rankSummaryEmptyEl = root.querySelector("#rankSummaryEmpty");
  const rankCopyBtn = root.querySelector("#rankCopyBtn");
  const rankSummaryStatusEl = root.querySelector("#rankSummaryStatus");
  const rankInputCardC = root.querySelector("#rankInputCardC");

  const pairRegistry = new Map();
  const rankSelections = new Map();
  const zoomManager = createZoomManager();
  const SIDE_CONFIG = {
    A: { labelInput: rankLabelAInput, jobsInput: rankJobsAInput },
    B: { labelInput: rankLabelBInput, jobsInput: rankJobsBInput },
    C: { labelInput: rankLabelCInput, jobsInput: rankJobsCInput },
  };

  let rankOrder = [];
  let rankOrderIndex = -1;
  let rankDisplayOrder = [];
  let selectionStatusTimer = null;
  let summaryStatusTimer = null;
  let saveTimer = null;

  const controller = new AbortController();
  const { signal } = controller;

  function getSelectedColumnCount() {
    if (!rankColumnCountSelect) return 2;
    const value = Number.parseInt(rankColumnCountSelect.value, 10);
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
    const selected = rankViewModeSelect.value;
    if (selected !== "auto") return selected;
    return jobIdsBySide.some((ids) => ids.length <= 1) ? "individual" : "grid";
  }

  function getZoomLevel() {
    const value = Number.parseFloat(rankZoomLevelSelect.value);
    return Number.isFinite(value) ? value : 3;
  }

  function getZoomSize() {
    const value = Number.parseFloat(rankZoomSizeSelect.value);
    return Number.isFinite(value) ? value : 200;
  }

  function shouldZoom(shiftKey) {
    if (!rankZoomEnabledInput.checked) return false;
    if (rankZoomRequiresShiftInput.checked && !shiftKey) return false;
    return true;
  }

  function getOptionLabel(side) {
    const index = rankDisplayOrder.indexOf(side);
    if (index < 0) return "Option";
    return `Option ${index + 1}`;
  }

  function updateRankColumnVisibility() {
    const showThird = getSelectedColumnCount() === 3;
    if (rankInputCardC) {
      rankInputCardC.classList.toggle("is-hidden", !showThird);
      rankInputCardC.hidden = !showThird;
      rankInputCardC.setAttribute("aria-hidden", (!showThird).toString());
    }
    zoomManager.updateVisibility();
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
    const sideData = getActiveSideData();
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

  function showRankSelectionStatus(message, isError = false) {
    if (!rankSelectionStatusEl) return;
    if (selectionStatusTimer) window.clearTimeout(selectionStatusTimer);
    rankSelectionStatusEl.textContent = message;
    rankSelectionStatusEl.classList.toggle("is-error", Boolean(isError));
    selectionStatusTimer = window.setTimeout(() => {
      rankSelectionStatusEl.textContent = "";
      rankSelectionStatusEl.classList.remove("is-error");
    }, 2000);
  }

  function showRankSummaryStatus(message, isError = false) {
    if (!rankSummaryStatusEl) return;
    if (summaryStatusTimer) window.clearTimeout(summaryStatusTimer);
    rankSummaryStatusEl.textContent = message;
    rankSummaryStatusEl.classList.toggle("is-error", Boolean(isError));
    summaryStatusTimer = window.setTimeout(() => {
      rankSummaryStatusEl.textContent = "";
      rankSummaryStatusEl.classList.remove("is-error");
    }, 2000);
  }

  function updateRankStatus() {
    if (!rankStatusEl) return;
    const sideData = getActiveSideData();
    const jobCounts = sideData.map((entry) => entry.jobIds.length);
    const pairCount = Math.max(0, ...jobCounts);
    if (pairCount === 0) {
      rankStatusEl.textContent = "Paste job IDs to start ranking.";
      return;
    }
    const mode = getEffectiveMode(sideData.map((entry) => entry.jobIds));
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

  function buildRankSummaryGroups() {
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
    const groups = new Map();
    rankSelections.forEach((entry) => {
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
      const ok = await copyText(text);
      if (!ok) throw new Error("Clipboard unavailable");
      showRankSummaryStatus("Summary copied.");
    } catch (error) {
      showRankSummaryStatus("Copy failed. Summary in console.", true);
      console.info("Ranking summary:\n", text);
    }
  }

  function buildRankOrder(pairCount) {
    return shuffleArray(Array.from({ length: pairCount }, (_, i) => i));
  }

  function resetRankSession({ keepOrder = false } = {}) {
    rankSelections.clear();
    pairRegistry.clear();
    rankDisplayOrder = [];
    rankOrderIndex = -1;
    if (!keepOrder) rankOrder = [];
    if (rankComparisonsEl) {
      rankComparisonsEl.innerHTML = "";
    }
    zoomManager.hide();
    updateRankSummary();
    updateRankProgress();
    updateRankStatus();
    updateRankStartButton();
    renderRankRound();
    zoomManager.updateOrder();
    zoomManager.updateVisibility();
  }

  function startRankSession() {
    const pairCount = getRankPairCount();
    rankSelections.clear();
    pairRegistry.clear();
    rankDisplayOrder = [];
    rankOrder = buildRankOrder(pairCount);
    rankOrderIndex = pairCount ? 0 : -1;
    renderRankRound();
    updateRankSummary();
    updateRankProgress();
    updateRankStatus();
    updateRankStartButton();
  }

  function createRankOptionCard({ jobId, imageUrl, pairId, side }) {
    const card = createElement("div", "side-card rank-option");
    card.dataset.side = side;
    card.dataset.jobId = jobId || "";
    card.appendChild(createElement("div", "rank-option-label", getOptionLabel(side)));
    card.appendChild(
      createImageFrame({
        url: imageUrl,
        altText: "Rank option",
        pairId,
        side,
        jobId,
        registry: pairRegistry,
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
    cell.appendChild(createElement("div", "rank-option-label", getOptionLabel(side)));
    cell.appendChild(
      createImageFrame({
        url: buildIndividualUrl(jobId, index),
        altText: "Rank option image",
        pairId,
        side,
        jobId,
        registry: pairRegistry,
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
    pairRegistry.clear();
    zoomManager.hide();

    const sideData = getActiveSideData();
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
    const mode = getEffectiveMode(sideData.map((entry) => entry.jobIds));
    rankDisplayOrder = shuffleArray(getActiveSides());
    zoomManager.updateOrder();
    zoomManager.updateVisibility();

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
    const entry = getActiveSideData().find((item) => item.side === side);
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

  function skipRankSelection() {
    if (!rankOrder.length || rankOrderIndex < 0) return;
    if (rankOrderIndex >= rankOrder.length) return;
    rankOrderIndex += 1;
    renderRankRound();
    showRankSelectionStatus("Skipped.");
  }

  function handleRankSelectionClick(event) {
    const card = event.target.closest(".rank-option");
    if (!card || !rankComparisonsEl?.contains(card)) return;
    const side = card.dataset.side;
    if (!side) return;
    selectRankOption(side);
  }

  function handleRankShortcutKey(event) {
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

  function saveRankState() {
    try {
      const state = getRankState();
      localStorage.setItem("mj-grid-rank-state", JSON.stringify(state));
    } catch (error) {
      // Ignore storage failures (private mode, disabled, etc).
    }
  }

  function scheduleRankSave() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveRankState, 200);
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

  const storedState = loadRankStateFromStorage();
  applyRankState(storedState);
  updateRankColumnVisibility();
  updateRankStatus();
  resetRankSession();

  zoomManager.setConfig({
    getActiveSides,
    getSideLabel: getOptionLabel,
    getZoomLevel,
    getZoomSize,
    shouldZoom,
    getRegistry: () => pairRegistry,
    getDisplayOrder: () =>
      rankDisplayOrder.length ? rankDisplayOrder : getActiveSides(),
  });
  zoomManager.attach(rankComparisonsEl);
  zoomManager.updatePaneSize();

  const handleRankInputChange = () => {
    scheduleRankSave();
    resetRankSession();
  };

  rankViewModeSelect.addEventListener("change", handleRankInputChange, { signal });
  rankJobsAInput.addEventListener("input", handleRankInputChange, { signal });
  rankJobsBInput.addEventListener("input", handleRankInputChange, { signal });
  if (rankJobsCInput) rankJobsCInput.addEventListener("input", handleRankInputChange, { signal });
  rankLabelAInput.addEventListener("input", handleRankInputChange, { signal });
  rankLabelBInput.addEventListener("input", handleRankInputChange, { signal });
  if (rankLabelCInput) rankLabelCInput.addEventListener("input", handleRankInputChange, { signal });

  rankColumnCountSelect.addEventListener(
    "change",
    () => {
      zoomManager.hide();
      updateRankColumnVisibility();
      handleRankInputChange();
    },
    { signal }
  );
  rankZoomEnabledInput.addEventListener(
    "change",
    () => {
      zoomManager.hide();
      scheduleRankSave();
    },
    { signal }
  );
  rankZoomRequiresShiftInput.addEventListener(
    "change",
    () => {
      zoomManager.hide();
      scheduleRankSave();
    },
    { signal }
  );
  rankZoomLevelSelect.addEventListener(
    "change",
    () => {
      scheduleRankSave();
      zoomManager.refresh();
    },
    { signal }
  );
  rankZoomSizeSelect.addEventListener(
    "change",
    () => {
      scheduleRankSave();
      zoomManager.updatePaneSize();
      zoomManager.refresh();
    },
    { signal }
  );

  rankComparisonsEl.addEventListener("click", handleRankSelectionClick, { signal });
  document.addEventListener("keydown", handleRankShortcutKey, { signal });

  if (rankCopyBtn) {
    rankCopyBtn.addEventListener("click", copyRankSummary, { signal });
  }
  rankStartBtn.addEventListener(
    "click",
    () => {
      startRankSession();
      saveRankState();
    },
    { signal }
  );
  rankClearBtn.addEventListener("click", clearRankInputs, { signal });

  updateRankSummary();
  updateRankStartButton();

  return {
    destroy: () => {
      controller.abort();
      if (selectionStatusTimer) window.clearTimeout(selectionStatusTimer);
      if (summaryStatusTimer) window.clearTimeout(summaryStatusTimer);
      if (saveTimer) window.clearTimeout(saveTimer);
      zoomManager.destroy();
    },
  };
}
