export const IDENTITY_LOCK =
  "CRITICAL IDENTITY LOCK: The person MUST have the EXACT same face, gender, facial structure, hair style (e.g., if hair is down it stays down, if tied it stays tied), skin tone, and body proportions as the base model reference. This is the exact same person. Do NOT change their gender, identity, or ethnicity. Clone their physical appearance perfectly.";

export const SAFETY_SUFFIX =
  "Do not depict celebrities or public figures. No on-screen subtitles, captions, watermarks, or UI. Photorealistic live-action photograph or video.";

export type StudioMode = "ugc" | "affiliate" | "commercial" | "mirror" | "pov";
export type UgcStyle = "Handheld" | "Tripod" | "Vlog";

export const MODE_BACKGROUNDS: Record<StudioMode, string[]> = {
  ugc: [
    "Kamar Kosan Aesthetic (Lampu Warm White)",
    "Warkop Kekinian (Lampu Kuning Hangat)",
    "Teras Depan Rumah Cluster",
    "Kafe Aesthetic (Sore Hari)",
    "Lorong Minimarket",
    "Kabin Mobil Siang Hari",
  ],
  affiliate: [
    "Kamar Kosan Aesthetic (Lampu Warm White)",
    "Warkop Kekinian (Lampu Kuning Hangat)",
    "Teras Depan Rumah Cluster",
    "Kafe Aesthetic (Sore Hari)",
    "Lorong Minimarket",
    "Kabin Mobil Siang Hari",
  ],
  commercial: [
    "Meja kayu walnut gelap dengan latar cokelat hangat",
    "Studio Setup Polos (Latar Putih Bersih)",
    "Meja Marmer Elegan (Lampu Studio Cerah)",
    "Latar Pastel Estetik Minimalis",
    "Podium Display Produk Mewah",
    "Set Ruang Tamu Skandinavia Modern",
  ],
  mirror: [
    "Kamar Estetik (Cermin Full Body)",
    "Kamar Mandi Mewah (Cermin Wastafel)",
    "Fitting Room Mall (Cahaya Terang)",
    "Lift Aesthetic (Cermin Full)",
    "Studio Minimalis (Cermin Bulat Besar)",
  ],
  pov: [
    "Meja Kerja Kayu Jati (Suasana Kantor)",
    "Kasur Sprei Motif Lokal (Unboxing Paket)",
    "Di Atas Jok Motor Matic (Jalanan Komplek)",
    "Di Balik Setir Mobil (Background Jalanan)",
    "Meja Kafe Estetik (Dekat Jendela)",
  ],
};

export const TESTED_COMMERCIAL_NEGATIVE =
  "Human, person, face, hands, body, amateur, smartphone photo, messy background, low quality, flat lighting, softbox, grainy, blurry, casual everyday lighting, distorted, text, watermark, words, letters, typography, signature, subtitles, captions, text overlays, UI elements, illustration, painting, cartoon, anime, 3d render, CGI, unreal engine, deformed, soft ambient light, lack of shadows, AI generated look, synthetic, plastic look, overly smooth, midjourney style, washed out, altered logo, different cup";

export const COMMERCIAL_SPOTLIGHT_TEMPLATE =
  "[CRITICAL] REFERENCE IMAGES: Image 1 = Product Reference (The EXACT Product). HIGH-END COMMERCIAL PHOTOGRAPHY TASK: Premium catalog aesthetic, razor-sharp details. Single harsh spotlight creating dramatic, deep shadows and striking 3D dimensionality. ABSOLUTELY NO TEXT OR WATERMARKS. Professional high-end commercial product photography. Shot on Hasselblad medium format. Single harsh directional spotlight, deep striking shadows, crisp sharp details, highly polished catalog aesthetic, 8k resolution. AWARD-WINNING COMMERCIAL PRODUCT SHOT. Masterpiece standalone product photography of {{productName}} ({{productDesc}}). The product is heroically displayed as the main focus with distinct shadows for 3D dimensionality, high contrast, and hyper-realistic textures. Keep the exact product from Image 1, including its real printed logo and packaging shape. NO HUMAN, NO HANDS. ENVIRONMENT: {{background}}. MANDATORY: Must look like a real, actual photograph. Ultra-detailed, lifelike. NOT AI GENERATED. Include natural photographic imperfections and high-contrast depth. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE (the product logo is part of the product and must stay). NEGATIVE: {{negative}} Technical: {{ratio}} format.";

