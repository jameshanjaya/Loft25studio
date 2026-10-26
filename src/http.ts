export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers });
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (!origin) return;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Asal permintaan tidak valid.", "bad_origin");
  }
  const host = request.headers.get("Host") || new URL(request.url).host;
  if (originHost !== host) {
    throw new HttpError(403, "Permintaan ditolak.", "bad_origin");
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "local";
}

export async function readJson<T>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const len = Number(request.headers.get("content-length") || "0");
  if (len > maxBytes) throw new HttpError(413, "Datanya kebesaran.", "too_large");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Datanya kebesaran.", "too_large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Format data tidak kebaca.", "bad_json");
  }
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [`session=${token}`, "HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${60 * 60 * 24 * 14}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const parts = ["session=", "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:" || request.headers.get("X-Forwarded-Proto") === "https";
}
