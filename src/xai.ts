import { b64ToBytes, dataUrl } from "./bytes";
import type { AppEnv } from "./env";
import { HttpError } from "./http";
import { logEvent } from "./log";
import { TINY_JPEG, TINY_MP3, TINY_MP4 } from "./tiny";
import { fallbackScript, fitScriptWordCount, fitScripts } from "./prompts";

export const MOCK_TICKS = {
  chat: 5_000_000,
  image: 400_000_000,
  video: 11_200_000_000,
  tts: 150_000_000,
} as const;

export class XaiCallError extends Error {
  costTicks: number;
  constructor(message: string, costTicks = 0) {
    super(message);
    this.name = "XaiCallError";
    this.costTicks = costTicks;
  }
}

export interface ImageInput {
  mime: string;
  bytes: Uint8Array;
}

export interface Usage {
  costTicks: number;
}

export type JsonTask = "analyze" | "scripts" | "draft" | "caption";

export interface JsonRequest {
  task: JsonTask;
  system: string;
  user: string;
  model?: string;
  images?: ImageInput[];
  hints?: { productName?: string; scenes?: number };
}

export interface VideoRequest {
  prompt: string;
  image?: ImageInput;
  aspectRatio: string;
  duration: number;
  resolution: string;
  voiceId?: string;
  model: string;
}

export interface VideoPoll {
  done: boolean;
  requestId: string;
  bytes?: Uint8Array;
  mime?: string;
  usage: Usage;
}

const pendingVideos = new Map<string, { polls: number; prompt: string }>();

export interface XaiClient {
  completeJson(req: JsonRequest): Promise<{ json: unknown; text: string; usage: Usage }>;
  editImage(input: { prompt: string; images: ImageInput[]; aspectRatio: string; model: string }): Promise<{ bytes: Uint8Array; mime: string; usage: Usage }>;
  generateImage(input: { prompt: string; aspectRatio: string; model: string }): Promise<{ bytes: Uint8Array; mime: string; usage: Usage }>;
  generateVideo(input: VideoRequest): Promise<VideoPoll>;
  pollVideo(requestId: string): Promise<VideoPoll>;
  tts(input: { text: string; voiceId: string; replace?: Record<string, string> }): Promise<{ bytes: Uint8Array; mime: string; usage: Usage }>;
}

function mockJson(req: JsonRequest): unknown {
  const product = req.hints?.productName || "Matcha Loft";
  if (req.task === "analyze") {
    return {
      productName: "Matcha Loft",
      productDesc: "Minuman matcha berlapis di gelas bening dengan logo putih di badan gelas.",
      backgrounds: [
        "Meja kayu walnut gelap",
        "Kafe industrial bata ekspos",
        "Teras rumah sore hari",
        "Warkop lampu kuning",
        "Studio latar cokelat hangat",
        "Meja marmer gelap",
        "Jendela cahaya sore",
      ],
    };
  }
  if (req.task === "scripts") {
    const scenes = req.hints?.scenes || 1;
    return {
      scripts: fitScripts(
        [
          fallbackScript(product),
          fitScriptWordCount(`Coba deh ${product} ini pelan-pelan, soalnya rasanya tuh nempel dan bikin pengin pesan lagi besok.`),
        ],
        scenes,
        product,
      ),
    };
  }
  if (req.task === "draft") {
    const script = fallbackScript(product);
    return {
      script,
      videoPrompt: `Photorealistic vertical 9:16 cafe video. A person talks to the camera and shows ${product}. Natural handheld motion, warm window light, no on-screen text. Dialogue: ${script}`,
    };
  }
  return {
    caption: `Lagi suka banget sama ${product}. Rasanya pas buat nemenin sore, ga terlalu manis, dan gelasnya enak dipandang.\n\nCoba deh kalau lagi nyari yang seger.\n\n#matcha #minuman #jajan #sore #kekinian #fyp #kuliner #lokal #rekomendasi #enak #cafe #daily #story #viral #konten`,
  };
}

