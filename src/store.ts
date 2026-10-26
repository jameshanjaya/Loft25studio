import { assertEmail, assertPassword, hashPassword, normalizeEmail, tokenHash } from "./auth";
import { changeBalance } from "./billing";
import { extFromMime, nowIso } from "./bytes";
import type { AppEnv } from "./env";
import { HttpError } from "./http";
import { logEvent } from "./log";
import { seedRecipes } from "./recipes";
import { DEFAULT_SETTINGS, parseSettings, type AppSettings, type Feature } from "./settings";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  exempt_billing: number;
  credit_balance_idr: number;
  disabled: number;
  created_at: string;
}

export interface GenerationRow {
  id: string;
  user_id: string;
  feature: string;
  status: string;
  title: string | null;
  prompt: string | null;
  input_json: string | null;
  result_r2_key: string | null;
  result_mime: string | null;
  result_filename: string | null;
  scene_r2_key: string | null;
  scene_mime: string | null;
  scene_filename: string | null;
  voice_r2_key: string | null;
  voice_mime: string | null;
  voice_filename: string | null;
  cost_ticks: number;
  cost_usd: number;
  list_price_idr: number;
  charged_idr: number;
  billing_note: string | null;
  error: string | null;
  provider_request_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  exempt: boolean;
  balanceIdr: number;
}

export interface PublicFile {
  url: string;
  downloadUrl: string;
  filename: string;
  mime: string;
}

export interface PublicGeneration {
  id: string;
  feature: string;
  status: string;
  title: string;
  prompt: string;
  script: string;
  chargedIdr: number;
  costUsd: number;
  costTicks: number;
  listPriceIdr: number;
  billingNote: string;
  error: string;
  files: { result: PublicFile | null; scene: PublicFile | null; voice: PublicFile | null };
  createdAt: string;
  finishedAt: string | null;
}

export function publicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    exempt: user.exempt_billing === 1,
    balanceIdr: user.credit_balance_idr,
  };
}

function fileOf(id: string, key: string | null, filename: string | null, mime: string | null, which: string): PublicFile | null {
  if (!key || !filename || !mime) return null;
  const base = `/api/generations/${id}/file?which=${which}`;
  return { url: `${base}&inline=1`, downloadUrl: base, filename, mime };
}

export function publicGeneration(row: GenerationRow): PublicGeneration {
  let script = "";
  if (row.input_json) {
    try {
      const parsed = JSON.parse(row.input_json) as { script?: string };
      script = parsed.script || "";
    } catch {
      script = "";
    }
  }
  return {
    id: row.id,
    feature: row.feature,
    status: row.status,
    title: row.title || "",
    prompt: row.prompt || "",
    script,
    chargedIdr: row.charged_idr,
    costUsd: row.cost_usd,
    costTicks: row.cost_ticks,
    listPriceIdr: row.list_price_idr,
    billingNote: row.billing_note || "",
    error: row.error || "",
    files: {
      result: fileOf(row.id, row.result_r2_key, row.result_filename, row.result_mime, "result"),
      scene: fileOf(row.id, row.scene_r2_key, row.scene_filename, row.scene_mime, "scene"),
      voice: fileOf(row.id, row.voice_r2_key, row.voice_filename, row.voice_mime, "voice"),
    },
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export async function loadSettings(db: D1Database): Promise<AppSettings> {
  const rows = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const map: Record<string, string> = {};
  for (const row of rows.results) map[row.key] = row.value;
  return parseSettings(map);
}

export async function ensureSettings(db: D1Database): Promise<void> {
  const statements = Object.entries(DEFAULT_SETTINGS).map(([key, value]) =>
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(key, value),
  );
  await db.batch(statements);
}

export async function ensureReady(env: AppEnv): Promise<void> {
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").first();
  if (!table) {
    throw new HttpError(500, "Database belum siap. Jalankan migrasi D1 dulu.", "no_schema");
  }
  await ensureSettings(env.DB);
  const settings = await loadSettings(env.DB);
  if (!settings.recipesSeeded) {
    await seedRecipes(env.DB);
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('recipes_seeded', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
  }
  await ensureMaster(env);
}

async function ensureMaster(env: AppEnv): Promise<void> {
  const email = env.MASTER_EMAIL ? normalizeEmail(env.MASTER_EMAIL) : "";
  const password = env.MASTER_PASSWORD || "";
  if (!email || !password) {
    logEvent("master_missing", {});
    return;
  }
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return;
  assertEmail(email);
  assertPassword(password);
  const hash = await hashPassword(password);
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, exempt_billing, credit_balance_idr, disabled, created_at)
     VALUES (?, ?, ?, ?, 'admin', 1, 0, 0, ?)`,
  )
    .bind(crypto.randomUUID(), email, hash, "Mandala", nowIso())
    .run();
  logEvent("master_created", { email });
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
}

export async function readSessionUser(env: AppEnv, request: Request): Promise<UserRow | null> {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return null;
  const hash = await tokenHash(decodeURIComponent(match[1]));
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
  )
    .bind(hash, nowIso())
    .first<UserRow>();
  return row;
}

export async function createSession(env: AppEnv, userId: string, token: string): Promise<void> {
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, await tokenHash(token), expires, nowIso())
    .run();
}

export async function deleteSession(env: AppEnv, request: Request): Promise<void> {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return;
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await tokenHash(decodeURIComponent(match[1]))).run();
}

export async function hitRateLimit(db: D1Database, bucket: string, limit: number, windowSec: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  await db
    .prepare(
      `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1`,
    )
    .bind(bucket, windowStart)
    .run();
  const row = await db
    .prepare("SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?")
    .bind(bucket, windowStart)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit) throw new HttpError(429, "Terlalu sering. Istirahat sebentar ya.", "rate_limit");
}

export async function getGeneration(db: D1Database, id: string): Promise<GenerationRow | null> {
  return db.prepare("SELECT * FROM generations WHERE id = ?").bind(id).first<GenerationRow>();
}

export interface StoredFile {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}

export async function putOwnedFile(env: AppEnv, userId: string, generationId: string, name: string, file: StoredFile): Promise<string> {
  const key = `u/${userId}/g/${generationId}/${name}.${extFromMime(file.mime)}`;
  await env.BUCKET.put(key, file.bytes, { httpMetadata: { contentType: file.mime } });
  return key;
}

export async function putUpload(env: AppEnv, userId: string, generationId: string, name: string, bytes: Uint8Array, mime: string): Promise<string> {
  const key = `u/${userId}/uploads/${generationId}-${name}.${extFromMime(mime)}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
  return key;
}

export async function insertRunning(db: D1Database, row: {
  id: string;
  userId: string;
  feature: Feature;
  title: string;
  listPrice: number;
  charged: number;
  input: unknown;
}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO generations (
        id, user_id, feature, status, title, prompt, input_json, cost_ticks, cost_usd,
        list_price_idr, charged_idr, created_at
      ) VALUES (?, ?, ?, 'running', ?, '', ?, 0, 0, ?, ?, ?)`,
    )
    .bind(row.id, row.userId, row.feature, row.title, JSON.stringify(row.input), row.listPrice, row.charged, nowIso())
    .run();
}

export function topup(env: AppEnv, userId: string, amount: number, note: string): Promise<number> {
  return changeBalance(env.DB, userId, amount, "topup", note);
}
