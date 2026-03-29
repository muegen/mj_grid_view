function formatTimestamp(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, "-");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function tryCopyImage(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch (error) {
    return false;
  }
}

export async function finalizeCapture({
  blob,
  warnings = [],
  setStatus = () => {},
  filePrefix = "zoom-panel",
  label = "Zoom panel",
  preferClipboard = true,
} = {}) {
  if (!blob) {
    setStatus(`${label} capture failed.`, true);
    return false;
  }
  const copied = preferClipboard ? await tryCopyImage(blob) : false;
  if (!copied) {
    downloadBlob(blob, `${filePrefix}-${formatTimestamp()}.png`);
  }

  const hasMissing = warnings.includes("image-load");
  if (hasMissing) {
    setStatus(
      copied
        ? `${label} copied (some images missing).`
        : `${label} saved (some images missing).`,
      true
    );
    return true;
  }

  setStatus(copied ? `${label} copied.` : `${label} saved.`);
  return true;
}

export async function captureZoomPanel({
  zoomManager,
  setStatus = () => {},
  filePrefix = "zoom-panel",
  label = "Zoom panel",
} = {}) {
  try {
    zoomManager?.setCaptureState?.("capturing");
    const result = await zoomManager?.capture?.();
    if (!result?.ok) {
      zoomManager?.setCaptureState?.("error");
      if (result?.reason === "no-hover" || result?.reason === "hidden") {
        setStatus("Hover an image to open the zoom panel first.", true);
      } else if (result?.reason === "tainted") {
        setStatus("Capture blocked by browser. Use system snip.", true);
      } else {
        setStatus(`${label} capture failed.`, true);
      }
      window.setTimeout(() => zoomManager?.setCaptureState?.(""), 1200);
      return false;
    }

    const ok = await finalizeCapture({
      blob: result.blob,
      warnings: result.warnings || [],
      setStatus,
      filePrefix,
      label,
    });
    zoomManager?.setCaptureState?.(ok ? "done" : "error");
    window.setTimeout(() => zoomManager?.setCaptureState?.(""), 1500);
    return ok;
  } catch (error) {
    zoomManager?.setCaptureState?.("error");
    setStatus(`${label} capture failed.`, true);
    window.setTimeout(() => zoomManager?.setCaptureState?.(""), 1200);
    return false;
  }
}

export async function downloadZoomPreview({
  zoomManager,
  pair,
  setStatus = () => {},
  filePrefix = "pair-preview",
  label = "Preview",
  zoomLevel = 1,
  xRatio = 0.5,
  yRatio = 0.5,
  paneSize = 720,
} = {}) {
  if (!pair) {
    setStatus(`${label} unavailable.`, true);
    return false;
  }
  try {
    const entries = Object.values(pair).filter(Boolean);
    const resolveSharedAspect = (items) => {
      for (const entry of items) {
        if (Number.isFinite(entry?.aspect) && entry.aspect > 0) {
          return entry.aspect;
        }
        const img = entry?.img;
        if (img?.naturalWidth && img?.naturalHeight) {
          return img.naturalHeight / img.naturalWidth;
        }
      }
      return null;
    };
    const waitForImageReady = (img, timeoutMs = 8000) =>
      new Promise((resolve) => {
        if (img.complete && img.naturalWidth && img.naturalHeight) {
          resolve(true);
          return;
        }
        let done = false;
        const finalize = (ok) => {
          if (done) return;
          done = true;
          resolve(ok);
        };
        const onLoad = () => finalize(true);
        const onError = () => finalize(false);
        img.addEventListener("load", onLoad, { once: true });
        img.addEventListener("error", onError, { once: true });
        if (img.decode) {
          img.decode().then(() => finalize(true)).catch(() => {});
        }
        window.setTimeout(() => finalize(false), timeoutMs);
      });

    const readinessPromises = entries
      .filter((entry) => entry?.img)
      .map(async (entry) => {
        const img = entry.img;
        await waitForImageReady(img);
        if (img.naturalWidth && img.naturalHeight) {
          entry.aspect = img.naturalHeight / img.naturalWidth;
        }
      });

    if (readinessPromises.length) {
      setStatus(`Waiting for images to load...`);
      await Promise.all(readinessPromises);
    }
    const allReady = entries
      .filter((entry) => entry?.img)
      .every((entry) => entry.img.naturalWidth && entry.img.naturalHeight);
    if (!allReady) {
      setStatus(`${label} capture failed. Images still loading.`, true);
      zoomManager?.setCaptureState?.("error");
      window.setTimeout(() => zoomManager?.setCaptureState?.(""), 1200);
      return false;
    }
    const sharedAspect = resolveSharedAspect(entries);
    zoomManager?.setCaptureState?.("capturing");
    const result = await zoomManager?.capture?.({
      pair,
      xRatio,
      yRatio,
      zoomLevel,
      aspectOverride: sharedAspect,
      paneSize,
    });
    if (!result?.ok) {
      if (result?.reason === "busy") {
        setStatus("Capture already running. Try again in a moment.", true);
        return false;
      }
      zoomManager?.setCaptureState?.("error");
      setStatus(`${label} capture failed.`, true);
      window.setTimeout(() => zoomManager?.setCaptureState?.(""), 1200);
      return false;
    }

    const ok = await finalizeCapture({
      blob: result.blob,
      warnings: result.warnings || [],
      setStatus,
      filePrefix,
      label,
      preferClipboard: false,
    });
    zoomManager?.setCaptureState?.(ok ? "done" : "error");
    window.setTimeout(() => zoomManager?.setCaptureState?.(""), 1500);
    return ok;
  } catch (error) {
    zoomManager?.setCaptureState?.("error");
    setStatus(`${label} capture failed.`, true);
    window.setTimeout(() => zoomManager?.setCaptureState?.(""), 1200);
    return false;
  }
}
