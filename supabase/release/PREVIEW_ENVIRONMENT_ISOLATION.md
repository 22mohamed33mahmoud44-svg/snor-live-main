# Preview environment isolation — release blocker (2026-10-30)

## Verified Vercel configuration (metadata only)

The Vercel project `snor-live-main` (`prj_fJTGJAprMU8NpbOItkCSkQB4HHba`) has **one shared environment-variable record** each for `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_STRIPE_PUBLIC_KEY`, targeted at **Production, Preview, and Development**. No separate custom environments or Preview branch-specific records were returned in the 2026-10-30 read-only configuration inspection. No decrypted values or secrets were inspected or committed.

Consequently, the Vercel preview build should be **treated as connected to the production Supabase and Stripe configuration until independently verified otherwise**. Vercel Preview is a frontend deployment target, NOT an isolated Supabase staging project or safe test environment. These shared client-side environment variables can direct data-changing browser requests to real infrastructure.

## Do not run these tests from the current shared Preview

- Do **not** create real or synthetic accounts, upload avatars, or change profiles while calling this a staging test.
- Do **not** send gift transactions, call service RPCs, credit wallets, or run checkout/payment flows.
- Do **not** run end-to-end direct call or livestream tests against production data.
- Do **not** edit or replace the shared values on the current project without planning an orderly rollout; those values are also used in Production.

## Safe path to real integrated testing

1. Create or obtain a separately provisioned, cost-approved **staging Supabase database/project** with its own URL and publishable/anon key. Obtain independent **Stripe test-mode** prices and webhook secrets; never share live Stripe secrets with staging.
2. Configure **Preview-only** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_STRIPE_PUBLIC_KEY` records (or a named custom environment) whose values belong to the isolated test services. Confirm Vercel's precedence and any branch filters. Leave Production values unchanged.
3. Verify browser network requests go to the staging Supabase host (not the production hostname) before creating any test user or invoking any mutating endpoint. Validate Stripe `pk_test_` in preview rather than live publishable keys. Do not log the full values.
4. On the staging backend, align Auth redirect allowlists, RLS policies, Storage buckets, Stripe checkout/webhook Edge Functions, and LiveKit test credentials. Rehearse the reconciled migrations against a schema-compatible clone before accepting payments.
5. Complete `AUTH_SIGNUP_CHECKLIST.md` and the separate payment/call checks using synthetic users, then review results and plan a controlled production rollout.

**Current release status: BLOCKED for integrated staging E2E** until environment isolation is independently proven. A Vercel deployment reporting `READY` confirms only the frontend build completed. It does not prove the backend is staged or that Stripe and call flows work safely.

## Traceability

- PR integration branch: `integration/security-hardening-20261030`.
- First explicit Preview deployment of the Auth fixes at commit `93233319357116dc1203f02de1fe28641e306e20` was verified as `READY` via Vercel deployment `dpl_CnFDUsRdw5DsYaoHUkn72un9SRM6`.
- Production Vercel remains on `main` commit `6ad50ac17026898adcbea3a39af91777b41c07ad`.
- Supabase production was accessed read-only; no migrations, coins, users or settings were changed.
