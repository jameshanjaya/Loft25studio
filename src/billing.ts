import { jakartaDay, nowIso } from "./bytes";
import type { AppEnv } from "./env";
import { HttpError } from "./http";
import { logEvent } from "./log";
import { notify } from "./notify";
import { FEATURE_ESTIMATE_USD, FEATURE_LABEL, type AppSettings, type Feature } from "./settings";

export const TICKS_PER_USD = 10_000_000_000;

export function ticksToUsd(ticks: number): number {
  if (!Number.isFinite(ticks) || ticks <= 0) return 0;
  return ticks / TICKS_PER_USD;
}

export function quoteChargeIdr(input: {
  exempt: boolean;
  listPriceIdr: number;
  costUsd: number;
  usdToIdr: number;
  multiplier: number;
}): { chargeIdr: number; meteredIdr: number } {
  if (input.exempt) return { chargeIdr: 0, meteredIdr: 0 };
  const metered = Math.ceil(input.costUsd * input.usdToIdr * input.multiplier - 1e-9);
  const chargeIdr = Math.max(0, input.listPriceIdr, metered);
  return { chargeIdr, meteredIdr: Math.max(0, metered) };
}

export class InsufficientFunds extends Error {
  constructor() {
    super("Saldo kurang.");
    this.name = "InsufficientFunds";
  }
}

export async function changeBalance(
  db: D1Database,
  userId: string,
  delta: number,
  entryType: "charge" | "refund" | "topup" | "adjust",
  note: string,
  generationId?: string,
): Promise<number> {
  const user = await db
    .prepare("SELECT credit_balance_idr, exempt_billing FROM users WHERE id = ?")
    .bind(userId)
    .first<{ credit_balance_idr: number; exempt_billing: number }>();
  if (!user) throw new HttpError(404, "Pengguna tidak ketemu.", "no_user");
  if (user.exempt_billing === 1 || delta === 0) return user.credit_balance_idr;
  const next = user.credit_balance_idr + delta;
  if (next < 0) throw new InsufficientFunds();
  await db.batch([
    db
      .prepare("UPDATE users SET credit_balance_idr = ? WHERE id = ? AND credit_balance_idr = ?")
      .bind(next, userId, user.credit_balance_idr),
    db
      .prepare(
        "INSERT INTO ledger (id, user_id, generation_id, entry_type, amount_idr, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), userId, generationId ?? null, entryType, delta, next, note, nowIso()),
  ]);
  return next;
}

export async function spendToday(db: D1Database, day = jakartaDay()): Promise<number> {
  const row = await db.prepare("SELECT cost_usd FROM spend_daily WHERE day = ?").bind(day).first<{ cost_usd: number }>();
  return row?.cost_usd ?? 0;
}

export async function assertCanSpend(db: D1Database, settings: AppSettings, feature: Feature): Promise<void> {
  if (settings.killSwitch) {
    throw new HttpError(423, "Generate lagi dimatikan dari admin.", "kill_switch");
  }
  const today = await spendToday(db);
  const estimate = FEATURE_ESTIMATE_USD[feature];
  if (today >= settings.dailySpendCapUsd || today + estimate > settings.dailySpendCapUsd) {
    throw new HttpError(
      429,
      `Pengeluaran harian sudah mentok (batas $${settings.dailySpendCapUsd}). Semua generate dimatiin dulu.`,
      "spend_cap",
    );
  }
}

export async function recordSpend(env: AppEnv, ticks: number, settings: AppSettings, day = jakartaDay()): Promise<number> {
  if (!Number.isFinite(ticks) || ticks <= 0) return spendToday(env.DB, day);
  const usd = ticksToUsd(ticks);
  await env.DB.prepare(
    `INSERT INTO spend_daily (day, cost_usd, cost_ticks, alerted_50, alerted_100)
     VALUES (?, ?, ?, 0, 0)
     ON CONFLICT(day) DO UPDATE SET
       cost_usd = cost_usd + excluded.cost_usd,
       cost_ticks = cost_ticks + excluded.cost_ticks`,
  )
    .bind(day, usd, Math.round(ticks))
    .run();
  const row = await env.DB.prepare("SELECT cost_usd, alerted_50, alerted_100 FROM spend_daily WHERE day = ?")
    .bind(day)
    .first<{ cost_usd: number; alerted_50: number; alerted_100: number }>();
  const total = row?.cost_usd ?? usd;
  if (row && total >= settings.alertUsd1 && row.alerted_50 !== 1) {
    const marked = await env.DB.prepare("UPDATE spend_daily SET alerted_50 = 1 WHERE day = ? AND alerted_50 = 0").bind(day).run();
    if ((marked.meta.changes ?? 0) > 0) {
      await notify(env, {
        kind: "spend_50",
        message: `Pengeluaran xAI hari ini sudah lewat $${settings.alertUsd1}. Total kira-kira $${total.toFixed(2)}.`,
      });
    }
  }
  if (row && total >= settings.alertUsd2 && row.alerted_100 !== 1) {
    const marked = await env.DB.prepare("UPDATE spend_daily SET alerted_100 = 1 WHERE day = ? AND alerted_100 = 0").bind(day).run();
    if ((marked.meta.changes ?? 0) > 0) {
      await notify(env, {
        kind: "spend_100",
        message: `Pengeluaran xAI hari ini sudah lewat $${settings.alertUsd2}. Total kira-kira $${total.toFixed(2)}.`,
      });
    }
  }
  logEvent("spend_recorded", { day, usd, total });
  return total;
}

export function priceLabel(feature: Feature, settings: AppSettings): string {
  return `${FEATURE_LABEL[feature]} Rp${settings.prices[feature].toLocaleString("id-ID")}`;
}