export interface ModeLogic {
  subjectPrompt: string;
  negPrompt: string;
  cameraLogic: string;
  motionCamera: string;
  lipSyncLogic: string;
}

export function getModeLogic(
  modeId: StudioMode,
  _index: number,
  productName: string,
  productDesc: string,
  _background: string,
  ugcStyle: UgcStyle = "Handheld",
  hasModel = true,
): ModeLogic {
  let subjectPrompt = "";
  let negPrompt = "";
  let cameraLogic = "";
  let motionCamera = "";
  let lipSyncLogic = "AMBIENT: Mouth closed or natural breathing, no talking.";

  switch (modeId) {
    case "ugc":
    case "affiliate": {
      if (ugcStyle === "Vlog") {
        cameraLogic =
          "Shot on iPhone 15 Pro Max front camera. Raw unedited vlog style. Wide angle lens, harsh directional sunlight or strong room light. Zero post-processing.";
        motionCamera = "Smooth handheld tracking shot, natural forward movement. Model walking and talking.";
      } else if (ugcStyle === "Tripod") {
        cameraLogic =
          "Shot on iPhone 15 Pro Max mounted on a simple tripod. Raw unedited smartphone photo, single harsh directional light source creating distinct shadows, authentic everyday creator setup.";
        motionCamera = "Perfectly static camera on a tripod, no movement.";
      } else {
        cameraLogic =
          "HANDHELD SELFIE STYLE. Shot on iPhone 15 Pro Max front camera. Candid framing, hard flash or harsh direct sunlight, authentic raw social media snapshot.";
        motionCamera = "Slight natural handheld camera shake.";
      }
      subjectPrompt = `RAW AUTHENTIC UGC PHOTO (${cameraLogic.split(".")[0]}). Model facing camera naturally. Candid mid-sentence expression. Model casually interacting with ${productName} (${productDesc}) in an everyday setting. CRITICAL: Extremely realistic human skin texture, visible pores, subtle blemishes, unedited natural look. Single harsh light casting distinct, realistic shadows for 3D depth. Real-world lived-in background, no studio setup.`;
      negPrompt =
        "studio lighting, softbox, flat lighting, professional photography, DSLR, perfect smooth plastic skin, beauty filter, airbrushed, over-polished, cinematic lighting, 3d render, illustration.";
      lipSyncLogic = "LIP-SYNC: Model is speaking, mouth moving precisely to dialogue: '[SCRIPT_SCENE_TERSEBUT]'.";
      break;
    }
    case "commercial": {
      cameraLogic =
        "Professional high-end commercial product photography. Shot on Hasselblad medium format. Single harsh directional spotlight, deep striking shadows, crisp sharp details, highly polished catalog aesthetic, 8k resolution.";
      if (hasModel) {
        subjectPrompt = `AWARD-WINNING COMMERCIAL SHOT. Masterpiece photography. Model looking pristine and perfectly styled, elegantly presenting ${productName} (${productDesc}). The product is heroically displayed with distinct shadows for 3D dimensionality, high contrast, and hyper-realistic textures. Clean, aesthetic background.`;
        negPrompt =
          "Amateur, smartphone photo, messy background, low quality, flat lighting, softbox, grainy, blurry, casual everyday lighting, distorted, bad anatomy, ugly, candid, snapshot, text, watermark.";
        lipSyncLogic = "LIP-SYNC: Professional commercial delivery, smiling while speaking dialogue: '[SCRIPT_SCENE_TERSEBUT]'.";
      } else {
        subjectPrompt = `AWARD-WINNING COMMERCIAL PRODUCT SHOT. Masterpiece standalone product photography of ${productName} (${productDesc}). The product is heroically displayed as the main focus with distinct shadows for 3D dimensionality, high contrast, and hyper-realistic textures. NO HUMAN, NO HANDS. Clean, aesthetic background.`;
        negPrompt =
          "Human, person, face, hands, body, amateur, smartphone photo, messy background, low quality, flat lighting, softbox, grainy, blurry, casual everyday lighting, distorted, text, watermark.";
        lipSyncLogic = "AMBIENT: Pure product focus, no talking.";
      }
      motionCamera = "Smooth cinematic slider movement, slow motion, showcasing the product elegantly.";
      break;
    }
    case "mirror": {
      cameraLogic =
        "Authentic mirror selfie. Shot on iPhone 15 Pro. Harsh directional room light or hard flash creating deep shadows, photorealistic.";
      subjectPrompt = `RAW MIRROR SELFIE PHOTO. Model standing in front of a mirror taking a mirror selfie with a smartphone. Model is stylishly showcasing ${productName} (${productDesc}). Trendy OOTD aesthetic. Real skin texture, unedited look. Single harsh light creating bold 3D dimensionality. Mirror reflection visible.`;
      negPrompt =
        "Flat lighting, soft ambient light, TV commercial look, amateur, basic white background, 3d render, illustration, not a mirror selfie, missing phone.";
      motionCamera = "Slight natural handheld camera shake, mimicking a mirror selfie recording.";
      lipSyncLogic = "AMBIENT: Casual posing in the mirror, natural breathing, no talking.";
      break;
    }
    case "pov": {
      cameraLogic =
        "Authentic everyday first-person POV, shot on an iPhone 15, looking down, harsh directional lighting casting distinct hand shadows, photorealistic.";
      subjectPrompt = `RAW FIRST-PERSON POV SHOT. Authentic everyday lifestyle. Only hands visible naturally holding or unboxing ${productName} (${productDesc}). Shot from user's eye-level looking down at hands. Single harsh directional light, distinct hard shadows. NO FACES, NO BODIES. Real skin texture, highly detailed macro focus on product. ABSOLUTELY NO TEXT OR UI.`;
      negPrompt =
        "Face, head, hair, eyes, mouth, neck, torso, legs, feet, full body, flat lighting, over-rendered, artificial studio lighting, highly polished professional shot, 3D render, illustration, painting, text, typography, watermark, UI.";
      motionCamera =
        "Authentic first-person POV, slight natural smartphone camera shake, looking down. Pair of hands naturally interacting with the product.";
      break;
    }
    default: {
      cameraLogic = "Standard high quality camera setup.";
      subjectPrompt = `High quality photorealistic shot of model with ${productName} (${productDesc}).`;
      negPrompt = "Distorted, blurry, illustration, 3d.";
      motionCamera = "Static.";
    }
  }

  return { subjectPrompt, negPrompt, cameraLogic, motionCamera, lipSyncLogic };
}

