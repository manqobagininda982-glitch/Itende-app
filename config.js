// Public browser configuration only. Never put a Supabase service-role key or admin secret here.
window.BRATEE_CONFIG = {
  // Create a Supabase project, then replace these two values with its Project URL and publishable/anon key.
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  // Keep true while testing. Set false before a real paid release, after Supabase and licence APIs are configured.
  demoMode: true
};