export function createMockClient(options: { fail?: boolean; defer?: boolean } = {}): XaiClient {
  const fail = () => {
    if (options.fail) throw new XaiCallError("Mock xAI gagal.", MOCK_TICKS.image);
  };
  return {
    async completeJson(req) {
      fail();
      const json = mockJson(req);
      return { json, text: JSON.stringify(json), usage: { costTicks: MOCK_TICKS.chat } };
    },
    async editImage() {
      fail();
      return { bytes: TINY_JPEG, mime: "image/jpeg", usage: { costTicks: MOCK_TICKS.image } };
    },
    async generateImage() {
      fail();
      return { bytes: TINY_JPEG, mime: "image/jpeg", usage: { costTicks: MOCK_TICKS.image } };
    },
    async generateVideo(input) {
      fail();
      const requestId = crypto.randomUUID();
      if (options.defer) {
        pendingVideos.set(requestId, { polls: 0, prompt: input.prompt });
        return { done: false, requestId, usage: { costTicks: 0 } };
      }
      return { done: true, requestId, bytes: TINY_MP4, mime: "video/mp4", usage: { costTicks: MOCK_TICKS.video } };
    },
    async pollVideo(requestId) {
      const state = pendingVideos.get(requestId);
      if (!state) {
        return { done: true, requestId, bytes: TINY_MP4, mime: "video/mp4", usage: { costTicks: MOCK_TICKS.video } };
      }
      state.polls += 1;
      if (state.polls < 2) return { done: false, requestId, usage: { costTicks: 0 } };
      pendingVideos.delete(requestId);
      return { done: true, requestId, bytes: TINY_MP4, mime: "video/mp4", usage: { costTicks: MOCK_TICKS.video } };
    },
    async tts() {
      fail();
      return { bytes: TINY_MP3, mime: "audio/mpeg", usage: { costTicks: MOCK_TICKS.tts } };
    },
  };
}

interface XaiJson {
  data?: Array<{ b64_json?: string; url?: string }>;
  usage?: { cost_in_usd_ticks?: number };
  request_id?: string;
  status?: string;
  video?: { url?: string; respect_moderation?: boolean };
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
  output?: Array<{ content?: Array<{ text?: string }> }>;
}

function ticksFrom(json: XaiJson | null, header: string | null): number {
  const fromBody = json?.usage?.cost_in_usd_ticks;
  if (typeof fromBody === "number" && Number.isFinite(fromBody)) return fromBody;
  const fromHeader = Number(header || "");
  return Number.isFinite(fromHeader) ? fromHeader : 0;
}

