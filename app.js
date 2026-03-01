const toolMount = document.getElementById("toolMount");
const toolCards = Array.from(document.querySelectorAll("[data-tool-target]"));
const toTopBtn = document.getElementById("toTopBtn");

const TOOL_CONFIG = {
  compare: {
    id: "compare",
    viewPath: "./tools/grid_compare/view.html",
    modulePath: "./tools/grid_compare/tool.js",
  },
  rank: {
    id: "rank",
    viewPath: "./tools/grid_rank/view.html",
    modulePath: "./tools/grid_rank/tool.js",
  },
  scale: {
    id: "scale",
    viewPath: "./tools/grid_scale/view.html",
    modulePath: "./tools/grid_scale/tool.js",
  },
};

let activeTool = null;

function normalizeToolId(toolId) {
  if (!toolId) return "compare";
  return TOOL_CONFIG[toolId] ? toolId : "compare";
}

function getToolFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeToolId(params.get("tool"));
}

function updateToolInUrl(toolId) {
  const nextTool = normalizeToolId(toolId);
  const params = new URLSearchParams(window.location.search);
  params.set("tool", nextTool);
  const href = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", href);
}

function updateToolCards(activeId) {
  toolCards.forEach((card) => {
    const isActive = card.dataset.toolTarget === activeId;
    card.classList.toggle("is-active", isActive);
    card.setAttribute("aria-selected", isActive.toString());
  });
}

async function loadTool(toolId, { updateUrl = true } = {}) {
  if (!toolMount) return;
  const nextId = normalizeToolId(toolId);
  const config = TOOL_CONFIG[nextId];
  if (!config) return;

  if (activeTool?.id === nextId) return;
  if (activeTool?.destroy) activeTool.destroy();

  if (updateUrl) updateToolInUrl(nextId);
  document.body.dataset.tool = nextId;
  updateToolCards(nextId);

  toolMount.innerHTML = "";
  try {
    const response = await fetch(config.viewPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${config.viewPath}`);
    }
    const markup = await response.text();
    toolMount.innerHTML = markup;
  } catch (error) {
    toolMount.innerHTML =
      '<div class="placeholder">Failed to load tool.</div>';
    console.error(error);
    return;
  }

  try {
    const module = await import(config.modulePath);
    const toolApi = module.init({ root: toolMount });
    const destroy =
      typeof toolApi === "function" ? toolApi : toolApi?.destroy || null;
    activeTool = { id: nextId, destroy };
  } catch (error) {
    toolMount.innerHTML =
      '<div class="placeholder">Failed to initialize tool.</div>';
    console.error(error);
  }
}

toolCards.forEach((card) => {
  card.addEventListener("click", () => loadTool(card.dataset.toolTarget));
});

window.addEventListener("popstate", () => {
  loadTool(getToolFromUrl(), { updateUrl: false });
});

if (toTopBtn) {
  toTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

loadTool(getToolFromUrl(), { updateUrl: false });
