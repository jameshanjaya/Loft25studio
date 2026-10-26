// Secrets are injected by Wrangler (.dev.vars locally, `wrangler secret put` in production).
// They are not declared in wrangler.jsonc, so they extend the generated Env instead of copying it.

export interface AppEnv extends Env {
  XAI_MOCK?: string;
  XAI_API_KEY?: string;
  MASTER_EMAIL?: string;
  MASTER_PASSWORD?: string;
  TURNSTILE_BYPASS?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  MIDTRANS_ENABLED?: string;
  MIDTRANS_SERVER_KEY?: string;
  MIDTRANS_CLIENT_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  ALERT_EMAIL?: string;
}
