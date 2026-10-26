export const DEFAULT_SETTINGS: Record<string, string> = {
  price_multiplier: "3",
  usd_to_idr: "16000",
  price_foto_produk: "5000",
  price_video_bebas: "57000",
  price_video_affiliate: "61000",
  price_video_commercial: "61000",
  price_caption: "0",
  price_analyze: "0",
  price_draft: "0",
  daily_spend_cap_usd: "200",
  alert_usd_1: "50",
  alert_usd_2: "100",
  kill_switch: "0",
  signup_enabled: "0",
  video_duration_seconds: "8",
  video_resolution: "720p",
  image_model: "grok-imagine-image-quality",
  text_model: "grok-4.3",
  recipes_seeded: "0",
};

export const IMAGE_MODELS = ["grok-imagine-image", "grok-imagine-image-2.0", "grok-imagine-image-quality"] as const;
export const TEXT_MODELS = ["grok-4.3", "grok-4", "grok-3"] as const;
export const VIDEO_MODEL = "grok-imagine-video-1.5";
export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;

export type Feature =
  | "foto_produk"
  | "video_bebas"
  | "video_affiliate"
  | "video_commercial"
  | "caption"
  | "analyze"
  | "draft";

export const FEATURE_LABEL: Record<Feature, string> = {
  foto_produk: "Foto produk",
  video_bebas: "Video bebas",
  video_affiliate: "Video affiliate",
  video_commercial: "Video iklan",
  caption: "Caption",
  analyze: "Analisis produk",
  draft: "Draf naskah",
};

export const FEATURE_PRICE_KEY: Record<Feature, string> = {
  foto_produk: "price_foto_produk",
  video_bebas: "price_video_bebas",
  video_affiliate: "price_video_affiliate",
  video_commercial: "price_video_commercial",
  caption: "price_caption",
  analyze: "price_analyze",
  draft: "price_draft",
};

/** Rough xAI USD estimate used to stop a job that would cross the daily cap. */
export const FEATURE_ESTIMATE_USD: Record<Feature, number> = {
  foto_produk: 0.08,
  video_bebas: 1.4,
  video_affiliate: 1.4,
  video_commercial: 1.4,
  caption: 0.01,
  analyze: 0.02,
  draft: 0.01,
};

export interface AppSettings {
  priceMultiplier: number;
  usdToIdr: number;
  prices: Record<Feature, number>;
  dailySpendCapUsd: number;
  alertUsd1: number;
  alertUsd2: number;
  killSwitch: boolean;
  signupEnabled: boolean;
  videoDurationSeconds: number;
  videoResolution: string;
  imageModel: string;
  textModel: string;
  recipesSeeded: boolean;
}

export function parseSettings(map: Record<string, string>): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...map };
  const num = (key: string, fallback: number) => {
    const value = Number(merged[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  const prices = {} as Record<Feature, number>;
  for (const feature of Object.keys(FEATURE_PRICE_KEY) as Feature[]) {
    prices[feature] = Math.max(0, Math.round(num(FEATURE_PRICE_KEY[feature], Number(DEFAULT_SETTINGS[FEATURE_PRICE_KEY[feature]]))));
  }
  const imageModel = IMAGE_MODELS.includes(merged.image_model as (typeof IMAGE_MODELS)[number])
    ? merged.image_model
    : DEFAULT_SETTINGS.image_model;
  const textModel = TEXT_MODELS.includes(merged.text_model as (typeof TEXT_MODELS)[number])
    ? merged.text_model
    : DEFAULT_SETTINGS.text_model;
  const resolution = RESOLUTIONS.includes(merged.video_resolution as (typeof RESOLUTIONS)[number])
    ? merged.video_resolution
    : "720p";
  return {
    priceMultiplier: Math.min(20, Math.max(1, num("price_multiplier", 3))),
    usdToIdr: Math.min(100000, Math.max(1000, Math.round(num("usd_to_idr", 16000)))),
    prices,
    dailySpendCapUsd: Math.min(10000, Math.max(0, num("daily_spend_cap_usd", 200))),
    alertUsd1: Math.max(0, num("alert_usd_1", 50)),
    alertUsd2: Math.max(0, num("alert_usd_2", 100)),
    killSwitch: merged.kill_switch === "1",
    signupEnabled: merged.signup_enabled === "1",
    videoDurationSeconds: Math.min(10, Math.max(5, Math.round(num("video_duration_seconds", 8)))),
    videoResolution: resolution,
    imageModel,
    textModel,
    recipesSeeded: merged.recipes_seeded === "1",
  };
}

export const EDITABLE_SETTING_KEYS = [
  "price_multiplier",
  "usd_to_idr",
  "price_foto_produk",
  "price_video_bebas",
  "price_video_affiliate",
  "price_video_commercial",
  "price_caption",
  "price_analyze",
  "price_draft",
  "daily_spend_cap_usd",
  "alert_usd_1",
  "alert_usd_2",
  "kill_switch",
  "signup_enabled",
  "video_duration_seconds",
  "video_resolution",
  "image_model",
  "text_model",
] as const;
