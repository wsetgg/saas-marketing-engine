const style = document.createElement("style");
style.textContent = "#growthdesk-token-meter{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;border:1px solid #dfe7e2;background:#f5faf7;color:#235b45;border-radius:9px;padding:8px 10px;font:650 .8rem/1.2 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;font-variant-numeric:tabular-nums}#growthdesk-token-icon{font-size:.95rem;line-height:1}@media(max-width:540px){#growthdesk-token-meter{padding:7px 8px;font-size:.74rem;gap:5px}}";
document.head.append(style);

const signOut = document.querySelector("#signout");
if (signOut && !document.querySelector("#growthdesk-token-meter")) {
  const meter = document.createElement("span");
  meter.id = "growthdesk-token-meter";
  meter.setAttribute("role", "group");
  meter.style.display = "none";
  meter.setAttribute("aria-label", "AI tokens remaining today");
  meter.title = "Today's AI token allowance";
  meter.innerHTML = '<span id="growthdesk-token-icon" aria-hidden="true">🪙</span><span id="growthdesk-token-remaining">—</span>';
  signOut.parentNode.insertBefore(meter, signOut);
}

let accessToken = window.__growthdeskAccessToken || "";
let refreshInFlight = false;
async function refreshTokenMeter() {
  if (refreshInFlight || !accessToken || !document.querySelector("#growthdesk-token-meter")) return;
  refreshInFlight = true;
  try {
    const response = await fetch("/api/token-usage", {
      headers: { Authorization: "Bearer " + accessToken },
      cache: "no-store"
    });
    const usage = await response.json().catch(() => ({}));
    const value = document.querySelector("#growthdesk-token-remaining");
    const meter = document.querySelector("#growthdesk-token-meter");
    if (!response.ok || !value || !meter) {
      if (meter) { meter.title = usage.error || "Token usage is temporarily unavailable."; meter.style.display = "none"; }
      return;
    }
    value.textContent = Math.max(0, Number(usage.remainingTokens) || 0).toLocaleString();
    meter.style.display = "inline-flex";
    const reset = usage.resetAt ? new Date(usage.resetAt) : null;
    const resetLabel = reset && !Number.isNaN(reset.getTime())
      ? reset.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "midnight UTC";
    meter.title = Number(usage.usedTokens).toLocaleString() + " of " +
      Number(usage.dailyLimit).toLocaleString() + " tokens used today. Resets " + resetLabel + ".";
  } catch {
    const meter = document.querySelector("#growthdesk-token-meter");
    if (meter) meter.title = "Token usage is temporarily unavailable.";
  } finally {
    refreshInFlight = false;
  }
}
window.addEventListener("growthdesk:session-ready", event => {
  accessToken = event.detail?.accessToken || window.__growthdeskAccessToken || "";
  refreshTokenMeter();
});
window.addEventListener("growthdesk:tokens-updated", refreshTokenMeter);
window.addEventListener("focus", refreshTokenMeter);
refreshTokenMeter();
