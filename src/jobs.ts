import { assertCanSpend, changeBalance, InsufficientFunds, priceLabel, quoteChargeIdr, recordSpend, ticksToUsd } from "./billing";
import { nowIso, stamp } from "./bytes";
import type { AppEnv } from "./env";
import { HttpError } from "./http";
import { logEvent } from "./log";
import { notify } from "./notify";
import { checkImage, fileBytes, wantsConsent, type CheckedImage } from "./media";
import {
  applyPronunciation,
  assertNoCelebrityRequest,
  buildImagePrompt,
  buildVideoPrompt,
  captionInstruction,
  cleanPronunciations,
  fallbackScript,
  finalizeFreeVideoPrompt,
  fitScripts,
  isStudioMode,
  isUgcStyle,
  mergeBackgrounds,
  MODE_BACKGROUNDS,
  productAnalysisInstruction,
  pronunciationNote,
  replaceMap,
  storyboardInstruction,
  videoDraftInstruction,
  type Pronunciation,
  type StudioMode,
  type UgcStyle,
} from "./prompts";
import { parseRecipeConfig, styleToRecipeSlug, type RecipeRow } from "./recipes";
import { FEATURE_LABEL, type Feature } from "./settings";
import {
  findUserById,
  getGeneration,
  hitRateLimit,
  insertRunning,
  loadSettings,
  publicGeneration,
  putOwnedFile,
  putUpload,
  type GenerationRow,
  type PublicGeneration,
  type UserRow,
} from "./store";
import { createXaiClient, XaiCallError, type ImageInput, type XaiClient } from "./xai";
import { isAllowedVoice } from "./voices";

interface Begun {
  id: string;
  user: UserRow;
  feature: Feature;
  hold: number;
  listPrice: number;
  settings: Awaited<ReturnType<typeof loadSettings>>;
}

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function ratioOf(value: unknown): string {
  const ratio = String(value || "9:16");
  return ["9:16", "1:1", "16:9", "3:4", "4:3"].includes(ratio) ? ratio : "9:16";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function requireConsent(ok: boolean): void {
  if (!ok) throw new HttpError(400, "Centang dulu: saya punya izin pakai wajah ini.", "consent");
}

function guardText(text: string): void {
  try {
    assertNoCelebrityRequest(text);
  } catch (error) {
    if (error instanceof Error && error.message === "CELEBRITY") {
      throw new HttpError(400, "Wajah artis atau tokoh publik tidak boleh dipakai.", "celebrity");
    }
    throw error;
  }
}

function friendly(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof InsufficientFunds) return new HttpError(402, "Saldo kurang.", "insufficient");
  return new HttpError(502, "Gagal buat konten. Kalau saldo sudah kepotong, itu dikembaliin.", "generate_failed");
}

export function mockFlags(env: AppEnv, request: Request): { fail: boolean; defer: boolean } {
  if (env.XAI_MOCK !== "1") return { fail: false, defer: false };
  return {
    fail: request.headers.get("x-mock-fail") === "1",
    defer: request.headers.get("x-mock-defer") === "1",
  };
}

async function begin(env: AppEnv, user: UserRow, feature: Feature, title: string, input: unknown): Promise<Begun> {
  const settings = await loadSettings(env.DB);
  await assertCanSpend(env.DB, settings, feature);
  await hitRateLimit(env.DB, `gen:${user.id}`, 30, 60 * 60);
  const listPrice = settings.prices[feature];
  const hold = user.exempt_billing === 1 ? 0 : listPrice;
  if (hold > user.credit_balance_idr) {
    throw new HttpError(
      402,
      `Saldo kurang. ${priceLabel(feature, settings)}, saldo kamu Rp${user.credit_balance_idr.toLocaleString("id-ID")}.`,
      "insufficient",
    );
  }
  const id = crypto.randomUUID();
  if (hold > 0) await changeBalance(env.DB, user.id, -hold, "charge", `Potong ${FEATURE_LABEL[feature]}`, id);
  try {
    await insertRunning(env.DB, { id, userId: user.id, feature, title, listPrice, charged: hold, input });
  } catch (error) {
    if (hold > 0) await changeBalance(env.DB, user.id, hold, "refund", "Batal sebelum mulai", id);
    throw error;
  }
  return { id, user, feature, hold, listPrice, settings };
}

