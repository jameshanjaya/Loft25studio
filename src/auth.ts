import { b64ToBytes, bytesToB64, sha256Hex, timingSafeEqual } from "./bytes";
import type { AppEnv } from "./env";
import { HttpError } from "./http";

const ITERATIONS = 100_000;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iter, saltB64, hashB64] = stored.split("$");
  if (algo !== "pbkdf2" || !iter || !saltB64 || !hashB64) return false;
  const iterations = Number(iter);
  if (!Number.isFinite(iterations) || iterations < 1 || iterations > 1_000_000) return false;
  const actual = await derive(password, b64ToBytes(saltB64), iterations);
  return timingSafeEqual(actual, b64ToBytes(hashB64));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertPassword(password: string): void {
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    throw new HttpError(400, "Password minimal 8 karakter.", "weak_password");
  }
}

export function assertEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw new HttpError(400, "Emailnya kurang pas.", "bad_email");
  }
}

export async function verifyTurnstile(env: AppEnv, token: string | undefined, ip: string): Promise<void> {
  const name = env.ENVIRONMENT || "development";
  const bypass = env.TURNSTILE_BYPASS === "1" && (name === "development" || name === "test");
  if (bypass) return;
  if (!env.TURNSTILE_SECRET) {
    throw new HttpError(503, "Cek manusia (Turnstile) belum dipasang.", "turnstile_missing");
  }
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET);
  body.set("response", token || "");
  body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const data = (await response.json()) as { success?: boolean };
  if (!data.success) throw new HttpError(400, "Verifikasi manusianya gagal. Coba lagi.", "turnstile");
}

export async function randomToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToB64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function tokenHash(token: string): Promise<string> {
  return sha256Hex(token);
}
