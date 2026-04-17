export function normalizeUsername(value) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function buildFallbackUsername(userId) {
  const compactId = (userId ?? "").replace(/-/g, "").slice(0, 8);
  return compactId ? `user-${compactId}` : "user";
}

export function isUsernameTakenError(error) {
  const haystack = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("username_taken") ||
    haystack.includes("profiles_username_unique_idx") ||
    (haystack.includes("duplicate key") && haystack.includes("username"))
  );
}
