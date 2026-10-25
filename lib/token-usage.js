import { dbRequest } from "./ga4.js";

const configuredLimit = Number.parseInt(process.env.GROWTHDESK_DAILY_TOKEN_LIMIT || "50000", 10);
export const DAILY_TOKEN_LIMIT = Number.isSafeInteger(configuredLimit) && configuredLimit >= 1000 ? configuredLimit : 50000;

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function resetAtForDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString();
}

export async function reserveTokens(userId, estimatedTokens) {
  const day = utcDay();
  const estimate = Math.max(1, Math.ceil(Number(estimatedTokens) || 1));
  const result = await dbRequest("rpc/growthdesk_reserve_tokens", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_day: day,
      p_estimated_tokens: estimate,
      p_daily_limit: DAILY_TOKEN_LIMIT
    })
  });
  return {
    ...(result || {}),
    day,
    allowed: result?.allowed === true,
    usedTokens: Number(result?.usedTokens || 0),
    remainingTokens: Number(result?.remainingTokens || 0),
    resetAt: resetAtForDay(day)
  };
}

export async function finalizeTokens(userId, day, reservedTokens, actualTokens) {
  return dbRequest("rpc/growthdesk_finalize_tokens", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_day: day,
      p_reserved_tokens: Math.max(1, Math.ceil(Number(reservedTokens) || 1)),
      p_actual_tokens: Math.max(0, Math.ceil(Number(actualTokens) || 0))
    })
  });
}

export async function getDailyTokenUsage(userId) {
  const day = utcDay();
  const rows = await dbRequest("growthdesk_token_usage?select=usage_date,tokens_used,tokens_reserved&user_id=eq." +
    encodeURIComponent(userId) + "&usage_date=eq." + encodeURIComponent(day) + "&limit=1");
  const row = rows?.[0];
  const usedTokens = Number(row?.tokens_used || 0);
  const reservedTokens = Number(row?.tokens_reserved || 0);
  return {
    day,
    usedTokens,
    reservedTokens,
    remainingTokens: Math.max(0, DAILY_TOKEN_LIMIT - usedTokens - reservedTokens),
    dailyLimit: DAILY_TOKEN_LIMIT,
    resetAt: resetAtForDay(day)
  };
}
