# Margin

An intelligent note-taking workspace with audio transcription, document analysis, and a
context-aware AI assistant — powered by a **multi-provider AI stack** that automatically
fails over between free models when one is rate-limited.

## Features

- **Active Record** — record audio in-browser, transcribed with Groq Whisper and
  auto-structured into a study guide.
- **Document import** — PDFs (text extracted client-side), Word docs, images
  (vision models), and audio files.
- **Global Analysis** — chat across your whole note library with interactive widgets
  (quizzes, flashcards, timelines, comparisons).
- **Multi-provider failover** — every AI call rotates across providers and skips any
  that are rate-limited (HTTP 429), using only free models.
- **Daily free-usage limit** — anonymous users get a configurable number of free AI
  actions per day, with a "limit reached" notice beyond that (quota resets daily).

## AI Providers (free models only)

Calls rotate in this order; a rate-limited or failing provider is transparently skipped:

| Order | Provider    | Text model                               | Vision / Audio                       |
|-------|-------------|------------------------------------------|--------------------------------------|
| 1     | Groq        | `llama-3.3-70b-versatile`                | Whisper (`whisper-large-v3-turbo`)   |
| 2     | NVIDIA NIM  | `meta/llama-3.3-70b-instruct`            | `meta/llama-3.2-90b-vision-instruct` |
| 3     | OpenRouter  | `meta-llama/llama-3.3-70b-instruct:free` | `llama-3.2-11b-vision:free`          |
| 4     | Gemini      | `gemini-2.0-flash`                       | `gemini-2.0-flash`                   |

Provider logic lives in [`api/_providers.ts`](api/_providers.ts). Override any model via
the env vars listed in [`.env.local`](.env.local).

## Usage limit

Enforced server-side in [`api/_usage.ts`](api/_usage.ts), with two layers chosen
automatically per request:

1. **Authenticated (preferred).** The browser signs in with **Supabase anonymous
   auth**, getting a real `auth.users` uuid. Its JWT is sent on every API call; the
   backend verifies it and enforces the limit via the project's `increment_usage` /
   `get_user_limits` RPCs (the `user_limits` table — monthly windows, durable in Postgres).
2. **Anonymous fallback.** If anonymous auth is disabled or unavailable, the app
   falls back to a simple per-browser daily counter (`usage_counters` table, or an
   in-memory map) so nothing breaks. Default fallback limit: `DAILY_FREE_LIMIT` (15/day).

The client mirrors status for the sidebar usage meter and shows a "limit reached"
notice. The quota resets automatically; paid plans/billing are not wired up.

> **To enable the authenticated path:** in the Supabase dashboard go to
> **Authentication → Sign In / Providers → Anonymous** and turn it on. Until then the
> app runs on the anonymous fallback.

### Bot protection (hCaptcha)

If you enable **CAPTCHA protection** on Supabase Auth (to stop bots farming anonymous
users to dodge limits), set `HCAPTCHA_SITE_KEY` in `.env.local` to your hCaptcha site
key and configure the matching secret in Supabase. The client solves an **invisible**
hCaptcha only when Supabase reports a captcha is required, then retries sign-in with the
token. The default site key is hCaptcha's always-pass test key.

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies: `npm install`
2. API keys are already set in [`.env.local`](.env.local). Edit it to use your own.
3. Run the app: `npm run dev`

A custom Vite plugin serves the `/api/*` serverless functions in dev, so the entire app
(including the AI backend) runs from a single `npm run dev` — no `vercel dev` needed.

## Optional: Supabase (cloud sync + durable limits)

Set `SUPABASE_URL` and `SUPABASE_KEY` in `.env.local`, then run
[`supabase_schema.sql`](supabase_schema.sql) in the Supabase SQL editor. This enables
cloud note/session sync and persistent daily usage counters.

## Deployment

Deploys as-is to Vercel (the `/api` functions are Vercel-compatible). Add the env vars
from `.env.local` to your Vercel project settings.
