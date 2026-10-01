/**
 * DrishtiCheck | API client
 * Smart India Hackathon 2026 | Idea ID 146687 | Team ID 156249 | Team Drishti Check
 *
 * All calls target the live production backend on Render.
 */
const API_BASE = 'https://drishticheck.onrender.com';

/** Turns a backend path (/api/...) into a full URL; leaves blob:, data: and http(s): URLs alone. */
export const assetUrl = (path = '') => (/^(https?:|blob:|data:)/.test(path) ? path : `${API_BASE}${path}`);

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error('Cannot reach the DrishtiCheck API. Start it with: uvicorn main:app --reload --port 8000');
  }
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`;
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* the error body was not JSON; keep the generic message */
    }
    throw new Error(detail);
  }
  return response;
}

/** POST /api/analyze: one multipart request for the whole batch. */
export async function analyzeFiles(files) {
  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));
  const response = await request('/api/analyze', { method: 'POST', body: form });
  return response.json();
}

/** GET /api/history: mock Milvus collection (meta + rows). */
export async function fetchHistory(signal) {
  const response = await request('/api/history', { signal });
  return response.json();
}

/** GET /api/samples: the synthetic demo labels. */
export async function fetchSamples() {
  const response = await request('/api/samples');
  return response.json();
}

/** Downloads a demo label and wraps it in a File so it goes through the normal upload path. */
export async function fetchSampleFile(sample) {
  const response = await request(sample.image_url);
  const blob = await response.blob();
  return new File([blob], sample.filename, { type: blob.type || 'image/svg+xml' });
}

/** GET /api/health: resolves true/false, never throws. */
export async function pingHealth(signal) {
  try {
    await request('/api/health', { signal });
    return true;
  } catch {
    return false;
  }
}
