import { env, exports } from "cloudflare:workers";
import sql from "../migrations/0001_init.sql?raw";

export async function applySchema(): Promise<void> {
  const statements = sql
    .split(";")
    .map((part) => part.replace(/--[^\n]*/g, "").trim())
    .filter((part) => part.length > 0);
  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

export async function resetDb(): Promise<void> {
  const tables = [
    "ledger",
    "generations",
    "sessions",
    "payment_orders",
    "alerts",
    "rate_limits",
    "spend_daily",
    "recipes",
    "settings",
    "users",
  ];
  for (const table of tables) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
}

export async function call(path: string, options: { method?: string; json?: unknown; body?: BodyInit; cookie?: string; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set("cookie", options.cookie);
  let body: BodyInit | undefined = options.body;
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  return exports.default.fetch(
    new Request(`http://localhost${path}`, {
      method: options.method || (body ? "POST" : "GET"),
      headers,
      body,
    }),
  );
}

export async function login(email = "owner@studio.test", password = "test-only-password"): Promise<{ cookie: string; status: number; data: { user?: { id: string; exempt: boolean; balanceIdr: number; role: string } }; error?: string }> {
  const response = await call("/api/auth/login", { json: { email, password } });
  const data = (await response.json()) as { user?: { id: string; exempt: boolean; balanceIdr: number; role: string }; error?: string };
  const raw = response.headers.get("set-cookie") || "";
  const match = raw.match(/session=([^;]+)/);
  return { cookie: match ? `session=${match[1]}` : "", status: response.status, data };
}