export function isForbiddenNegativeToken(token: string): boolean {
  const t = token
    .trim()
    .toLowerCase()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  if (!t) return false;
  if (t === "brand name" || t === "brand names" || t === "brandname") return true;
  if (/\blogos?\b/.test(t)) {
    if (/\b(alter|altered|change|changed|different|wrong|modified|modify|ubah|berubah)\b/.test(t)) return false;
    return true;
  }
  return false;
}

export function sanitizeNegativeList(list: string): string {
  return list
    .split(",")
    .map((part) => part.trim().replace(/^[.\s]+|[.\s]+$/g, ""))
    .filter((part) => part && !isForbiddenNegativeToken(part))
    .join(", ");
}

export function globalNegative(mode: StudioMode): string {
  let neg =
    "wrong gender, opposite sex, different person, wrong hair style, different clothing, altered outfit, missing clothes, wrong hands, mismatched hands, text, words, letters, typography, watermark, signature, subtitles, captions, text overlays, UI elements, illustration, painting, cartoon, anime, 3d render, CGI, unreal engine, deformed, bad anatomy, distorted, different face, morphed body, flat lighting, soft ambient light, lack of shadows, AI generated look, synthetic, plastic, generic AI face, overly smooth, midjourney style, washed out";
  if (mode === "ugc" || mode === "affiliate" || mode === "pov" || mode === "mirror") {
    neg += ", flawless perfect lighting, professional photography, softbox, studio flash, plastic skin";
  }
  return sanitizeNegativeList(neg);
}

