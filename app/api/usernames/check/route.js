import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "../../../../lib/server-supabase";
import { normalizeUsername } from "../../../../lib/usernames.mjs";

const CACHE_HEADERS = { "Cache-Control": "no-store" };

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const username = normalizeUsername(body?.username);

    if (!username) {
      return NextResponse.json(
        { error: "Username is required." },
        { status: 400, headers: CACHE_HEADERS }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .limit(1);

    if (error) {
      console.error("Username availability check failed", error);
      return NextResponse.json(
        { error: "Unable to check username availability." },
        { status: 500, headers: CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { available: !data?.length },
      { status: 200, headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error("Username availability route failed", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}
