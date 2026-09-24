// Deadline covers headers AND response body. Abort alone is not a size bound.
export async function providerFetch(url: string, init: RequestInit, timeoutMs = 10000, maximumBytes = 2_000_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "error", cache: "no-store" });
    const reader = response.body?.getReader();
    // Test adapters can supply lightweight Response doubles; real fetch always has a body for JSON.
    if (!reader) return response;
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > maximumBytes) { await reader.cancel(); throw new Error("Provider response too large"); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally { clearTimeout(timer); }
}