export function negativeFor(mode: StudioMode, hasModel: boolean): string {
  if (mode === "commercial" && !hasModel) return sanitizeNegativeList(TESTED_COMMERCIAL_NEGATIVE);
  const logic = getModeLogic(mode, 0, "produk", "produk", "latar", "Handheld", hasModel && mode !== "pov");
  return sanitizeNegativeList(
    `${logic.negPrompt}, ${globalNegative(mode)}, different face, altered identity, unrecognizable person, random face`,
  );
}

export function sanitizePromptNegatives(prompt: string): string {
  return prompt.replace(/NEGATIVE:\s*([\s\S]*?)(?=Technical:|$)/gi, (_match, list: string) => {
    return `NEGATIVE: ${sanitizeNegativeList(list)} `;
  });
}

export function realismBlock(mode: StudioMode): { rolePrefix: string; styling: string; realismLaws: string } {
  if (mode === "ugc" || mode === "affiliate" || mode === "pov" || mode === "mirror") {
    return {
      rolePrefix: "RAW SMARTPHONE PHOTO TASK:",
      styling:
        "Authentic raw aesthetic. Single harsh directional light (like direct sunlight or hard smartphone flash) casting distinct, hard shadows for realistic depth. Shot on iPhone. ABSOLUTELY NO TEXT OR WATERMARKS.",
      realismLaws:
        "AUTHENTIC UGC REALISM: Must look EXACTLY like an unedited iPhone photo posted directly to social media. ZERO AI VIBE. CRITICAL: Highly detailed real human skin texture, visible pores, natural imperfections, distinct harsh lighting contrast. NO soft studio lights, NO beauty filters. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.",
    };
  }
  if (mode === "commercial") {
    return {
      rolePrefix: "HIGH-END COMMERCIAL PHOTOGRAPHY TASK:",
      styling:
        "Premium catalog aesthetic, razor-sharp details. Single harsh spotlight creating dramatic, deep shadows and striking 3D dimensionality. ABSOLUTELY NO TEXT OR WATERMARKS.",
      realismLaws:
        "MANDATORY: Must look like a real, actual photograph. Ultra-detailed, lifelike. NOT AI GENERATED. Include natural photographic imperfections and high-contrast depth. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.",
    };
  }
  return {
    rolePrefix: "PHOTOGRAPHY MASTERCLASS TASK:",
    styling:
      "Hyper-realistic color processing. Single harsh directional light source creating deep, hard shadows and bold 3D dimensionality. ABSOLUTELY NO TEXT OR WATERMARKS.",
    realismLaws:
      "MANDATORY: Must look like a real, actual photograph. Ultra-detailed, lifelike. NOT AI GENERATED. Include natural photographic imperfections and high-contrast depth. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.",
  };
}

export interface ReferencePlan {
  header: string;
  identityLock: string;
  imageOrder: Array<"model" | "product">;
}

