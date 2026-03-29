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
} = {}) {
  if (!blob) {
    setStatus(`${label} capture failed.`, true);
    return false;
  }
  const copied = await tryCopyImage(blob);
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
