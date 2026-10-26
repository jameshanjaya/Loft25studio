import { HttpError } from "./http";

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export interface CheckedImage {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png" | "image/webp";
}

export function detectImage(bytes: Uint8Array): CheckedImage["mime"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function checkImage(bytes: Uint8Array, label: string): CheckedImage {
  if (bytes.byteLength === 0) throw new HttpError(400, `${label} kosong.`, "empty_file");
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(400, `${label} kebesaran. Maksimal 6 MB.`, "file_too_large");
  }
  const mime = detectImage(bytes);
  if (!mime) throw new HttpError(400, `${label} harus JPG, PNG, atau WEBP.`, "bad_file_type");
  return { bytes, mime };
}

export async function fileBytes(value: unknown, label: string): Promise<Uint8Array> {
  if (!(value instanceof File)) throw new HttpError(400, `${label} belum dipilih.`, "missing_file");
  return new Uint8Array(await value.arrayBuffer());
}

export function wantsConsent(flag: unknown): boolean {
  if (flag === true) return true;
  if (typeof flag !== "string") return false;
  const value = flag.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "ya" || value === "on";
}
