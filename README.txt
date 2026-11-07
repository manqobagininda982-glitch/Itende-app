ToneMaster by MG:SOUNDS

Vercel static PWA + serverless API. Uses Supabase Auth, Postgres licences and private Storage.

Required Vercel environment variables (Production + Preview as needed):
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-side-only-secret>
MG_SOUNDS_ADMIN_SECRET=<long-random-admin-secret>
SUPABASE_AUDIO_BUCKET=tonemaster-audio
SUPABASE_BEAT_OBJECT=tonemaster-beat-pack.zip
SUPABASE_TONE_OBJECT=38_Roland_E500_Inspired_Fretless_Bright.wav

Never put SUPABASE_SERVICE_ROLE_KEY or MG_SOUNDS_ADMIN_SECRET in browser files or GitHub.

Existing database schema expected: public.licenses(key_hash unique,status,assigned_user_id,activated_at,expires_at). Status values: available, active, revoked, expired. No schema reset is required.

Private storage bucket tonemaster-audio must contain tonemaster-beat-pack.zip and 38_Roland_E500_Inspired_Fretless_Bright.wav.

Admin key generation: /admin.html. Generate keys only after payment is independently confirmed. The app does not process payments.

The beat pack is downloaded once and cached locally for offline playback. The fretless WAV is fetched with a short-lived signed URL after licence verification.
