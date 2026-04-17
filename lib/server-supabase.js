import "server-only";

import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createServerClient(keyName) {
  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv(keyName),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export function createSupabaseAnonClient() {
  return createServerClient("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function createSupabaseAdminClient() {
  return createServerClient("SUPABASE_SERVICE_ROLE_KEY");
}
