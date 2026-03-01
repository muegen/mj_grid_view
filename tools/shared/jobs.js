export function extractJobId(token) {
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

export function parseJobIds(raw) {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map(extractJobId)
    .filter(Boolean);
}

export function buildGridUrl(jobId) {
  return jobId ? `https://cdn.midjourney.com/${jobId}/grid_0.png` : "";
}

export function buildIndividualUrl(jobId, index) {
  return jobId ? `https://cdn.midjourney.com/${jobId}/0_${index}.png` : "";
}
