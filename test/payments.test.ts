import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { handleMidtransNotification, midtransSignature } from "../src/payments";
import { applySchema } from "./helpers";

describe("midtrans stub", () => {
  beforeAll(async () => {
    await applySchema();
  });

  it("checks the signature the way Midtrans documents it", async () => {
    const signature = await midtransSignature("order-1", "200", "10000.00", "server-key");
    const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode("order-120010000.00server-key"));
    const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(signature).toBe(expected);
    expect(signature).toHaveLength(128);
  });

  it("credits a wallet only when the module is enabled and the signature matches", async () => {
    await env.DB.prepare("DELETE FROM users WHERE id = 'payer'").run();
    await env.DB.prepare("DELETE FROM payment_orders WHERE id = 'topup-payer'").run();
    await env.DB.prepare("DELETE FROM ledger WHERE user_id = 'payer'").run();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, exempt_billing, credit_balance_idr, disabled, created_at)
       VALUES ('payer', 'payer@studio.test', 'x', 'Payer', 'user', 0, 0, 0, '2026-10-26T00:00:00.000Z')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO payment_orders (id, user_id, amount_idr, status, provider, created_at)
       VALUES ('topup-payer', 'payer', 25000, 'pending', 'midtrans', '2026-10-26T00:00:00.000Z')`,
    ).run();
    const signature = await midtransSignature("topup-payer", "200", "25000.00", "server-key");
    const off = await handleMidtransNotification(
      env.DB,
      { order_id: "topup-payer", status_code: "200", gross_amount: "25000.00", signature_key: signature, transaction_status: "settlement" },
      "server-key",
      false,
    );
    expect(off.status).toBe(503);
    const still = await env.DB.prepare("SELECT credit_balance_idr FROM users WHERE id = 'payer'").first<{ credit_balance_idr: number }>();
    expect(still?.credit_balance_idr).toBe(0);

    const bad = await handleMidtransNotification(
      env.DB,
      { order_id: "topup-payer", status_code: "200", gross_amount: "25000.00", signature_key: "nope", transaction_status: "settlement" },
      "server-key",
      true,
    );
    expect(bad.status).toBe(401);

    const paid = await handleMidtransNotification(
      env.DB,
      { order_id: "topup-payer", status_code: "200", gross_amount: "25000.00", signature_key: signature, transaction_status: "settlement" },
      "server-key",
      true,
    );
    expect(paid.status).toBe(200);
    const after = await env.DB.prepare("SELECT credit_balance_idr FROM users WHERE id = 'payer'").first<{ credit_balance_idr: number }>();
    expect(after?.credit_balance_idr).toBe(25000);
    const again = await handleMidtransNotification(
      env.DB,
      { order_id: "topup-payer", status_code: "200", gross_amount: "25000.00", signature_key: signature, transaction_status: "settlement" },
      "server-key",
      true,
    );
    expect(again.body).toMatchObject({ duplicate: true });
    const once = await env.DB.prepare("SELECT credit_balance_idr FROM users WHERE id = 'payer'").first<{ credit_balance_idr: number }>();
    expect(once?.credit_balance_idr).toBe(25000);
  });
});
