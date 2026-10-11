# GradeStack

The mark book for bubble-sheet assessments. Build the sheet, mark the key, grade the stack.

GradeStack is a scantron-style grading app for classrooms: design a printable answer sheet with real fillable form fields, mark the answer key right on the sheet preview, then grade student responses — by photographing completed sheets, or by collecting digitally filled PDFs that grade instantly with no AI involved.

## What it does

- **Sheet builder** — assemble sections (single choice A–D / A–E, true–false, mark-all-that-apply, short answer), preview the printed sheet live, and mark the answer key directly on the bubbles.
- **Real PDFs** — exported sheets are genuine AcroForm PDFs: students can fill them in any PDF reader, or print and bubble by hand.
- **Two grading paths** —
  - *Digitally filled PDFs* grade locally, instantly, and offline (no API key needed).
  - *Photos and scanned sheets* are read with Gemini — bring your own key in Settings.
- **Review desk** — every read is inspectable: correct a student's name or ID, tap any question to fix its marked answer, and the score re-computes.
- **Register** — class averages, score distribution, hardest-item analysis, batch/period filtering, and a gradebook CSV export.
- **Your rules** — configurable A–D cutoffs, partial credit for multi-mark questions, dark "ink" theme, and full JSON backup/restore.

Works entirely offline: data lives in your browser, with optional Google sign-in to sync through Firebase.

## Run locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

### Optional environment

Create `.env.local` for the pieces you want:

```
# Gemini key for photo-based grading (or set it later in Settings)
GEMINI_API_KEY=your_key

# Firebase sync (optional — the app is fully functional without it)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Without either, everything still works: the builder, PDF export/import, local grading, review, analytics, and backups.

## Stack

Vite · React 19 · TypeScript · Tailwind CSS 4 · zustand (persisted) · pdf-lib · @google/genai · Firebase (optional) · motion

## The design

"Mark Book" — the app dressed like the institutional examination documents it produces. Paper surfaces with hairline borders instead of cards, Zilla Slab display type, Public Sans UI text, IBM Plex Mono for real data, a single mark-sense green, and the bubble as the signature control: circular choices that fill when marked.
