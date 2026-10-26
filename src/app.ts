import { Hono } from "hono";
import { assertEmail, assertPassword, hashPassword, normalizeEmail, randomToken, verifyPassword, verifyTurnstile } from "./auth";
import type { AppEnv } from "./env";
import { assertSameOrigin, clearSessionCookie, clientIp, isSecureRequest, json, readJson, sessionCookie } from "./http";
import { HttpError } from "./http";
import {
  analyzeProduct,
  continueGeneration,
  draftVideo,
  generateAffiliate,
  generateCommercial,
  generateFoto,
  generateFreeVideo,
  writeCaption,
} from "./jobs";
import { logEvent } from "./log";
import { handleMidtransNotification } from "./payments";
import { nowIso, safeSlug } from "./bytes";
import { isStudioMode, MODE_BACKGROUNDS } from "./prompts";
import { EDITABLE_SETTING_KEYS, FEATURE_LABEL, parseSettings } from "./settings";
import { VOICE_OPTIONS } from "./voices";
import { changeBalance } from "./billing";
import { jakartaDay } from "./bytes";
import {
  createSession,
  deleteSession,
  ensureReady,
  findUserByEmail,
  findUserById,
  getGeneration,
  hitRateLimit,
  loadSettings,
  publicGeneration,
  publicUser,
  readSessionUser,
  type GenerationRow,
  type UserRow,
} from "./store";

type Vars = { user: UserRow | null };
export const app = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

app.onError((error, c) => {
  if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
  logEvent("unhandled", { message: error instanceof Error ? error.message : "unknown" });
  return json({ error: "Ada gangguan di server. Coba lagi ya." }, 500);
});

app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") assertSameOrigin(c.req.raw);
  await ensureReady(c.env);
  c.set("user", await readSessionUser(c.env, c.req.raw));
  await next();
});

function requireUser(user: UserRow | null): UserRow {
  if (!user) throw new HttpError(401, "Masuk dulu ya.", "auth");
  if (user.disabled) throw new HttpError(403, "Akun ini dimatikan.", "disabled");
  return user;
}

function requireAdmin(user: UserRow | null): UserRow {
  const current = requireUser(user);
  if (current.role !== "admin") throw new HttpError(403, "Khusus admin.", "admin");
  return current;
}

app.get("/api/health", (c) => json({ ok: true, mock: c.env.XAI_MOCK === "1" }));

app.get("/api/config", async (c) => {
  const settings = await loadSettings(c.env.DB);
  return json({
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || "",
    signupEnabled: settings.signupEnabled,
    mock: c.env.XAI_MOCK === "1",
  });
});

app.post("/api/auth/login", async (c) => {
  await hitRateLimit(c.env.DB, `login:${clientIp(c.req.raw)}`, 8, 15 * 60);
  const body = await readJson<{ email?: string; password?: string; turnstileToken?: string }>(c.req.raw);
  await verifyTurnstile(c.env, body.turnstileToken, clientIp(c.req.raw));
  const email = normalizeEmail(String(body.email || ""));
  const password = String(body.password || "");
  const user = await findUserByEmail(c.env.DB, email);
  const dummy = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const ok = await verifyPassword(password, user?.password_hash || dummy);
  if (!user || !ok || user.disabled) throw new HttpError(401, "Email atau password salah.", "auth");
  const token = await randomToken();
  await createSession(c.env, user.id, token);
  logEvent("login", { userId: user.id });
  return json({ user: publicUser(user) }, 200, { "set-cookie": sessionCookie(token, isSecureRequest(c.req.raw)) });
});

app.post("/api/auth/logout", async (c) => {
  await deleteSession(c.env, c.req.raw);
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(isSecureRequest(c.req.raw)) });
});

