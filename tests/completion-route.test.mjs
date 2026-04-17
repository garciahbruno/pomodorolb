import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPLETION_COOLDOWN_MINUTES,
  createCompletionPostHandler,
} from "../lib/completion-route.mjs";

function createStatefulRecorder() {
  const completedAtByUser = new Map();

  return async function recordCompletion({ userId, cooldownMinutes }) {
    const lastCompletedAt = completedAtByUser.get(userId);

    if (lastCompletedAt) {
      const nextAllowedAt = new Date(
        lastCompletedAt.getTime() + cooldownMinutes * 60 * 1000
      );
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((nextAllowedAt.getTime() - Date.now()) / 1000)
      );
      const error = new Error("completion_cooldown_active");
      error.details = JSON.stringify({
        next_allowed_at: nextAllowedAt.toISOString(),
        retry_after_seconds: retryAfterSeconds,
      });
      throw error;
    }

    const completedAt = new Date();
    completedAtByUser.set(userId, completedAt);

    return {
      user_id: userId,
      completed_at: completedAt.toISOString(),
      next_allowed_at: new Date(
        completedAt.getTime() + cooldownMinutes * 60 * 1000
      ).toISOString(),
    };
  };
}

test("returns 429 with Retry-After when the recorder reports cooldown", async () => {
  const retryAfterSeconds = 3000;
  const nextAllowedAt = "2026-04-16T15:00:00.000Z";
  const handleCompletionPost = createCompletionPostHandler({
    getUserFromAccessToken: async () => ({ id: "user-1" }),
    recordCompletion: async () => {
      const error = new Error("completion_cooldown_active");
      error.details = JSON.stringify({
        next_allowed_at: nextAllowedAt,
        retry_after_seconds: retryAfterSeconds,
      });
      throw error;
    },
  });

  const response = await handleCompletionPost({ accessToken: "valid-token" });

  assert.equal(response.status, 429);
  assert.equal(response.headers["Retry-After"], String(retryAfterSeconds));
  assert.deepEqual(response.body, {
    error: "Completion cooldown active.",
    nextAllowedAt,
    retryAfterSeconds,
  });
});

test("blocks repeated completion spam for the same user within the cooldown window", async () => {
  const handleCompletionPost = createCompletionPostHandler({
    getUserFromAccessToken: async () => ({ id: "user-1" }),
    recordCompletion: createStatefulRecorder(),
  });

  const firstResponse = await handleCompletionPost({ accessToken: "valid-token" });
  const secondResponse = await handleCompletionPost({ accessToken: "valid-token" });

  assert.equal(firstResponse.status, 201);
  assert.equal(firstResponse.body.ok, true);
  assert.equal(firstResponse.body.completion.user_id, "user-1");

  assert.equal(secondResponse.status, 429);
  assert.equal(secondResponse.body.error, "Completion cooldown active.");
  assert.ok(secondResponse.body.retryAfterSeconds > 0);
  assert.equal(
    secondResponse.headers["Retry-After"],
    String(secondResponse.body.retryAfterSeconds)
  );

  const cooldownSeconds = COMPLETION_COOLDOWN_MINUTES * 60;
  assert.ok(
    secondResponse.body.retryAfterSeconds <= cooldownSeconds,
    "retryAfterSeconds should stay within the configured cooldown"
  );
});
