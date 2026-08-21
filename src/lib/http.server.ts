export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export async function body<T = Record<string, unknown>>(request: Request): Promise<T> {
  const raw = await textBody(request);
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

/** Read a request without allowing chunked bodies to bypass the size limit. */
export async function textBody(request: Request, maxBytes = 6 * 1024 * 1024): Promise<string> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    throw new Response(JSON.stringify({ error: "payload_too_large" }), { status: 413 });
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let value = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (!chunk.value) continue;
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Response(JSON.stringify({ error: "payload_too_large" }), { status: 413 });
    }
    value += decoder.decode(chunk.value, { stream: true });
  }
  value += decoder.decode();
  return value;
}

/**
 * Short correlation id shared between the log line and the client response.
 *
 * A bare "server_error" told nobody which statement failed; the id lets a
 * report from a user be matched against a single `wrangler tail` line.
 */
export function errorRef(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Log a caught server error with enough context to identify it later, without
 * leaking the message to the caller.
 */
export function logServerError(scope: string, ref: string, error: unknown): void {
  // This runs inside a Cloudflare Worker: there is no writable filesystem, and
  // the previous `import("fs").then(fs => fs.appendFileSync(...))` had no catch,
  // so every handled server error also produced an unhandled rejection.
  // `wrangler tail` / Workers Logs is the log sink; the ref ties a user report
  // to a single line there.
  const detail = error instanceof Error ? error : new Error(String(error));
  console.error(`[${scope}:error] ref=${ref} ${detail.name}: ${detail.message}`, detail.stack);
}

/** Turns a thrown Response (auth guards) into a real response. */
export async function guard(handler: () => Promise<Response>, scope = "api"): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof Response) return error;
    const ref = errorRef();
    logServerError(scope, ref, error);
    return json({ error: "server_error", ref }, { status: 500 });
  }
}
