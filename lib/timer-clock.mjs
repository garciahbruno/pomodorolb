export function getCurrentTimerClock(timeSource = globalThis) {
  const wallNow =
    typeof timeSource?.Date?.now === "function"
      ? timeSource.Date.now()
      : Date.now();
  const monoNow =
    typeof timeSource?.performance?.now === "function"
      ? timeSource.performance.now()
      : null;

  return {
    wallMs: wallNow,
    monoMs: Number.isFinite(monoNow) ? monoNow : null,
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
