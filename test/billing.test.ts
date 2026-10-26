import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { changeBalance, quoteChargeIdr, recordSpend, ticksToUsd, TICKS_PER_USD } from "../src/billing";
import { ensureSettings, loadSettings } from "../src/store";
import { applySchema, resetDb } from "./helpers";

describe("credits, ledger, and spend cap", () => {
  beforeAll(async () => {
    await applySchema();
  });

  beforeEach(async () => {
    await resetDb();
    await ensureSettings(env.DB);
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, exempt_billing, credit_balance_idr, disabled, created_at)
       VALUES ('user-1', 'kasir@studio.test', 'x', 'Kasir', 'user', 0, 10000, 0, '2026-10-26T00:00:00.000Z')`,
    ).run();
  });

  it("charges three times the real cost when that is above the menu price", () => {
    const quote = quoteChargeIdr({ exempt: false, listPriceIdr: 1000, costUsd: 0.04, usdToIdr: 16000, multiplier: 3 });
    expect(quote.meteredIdr).toBe(1920);
    expect(quote.chargeIdr).toBe(1920);
    const floored = quoteChargeIdr({ exempt: false, listPriceIdr: 5000, costUsd: 0.04, usdToIdr: 16000, multiplier: 3 });
    expect(floored.chargeIdr).toBe(5000);
    expect(quoteChargeIdr({ exempt: true, listPriceIdr: 5000, costUsd: 2, usdToIdr: 16000, multiplier: 3 }).chargeIdr).toBe(0);
    expect(ticksToUsd(400_000_000)).toBe(0.04);
    expect(TICKS_PER_USD).toBe(10_000_000_000);
    const rounded = quoteChargeIdr({ exempt: false, listPriceIdr: 0, costUsd: 0.04001, usdToIdr: 16000, multiplier: 3 });
    expect(rounded.chargeIdr).toBe(1921);
  });

  it("debits, refunds, and keeps the ledger equal to the balance", async () => {
    const afterCharge = await changeBalance(env.DB, "user-1", -5000, "charge", "foto", "gen-1");
    expect(afterCharge).toBe(5000);
    const afterRefund = await changeBalance(env.DB, "user-1", 5000, "refund", "gagal", "gen-1");
    expect(afterRefund).toBe(10000);
    await expect(changeBalance(env.DB, "user-1", -20000, "charge", "kebanyakan", "gen-2")).rejects.toThrow(/Saldo kurang/);
    const rows = await env.DB.prepare("SELECT amount_idr, balance_after FROM ledger WHERE user_id = ? ORDER BY created_at").bind("user-1").all<{ amount_idr: number; balance_after: number }>();
    expect(rows.results.map((row) => row.amount_idr)).toEqual([-5000, 5000]);
    expect(rows.results.at(-1)?.balance_after).toBe(10000);
    const user = await env.DB.prepare("SELECT credit_balance_idr FROM users WHERE id = 'user-1'").first<{ credit_balance_idr: number }>();
    expect(user?.credit_balance_idr).toBe(10000);
  });

  it("does not charge an exempt account", async () => {
    await env.DB.prepare("UPDATE users SET exempt_billing = 1, credit_balance_idr = 0 WHERE id = 'user-1'").run();
    const balance = await changeBalance(env.DB, "user-1", -5000, "charge", "harusnya nol", "gen-1");
    expect(balance).toBe(0);
    const ledger = await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger").first<{ n: number }>();
    expect(ledger?.n).toBe(0);
  });

  it("alerts once at $50 and once at $100", async () => {
    const settings = await loadSettings(env.DB);
    await recordSpend(env, 60 * TICKS_PER_USD, settings);
    await recordSpend(env, 1 * TICKS_PER_USD, settings);
    const first = await env.DB.prepare("SELECT kind FROM alerts ORDER BY created_at").all<{ kind: string }>();
    expect(first.results.map((row) => row.kind)).toEqual(["spend_50"]);
    await recordSpend(env, 50 * TICKS_PER_USD, settings);
    const second = await env.DB.prepare("SELECT kind FROM alerts ORDER BY created_at").all<{ kind: string }>();
    expect(second.results.map((row) => row.kind)).toEqual(["spend_50", "spend_100"]);
    const day = await env.DB.prepare("SELECT cost_usd, alerted_50, alerted_100 FROM spend_daily").first<{ cost_usd: number; alerted_50: number; alerted_100: number }>();
    expect(day?.alerted_50).toBe(1);
    expect(day?.alerted_100).toBe(1);
    expect(day?.cost_usd).toBeCloseTo(111, 5);
  });
});
