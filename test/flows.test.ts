import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { TINY_JPEG } from "../src/tiny";
import { countWords } from "../src/prompts";
import { applySchema, call, login, resetDb } from "./helpers";

function productForm(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("product", new File([TINY_JPEG], "produk.jpg", { type: "image/jpeg" }));
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

describe("studio flows", () => {
  beforeAll(async () => {
    await applySchema();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it("lets the master log in and run every feature without a charge", async () => {
    const health = await call("/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, mock: true });

    const bad = await login("owner@studio.test", "salah-sekali");
    expect(bad.status).toBe(401);

    const session = await login();
    expect(session.status).toBe(200);
    expect(session.data.user?.exempt).toBe(true);
    expect(session.data.user?.balanceIdr).toBe(0);

    const foto = await call("/api/foto-produk", {
      cookie: session.cookie,
      body: productForm({ recipeId: "katalog-spotlight", productName: "Matcha Loft", background: "meja walnut" }),
    });
    const fotoBody = (await foto.json()) as { generation: { id: string; chargedIdr: number; costUsd: number; prompt: string; files: { result: { filename: string } } } };
    expect(foto.status).toBe(200);
    expect(fotoBody.generation.chargedIdr).toBe(0);
    expect(fotoBody.generation.costUsd).toBeGreaterThan(0);
    expect(fotoBody.generation.prompt).toContain("Hasselblad");
    expect(fotoBody.generation.prompt.toLowerCase()).not.toContain("brand name");
    expect(fotoBody.generation.files.result.filename.endsWith(".jpg")).toBe(true);

    const file = await call(`/api/generations/${fotoBody.generation.id}/file?which=result`, { cookie: session.cookie });
    expect(file.headers.get("content-type")).toContain("image/jpeg");
    expect(file.headers.get("content-disposition")).toContain(".jpg");
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);

    const analyzed = await call("/api/analyze", { cookie: session.cookie, body: productForm({ mode: "commercial" }) });
    const analysis = (await analyzed.json()) as { productName: string; backgrounds: string[] };
    expect(analyzed.status).toBe(200);
    expect(analysis.productName.length).toBeGreaterThan(0);
    expect(analysis.backgrounds.length).toBeGreaterThanOrEqual(7);

    const caption = await call("/api/captions", { cookie: session.cookie, json: { platform: "Instagram", topic: "matcha sore hari" } });
    const captionBody = (await caption.json()) as { generation: { script: string } };
    expect(caption.status).toBe(200);
    expect(captionBody.generation.script.length).toBeGreaterThan(20);

    const draft = await call("/api/video-bebas/draft", {
      cookie: session.cookie,
      json: { brief: "Cewek di kafe nunjukin matcha dan ngomong santai", pronunciations: [{ written: "Loft25", spoken: "Loft dua lima" }] },
    });
    const draftBody = (await draft.json()) as { script: string; videoPrompt: string };
    expect(draft.status).toBe(200);
    expect(countWords(draftBody.script)).toBeGreaterThanOrEqual(18);
    expect(countWords(draftBody.script)).toBeLessThanOrEqual(25);

    const video = await call("/api/video-bebas", {
      cookie: session.cookie,
      json: { brief: "kafe", script: draftBody.script, videoPrompt: draftBody.videoPrompt, voiceId: "ara", pronunciations: [{ written: "Loft25", spoken: "Loft dua lima" }] },
    });
    const videoBody = (await video.json()) as { generation: { id: string; files: { result: { filename: string }; voice: { filename: string } } } };
    expect(video.status).toBe(200);
    expect(videoBody.generation.files.result.filename.endsWith(".mp4")).toBe(true);
    expect(videoBody.generation.files.voice.filename.endsWith(".mp3")).toBe(true);
    const mp4 = await call(`/api/generations/${videoBody.generation.id}/file?which=result`, { cookie: session.cookie });
    expect(mp4.headers.get("content-disposition")).toContain(".mp4");
    expect(mp4.headers.get("content-type")).toContain("video/mp4");

    const denied = await call("/api/video-affiliate", {
      cookie: session.cookie,
      body: (() => {
        const form = productForm({ productName: "Matcha", voiceId: "ara", ugcStyle: "Handheld" });
        form.set("model", new File([TINY_JPEG], "orang.jpg", { type: "image/jpeg" }));
        return form;
      })(),
    });
    expect(denied.status).toBe(400);

    const affiliate = await call("/api/video-affiliate", {
      cookie: session.cookie,
      body: (() => {
        const form = productForm({ productName: "Matcha Loft", productDesc: "gelas matcha", voiceId: "rex", ugcStyle: "Tripod", consent: "ya", background: "Kafe sore" });
        form.set("model", new File([TINY_JPEG], "orang.jpg", { type: "image/jpeg" }));
        return form;
      })(),
    });
    const affiliateBody = (await affiliate.json()) as { generation: { prompt: string; files: { result: { filename: string } } } };
    expect(affiliate.status).toBe(200);
    expect(affiliateBody.generation.prompt).toContain("IDENTITY LOCK");
    expect(affiliateBody.generation.prompt).toContain("LIP-SYNC");
    expect(affiliateBody.generation.files.result.filename.endsWith(".mp4")).toBe(true);

    const commercial = await call("/api/video-commercial", {
      cookie: session.cookie,
      body: productForm({ concept: "gelas di meja gelap dengan lampu sorot", productName: "Matcha Loft", background: "meja walnut" }),
    });
    const commercialBody = (await commercial.json()) as { generation: { prompt: string; files: { result: { filename: string } } } };
    expect(commercial.status).toBe(200);
    expect(commercialBody.generation.prompt).toContain("NO HUMAN");
    expect(commercialBody.generation.files.result.filename.endsWith(".mp4")).toBe(true);

    const history = await call("/api/generations", { cookie: session.cookie });
    const historyBody = (await history.json()) as { generations: Array<{ id: string }> };
    expect(historyBody.generations.length).toBeGreaterThanOrEqual(4);

    const me = await call("/api/me", { cookie: session.cookie });
    const meBody = (await me.json()) as { user: { balanceIdr: number } };
    expect(meBody.user.balanceIdr).toBe(0);
  });

  it("charges a normal user, refunds a failed job, and blocks an empty wallet", async () => {
    const admin = await login();
    const created = await call("/api/admin/users", {
      cookie: admin.cookie,
      json: { email: "kasir@studio.test", password: "rahasia-kasir", name: "Kasir", creditIdr: 0 },
    });
    expect(created.status).toBe(201);
    const userId = ((await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind("kasir@studio.test").first()) as { id: string }).id;

    const poor = await login("kasir@studio.test", "rahasia-kasir");
    const blocked = await call("/api/foto-produk", {
      cookie: poor.cookie,
      body: productForm({ recipeId: "katalog-spotlight" }),
    });
    expect(blocked.status).toBe(402);

    await call(`/api/admin/users/${userId}/topup`, { cookie: admin.cookie, json: { amountIdr: 5000, note: "uji" } });
    const failed = await call("/api/foto-produk", {
      cookie: poor.cookie,
      headers: { "x-mock-fail": "1" },
      body: productForm({ recipeId: "katalog-spotlight" }),
    });
    expect(failed.status).toBe(502);
    const afterFail = await env.DB.prepare("SELECT credit_balance_idr FROM users WHERE id = ?").bind(userId).first<{ credit_balance_idr: number }>();
    expect(afterFail?.credit_balance_idr).toBe(5000);
    const ledger = await env.DB.prepare("SELECT entry_type, amount_idr FROM ledger WHERE user_id = ? ORDER BY created_at").bind(userId).all<{ entry_type: string; amount_idr: number }>();
    expect(ledger.results.map((row) => row.entry_type)).toEqual(["topup", "charge", "refund"]);

    await call("/api/admin/settings", {
      cookie: admin.cookie,
      method: "PUT",
      json: { settings: { price_foto_produk: "1000" } },
    });
    await call(`/api/admin/users/${userId}/topup`, { cookie: admin.cookie, json: { amountIdr: 10000 } });
    const priced = await call("/api/foto-produk", {
      cookie: poor.cookie,
      body: productForm({ recipeId: "katalog-spotlight", productName: "Roti" }),
    });
    expect(priced.status).toBe(200);
    const balance = await env.DB.prepare("SELECT credit_balance_idr FROM users WHERE id = ?").bind(userId).first<{ credit_balance_idr: number }>();
    expect(balance?.credit_balance_idr).toBe(5000 + 10000 - 1920);
  });

  it("stops generation on the kill switch and the daily cap", async () => {
    const admin = await login();
    await call("/api/admin/kill-switch", { cookie: admin.cookie, json: { enabled: true } });
    const killed = await call("/api/foto-produk", {
      cookie: admin.cookie,
      body: productForm({ recipeId: "katalog-spotlight" }),
    });
    expect(killed.status).toBe(423);
    await call("/api/admin/kill-switch", { cookie: admin.cookie, json: { enabled: false } });
    await call("/api/admin/settings", {
      cookie: admin.cookie,
      method: "PUT",
      json: { settings: { daily_spend_cap_usd: "0" } },
    });
    const capped = await call("/api/foto-produk", {
      cookie: admin.cookie,
      body: productForm({ recipeId: "katalog-spotlight" }),
    });
    expect(capped.status).toBe(429);
  });

  it("leaves a paid webhook unpaid while Midtrans is off", async () => {
    const response = await call("/api/payments/midtrans/webhook", {
      json: {
        order_id: "topup-test",
        status_code: "200",
        gross_amount: "10000.00",
        signature_key: "abc",
        transaction_status: "settlement",
      },
    });
    expect(response.status).toBe(503);
    const orders = await env.DB.prepare("SELECT COUNT(*) AS n FROM payment_orders").first<{ n: number }>();
    expect(orders?.n).toBe(0);
  });
});
