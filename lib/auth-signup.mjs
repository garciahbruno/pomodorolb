import { isUsernameTakenError, normalizeUsername } from "./usernames.mjs";

function normalizeEmail(value) {
  return (value ?? "").trim().toLowerCase();
}

function isEmailRegisteredError(error) {
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
    haystack.includes("user already registered") ||
    haystack.includes("email address already in use") ||
    haystack.includes("email_exists")
  );
}

export function createSignupHandler({
  checkUsernameAvailability,
  signUpWithPassword,
} = {}) {
  if (typeof checkUsernameAvailability !== "function") {
    throw new TypeError("checkUsernameAvailability must be a function");
  }

  if (typeof signUpWithPassword !== "function") {
    throw new TypeError("signUpWithPassword must be a function");
  }

  return async function handleSignup({ email, password, username }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedEmail) {
      return {
        status: 400,
        body: { error: "Email is required." },
      };
    }

    if (typeof password !== "string" || password.length < 6) {
      return {
        status: 400,
        body: { error: "Password must be at least 6 characters." },
      };
    }

    if (!normalizedUsername) {
      return {
        status: 400,
        body: { error: "Username is required." },
      };
    }

    const usernameAvailable = await checkUsernameAvailability(normalizedUsername);
    if (!usernameAvailable) {
      return {
        status: 409,
        body: {
          code: "username_taken",
          error: "Username is already taken.",
        },
      };
    }

    const { data, error } = await signUpWithPassword({
      email: normalizedEmail,
      password,
      username: normalizedUsername,
    });

    if (error) {
      if (isUsernameTakenError(error)) {
        return {
          status: 409,
          body: {
            code: "username_taken",
            error: "Username is already taken.",
          },
        };
      }

      if (isEmailRegisteredError(error)) {
        return {
          status: 409,
          body: {
            code: "email_taken",
            error: "Email is already registered.",
          },
        };
      }

      return {
        status: 400,
        body: {
          code: "signup_failed",
          error: error.message || "Unable to create account.",
        },
      };
    }

    return {
      status: 201,
      body: {
        user: data?.user ?? null,
        session: data?.session ?? null,
        needsEmailConfirmation: !data?.session,
      },
    };
  };
}