async function fail(env: AppEnv, begun: Begun, error: unknown): Promise<void> {
  const ticks = error instanceof XaiCallError ? error.costTicks : 0;
  if (ticks > 0) await recordSpend(env, ticks, begun.settings);
  if (begun.hold > 0) {
    await changeBalance(env.DB, begun.user.id, begun.hold, "refund", "Gagal, saldo kembali", begun.id);
  }
  const message = error instanceof HttpError ? error.message : error instanceof Error ? error.message : "gagal";
  await env.DB.prepare(
    "UPDATE generations SET status = 'failed', error = ?, cost_ticks = ?, cost_usd = ?, charged_idr = 0, finished_at = ? WHERE id = ?",
  )
    .bind(message.slice(0, 500), ticks, ticksToUsd(ticks), nowIso(), begun.id)
    .run();
  logEvent("generation_failed", { id: begun.id, feature: begun.feature, ticks });
}

interface FinishInput {
  ticks: number;
  prompt: string;
  input: unknown;
  title?: string;
  result?: { bytes: Uint8Array; mime: string; filename: string };
  scene?: { bytes: Uint8Array; mime: string; filename: string };
  voice?: { bytes: Uint8Array; mime: string; filename: string };
}

async function finish(env: AppEnv, begun: Begun, output: FinishInput): Promise<PublicGeneration> {
  await recordSpend(env, output.ticks, begun.settings);
  const costUsd = ticksToUsd(output.ticks);
  const quote = quoteChargeIdr({
    exempt: begun.user.exempt_billing === 1,
    listPriceIdr: begun.listPrice,
    costUsd,
    usdToIdr: begun.settings.usdToIdr,
    multiplier: begun.settings.priceMultiplier,
  });
  let charged = begun.hold;
  let billingNote = "";
  const extra = quote.chargeIdr - begun.hold;
  if (extra > 0) {
    try {
      await changeBalance(env.DB, begun.user.id, -extra, "charge", `Selisih biaya asli ${FEATURE_LABEL[begun.feature]}`, begun.id);
      charged += extra;
    } catch (error) {
      if (!(error instanceof InsufficientFunds)) throw error;
      billingNote = `kurang bayar Rp${extra}`;
      await notify(env, { kind: "undercharge", message: `Generasi ${begun.id} kurang bayar Rp${extra}.` });
    }
  }
  let resultKey: string | null = null;
  let sceneKey: string | null = null;
  let voiceKey: string | null = null;
  if (output.result) resultKey = await putOwnedFile(env, begun.user.id, begun.id, "result", output.result);
  if (output.scene) sceneKey = await putOwnedFile(env, begun.user.id, begun.id, "scene", output.scene);
  if (output.voice) voiceKey = await putOwnedFile(env, begun.user.id, begun.id, "voice", output.voice);
  await env.DB.prepare(
    `UPDATE generations SET status = 'succeeded', title = ?, prompt = ?, input_json = ?,
      result_r2_key = ?, result_mime = ?, result_filename = ?,
      scene_r2_key = ?, scene_mime = ?, scene_filename = ?,
      voice_r2_key = ?, voice_mime = ?, voice_filename = ?,
      cost_ticks = ?, cost_usd = ?, charged_idr = ?, billing_note = ?, finished_at = ?
     WHERE id = ?`,
  )
    .bind(
      output.title || null,
      output.prompt,
      JSON.stringify(output.input),
      resultKey,
      output.result?.mime || null,
      output.result?.filename || null,
      sceneKey,
      output.scene?.mime || null,
      output.scene?.filename || null,
      voiceKey,
      output.voice?.mime || null,
      output.voice?.filename || null,
      Math.round(output.ticks),
      costUsd,
      charged,
      billingNote,
      nowIso(),
      begun.id,
    )
    .run();
  logEvent("generation_ok", { id: begun.id, feature: begun.feature, costUsd, charged });
  const row = await getGeneration(env.DB, begun.id);
  if (!row) throw new HttpError(500, "Hasilnya hilang setelah tersimpan.", "missing_row");
  return publicGeneration(row);
}

async function run<T>(env: AppEnv, begun: Begun, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    await fail(env, begun, error);
    throw friendly(error);
  }
}