app.post("/api/auth/signup", async (c) => {
  const settings = await loadSettings(c.env.DB);
  if (!settings.signupEnabled) throw new HttpError(403, "Pendaftaran lagi ditutup. Minta undangan ke admin.", "signup_closed");
  await hitRateLimit(c.env.DB, `signup:${clientIp(c.req.raw)}`, 5, 60 * 60);
  const body = await readJson<{ email?: string; password?: string; name?: string; turnstileToken?: string }>(c.req.raw);
  await verifyTurnstile(c.env, body.turnstileToken, clientIp(c.req.raw));
  const email = normalizeEmail(String(body.email || ""));
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 80);
  assertEmail(email);
  assertPassword(password);
  if (name.length < 2) throw new HttpError(400, "Isi namanya.", "name");
  if (await findUserByEmail(c.env.DB, email)) throw new HttpError(409, "Email itu sudah terdaftar.", "exists");
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, exempt_billing, credit_balance_idr, disabled, created_at)
     VALUES (?, ?, ?, ?, 'user', 0, 0, 0, ?)`,
  )
    .bind(id, email, await hashPassword(password), name, nowIso())
    .run();
  const token = await randomToken();
  await createSession(c.env, id, token);
  const user = await findUserById(c.env.DB, id);
  return json({ user: user ? publicUser(user) : null }, 201, { "set-cookie": sessionCookie(token, isSecureRequest(c.req.raw)) });
});

app.get("/api/me", async (c) => {
  const user = requireUser(c.get("user"));
  const settings = await loadSettings(c.env.DB);
  return json({
    user: publicUser(user),
    prices: settings.prices,
    multiplier: settings.priceMultiplier,
    usdToIdr: settings.usdToIdr,
    voices: VOICE_OPTIONS,
    labels: FEATURE_LABEL,
  });
});

app.get("/api/recipes", async (c) => {
  requireUser(c.get("user"));
  const feature = c.req.query("feature");
  const statement = feature
    ? c.env.DB.prepare("SELECT * FROM recipes WHERE active = 1 AND feature = ? ORDER BY sort_order, name").bind(feature)
    : c.env.DB.prepare("SELECT * FROM recipes WHERE active = 1 ORDER BY sort_order, name");
  const rows = await statement.all();
  return json({ recipes: rows.results });
});

app.get("/api/backgrounds", (c) => {
  requireUser(c.get("user"));
  return json({ backgrounds: MODE_BACKGROUNDS });
});

app.post("/api/analyze", async (c) => json(await analyzeProduct(c.env, requireUser(c.get("user")), c.req.raw)));
app.post("/api/captions", async (c) => {
  const body = await readJson<{ platform?: string; topic?: string }>(c.req.raw);
  return json({ generation: await writeCaption(c.env, requireUser(c.get("user")), body) });
});
app.post("/api/video-bebas/draft", async (c) => {
  const body = await readJson<{ brief?: string; pronunciations?: unknown; productName?: string }>(c.req.raw);
  return json(await draftVideo(c.env, requireUser(c.get("user")), body));
});
app.post("/api/video-bebas", async (c) => json({ generation: await generateFreeVideo(c.env, requireUser(c.get("user")), c.req.raw) }));
app.post("/api/foto-produk", async (c) => json({ generation: await generateFoto(c.env, requireUser(c.get("user")), c.req.raw) }));
app.post("/api/video-affiliate", async (c) => json({ generation: await generateAffiliate(c.env, requireUser(c.get("user")), c.req.raw) }));
app.post("/api/video-commercial", async (c) => json({ generation: await generateCommercial(c.env, requireUser(c.get("user")), c.req.raw) }));

app.get("/api/generations", async (c) => {
  const user = requireUser(c.get("user"));
  const rows = await c.env.DB.prepare("SELECT * FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .bind(user.id)
    .all<GenerationRow>();
  const items = [];
  for (const row of rows.results) {
    if (row.status === "running" && row.provider_request_id && items.length < 3) {
      items.push(await continueGeneration(c.env, row, user));
    } else {
      items.push(publicGeneration(row));
    }
  }
  const fresh = await findUserById(c.env.DB, user.id);
  return json({ generations: items, balanceIdr: fresh?.credit_balance_idr ?? user.credit_balance_idr });
});

app.get("/api/generations/:id", async (c) => {
  const user = requireUser(c.get("user"));
  const row = await getGeneration(c.env.DB, c.req.param("id"));
  if (!row || (row.user_id !== user.id && user.role !== "admin")) throw new HttpError(404, "Hasilnya tidak ketemu.", "not_found");
  const generation = row.status === "running" ? await continueGeneration(c.env, row, user) : publicGeneration(row);
  return json({ generation });
});

app.get("/api/generations/:id/file", async (c) => {
  const user = requireUser(c.get("user"));
  const row = await getGeneration(c.env.DB, c.req.param("id"));
  if (!row || (row.user_id !== user.id && user.role !== "admin")) throw new HttpError(404, "Hasilnya tidak ketemu.", "not_found");
  const which = c.req.query("which") || "result";
  const picked =
    which === "scene"
      ? { key: row.scene_r2_key, mime: row.scene_mime, filename: row.scene_filename }
      : which === "voice"
        ? { key: row.voice_r2_key, mime: row.voice_mime, filename: row.voice_filename }
        : { key: row.result_r2_key, mime: row.result_mime, filename: row.result_filename };
  if (!picked.key || !picked.filename || !picked.mime) throw new HttpError(404, "Filenya belum ada.", "no_file");
  const object = await c.env.BUCKET.get(picked.key);
  if (!object) throw new HttpError(404, "Filenya belum ada.", "no_file");
  const filename = picked.filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const inline = c.req.query("inline") === "1";
  const headers = new Headers();
  headers.set("content-type", picked.mime);
  headers.set("content-disposition", `${inline ? "inline" : "attachment"}; filename="${filename}"`);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
});

app.post("/api/payments/qris", async (c) => {
  const user = requireUser(c.get("user"));
  if (c.env.MIDTRANS_ENABLED === "1") {
    const body = await readJson<{ amountIdr?: number }>(c.req.raw);
    const amount = Math.round(Number(body.amountIdr));
    if (!Number.isFinite(amount) || amount < 10000 || amount > 10_000_000) {
      throw new HttpError(400, "Nominal QRIS antara Rp10.000 dan Rp10.000.000.", "amount");
    }
    const id = `topup-${crypto.randomUUID()}`;
    await c.env.DB.prepare(
      "INSERT INTO payment_orders (id, user_id, amount_idr, status, provider, created_at) VALUES (?, ?, ?, 'pending', 'midtrans', ?)",
    )
      .bind(id, user.id, amount, nowIso())
      .run();
    return json({
      enabled: true,
      orderId: id,
      message: "Pesanan tercatat. Panggilan QRIS ke Midtrans belum dihubungkan di versi uji ini.",
    });
  }
  return json({ enabled: false, message: "QRIS belum diaktifkan. Nanti nyambung ke Midtrans." });
});

app.post("/api/payments/midtrans/webhook", async (c) => {
  const body = await readJson<Record<string, string>>(c.req.raw);
  const result = await handleMidtransNotification(c.env.DB, body, c.env.MIDTRANS_SERVER_KEY || "", c.env.MIDTRANS_ENABLED === "1");
  return json(result.body, result.status);
});

app.get("/api/admin/summary", async (c) => {
  requireAdmin(c.get("user"));
  const settings = await loadSettings(c.env.DB);
  const day = jakartaDay();
  const spend = await c.env.DB.prepare("SELECT cost_usd, cost_ticks, alerted_50, alerted_100 FROM spend_daily WHERE day = ?")
    .bind(day)
    .first<{ cost_usd: number; cost_ticks: number; alerted_50: number; alerted_100: number }>();
  const alerts = await c.env.DB.prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 20").all();
  const counts = await c.env.DB.prepare("SELECT status, COUNT(*) AS n FROM generations GROUP BY status").all<{ status: string; n: number }>();
  return json({
    day,
    spendUsd: spend?.cost_usd ?? 0,
    spendTicks: spend?.cost_ticks ?? 0,
    capUsd: settings.dailySpendCapUsd,
    alerted50: spend?.alerted_50 === 1,
    alerted100: spend?.alerted_100 === 1,
    killSwitch: settings.killSwitch,
    settings,
    alerts: alerts.results,
    counts: counts.results,
  });
});

app.get("/api/admin/generations", async (c) => {
  requireAdmin(c.get("user"));
  const rows = await c.env.DB.prepare(
    `SELECT g.*, u.email AS user_email FROM generations g JOIN users u ON u.id = g.user_id
     ORDER BY g.created_at DESC LIMIT 100`,
  ).all<GenerationRow & { user_email: string }>();
  return json({
    generations: rows.results.map((row) => ({ ...publicGeneration(row), userEmail: row.user_email })),
  });
});

app.get("/api/admin/users", async (c) => {
  requireAdmin(c.get("user"));
  const rows = await c.env.DB.prepare(
    "SELECT id, email, name, role, exempt_billing, credit_balance_idr, disabled, created_at FROM users ORDER BY created_at DESC",
  ).all();
  return json({ users: rows.results });
});

app.post("/api/admin/users", async (c) => {
  requireAdmin(c.get("user"));
  const body = await readJson<{ email?: string; password?: string; name?: string; creditIdr?: number }>(c.req.raw);
  const email = normalizeEmail(String(body.email || ""));
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 80);
  assertEmail(email);
  assertPassword(password);
  if (name.length < 2) throw new HttpError(400, "Isi namanya.", "name");
  if (await findUserByEmail(c.env.DB, email)) throw new HttpError(409, "Email itu sudah terdaftar.", "exists");
  const id = crypto.randomUUID();
  const credit = Math.max(0, Math.round(Number(body.creditIdr) || 0));
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, exempt_billing, credit_balance_idr, disabled, created_at)
     VALUES (?, ?, ?, ?, 'user', 0, 0, 0, ?)`,
  )
    .bind(id, email, await hashPassword(password), name, nowIso())
    .run();
  if (credit > 0) await changeBalance(c.env.DB, id, credit, "topup", "Saldo awal dari admin");
  const user = await findUserById(c.env.DB, id);
  return json({ user: user ? publicUser(user) : null }, 201);
});

