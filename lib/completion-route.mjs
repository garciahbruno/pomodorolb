const COMPLETION_COOLDOWN_MINUTES = 50;

function parseCooldownDetails(details) {
  if (!details) return null;

  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

function getCooldownResponse(error, cooldownMinutes) {
  if (error?.message !== "completion_cooldown_active") {
    return null;
  }

  const details = parseCooldownDetails(error.details);
  const retryAfterSeconds = Number(details?.retry_after_seconds) || cooldownMinutes * 60;

  return {
    status: 429,
    body: {
      error: "Completion cooldown active.",
      nextAllowedAt: details?.next_allowed_at ?? null,
      retryAfterSeconds,
    },
    headers: {
      "Retry-After": String(retryAfterSeconds),
    },
  };
}

export function createCompletionPostHandler({
  getUserFromAccessToken,
  recordCompletion,
  cooldownMinutes = COMPLETION_COOLDOWN_MINUTES,
} = {}) {
  if (typeof getUserFromAccessToken !== "function") {
    throw new TypeError("getUserFromAccessToken must be a function");
  }

  if (typeof recordCompletion !== "function") {
    throw new TypeError("recordCompletion must be a function");
  }

  return async function handleCompletionPost({ accessToken }) {
    if (!accessToken) {
      return {
        status: 401,
        body: { error: "Missing bearer token." },
        headers: {},
      };
    }

    const user = await getUserFromAccessToken(accessToken);
    if (!user?.id) {
      return {
        status: 401,
        body: { error: "Invalid or expired session." },
        headers: {},
      };
    }

    try {
      const completion = await recordCompletion({
        userId: user.id,
        cooldownMinutes,
      });

      return {
        status: 201,
        body: {
          ok: true,
          completion,
        },
        headers: {},
      };
    } catch (error) {
      const cooldownResponse = getCooldownResponse(error, cooldownMinutes);
      if (cooldownResponse) return cooldownResponse;
      throw error;
    }
  };
}

export { COMPLETION_COOLDOWN_MINUTES, parseCooldownDetails };