async function makeScripts(
  client: XaiClient,
  model: string,
  mode: StudioMode,
  productName: string,
  productDesc: string,
  scenes: number,
): Promise<{ scripts: string[]; ticks: number }> {
  const result = await client.completeJson({
    task: "scripts",
    model,
    system: "You write short Indonesian storyboard lines and reply with JSON only.",
    user: storyboardInstruction({ scenes, productName, productDesc, mode }),
    hints: { productName, scenes },
  });
  const raw = asRecord(result.json).scripts;
  const list = Array.isArray(raw) ? raw.map((item) => String(item)) : [];
  return { scripts: fitScripts(list, scenes, productName), ticks: result.usage.costTicks };
}

export async function analyzeProduct(
  env: AppEnv,
  user: UserRow,
  request: Request,
): Promise<{ productName: string; productDesc: string; backgrounds: string[]; generation: PublicGeneration }> {
  const form = await request.formData();
  const image = checkImage(await fileBytes(form.get("product"), "Foto produk"), "Foto produk");
  const modeName = clip(form.get("mode"), 40);
  const mode: StudioMode = isStudioMode(modeName) ? modeName : "commercial";
  const begun = await begin(env, user, "analyze", "Analisis produk", { mode });
  return run(env, begun, async () => {
    const client = createXaiClient(env, mockFlags(env, request));
    await putUpload(env, user.id, begun.id, "product", image.bytes, image.mime);
    const result = await client.completeJson({
      task: "analyze",
      model: begun.settings.textModel,
      system: "Analisis foto produk. Balas JSON saja.",
      user: productAnalysisInstruction(mode),
      images: [{ mime: image.mime, bytes: image.bytes }],
    });
    const data = asRecord(result.json);
    const productName = clip(data.productName, 80) || "Produk";
    const productDesc = clip(data.productDesc, 400) || "Produk seperti di foto.";
    const suggested = Array.isArray(data.backgrounds) ? data.backgrounds.map((item) => String(item)) : [];
    const backgrounds = mergeBackgrounds(suggested, mode).slice(0, 12);
    const generation = await finish(env, begun, {
      ticks: result.usage.costTicks,
      prompt: productAnalysisInstruction(mode),
      title: productName,
      input: { productName, productDesc, backgrounds, mode },
    });
    return { productName, productDesc, backgrounds, generation };
  });
}

export async function writeCaption(env: AppEnv, user: UserRow, body: { platform?: string; topic?: string }): Promise<PublicGeneration> {
  const platform = clip(body.platform, 40) || "Instagram";
  const topic = clip(body.topic, 300);
  if (topic.length < 3) throw new HttpError(400, "Isi dulu topiknya.", "topic");
  guardText(topic);
  const begun = await begin(env, user, "caption", topic, { platform, topic });
  return run(env, begun, async () => {
    const client = createXaiClient(env);
    const instruction = captionInstruction(platform, topic);
    const result = await client.completeJson({
      task: "caption",
      model: begun.settings.textModel,
      system: "Kamu copywriter media sosial. Balas JSON.",
      user: instruction,
      hints: { productName: topic },
    });
    const caption = clip(asRecord(result.json).caption, 4000) || result.text;
    return finish(env, begun, {
      ticks: result.usage.costTicks,
      prompt: instruction,
      title: topic,
      input: { platform, topic, script: caption },
    });
  });
}

export async function draftVideo(
  env: AppEnv,
  user: UserRow,
  body: { brief?: string; pronunciations?: unknown; productName?: string },
): Promise<{ script: string; videoPrompt: string; generation: PublicGeneration }> {
  const brief = clip(body.brief, 2000);
  if (brief.length < 8) throw new HttpError(400, "Ceritain dulu mau videonya kayak apa.", "brief");
  guardText(brief);
  const pronunciations = cleanPronunciations(body.pronunciations);
  const begun = await begin(env, user, "draft", brief.slice(0, 80), { brief });
  return run(env, begun, async () => {
    const client = createXaiClient(env);
    const instruction = videoDraftInstruction(brief, pronunciationNote(pronunciations));
    const result = await client.completeJson({
      task: "draft",
      model: begun.settings.textModel,
      system: "Kamu penulis naskah iklan singkat. Balas JSON.",
      user: instruction,
      hints: { productName: clip(body.productName, 80) || "produk ini" },
    });
    const data = asRecord(result.json);
    const script = fitScripts([String(data.script || "")], 1, clip(body.productName, 80) || "produk")[0];
    const videoPrompt = clip(data.videoPrompt, 4000) || `Photorealistic vertical video about ${brief}`;
    const generation = await finish(env, begun, {
      ticks: result.usage.costTicks,
      prompt: videoPrompt,
      title: brief.slice(0, 80),
      input: { brief, script, videoPrompt, pronunciations },
    });
    return { script, videoPrompt, generation };
  });
}

