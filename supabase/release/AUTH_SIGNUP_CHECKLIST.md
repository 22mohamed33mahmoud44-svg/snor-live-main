# Auth and onboarding release checks

Run these **only against an isolated staging Supabase project** with synthetic test users. CI covers response branching and profile column constraints; it cannot confirm delivery of email, Auth redirect configuration, or real browser sessions.

## Configuration prerequisites

- Check Supabase Authentication **URL Configuration**. The site URL must point to the intended environment; any additional confirmation and OAuth redirect URLs must be explicitly allowlisted. Do not assume a Vercel preview hostname is authorized.
- Check the project's Email provider and **Confirm email** setting. Hosted Supabase generally enables confirmation, but the deployed setting must be verified.
- Check that the `avatars` storage bucket is public-read and only allows authenticated owners to write to the first `<user_id>/` folder, with the documented image MIME types and 5 MiB limit.
- Apply the reviewed owner-scoped profiles view policies on staging before testing. Do not point a staging frontend at production merely to simulate a signup.

## Real-browser validation

| Case | Expected behavior |
| --- | --- |
| Fresh email signup, email confirmation enabled | Supabase returns user, no session; the modal stays open and presents neutral confirmation instructions, without claiming sign-in |
| Follow a valid confirmation link | Browser returns to the allowlisted site URL; a real session can be established and the four-step onboarding appears |
| Signup with confirmation disabled (separate staging configuration) | If Supabase returns a session, the modal closes and profile onboarding starts |
| Password login failure or missing session | The modal stays open and displays a clear error without advancing to the dashboard |
| Google OAuth initiation failure | The error appears in the modal instead of becoming an uncaught promise |
| Finish onboarding without a photograph | A fresh owner profile is inserted with a deterministic nonempty `username`, `gender`, `birthdate` and `avatar_url=''` |
| Finish onboarding with a supported image | Storage upload path starts with the actual auth user UUID; URL references a valid JPEG, PNG, WebP or GIF image |
| Retry after profile save error | Error appears inline; the user remains on onboarding and can retry without double-submitting |
| Unauthorized account | A signed-in user cannot read another user's private profile or edit their birthdate and account fields |

Supabase may deliberately return an obfuscated user for an existing email when confirmation is enabled. Do **not** reveal the account's existence through the signup response.

## Release gate

Do not mark auth E2E complete based solely on Deno/TypeScript/PostgreSQL CI. Record a passing browser signup and confirmation result from the **real staging Auth endpoint**. Keep the production migration drift and integrated payment/call tests as separate release blockers.
