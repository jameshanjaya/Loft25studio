import { nowIso } from "./bytes";
import { COMMERCIAL_SPOTLIGHT_TEMPLATE, type StudioMode } from "./prompts";

export interface RecipeRow {
  id: string;
  slug: string;
  name: string;
  feature: string;
  mode: string;
  description: string;
  prompt_template: string;
  config_json: string;
  sort_order: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeConfig {
  ugcStyle?: "Handheld" | "Tripod" | "Vlog";
  hasModel?: boolean;
  aspectRatio?: string;
}

export function parseRecipeConfig(raw: string): RecipeConfig {
  try {
    const value = JSON.parse(raw) as RecipeConfig;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

interface SeedRecipe {
  slug: string;
  name: string;
  feature: string;
  mode: StudioMode;
  description: string;
  prompt_template: string;
  config: RecipeConfig;
  sort_order: number;
}

export const SEED_RECIPES: SeedRecipe[] = [
  {
    slug: "katalog-spotlight",
    name: "Katalog spotlight (tanpa orang)",
    feature: "foto_produk",
    mode: "commercial",
    description: "Foto produk kayak katalog mahal. Lampu sorot tajam, bayangan dalam, tanpa orang. Logo barang tetap.",
    prompt_template: COMMERCIAL_SPOTLIGHT_TEMPLATE,
    config: { hasModel: false, aspectRatio: "9:16" },
    sort_order: 10,
  },
  {
    slug: "katalog-dengan-model",
    name: "Katalog dengan model",
    feature: "foto_produk",
    mode: "commercial",
    description: "Model rapi nunjukin produk. Lampu sorot, latar bersih, tetap tajam.",
    prompt_template: "",
    config: { hasModel: true, aspectRatio: "9:16" },
    sort_order: 20,
  },
  {
    slug: "ugc-handheld",
    name: "Pegang HP",
    feature: "foto_produk",
    mode: "affiliate",
    description: "Selfie handheld, cahaya keras, kayak konten sendiri di TikTok.",
    prompt_template: "",
    config: { ugcStyle: "Handheld", hasModel: true, aspectRatio: "9:16" },
    sort_order: 30,
  },
  {
    slug: "ugc-tripod",
    name: "Tripod diam",
    feature: "foto_produk",
    mode: "affiliate",
    description: "HP di tripod, gambar tidak goyang, tetap terasa mentah.",
    prompt_template: "",
    config: { ugcStyle: "Tripod", hasModel: true, aspectRatio: "9:16" },
    sort_order: 40,
  },
  {
    slug: "ugc-vlog",
    name: "Vlog jalan",
    feature: "foto_produk",
    mode: "affiliate",
    description: "Kamera depan, kesan vlog jalan, cahaya matahari keras.",
    prompt_template: "",
    config: { ugcStyle: "Vlog", hasModel: true, aspectRatio: "9:16" },
    sort_order: 50,
  },
  {
    slug: "mirror-selfie",
    name: "Mirror selfie",
    feature: "foto_produk",
    mode: "mirror",
    description: "Foto kaca, gaya mau keluar. Produk kelihatan di cermin.",
    prompt_template: "",
    config: { hasModel: true, aspectRatio: "9:16" },
    sort_order: 60,
  },
  {
    slug: "pov-tangan",
    name: "POV tangan",
    feature: "foto_produk",
    mode: "pov",
    description: "Cuma tangan dan produk, dari atas. Tanpa wajah.",
    prompt_template: "",
    config: { hasModel: false, aspectRatio: "9:16" },
    sort_order: 70,
  },
];

export async function seedRecipes(db: D1Database): Promise<void> {
  const now = nowIso();
  const statements = SEED_RECIPES.map((recipe) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO recipes
        (id, slug, name, feature, mode, description, prompt_template, config_json, sort_order, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        recipe.slug,
        recipe.slug,
        recipe.name,
        recipe.feature,
        recipe.mode,
        recipe.description,
        recipe.prompt_template,
        JSON.stringify(recipe.config),
        recipe.sort_order,
        now,
        now,
      ),
  );
  if (statements.length) await db.batch(statements);
}

export function styleToRecipeSlug(style: string): string {
  if (style === "Tripod") return "ugc-tripod";
  if (style === "Vlog") return "ugc-vlog";
  return "ugc-handheld";
}
