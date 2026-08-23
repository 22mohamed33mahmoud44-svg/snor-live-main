# Snor Live Main

## Deploy (Vercel)

Set **Root Directory** in Vercel to `snor-live-main`.

Build settings:
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`

Required environment variables must be configured in Vercel project settings (for example Supabase and LiveKit keys used by the app).

## Production environment variables

Configure these at minimum in Vercel (Production):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_LIVEKIT_URL`

See `/home/runner/work/snor-live-main/snor-live-main/snor-live-main/.env.example` for the full app variable template.

## Database and deploy verification

1. Apply all SQL migrations from:
   - `/home/runner/work/snor-live-main/snor-live-main/supabase/migrations`
2. Ensure required frontend RPCs are present in production DB functions.
3. Redeploy from latest `main` commit and compare deployed SHA with `main`.
4. Validate runtime flows: login, live room join, chat, likes, gifts/payments.

Use automated validation before deploy:

```bash
cd /home/runner/work/snor-live-main/snor-live-main
node scripts/verify-deploy-readiness.mjs
```