async function xaiFetch(env: AppEnv, path: string, init: RequestInit): Promise<{ response: Response; json: XaiJson | null; bytes: Uint8Array | null }> {
  if (!env.XAI_API_KEY) throw new XaiCallError("Kunci xAI belum dipasang di server.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${env.XAI_API_KEY}`);
  let response: Response;
  try {
    response = await fetch(`https://api.x.ai/v1${path}`, { ...init, headers });
  } catch (error) {
    logEvent("xai_network", { path, message: error instanceof Error ? error.message : "network" });
    throw new XaiCallError("Tidak tersambung ke xAI.");
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json") || contentType.includes("text/")) {
    const json = (await response.json().catch(() => null)) as XaiJson | null;
    if (!response.ok) {
      const message = json?.error?.message || `xAI menolak permintaan (${response.status}).`;
      logEvent("xai_error", { path, status: response.status, message: message.slice(0, 300) });
      throw new XaiCallError(message, ticksFrom(json, response.headers.get("x-cost-in-usd-ticks")));
    }
    return { response, json, bytes: null };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) throw new XaiCallError(`xAI menolak permintaan (${response.status}).`);
  return { response, json: null, bytes };
}

async function imageBytesFrom(env: AppEnv, json: XaiJson): Promise<Uint8Array> {
  const first = json.data?.[0];
  if (first?.b64_json) {
    const bin = atob(first.b64_json);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (first?.url) {
    const downloaded = await fetch(first.url);
    if (!downloaded.ok) throw new XaiCallError("Gambar dari xAI tidak bisa diunduh.");
    return new Uint8Array(await downloaded.arrayBuffer());
  }
  logEvent("xai_empty_image", { hasKey: Boolean(env.XAI_API_KEY) });
  throw new XaiCallError("xAI tidak mengembalikan gambar.", ticksFrom(json, null));
}

function estimateTtsTicks(text: string): number {
  return Math.round((text.length / 1_000_000) * 15 * 10_000_000_000);
}

export function createRealClient(env: AppEnv): XaiClient {
  return {
    async completeJson(req) {
      const content: Array<Record<string, unknown>> = [{ type: "text", text: req.user }];
      for (const image of (req.images || []).slice(0, 5)) {
        content.push({ type: "image_url", image_url: { url: dataUrl(image.mime, image.bytes) } });
      }
      const { response, json } = await xaiFetch(env, "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: req.model || "grok-4.3",
          messages: [
            { role: "system", content: req.system },
            { role: "user", content },
          ],
          response_format: { type: "json_object" },
        }),
      });
      const text = json?.choices?.[0]?.message?.content || "";
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
      return { json: parsed, text, usage: { costTicks: ticksFrom(json, response.headers.get("x-cost-in-usd-ticks")) } };
    },
    async editImage(input) {
      if (input.images.length > 5) throw new XaiCallError("Maksimal 5 foto referensi.");
      const { response, json } = await xaiFetch(env, "/images/edits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          prompt: input.prompt,
          images: input.images.map((image) => ({ type: "image_url", url: dataUrl(image.mime, image.bytes) })),
          aspect_ratio: input.aspectRatio,
          response_format: "b64_json",
          n: 1,
        }),
      });
      if (!json) throw new XaiCallError("Balasan gambar kosong.");
      return {
        bytes: await imageBytesFrom(env, json),
        mime: "image/jpeg",
        usage: { costTicks: ticksFrom(json, response.headers.get("x-cost-in-usd-ticks")) },
      };
    },
    async generateImage(input) {
      const { response, json } = await xaiFetch(env, "/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          prompt: input.prompt,
          aspect_ratio: input.aspectRatio,
          response_format: "b64_json",
          n: 1,
        }),
      });
      if (!json) throw new XaiCallError("Balasan gambar kosong.");
      return {
        bytes: await imageBytesFrom(env, json),
        mime: "image/jpeg",
        usage: { costTicks: ticksFrom(json, response.headers.get("x-cost-in-usd-ticks")) },
      };
    },
    async generateVideo(input) {
      const body: Record<string, unknown> = {
        model: input.model,
        prompt: input.prompt,
        duration: input.duration,
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
      };
      if (input.image) body.image = { url: dataUrl(input.image.mime, input.image.bytes) };
      if (input.voiceId) body.reference_audios = [{ voice_id: input.voiceId }];
      const { json } = await xaiFetch(env, "/videos/generations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const requestId = json?.request_id;
      if (!requestId) throw new XaiCallError("xAI tidak memberi id video.");
      return pollReal(env, requestId, 6);
    },
    pollVideo(requestId: string) {
      return pollReal(env, requestId, 1);
    },
    async tts(input) {
      const { response, json, bytes } = await xaiFetch(env, "/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: input.text,
          voice_id: input.voiceId,
          language: "id",
          replace: input.replace || {},
          text_normalization: true,
          output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 128000 },
        }),
      });
      const headerTicks = response.headers.get("x-cost-in-usd-ticks");
      const costTicks = json ? ticksFrom(json, headerTicks) : Number(headerTicks || "") || estimateTtsTicks(input.text);
      const audioField = json && typeof (json as { audio?: unknown }).audio === "string" ? (json as { audio: string }).audio : "";
      const audioBytes = bytes && bytes.byteLength ? bytes : audioField ? b64ToBytes(audioField) : new Uint8Array();
      return { bytes: audioBytes, mime: "audio/mpeg", usage: { costTicks } };
    },
  };
}

async function pollReal(env: AppEnv, requestId: string, attempts: number): Promise<VideoPoll> {
  let lastTicks = 0;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    const { response, json } = await xaiFetch(env, `/videos/${requestId}`, { method: "GET" });
    lastTicks = ticksFrom(json, response.headers.get("x-cost-in-usd-ticks"));
    if (json?.status === "failed") {
      throw new XaiCallError(json.error?.message || "Video gagal dibuat.", lastTicks);
    }
    if (json?.status === "done") {
      if (json.video?.respect_moderation === false) throw new XaiCallError("Video ditolak moderasi.", lastTicks);
      const url = json.video?.url;
      if (!url) throw new XaiCallError("Video selesai tapi file-nya kosong.", lastTicks);
      const downloaded = await fetch(url);
      if (!downloaded.ok) throw new XaiCallError("File video tidak bisa diunduh.", lastTicks);
      return {
        done: true,
        requestId,
        bytes: new Uint8Array(await downloaded.arrayBuffer()),
        mime: "video/mp4",
        usage: { costTicks: lastTicks },
      };
    }
  }
  return { done: false, requestId, usage: { costTicks: lastTicks } };
}

export function createXaiClient(env: AppEnv, options: { fail?: boolean; defer?: boolean } = {}): XaiClient {
  if (env.XAI_MOCK === "1") return createMockClient(options);
  if (options.fail || options.defer) {
    throw new HttpError(400, "Mode uji tidak aktif.", "mock_off");
  }
  return createRealClient(env);
}