async function loadRecipe(env: AppEnv, idOrSlug: string): Promise<RecipeRow | null> {
  if (!idOrSlug) return null;
  return env.DB.prepare("SELECT * FROM recipes WHERE id = ? OR slug = ?").bind(idOrSlug, idOrSlug).first<RecipeRow>();
}

export async function generateFoto(env: AppEnv, user: UserRow, request: Request): Promise<PublicGeneration> {
  const form = await request.formData();
  const product = checkImage(await fileBytes(form.get("product"), "Foto produk"), "Foto produk");
  const custom = clip(form.get("customPrompt"), 4000);
  const recipeId = clip(form.get("recipeId"), 80);
  if (!custom && !recipeId) throw new HttpError(400, "Pilih resep atau tulis prompt sendiri.", "prompt");
  const recipe = custom ? null : await loadRecipe(env, recipeId);
  if (!custom && (!recipe || recipe.active !== 1)) throw new HttpError(400, "Resepnya tidak ada.", "recipe");
  const mode: StudioMode = recipe && isStudioMode(recipe.mode) ? recipe.mode : "commercial";
  const config = recipe ? parseRecipeConfig(recipe.config_json) : {};
  const hasModel = Boolean(config.hasModel) && mode !== "pov";
  let modelImage: CheckedImage | null = null;
  if (hasModel) {
    requireConsent(wantsConsent(form.get("consent")));
    modelImage = checkImage(await fileBytes(form.get("model"), "Foto orang"), "Foto orang");
  }
  guardText(`${custom} ${clip(form.get("productName"), 80)}`);
  const productName = clip(form.get("productName"), 80) || "Produk";
  const productDesc = clip(form.get("productDesc"), 400) || "produk seperti di foto referensi";
  const background = clip(form.get("background"), 200) || MODE_BACKGROUNDS[mode][0];
  const ratio = ratioOf(form.get("ratio") || config.aspectRatio);
  const ugcStyle: UgcStyle = isUgcStyle(String(config.ugcStyle || "")) ? (config.ugcStyle as UgcStyle) : "Handheld";
  const begun = await begin(env, user, "foto_produk", productName, { recipeId, mode });
  return run(env, begun, async () => {
    const client = createXaiClient(env, mockFlags(env, request));
    await putUpload(env, user.id, begun.id, "product", product.bytes, product.mime);
    const images: ImageInput[] = [];
    if (modelImage) {
      await putUpload(env, user.id, begun.id, "model", modelImage.bytes, modelImage.mime);
      images.push({ mime: modelImage.mime, bytes: modelImage.bytes });
    }
    images.push({ mime: product.mime, bytes: product.bytes });
    const prompt = buildImagePrompt({
      mode,
      productName,
      productDesc,
      background,
      ratio,
      ugcStyle,
      hasModel,
      hasProduct: true,
      template: custom ? undefined : recipe?.prompt_template,
      customPrompt: custom || undefined,
    });
    const image = await client.editImage({
      prompt,
      images,
      aspectRatio: ratio,
      model: begun.settings.imageModel,
    });
    return finish(env, begun, {
      ticks: image.usage.costTicks,
      prompt,
      title: productName,
      input: { productName, productDesc, background, mode, recipeId, script: "" },
      result: { bytes: image.bytes, mime: image.mime, filename: `foto-produk-${stamp()}-${begun.id.slice(0, 8)}.jpg` },
    });
  });
}

