import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Email magic links, invites, and password recovery use implicit grant (tokens in URL hash).
    // flowType "pkce" rejects those URLs with "Not a valid PKCE flow url" and leaves users on "/".
    flowType: "implicit",
    detectSessionInUrl: true,
  },
});
