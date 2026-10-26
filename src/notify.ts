import { nowIso } from "./bytes";
import type { AppEnv } from "./env";
import { logEvent } from "./log";

export async function notify(env: AppEnv, alert: { kind: string; message: string }): Promise<void> {
  try {
    await env.DB.prepare("INSERT INTO alerts (id, kind, message, created_at) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), alert.kind, alert.message, nowIso())
      .run();
    logEvent("alert", { kind: alert.kind, message: alert.message });
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: alert.message }),
      });
      return;
    }
    if (env.ALERT_EMAIL) {
      logEvent("email_notifier_stub", { to: env.ALERT_EMAIL, kind: alert.kind, message: alert.message });
    }
  } catch (error) {
    logEvent("notify_failed", { message: error instanceof Error ? error.message : "unknown" });
  }
}