export function referencePlan(hasModel: boolean, hasProduct: boolean, mode: StudioMode, isBRoll = false): ReferencePlan {
  const modelActive = hasModel && mode !== "pov";
  const parts: string[] = [];
  const imageOrder: Array<"model" | "product"> = [];
  let n = 1;
  if (modelActive) {
    imageOrder.push("model");
    if (isBRoll) {
      parts.push(
        `Image ${n} = Base Model (Use ONLY for matching exact gender, skin tone, and vibe for the hands holding the product. NO FACES IN FINAL IMAGE).`,
      );
    } else {
      parts.push(`Image ${n} = Base Model (CRITICAL: Clone this exact face, gender, hair style, and body).`);
    }
    n += 1;
  }
  if (hasProduct) {
    imageOrder.push("product");
    parts.push(`Image ${n} = Product Reference (The EXACT Product).`);
  }
  const header = parts.length ? `[CRITICAL] REFERENCE IMAGES: ${parts.join(" ")} ` : "";
  const identityLock = modelActive && !isBRoll ? IDENTITY_LOCK : "";
  return { header, identityLock, imageOrder };
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

export interface ImagePromptInput {
  mode: StudioMode;
  productName: string;
  productDesc: string;
  background: string;
  ratio: string;
  ugcStyle?: UgcStyle;
  hasModel: boolean;
  hasProduct: boolean;
  scriptText?: string;
  sceneIndex?: number;
  sceneCount?: number;
  isBRoll?: boolean;
  customPrompt?: string;
  template?: string;
}

export function buildImagePrompt(input: ImagePromptInput): string {
  const mode = input.mode;
  const ugcStyle = input.ugcStyle || "Handheld";
  const sceneIndex = input.sceneIndex ?? 0;
  const sceneCount = input.sceneCount ?? 1;
  const isBRoll = input.isBRoll ?? ((sceneIndex % 3 === 2) && sceneIndex !== sceneCount - 1 && sceneCount > 1);
  const hasModel = input.hasModel && mode !== "pov";
  const productName = input.productName || "Produk";
  const productDesc = input.productDesc || "produk seperti di foto referensi";
  const background = input.background || MODE_BACKGROUNDS[mode][0];
  const ratio = input.ratio || "9:16";
  const refs = referencePlan(input.hasModel, input.hasProduct, mode, isBRoll);
  const negative = negativeFor(mode, hasModel);
  const realism = realismBlock(mode);

  if (input.template?.trim()) {
    const filled = fillTemplate(input.template, {
      productName,
      productDesc,
      background,
      ratio,
      negative,
      identityLock: refs.identityLock,
      realism: realism.realismLaws,
      script: input.scriptText || "",
    });
    const withNeg = filled.includes("NEGATIVE:") ? filled : `${filled} NEGATIVE: ${negative}`;
    return sanitizePromptNegatives(withNeg).replace(/\s+/g, " ").trim();
  }

  if (input.customPrompt?.trim()) {
    const custom = `${refs.header}${input.customPrompt.trim()} ENVIRONMENT: ${background}. ${realism.realismLaws} ${refs.identityLock} NEGATIVE: ${negative} Technical: ${ratio} format.`;
    return sanitizePromptNegatives(custom).replace(/\s+/g, " ").trim();
  }

  const logic = getModeLogic(mode, sceneIndex, productName, productDesc, background, ugcStyle, hasModel);
  let subject = logic.subjectPrompt;
  let neg = logic.negPrompt;
  if (isBRoll) {
    if (mode === "ugc" || mode === "affiliate") {
      subject = `RAW LIFESTYLE B-ROLL PHOTO. Casual close-up of ${productName} (${productDesc}) held casually by hands. Shot on iPhone 15 Pro Max. Background: ${background}. Single harsh directional light creating strong distinct shadows. CRITICAL: Match the exact gender, skin tone, and characteristics of the Base Model reference for the hands. Real human skin texture, visible pores. NO FACES, NO BODIES. Unedited, raw, candid.`;
      neg =
        "Human face, eyes, mouth, floating product, opposite gender hands, mismatched hands, masculine hands on female, overly stylized studio lighting, flat lighting, artificial look, 3d render, DSLR, softbox, professional macro, smooth plastic skin.";
    } else if (mode === "commercial") {
      subject = `PREMIUM STUDIO B-ROLL. Masterpiece macro close-up of ${productName} (${productDesc}). Focus on premium texture and material details. Background: ${background}. Dramatic commercial lighting with a single harsh spotlight, distinct shadows, elegant reflections, 8k resolution. NO HUMAN FACES.`;
      neg = "Human face, eyes, mouth, messy background, low quality, flat lighting, grainy, amateur, everyday lighting, blurry.";
    } else if (mode === "mirror") {
      subject = `RAW MIRROR SELFIE B-ROLL. Close-up of ${productName} (${productDesc}) reflected in a mirror. Held casually. Background: ${background}. Harsh directional room light creating distinct shadows, highly detailed textures. NO FACES.`;
      neg = "Human face, flat lighting, lack of shadows, overexposed, clean commercial look, 3d render.";
    }
  }

  const scriptBit = input.scriptText?.trim() ? `${input.scriptText.trim()}. ` : "";
  const prompt = `${refs.header}${realism.rolePrefix} Scene ${sceneIndex + 1}. ${scriptBit}${realism.styling} ${logic.cameraLogic}. ${subject} ENVIRONMENT: ${background}. ${realism.realismLaws} ${refs.identityLock} NEGATIVE: ${sanitizeNegativeList(`${neg}, ${globalNegative(mode)}`)} Technical: ${ratio} format.`;
  return sanitizePromptNegatives(prompt).replace(/\s+/g, " ").trim();
}

export function videoContext(input: {
  mode: StudioMode;
  script: string;
  hasModel: boolean;
  isBRoll?: boolean;
}): string {
  const speaking = input.hasModel && input.mode !== "pov" && !input.isBRoll;
  if (speaking) {
    if (input.mode === "commercial") {
      return `LIP-SYNC: Professional commercial delivery, smiling while speaking dialogue: '${input.script}'.`;
    }
    return `LIP-SYNC: Model is speaking, mouth moving precisely to dialogue: '${input.script}'.`;
  }
  if (input.isBRoll) return "AMBIENT: No human visible, purely product focused.";
  if (input.mode === "commercial" && !input.hasModel) return "AMBIENT: Pure product focus, no talking.";
  if (input.mode === "mirror") return "AMBIENT: Casual posing in the mirror, natural breathing, no talking.";
  return "AMBIENT: Mouth closed or natural breathing, no talking.";
}

export function buildVideoPrompt(input: {
  mode: StudioMode;
  productName: string;
  productDesc: string;
  background: string;
  script: string;
  ugcStyle?: UgcStyle;
  hasModel: boolean;
  isBRoll?: boolean;
  voiceId?: string;
}): string {
  const logic = getModeLogic(
    input.mode,
    0,
    input.productName,
    input.productDesc,
    input.background,
    input.ugcStyle || "Handheld",
    input.hasModel && input.mode !== "pov",
  );
  const context = videoContext(input);
  const voice = input.voiceId ? ` VOICE PRESET: ${input.voiceId}.` : "";
  return `PROMPT: ${logic.motionCamera} CAMERA: ${logic.cameraLogic} DETAILS: Photorealistic high-fidelity video generation. Maintain strict consistency with the provided image reference. CONTEXT: ${context} ENVIRONMENT: ${input.background}.${voice} ${SAFETY_SUFFIX} NEGATIVE: distortion, morphing, bad hands, text overlays.`;
}

export function finalizeFreeVideoPrompt(userPrompt: string, script: string, voiceId: string): string {
  let prompt = userPrompt.trim();
  if (script && !prompt.includes(script)) {
    prompt += ` LIP-SYNC: The person speaks this exact Bahasa Indonesia line with natural mouth movement: '${script}'.`;
  }
  prompt += ` VOICE PRESET: ${voiceId}. ${SAFETY_SUFFIX}`;
  return prompt.replace(/\s+/g, " ").trim();
}

const PAD_WORDS = ["ya", "sih", "kok", "deh", "dong", "nih", "tuh", "kan"];

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function fitScriptWordCount(text: string): string {
  let words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) {
    words =
      "Aku lagi coba produk ini dan jujur rasanya enak banget buat sehari-hari jadi pengin cerita ke teman yang cari yang simpel".split(
        " ",
      );
  }
  let pad = 0;
  while (words.length < 18) {
    words.push(PAD_WORDS[pad % PAD_WORDS.length]);
    pad += 1;
  }
  if (words.length > 25) words = words.slice(0, 25);
  return words.join(" ");
}

