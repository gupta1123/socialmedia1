"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:62021";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "public-anon-key-placeholder-for-build";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
