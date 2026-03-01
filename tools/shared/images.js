import { createPlaceholder } from "./dom.js";

const DEFAULT_PLACEHOLDERS = {
  missing: "Missing job",
  error: "Image failed to load",
};

export function registerPairImage(registry, pairId, side, data) {
  if (!pairId || !side) return;
  if (!registry.has(pairId)) {
    registry.set(pairId, {});
  }
  const entry = registry.get(pairId);
  entry[side] = data;
}

export function createImageFrame({
  url,
  altText,
  pairId,
  side,
  jobId,
  registry,
  linkEnabled = true,
  placeholderMessages = DEFAULT_PLACEHOLDERS,
}) {
  const frameEl = document.createElement("div");
  frameEl.className = "image-frame";
  if (!url) {
    registerPairImage(registry, pairId, side, {
      img: null,
      url: "",
      jobId,
      status: "missing",
      outline: null,
    });
    frameEl.appendChild(createPlaceholder(placeholderMessages.missing));
    return frameEl;
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

  const wrapper = document.createElement("div");
  wrapper.className = "image-wrap";
  const outline = document.createElement("div");
  outline.className = "zoom-outline";

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

  registerPairImage(registry, pairId, side, {
    img,
    url,
    jobId,
    status: "ok",
    outline,
  });

  img.addEventListener("error", () => {
    img.dataset.loadError = "true";
    const entry = registry.get(pairId);
    if (entry && entry[side]) {
      entry[side].status = "error";
      if (entry[side].outline) {
        entry[side].outline.classList.remove("visible");
      }
    }
    frameEl.innerHTML = "";
    frameEl.appendChild(createPlaceholder(placeholderMessages.error));
  });

  frameEl.appendChild(wrapper);
  return frameEl;
}
