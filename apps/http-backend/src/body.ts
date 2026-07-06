import { corsResponse } from "./response";

/** Maximum allowed request body size (1 MB) */
const MAX_BODY_SIZE = 1 * 1024 * 1024;

/**
 * Read and parse a JSON request body with a hard size limit.
 * Validates the *actual* bytes received, not the Content-Length header.
 * Returns the parsed object or a Response error (to return immediately).
 */
export async function readJsonBody<T = unknown>(
  req: Request,
): Promise<{ data: T } | { error: Response }> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_BODY_SIZE) {
    return {
      error: corsResponse(
        { error: "Request body too large" },
        { status: 413 },
        req,
      ),
    };
  }

  try {
    const text = new TextDecoder().decode(buf);
    const data = JSON.parse(text) as T;
    return { data };
  } catch {
    return {
      error: corsResponse({ error: "Invalid JSON" }, { status: 400 }, req),
    };
  }
}
