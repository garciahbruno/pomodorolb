import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFallbackUsername,
  isUsernameTakenError,
  normalizeUsername,
} from "../lib/usernames.mjs";

test("normalizeUsername trims and collapses whitespace", () => {
  assert.equal(normalizeUsername("  pasta   king  "), "pasta king");
  assert.equal(normalizeUsername(""), "");
});

test("buildFallbackUsername derives a stable id-based username", () => {
  assert.equal(
    buildFallbackUsername("12345678-1234-1234-1234-123456789abc"),
    "user-12345678"
  );
});

test("isUsernameTakenError detects username uniqueness failures", () => {
  assert.equal(
    isUsernameTakenError({ message: "duplicate key value violates unique constraint profiles_username_unique_idx" }),
    true
  );
  assert.equal(
    isUsernameTakenError({ message: "username_taken" }),
    true
  );
  assert.equal(
    isUsernameTakenError({ message: "some other database error" }),
    false
  );
});
