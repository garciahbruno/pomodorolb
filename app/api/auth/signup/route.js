import { NextResponse } from "next/server";

import { createSignupHandler } from "../../../../lib/auth-signup.mjs";
import {
  createSupabaseAdminClient,
  createSupabaseAnonClient,
} from "../../../../lib/server-supabase";

const CACHE_HEADERS = { "Cache-Control": "no-store" };

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const adminSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createSupabaseAdminClient()
      : null;
    const anonSupabase = createSupabaseAnonClient();

    const handleSignup = createSignupHandler({
      checkUsernameAvailability: async (username) => {
        if (!adminSupabase) {
          // The DB trigger still enforces uniqueness if no service-role precheck is available.
          return true;
        }

        const { data, error } = await adminSupabase
          .from("profiles")
          .select("id")
          .ilike("username", username)
          .limit(1);

        if (error) {
          throw error;
        }

        return !data?.length;
      },
      signUpWithPassword: async ({ email, password, username }) =>
        anonSupabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
          },
        }),
    });

    const result = await handleSignup(body ?? {});

    return NextResponse.json(result.body, {
      status: result.status,
      headers: CACHE_HEADERS,
    });
  } catch (error) {
    console.error("Signup route failed", error);

    return NextResponse.json(
      { error: "Unable to create account." },
      {
        status: 500,
        headers: CACHE_HEADERS,
      }
    );
  }
}
