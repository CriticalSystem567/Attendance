import { createClient } from "@supabase/supabase-js";

// Fill these in with YOUR Supabase project's values.
// Locally: create a .env file (see .env.example).
// On Vercel: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY under
// Project Settings -> Environment Variables.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.warn("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — set them in .env or Vercel env vars.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
