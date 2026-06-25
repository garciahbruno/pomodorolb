export function getCurrentTimerClock(timeSource = globalThis) {
  const wallNow =
    typeof timeSource?.Date?.now === "function"
      ? timeSource.Date.now()
      : Date.now();

  // The wall clock is the single source of truth. Date.now() advances at the
  // same rate in every browser, including while the tab is backgrounded or the
  // device sleeps, so the countdown behaves identically everywhere. We no longer
  // blend in performance.now(): mixing two clocks (and picking via Math.min) was
  // the only browser-dependent part of the timer and added no real protection,
  // since completions are rate-limited server-side regardless of client timing.
  return {
    wallMs: wallNow,
    monoMs: null,
  };
}

export function addTimerClockMs(clock, ms) {
  return {
    wallMs: clock.wallMs + ms,
    monoMs: clock.monoMs == null ? null : clock.monoMs + ms,
  };
}

export function getRemainingTimerMs(deadline, now) {
  const wallRemaining = deadline.wallMs - now.wallMs;

  if (deadline.monoMs == null || now.monoMs == null) {
    return wallRemaining;
  }

  // Prefer whichever clock shows more elapsed time. This keeps the timer moving
  // across browser sleep/throttling while still benefiting from monotonic timing
  // when the wall clock is coarse or adjusted backwards.
  return Math.min(wallRemaining, deadline.monoMs - now.monoMs);
}

export function getRemainingTimerSeconds(deadline, now) {
  return Math.max(0, Math.ceil(getRemainingTimerMs(deadline, now) / 1000));
}

export function hasTimerElapsed(deadline, now) {
  return getRemainingTimerMs(deadline, now) <= 0;
}