export function fallbackScript(productName: string): string {
  const name = (productName || "produk ini").trim();
  return fitScriptWordCount(
    `Aku lagi coba ${name} dan jujur rasanya enak banget buat sehari-hari, jadi pengin cerita ke teman yang lagi cari yang simpel.`,
  );
}

export function fitScripts(scripts: string[], count: number, productName: string): string[] {
  const n = Math.min(Math.max(count, 1), 8);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const raw = scripts[i] || fallbackScript(productName);
    out.push(fitScriptWordCount(raw));
  }
  return out;
}

export function productAnalysisInstruction(modeTitle: string): string {
  return `Tugas Anda adalah menganalisis gambar produk dan mengembalikan HANYA format JSON valid.
1. "productName": Identifikasi produk, maksimal 3 kata (Bahasa Indonesia).
2. "productDesc": Deskripsi SANGAT RINGKAS (kategori, merek, warna/ciri menonjol). Sebut logo yang terlihat supaya logo itu dipertahankan.
3. "backgrounds": Array berisi tepat 7 rekomendasi latar/background yang eksklusif dan estetik untuk sesi ${modeTitle} produk tersebut di Indonesia.

Contoh output:
{
  "productName": "Sepatu Lari Nike",
  "productDesc": "Sepatu lari Nike Air Max warna putih dan biru.",
  "backgrounds": ["Trek Lari Senayan", "Jalanan Sudirman", "Studio Putih", "Teras Cafe", "Ruang Tamu Estetik", "Track Urban", "Taman Kota"]
}`;
}