async function speakingVideo(
  env: AppEnv,
  begun: Begun,
  client: XaiClient,
  input: {
    prompt: string;
    image: ImageInput;
    script: string;
    voiceId?: string;
    pronunciations: Pronunciation[];
    scene?: { bytes: Uint8Array; mime: string };
  },
): Promise<{ videoBytes: Uint8Array; videoMime: string; voice?: { bytes: Uint8Array; mime: string }; ticks: number; pendingId?: string }> {
  let ticks = 0;
  const spoken = applyPronunciation(input.script, input.pronunciations);
  const video = await client.generateVideo({
    prompt: input.prompt,
    image: input.image,
    aspectRatio: "9:16",
    duration: begun.settings.videoDurationSeconds,
    resolution: begun.settings.videoResolution,
    voiceId: input.voiceId,
    model: "grok-imagine-video-1.5",
  });
  ticks += video.usage.costTicks;
  let voice: { bytes: Uint8Array; mime: string } | undefined;
  if (input.voiceId) {
    const audio = await client.tts({
      text: spoken,
      voiceId: input.voiceId,
      replace: replaceMap(input.pronunciations),
    });
    ticks += audio.usage.costTicks;
    voice = { bytes: audio.bytes, mime: audio.mime };
  }
  if (!video.done || !video.bytes) {
    return { videoBytes: new Uint8Array(), videoMime: "video/mp4", voice, ticks, pendingId: video.requestId };
  }
  return { videoBytes: video.bytes, videoMime: video.mime || "video/mp4", voice, ticks };
}

export async function generateFreeVideo(
  env: AppEnv,
  user: UserRow,
  request: Request,
): Promise<PublicGeneration> {
  const body = (await request.json()) as {
    brief?: string;
    script?: string;
    videoPrompt?: string;
    voiceId?: string;
    pronunciations?: unknown;
  };
  const brief = clip(body.brief, 2000);
  const script = fitScripts([clip(body.script, 600)], 1, "produk")[0];
  const videoPrompt = clip(body.videoPrompt, 4000);
  const voiceId = clip(body.voiceId, 40);
  if (!videoPrompt) throw new HttpError(400, "Prompt videonya masih kosong.", "prompt");
  if (!isAllowedVoice(voiceId)) throw new HttpError(400, "Pilih salah satu suara.", "voice");
  guardText(`${brief} ${script} ${videoPrompt}`);
  const pronunciations = cleanPronunciations(body.pronunciations);
  const begun = await begin(env, user, "video_bebas", brief.slice(0, 80) || "Video bebas", { brief, script, voiceId });
  return run(env, begun, async () => {
    const client = createXaiClient(env, mockFlags(env, request));
    const spoken = applyPronunciation(script, pronunciations);
    const prompt = finalizeFreeVideoPrompt(videoPrompt, spoken, voiceId);
    const still = await client.generateImage({
      prompt: `${prompt} Still frame, no text.`,
      aspectRatio: "9:16",
      model: begun.settings.imageModel,
    });
    const video = await speakingVideo(env, begun, client, {
      prompt,
      image: { mime: still.mime, bytes: still.bytes },
      script,
      voiceId,
      pronunciations,
    });
    const ticks = still.usage.costTicks + video.ticks;
    if (video.pendingId && video.videoBytes.byteLength === 0) {
      return park(env, begun, {
        requestId: video.pendingId,
        ticks,
        prompt,
        input: { brief, script, videoPrompt: prompt, voiceId },
        scene: { bytes: still.bytes, mime: still.mime, filename: `adegan-${stamp()}-${begun.id.slice(0, 8)}.jpg` },
        voice: video.voice
          ? { bytes: video.voice.bytes, mime: video.voice.mime, filename: `voiceover-${stamp()}-${begun.id.slice(0, 8)}.mp3` }
          : undefined,
      });
    }
    return finish(env, begun, {
      ticks,
      prompt,
      title: brief.slice(0, 80) || "Video bebas",
      input: { brief, script, videoPrompt: prompt, voiceId },
      result: { bytes: video.videoBytes, mime: "video/mp4", filename: `video-bebas-${stamp()}-${begun.id.slice(0, 8)}.mp4` },
      scene: { bytes: still.bytes, mime: still.mime, filename: `adegan-${stamp()}-${begun.id.slice(0, 8)}.jpg` },
      voice: video.voice
        ? { bytes: video.voice.bytes, mime: video.voice.mime, filename: `voiceover-${stamp()}-${begun.id.slice(0, 8)}.mp3` }
        : undefined,
    });
  });
}