app.post("/api/admin/users/:id/topup", async (c) => {
  requireAdmin(c.get("user"));
  const body = await readJson<{ amountIdr?: number; note?: string }>(c.req.raw);
  const amount = Math.round(Number(body.amountIdr));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    throw new HttpError(400, "Nominal isi saldo tidak pas.", "amount");
  }
  const user = await findUserById(c.env.DB, c.req.param("id"));
  if (!user) throw new HttpError(404, "Pengguna tidak ketemu.", "no_user");
  const balance = await changeBalance(c.env.DB, user.id, amount, "topup", clipNote(body.note) || "Isi saldo manual");
  return json({ balanceIdr: balance });
});

app.get("/api/admin/recipes", async (c) => {
  requireAdmin(c.get("user"));
  const rows = await c.env.DB.prepare("SELECT * FROM recipes ORDER BY sort_order, name").all();
  return json({ recipes: rows.results });
});

app.post("/api/admin/recipes", async (c) => {
  requireAdmin(c.get("user"));
  const body = await readJson<RecipeBody>(c.req.raw);
  const name = String(body.name || "").trim().slice(0, 80);
  if (name.length < 2) throw new HttpError(400, "Nama resepnya diisi dulu.", "name");
  const slug = safeSlug(String(body.slug || name)) + "-" + crypto.randomUUID().slice(0, 4);
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO recipes (id, slug, name, feature, mode, description, prompt_template, config_json, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      slug,
      slug,
      name,
      clipFeature(body.feature),
      clipMode(body.mode),
      String(body.description || "").slice(0, 400),
      String(body.prompt_template || "").slice(0, 8000),
      JSON.stringify(body.config || {}),
      Number(body.sort_order) || 100,
      body.active === false ? 0 : 1,
      now,
      now,
    )
    .run();
  return json({ id: slug }, 201);
});