export function storyboardInstruction(input: {
  scenes: number;
  productName: string;
  productDesc: string;
  mode: StudioMode;
}): string {
  let tone =
    "Tone: Profesional, jernih, persuasif.";
  let arc = "Follow a logical narrative arc: context, problem, discovery, interaction, resolution.";
  if (input.mode === "ugc" || input.mode === "affiliate") {
    tone =
      "Tone: Sangat natural, ngobrol santai seperti UGC TikTok/Reels sungguhan, tidak terkesan membaca script, gunakan bahasa sehari-hari yang sangat membumi.";
    arc =
      "Follow a highly organic TikTok/Reels narrative: casual hook, relatable problem, introducing the product as an everyday find, genuine reaction, soft recommendation.";
  } else if (input.mode === "commercial") {
    tone = "Tone: Elegan, profesional, sangat meyakinkan seperti iklan TV premium.";
  } else if (input.mode === "mirror") {
    tone = "Tone: Stylish, trendy, fokus pada penampilan dan kepercayaan diri gaya mirror selfie.";
  } else if (input.mode === "pov") {
    tone = "Tone: Review langsung, fokus pada detail produk, praktis, dan interaktif.";
  }
  return `Generate a JSON object with a single key "scripts" containing an array of precisely ${input.scenes} strings for a storyboard about ${input.productName} (${input.productDesc}). ${arc} IMPORTANT: Use Bahasa Indonesia. ${tone} EXACT DURATION: Each script string MUST take exactly 6 to 8 seconds to speak. To achieve this, write STRICTLY between 18 and 25 words per string. Do not make it too short or too long. If a brand name is awkward to say, keep the written brand in the script; pronunciation is handled separately.`;
}