async function park(
  env: AppEnv,
  begun: Begun,
  output: {
    requestId: string;
    ticks: number;
    prompt: string;
    input: unknown;
    scene?: { bytes: Uint8Array; mime: string; filename: string };
    voice?: { bytes: Uint8Array; mime: string; filename: string };
  },
): Promise<PublicGeneration> {
  await recordSpend(env, output.ticks, begun.settings);
  const sceneKey = output.scene ? await putOwnedFile(env, begun.user.id, begun.id, "scene", output.scene) : null;
  const voiceKey = output.voice ? await putOwnedFile(env, begun.user.id, begun.id, "voice", output.voice) : null;
  await env.DB.prepare(
    `UPDATE generations SET prompt = ?, input_json = ?, provider_request_id = ?, cost_ticks = ?, cost_usd = ?,
      scene_r2_key = ?, scene_mime = ?, scene_filename = ?,
      voice_r2_key = ?, voice_mime = ?, voice_filename = ?
     WHERE id = ?`,
  )
    .bind(
      output.prompt,
      JSON.stringify(output.input),
      output.requestId,
      Math.round(output.ticks),
      ticksToUsd(output.ticks),
      sceneKey,
      output.scene?.mime || null,
      output.scene?.filename || null,
      voiceKey,
      output.voice?.mime || null,
      output.voice?.filename || null,
      begun.id,
    )
    .run();
  const row = await getGeneration(env.DB, begun.id);
  if (!row) throw new HttpError(500, "Pekerjaan tertahan tidak tersimpan.", "missing_row");
  return publicGeneration(row);
}

export async function continueGeneration(env: AppEnv, row: GenerationRow, actor: UserRow): Promise<PublicGeneration> {
  if (row.status !== "running" || !row.provider_request_id) return publicGeneration(row);
  if (row.user_id !== actor.id && actor.role !== "admin") throw new HttpError(404, "Hasilnya tidak ketemu.", "not_found");
  const user = (await findUserById(env.DB, row.user_id)) || actor;
  const settings = await loadSettings(env.DB);
  const client = createXaiClient(env);
  let polled;
  try {
    polled = await client.pollVideo(row.provider_request_id);
  } catch (error) {
    const ticks = (error instanceof XaiCallError ? error.costTicks : 0) + row.cost_ticks;
    if (error instanceof XaiCallError && error.costTicks) await recordSpend(env, error.costTicks, settings);
    if (row.charged_idr > 0) await changeBalance(env.DB, row.user_id, row.charged_idr, "refund", "Video gagal, saldo kembali", row.id);
    await env.DB.prepare("UPDATE generations SET status = 'failed', error = ?, charged_idr = 0, cost_ticks = ?, cost_usd = ?, finished_at = ? WHERE id = ?")
      .bind("Video gagal selesai.", ticks, ticksToUsd(ticks), nowIso(), row.id)
      .run();
    const failed = await getGeneration(env.DB, row.id);
    return publicGeneration(failed || row);
  }
  if (!polled.done || !polled.bytes) return publicGeneration(row);
  await recordSpend(env, polled.usage.costTicks, settings);
  const totalTicks = row.cost_ticks + polled.usage.costTicks;
  const costUsd = ticksToUsd(totalTicks);
  const quote = quoteChargeIdr({
    exempt: user.exempt_billing === 1,
    listPriceIdr: row.list_price_idr,
    costUsd,
    usdToIdr: settings.usdToIdr,
    multiplier: settings.priceMultiplier,
  });
  let charged = row.charged_idr;
  const extra = quote.chargeIdr - charged;
  let billingNote = row.billing_note || "";
  if (extra > 0 && user.exempt_billing !== 1) {
    try {
      await changeBalance(env.DB, row.user_id, -extra, "charge", "Selisih biaya video", row.id);
      charged += extra;
    } catch (error) {
      if (!(error instanceof InsufficientFunds)) throw error;
      billingNote = `kurang bayar Rp${extra}`;
    }
  }
  const filename = `${row.feature}-${stamp()}-${row.id.slice(0, 8)}.mp4`;
  const key = await putOwnedFile(env, row.user_id, row.id, "result", { bytes: polled.bytes, mime: "video/mp4", filename });
  await env.DB.prepare(
    `UPDATE generations SET status = 'succeeded', result_r2_key = ?, result_mime = 'video/mp4', result_filename = ?,
      cost_ticks = ?, cost_usd = ?, charged_idr = ?, billing_note = ?, finished_at = ?, provider_request_id = NULL WHERE id = ?`,
  )
    .bind(key, filename, Math.round(totalTicks), costUsd, charged, billingNote, nowIso(), row.id)
    .run();
  const done = await getGeneration(env.DB, row.id);
  if (!done) throw new HttpError(500, "Video selesai tapi catatannya hilang.", "missing_row");
  return publicGeneration(done);
}

