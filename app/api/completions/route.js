import { NextResponse } from "next/server";

import {
  COMPLETION_COOLDOWN_MINUTES,
  createCompletionPostHandler,
} from "../../../lib/completion-route.mjs";
import {
  createSupabaseAdminClient,
  createSupabaseAnonClient,
  createSupabaseUserClient,
  hasSupabaseServiceRoleKey,
} from "../../../lib/server-supabase";

const CACHE_HEADERS = { "Cache-Control": "no-store" };

export const runtime = "nodejs";

function getBearerToken(request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) return null;

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  return token;
}

export async function POST(request) {
  const accessToken = getBearerToken(request);

  try {
    const authSupabase = createSupabaseAnonClient();
    const supabase = hasSupabaseServiceRoleKey()
      ? createSupabaseAdminClient()
      : createSupabaseUserClient(accessToken);
    const handleCompletionPost = createCompletionPostHandler({
      getUserFromAccessToken: async (token) => {
        const {
          data: { user },
          error: authError,
        } = await authSupabase.auth.getUser(token);

        if (authError) return null;
        return user;
      },
      recordCompletion: async ({ userId, cooldownMinutes }) => {
        const { data, error } = await supabase.rpc("record_completion", {
          p_user_id: userId,
          p_cooldown_minutes: cooldownMinutes,
        });

        if (error) throw error;
        return Array.isArray(data) ? data[0] : data;
      },
    });

    const result = await handleCompletionPost({ accessToken });

    return NextResponse.json(
      result.body,
      {
        status: result.status,
        headers: {
          ...CACHE_HEADERS,
          ...result.headers,
        },
      }
    );
  } catch (error) {
    if (error?.message !== "completion_cooldown_active") {
      console.error("Completion route failed", error);
    }

    const lowerMessage = String(error?.message || "").toLowerCase();
    if (
      lowerMessage.includes("permission denied") ||
      lowerMessage.includes("record_completion") ||
      lowerMessage.includes("42501")
    ) {
      return NextResponse.json(
        { error: "Completion recording is not configured. Apply the latest Supabase completions migration." },
        { status: 500, headers: CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: "Unable to record completion." },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}
