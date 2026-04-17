import test from "node:test";
import assert from "node:assert/strict";

import { createSignupHandler } from "../lib/auth-signup.mjs";

test("returns 400 when required signup fields are missing", async () => {
  const handleSignup = createSignupHandler({
    checkUsernameAvailability: async () => true,
    signUpWithPassword: async () => ({ data: null, error: null }),
  });

  const response = await handleSignup({
    email: " ",
    password: "123456",
    username: "chef",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Email is required.");
});

test("returns 409 when the requested username is already taken", async () => {
  const handleSignup = createSignupHandler({
    checkUsernameAvailability: async () => false,
    signUpWithPassword: async () => ({ data: null, error: null }),
  });

  const response = await handleSignup({
    email: "test@example.com",
    password: "123456",
    username: "chef",
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "username_taken");
});

test("returns 409 when Supabase reports a duplicate email", async () => {
  const handleSignup = createSignupHandler({
    checkUsernameAvailability: async () => true,
    signUpWithPassword: async () => ({
      data: null,
      error: { message: "User already registered" },
    }),
  });

  const response = await handleSignup({
    email: "test@example.com",
    password: "123456",
    username: "chef",
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "email_taken");
});

test("returns the created user and session on successful signup", async () => {
  const session = {
    access_token: "access-token",
    refresh_token: "refresh-token",
  };
  const handleSignup = createSignupHandler({
    checkUsernameAvailability: async () => true,
    signUpWithPassword: async ({ email, username }) => ({
      data: {
        user: {
          id: "user-1",
          email,
          user_metadata: { username },
        },
        session,
      },
      error: null,
    }),
  });

  const response = await handleSignup({
    email: "TEST@example.com",
    password: "123456",
    username: "  chef  ",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, "test@example.com");
  assert.equal(response.body.user.user_metadata.username, "chef");
  assert.deepEqual(response.body.session, session);
  assert.equal(response.body.needsEmailConfirmation, false);
});
