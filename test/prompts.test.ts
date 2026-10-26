import { describe, expect, it } from "vitest";
import {
  buildImagePrompt,
  buildVideoPrompt,
  COMMERCIAL_SPOTLIGHT_TEMPLATE,
  countWords,
  fitScriptWordCount,
  getModeLogic,
  IDENTITY_LOCK,
  isForbiddenNegativeToken,
  mergeBackgrounds,
  negativeFor,
  sanitizeNegativeList,
  videoContext,
} from "../src/prompts";

function negativeSection(prompt: string): string {
  const match = prompt.match(/NEGATIVE:\s*([\s\S]*?)(?:Technical:|$)/i);
  return match?.[1] || "";
}

describe("prompt engine", () => {
  it("keeps altered logo and drops logo and brand name bans", () => {
    expect(isForbiddenNegativeToken("logo")).toBe(true);
    expect(isForbiddenNegativeToken("brand name")).toBe(true);
    expect(isForbiddenNegativeToken("altered logo")).toBe(false);
    expect(isForbiddenNegativeToken("different logo")).toBe(false);
    const cleaned = sanitizeNegativeList("text, logo, altered logo, brand name, watermark");
    expect(cleaned).toContain("altered logo");
    expect(cleaned.split(",").map((part) => part.trim())).not.toContain("logo");
    expect(cleaned.toLowerCase()).not.toContain("brand name");
  });

  it("builds the tested commercial still without banning the real logo", () => {
    const prompt = buildImagePrompt({
      mode: "commercial",
      productName: "Loft25 iced matcha",
      productDesc: "tall clear cup, green over milk, white house and whisk logo",
      background: "dark walnut wood tabletop",
      ratio: "9:16",
      hasModel: false,
      hasProduct: true,
      template: COMMERCIAL_SPOTLIGHT_TEMPLATE,
    });
    expect(prompt).toContain("Hasselblad");
    expect(prompt).toContain("Single harsh");
    expect(prompt).toContain("8k");
    expect(prompt).toContain("NO HUMAN");
    expect(prompt).toContain("real printed logo");
    const negative = negativeSection(prompt).toLowerCase();
    expect(negative).toContain("altered logo");
    expect(negative.split(",").map((part) => part.trim())).not.toContain("logo");
    expect(negative).not.toContain("brand name");
  });

  it("switches affiliate cameras and locks identity when a person is present", () => {
    const handheld = getModeLogic("affiliate", 0, "Matcha", "gelas", "kafe", "Handheld", true);
    const tripod = getModeLogic("affiliate", 0, "Matcha", "gelas", "kafe", "Tripod", true);
    const vlog = getModeLogic("affiliate", 0, "Matcha", "gelas", "kafe", "Vlog", true);
    expect(handheld.cameraLogic).toContain("HANDHELD");
    expect(tripod.cameraLogic.toLowerCase()).toContain("tripod");
    expect(vlog.cameraLogic.toLowerCase()).toContain("vlog");
    expect(handheld.lipSyncLogic).toContain("LIP-SYNC");

    const prompt = buildImagePrompt({
      mode: "affiliate",
      productName: "Matcha",
      productDesc: "gelas bening",
      background: "Kafe Aesthetic (Sore Hari)",
      ratio: "9:16",
      ugcStyle: "Tripod",
      hasModel: true,
      hasProduct: true,
      scriptText: fitScriptWordCount("Aku lagi minum matcha ini pelan-pelan karena segarnya pas buat sore yang panas banget."),
    });
    expect(prompt).toContain(IDENTITY_LOCK);
    expect(prompt).toContain("tripod");
    expect(prompt).toContain("Image 1 = Base Model");
    expect(prompt).toContain("Image 2 = Product Reference");
    expect(negativeSection(prompt).toLowerCase().split(",").map((part) => part.trim())).not.toContain("logo");
  });

  it("covers mirror, pov, and product-only commercial motion", () => {
    const mirror = buildImagePrompt({
      mode: "mirror",
      productName: "Minuman",
      productDesc: "gelas",
      background: "Kamar Estetik (Cermin Full Body)",
      ratio: "9:16",
      hasModel: true,
      hasProduct: true,
    });
    expect(mirror.toLowerCase()).toContain("mirror selfie");
    expect(mirror).toContain(IDENTITY_LOCK);

    const pov = buildImagePrompt({
      mode: "pov",
      productName: "Minuman",
      productDesc: "gelas",
      background: "Meja Kafe Estetik (Dekat Jendela)",
      ratio: "9:16",
      hasModel: true,
      hasProduct: true,
    });
    expect(pov).toContain("FIRST-PERSON POV");
    expect(pov).not.toContain(IDENTITY_LOCK);
    expect(pov).toContain("NO FACES");

    const video = buildVideoPrompt({
      mode: "commercial",
      productName: "Matcha",
      productDesc: "gelas",
      background: "meja walnut",
      script: "",
      hasModel: false,
    });
    expect(video).toContain("AMBIENT");
    expect(video).toContain("Hasselblad");
    const talking = videoContext({ mode: "affiliate", script: "halo", hasModel: true });
    expect(talking).toContain("mouth moving");
  });

  it("keeps storyboard lines between 18 and 25 words and merges seven backgrounds", () => {
    expect(countWords(fitScriptWordCount("pendek sekali"))).toBeGreaterThanOrEqual(18);
    expect(countWords(fitScriptWordCount("satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua belas tiga belas empat belas lima belas enam belas tujuh belas delapan belas sembilan belas dua puluh dua puluh satu dua puluh dua dua puluh tiga dua puluh empat dua puluh lima dua puluh enam"))).toBeLessThanOrEqual(25);
    const merged = mergeBackgrounds(["A", "B", "C"], "commercial");
    expect(merged.length).toBeGreaterThanOrEqual(7);
    expect(negativeFor("commercial", false)).not.toMatch(/(^|, )logo(,|$)/);
  });
});
