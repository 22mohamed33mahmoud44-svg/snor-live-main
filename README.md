# Snor Live

## Vercel deployment

The application is located at the repository root. Configure Vercel with **Root Directory = `.`** (repository root), then use the committed `vercel.json` build settings.

## Supabase migrations

Production database migration history must remain synchronized with `supabase/migrations`. Do not reset production to reconcile migration history; reconcile missing migration files first.