app.put("/api/admin/recipes/:id", async (c) => {
  requireAdmin(c.get("user"));
  const body = await readJson<RecipeBody>(c.req.raw);
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM recipes WHERE id = ?").bind(id).first();
  if (!existing) throw new HttpError(404, "Resep tidak ketemu.", "no_recipe");
  await c.env.DB.prepare(
    `UPDATE recipes SET name = ?, feature = ?, mode = ?, description = ?, prompt_template = ?, config_json = ?, sort_order = ?, active = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      String(body.name || "").trim().slice(0, 80),
      clipFeature(body.feature),
      clipMode(body.mode),
      String(body.description || "").slice(0, 400),
      String(body.prompt_template || "").slice(0, 8000),
      JSON.stringify(body.config || {}),
      Number(body.sort_order) || 0,
      body.active === false ? 0 : 1,
      nowIso(),
      id,
    )
    .run();
  return json({ ok: true });
});

app.delete("/api/admin/recipes/:id", async (c) => {
  requireAdmin(c.get("user"));
  await c.env.DB.prepare("DELETE FROM recipes WHERE id = ?").bind(c.req.param("id")).run();
  return json({ ok: true });
});

app.get("/api/admin/settings", async (c) => {
  requireAdmin(c.get("user"));
  const rows = await c.env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const map: Record<string, string> = {};
  for (const row of rows.results) map[row.key] = row.value;
  return json({ settings: map, parsed: parseSettings(map) });
});

app.put("/api/admin/settings", async (c) => {
  requireAdmin(c.get("user"));
  const body = await readJson<{ settings?: Record<string, string> }>(c.req.raw);
  const incoming = body.settings || {};
  const statements = [];
  for (const key of EDITABLE_SETTING_KEYS) {
    if (incoming[key] === undefined) continue;
    statements.push(c.env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(incoming[key]).slice(0, 40)));
  }
  if (statements.length) await c.env.DB.batch(statements);
  return json({ settings: await loadSettings(c.env.DB) });
});

app.post("/api/admin/kill-switch", async (c) => {
  requireAdmin(c.get("user"));
  const body = await readJson<{ enabled?: boolean }>(c.req.raw);
  const value = body.enabled ? "1" : "0";
  await c.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('kill_switch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(value)
    .run();
  logEvent("kill_switch", { enabled: body.enabled === true, by: c.get("user")?.id });
  return json({ killSwitch: body.enabled === true });
});

interface RecipeBody {
  name?: string;
  slug?: string;
  feature?: string;
  mode?: string;
  description?: string;
  prompt_template?: string;
  config?: unknown;
  sort_order?: number;
  active?: boolean;
}

function clipFeature(value: unknown): string {
  const feature = String(value || "foto_produk");
  return ["foto_produk", "video_bebas", "video_affiliate", "video_commercial"].includes(feature) ? feature : "foto_produk";
}

function clipMode(value: unknown): string {
  const mode = String(value || "commercial");
  return isStudioMode(mode) ? mode : "commercial";
}

function clipNote(value: unknown): string {
  return String(value || "").trim().slice(0, 200);
}
