export function reportError(error: unknown, context?: string): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : "";
  console.error(`[ArchVision Error] ${context || "unknown"}: ${message}`, stack);
  const webhook = process.env.ERROR_REPORTING_URL;
  if (webhook && webhook.startsWith("http")) {
    fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: message, context, stack, timestamp: new Date().toISOString() }),
    }).catch(() => {});
  }
}
