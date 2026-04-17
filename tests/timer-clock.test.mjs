import test from "node:test";
import assert from "node:assert/strict";

import {
  addTimerClockMs,
  getRemainingTimerMs,
  getRemainingTimerSeconds,
  hasTimerElapsed,
} from "../lib/timer-clock.mjs";

test("uses the monotonic clock when the wall clock moves backwards", () => {
  const startedAt = { wallMs: 10_000, monoMs: 500 };
  const deadline = addTimerClockMs(startedAt, 5_000);
  const now = { wallMs: 8_000, monoMs: 3_500 };

  assert.equal(getRemainingTimerMs(deadline, now), 2_000);
  assert.equal(getRemainingTimerSeconds(deadline, now), 2);
});

test("uses the wall clock when it advanced further than the monotonic clock", () => {
  const startedAt = { wallMs: 10_000, monoMs: 500 };
  const deadline = addTimerClockMs(startedAt, 5_000);
  const now = { wallMs: 16_500, monoMs: 1_000 };

  assert.equal(getRemainingTimerMs(deadline, now), -1_500);
  assert.equal(hasTimerElapsed(deadline, now), true);
});

test("falls back to the wall clock when no monotonic clock is available", () => {
  const deadline = { wallMs: 3_000, monoMs: null };
  const now = { wallMs: 1_600, monoMs: null };

  assert.equal(getRemainingTimerMs(deadline, now), 1_400);
  assert.equal(getRemainingTimerSeconds(deadline, now), 2);
});