export async function generateAffiliate(env: AppEnv, user: UserRow, request: Request): Promise<PublicGeneration> {
  const form = await request.formData();
  requireConsent(wantsConsent(form.get("consent")));
  const modelImage = checkImage(await fileBytes(form.get("model"), "Foto orang"), "Foto orang");
  const product = checkImage(await fileBytes(form.get("product"), "Foto produk"), "Foto produk");
  const styleName = clip(form.get("ugcStyle"), 20) || "Handheld";
  const ugcStyle: UgcStyle = isUgcStyle(styleName) ? styleName : "Handheld";
  const voiceId = clip(form.get("voiceId"), 40);
  if (!isAllowedVoice(voiceId)) throw new HttpError(400, "Pilih salah satu suara.", "voice");
  const pronunciations = cleanPronunciations(parseMaybeJson(form.get("pronunciations")));
  guardText(clip(form.get("productName"), 120));
  const productName = clip(form.get("productName"), 80) || "Produk";
  const productDesc = clip(form.get("productDesc"), 400) || "produk seperti di foto referensi";
  const background = clip(form.get("background"), 200) || MODE_BACKGROUNDS.affiliate[0];
  const recipe = await loadRecipe(env, styleToRecipeSlug(ugcStyle));
  const begun = await begin(env, user, "video_affiliate", productName, { ugcStyle, productName });
  return run(env, begun, async () => {
    const client = createXaiClient(env, mockFlags(env, request));
    await putUpload(env, user.id, begun.id, "model", modelImage.bytes, modelImage.mime);
    await putUpload(env, user.id, begun.id, "product", product.bytes, product.mime);
    const scripts = await makeScripts(client, begun.settings.textModel, "affiliate", productName, productDesc, 1);
    const script = applyPronunciation(scripts.scripts[0] || fallbackScript(productName), pronunciations);
    const imagePrompt = buildImagePrompt({
      mode: "affiliate",
      productName,
      productDesc,
      background,
      ratio: "9:16",
      ugcStyle,
      hasModel: true,
      hasProduct: true,
      scriptText: script,
      template: recipe?.prompt_template || undefined,
    });
    const still = await client.editImage({
      prompt: imagePrompt,
      images: [
        { mime: modelImage.mime, bytes: modelImage.bytes },
        { mime: product.mime, bytes: product.bytes },
      ],
      aspectRatio: "9:16",
      model: begun.settings.imageModel,
    });
    const videoPrompt = buildVideoPrompt({
      mode: "affiliate",
      productName,
      productDesc,
      background,
      script,
      ugcStyle,
      hasModel: true,
      voiceId,
    });
    const video = await speakingVideo(env, begun, client, {
      prompt: videoPrompt,
      image: { mime: still.mime, bytes: still.bytes },
      script,
      voiceId,
      pronunciations,
    });
    const ticks = scripts.ticks + still.usage.costTicks + video.ticks;
    const scene = { bytes: still.bytes, mime: still.mime, filename: `adegan-${stamp()}-${begun.id.slice(0, 8)}.jpg` };
    const voice = video.voice
      ? { bytes: video.voice.bytes, mime: video.voice.mime, filename: `voiceover-${stamp()}-${begun.id.slice(0, 8)}.mp3` }
      : undefined;
    const input = { productName, productDesc, background, script, ugcStyle, voiceId, videoPrompt };
    if (video.pendingId && video.videoBytes.byteLength === 0) {
      return park(env, begun, { requestId: video.pendingId, ticks, prompt: videoPrompt, input, scene, voice });
    }
    return finish(env, begun, {
      ticks,
      prompt: `${imagePrompt}\n${videoPrompt}`,
      title: productName,
      input,
      result: { bytes: video.videoBytes, mime: "video/mp4", filename: `video-affiliate-${stamp()}-${begun.id.slice(0, 8)}.mp4` },
      scene,
      voice,
    });
  });
}

