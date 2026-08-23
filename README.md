# Snor Live Main

## Deploy (Vercel)

Set **Root Directory** in Vercel to `snor-live-main`.

Build settings:
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`

Required environment variables must be configured in Vercel project settings (for example Supabase and LiveKit keys used by the app).