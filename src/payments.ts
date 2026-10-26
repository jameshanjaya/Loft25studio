import { nowIso, timingSafeEqualText } from "./bytes";
import { HttpError } from "./http";
import { changeBalance } from "./billing";
import { logEvent } from "./log";

export async function midtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-512",
    new TextEncoder().encode(`${orderId}${statusCode}${grossAmount}${serverKey}`),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface MidtransNotice {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
}

/**
 * Planned live call (not used while payments are off):
 * POST https://api.midtrans.com/v2/charge
 * Authorization: Basic base64(serverKey + ":")
 * body: { payment_type: "qris", transaction_details: { order_id, gross_amount }, qris: { acquirer: "gopay" } }
 */
export function createQrisCharge(): never {
  throw new HttpError(501, "QRIS Midtrans belum dihubungkan.", "midtrans_off");
}

export async function handleMidtransNotification(
  db: D1Database,
  body: MidtransNotice,
  serverKey: string,
  enabled: boolean,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!enabled) {
    logEvent("midtrans_ignored", { reason: "disabled", orderId: body.order_id || "" });
    return { status: 503, body: { error: "Pembayaran belum diaktifkan." } };
  }
  const orderId = String(body.order_id || "");
  const statusCode = String(body.status_code || "");
  const grossAmount = String(body.gross_amount || "");
  const signature = String(body.signature_key || "");
  if (!orderId || !statusCode || !grossAmount || !signature || !serverKey) {
    return { status: 400, body: { error: "Notifikasi tidak lengkap." } };
  }
  const expected = await midtransSignature(orderId, statusCode, grossAmount, serverKey);
  if (!timingSafeEqualText(expected, signature.toLowerCase())) {
    return { status: 401, body: { error: "Tanda tangan tidak cocok." } };
  }
  const status = String(body.transaction_status || "");
  if (status !== "settlement" && status !== "capture") {
    return { status: 200, body: { ok: true, ignored: true } };
  }
  const order = await db
    .prepare("SELECT id, user_id, amount_idr, status FROM payment_orders WHERE id = ?")
    .bind(orderId)
    .first<{ id: string; user_id: string; amount_idr: number; status: string }>();
  if (!order) return { status: 404, body: { error: "Pesanan tidak ketemu." } };
  if (order.status === "paid") return { status: 200, body: { ok: true, duplicate: true } };
  const gross = Number(grossAmount);
  if (!Number.isFinite(gross) || Math.round(gross) !== order.amount_idr) {
    return { status: 400, body: { error: "Nominal tidak cocok." } };
  }
  await changeBalance(db, order.user_id, order.amount_idr, "topup", `QRIS ${orderId}`, undefined);
  await db.prepare("UPDATE payment_orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'")
    .bind(nowIso(), orderId)
    .run();
  return { status: 200, body: { ok: true } };
}