export async function generateCommercial(env: AppEnv, user: UserRow, request: Request): Promise<PublicGeneration> {
  const form = await request.formData();
  const product = checkImage(await fileBytes(form.get("product"), "Foto produk"), "Foto produk");
  const concept = clip(form.get("concept"), 2000);
  if (concept.length < 4) throw new HttpError(400, "Tulis konsep iklannya dulu.", "concept");
  guardText(concept);
  const modelField = form.get("model");
  const modelFile = modelField instanceof File && modelField.size > 0 ? modelField : null;
  const hasModel = wantsConsent(form.get("hasModel")) || Boolean(modelFile);
  let modelImage: CheckedImage | null = null;
  if (hasModel) {
    requireConsent(wantsConsent(form.get("consent")));
    modelImage = checkImage(await fileBytes(modelFile, "Foto orang"), "Foto orang");
  }
  const voiceId = clip(form.get("voiceId"), 40);
  if (hasModel && !isAllowedVoice(voiceId)) throw new HttpError(400, "Pilih salah satu suara.", "voice");
  const pronunciations = cleanPronunciations(parseMaybeJson(form.get("pronunciations")));
  const productName = clip(form.get("productName"), 80) || "Produk";
  const productDesc = clip(form.get("productDesc"), 400) || concept;
  const background = clip(form.get("background"), 200) || MODE_BACKGROUNDS.commercial[0];
  const recipe = await loadRecipe(env, hasModel ? "katalog-dengan-model" : "katalog-spotlight");
  const begun = await begin(env, user, "video_commercial", productName, { concept, hasModel });
  return run(env, begun, async () => {
    const client = createXaiClient(env, mockFlags(env, request));
    await putUpload(env, user.id, begun.id, "product", product.bytes, product.mime);
    const images: ImageInput[] = [];
    if (modelImage) {
      await putUpload(env, user.id, begun.id, "model", modelImage.bytes, modelImage.mime);
      images.push({ mime: modelImage.mime, bytes: modelImage.bytes });
    }
    images.push({ mime: product.mime, bytes: product.bytes });
    const scripts = await makeScripts(client, begun.settings.textModel, "commercial", productName, `${productDesc}. Konsep: ${concept}`, 1);
    const script = applyPronunciation(scripts.scripts[0] || fallbackScript(productName), pronunciations);
    const imagePrompt = buildImagePrompt({
      mode: "commercial",
      productName,
      productDesc: `${productDesc}. Concept: ${concept}`,
      background,
      ratio: "9:16",
      hasModel: Boolean(modelImage),
      hasProduct: true,
      scriptText: hasModel ? script : "",
      template: recipe?.active === 1 ? recipe.prompt_template : undefined,
    });
    const still = await client.editImage({
      prompt: imagePrompt,
      images,
      aspectRatio: "9:16",
      model: begun.settings.imageModel,
    });
    const videoPrompt = buildVideoPrompt({
      mode: "commercial",
      productName,
      productDesc,
      background,
      script: hasModel ? script : "",
      hasModel: Boolean(modelImage),
      voiceId: hasModel ? voiceId : undefined,
    });
    const video = await speakingVideo(env, begun, client, {
      prompt: videoPrompt,
      image: { mime: still.mime, bytes: still.bytes },
      script: hasModel ? script : "",
      voiceId: hasModel ? voiceId : undefined,
      pronunciations,
    });
    const ticks = scripts.ticks + still.usage.costTicks + video.ticks;
    const scene = { bytes: still.bytes, mime: still.mime, filename: `adegan-${stamp()}-${begun.id.slice(0, 8)}.jpg` };
    const voice =
      video.voice && hasModel
        ? { bytes: video.voice.bytes, mime: video.voice.mime, filename: `voiceover-${stamp()}-${begun.id.slice(0, 8)}.mp3` }
        : undefined;
    const input = { productName, productDesc, concept, background, script: hasModel ? script : "", hasModel: Boolean(modelImage), voiceId, videoPrompt };
    if (video.pendingId && video.videoBytes.byteLength === 0) {
      return park(env, begun, { requestId: video.pendingId, ticks, prompt: videoPrompt, input, scene, voice });
    }
    return finish(env, begun, {
      ticks,
      prompt: `${imagePrompt}\n${videoPrompt}`,
      title: productName,
      input,
      result: { bytes: video.videoBytes, mime: "video/mp4", filename: `video-iklan-${stamp()}-${begun.id.slice(0, 8)}.mp4` },
      scene,
      voice,
    });
  });
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}