export function videoDraftInstruction(brief: string, pronunciationNote: string): string {
  return `Buat JSON dengan kunci "script" dan "videoPrompt".
script: satu naskah voice-over Bahasa Indonesia santai, STRICTLY 18 sampai 25 kata, untuk video pendek 6-8 detik. Jangan pakai markdown.
videoPrompt: prompt bahasa Inggris untuk generator video fotorealistik vertikal 9:16. Jelaskan aksi, kamera, dan kalau ada orang yang bicara, minta lip-sync ke naskah itu. Jangan minta teks di layar.
Brief pemilik: ${brief}
Cara baca merek: ${pronunciationNote || "(tidak ada)"}`;
}

export function captionInstruction(platform: string, topic: string): string {
  return `Buatkan caption/deskripsi postingan untuk platform ${platform} yang menarik, engaging, copywriting memikat, dan berpotensi viral dengan topik: "${topic}".
Gunakan bahasa Indonesia kekinian. Beri spasi/paragraf yang rapi dan enak dibaca. Berikan Call to Action (CTA) di bagian akhir caption.
Setelah caption, berikan 15 hashtag yang sangat relevan dan trending.
Kembalikan JSON {"caption":"..."} dan isi caption dengan teks lengkapnya.`;
}

export function voiceOverInstruction(style: string, productName: string, duration: string): string {
  return `Buatkan naskah master voiceover gaya ${style} untuk ${productName || "Produk"}. Durasi: ${duration}. Bahasa Indonesia. Tuliskan naskahnya saja, 18 sampai 25 kata, tanpa judul atau markdown.`;
}

export function mergeBackgrounds(suggested: string[], mode: StudioMode): string[] {
  const clean: string[] = [];
  for (const item of suggested) {
    const text = String(item || "").trim();
    if (!text || clean.includes(text)) continue;
    clean.push(text);
    if (clean.length === 7) break;
  }
  for (const preset of MODE_BACKGROUNDS[mode]) {
    if (clean.length >= 7) break;
    if (!clean.includes(preset)) clean.push(preset);
  }
  return Array.from(new Set([...clean, ...MODE_BACKGROUNDS[mode]]));
}

export interface Pronunciation {
  written: string;
  spoken: string;
}

export function cleanPronunciations(value: unknown): Pronunciation[] {
  if (!Array.isArray(value)) return [];
  const out: Pronunciation[] = [];
  for (const item of value.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const written = String((item as Pronunciation).written || "").trim().slice(0, 40);
    const spoken = String((item as Pronunciation).spoken || "").trim().slice(0, 80);
    if (written && spoken) out.push({ written, spoken });
  }
  return out;
}

export function applyPronunciation(text: string, items: Pronunciation[]): string {
  let out = text;
  for (const item of items) out = out.split(item.written).join(item.spoken);
  return out;
}

export function pronunciationNote(items: Pronunciation[]): string {
  if (!items.length) return "";
  return items.map((item) => `${item.written} diucapkan "${item.spoken}"`).join("; ");
}

export function replaceMap(items: Pronunciation[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) map[item.written] = item.spoken;
  return map;
}

const CELEBRITY_HINTS = ["wajah artis", "mirip artis", "tokoh publik", "public figure", "selebriti", "celebrity", "selebgram terkenal"];

export function assertNoCelebrityRequest(text: string): void {
  const hay = text.toLowerCase();
  if (CELEBRITY_HINTS.some((hint) => hay.includes(hint))) {
    throw new Error("CELEBRITY");
  }
}

export function isStudioMode(value: string): value is StudioMode {
  return value === "ugc" || value === "affiliate" || value === "commercial" || value === "mirror" || value === "pov";
}

export function isUgcStyle(value: string): value is UgcStyle {
  return value === "Handheld" || value === "Tripod" || value === "Vlog";
}
