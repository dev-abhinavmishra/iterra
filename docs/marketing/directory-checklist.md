# Directory Submission Checklist — Iterra

Exact steps for each directory. Work top-to-bottom; most take 5–15
minutes. Have these ready before you start:

- [ ] Logo: `icon-512.png` (512×512 PNG)
- [ ] Screenshots: `og/home.png`, `og/tools.png`, `shots/*.webp`
- [ ] Short description (250 chars) — copy from `alternatives-and-directories.md`
- [ ] Long description — copy from `alternatives-and-directories.md`
- [ ] Website URL: https://iterrapp.vercel.app
- [ ] Category guesses: Education, Productivity, Note-Taking, Students
- [ ] Maker name / Twitter handle

---

## 1. Product Hunt (highest impact — do on launch day)

**URL:** https://www.producthunt.com/posts/new

Steps:
1. Click "Submit" → "New product"
2. Fill in: name (Iterra), tagline, topics (Education, Productivity, Notes), pricing (Free), links
3. Upload gallery images in order: home → tools → key tools → screenshots
4. Write the description (from `product-hunt.md`)
5. Schedule for Tuesday–Thursday 12:01 AM PST
6. On launch day: post first comment immediately, engage all day

**Time:** 30 min setup + all-day engagement

---

## 2. AlternativeTo (high SEO value)

**URL:** https://alternativeto.net → click "Add application"

Steps:
1. Sign in (free account required)
2. Fill in app details: name, URL, platforms (Web), license (Free), tags
3. Paste short + long description from `alternatives-and-directories.md`
4. Add screenshots (use `og/*.png` cards or `shots/*.webp`)
5. **Add alternatives**: Notion, Quizlet, Anki, Google Keep, Todoist,
   Structured, Motion, MyStudyLife, StudySmarter, RemNote
6. Submit for review (usually approved within 24–48h)

**Time:** 15 min

---

## 3. SaaSHub (good for "alternatives" searches)

**URL:** https://www.saashub.com → "Submit software"

Steps:
1. Click "Submit" → "Submit software"
2. Fill in: name, URL, category (Education/Productivity), pricing (Free)
3. Paste description from `alternatives-and-directories.md`
4. Add logo + screenshots
5. Submit (review is usually fast)

**Time:** 10 min

---

## 4. StackShare (developer/student audience)

**URL:** https://stackshare.io → "Add tool"

Steps:
1. Sign in with GitHub/Google
2. Add new tool: name, tagline, URL, description
3. Select categories: Education, Productivity
4. Add pricing: Free
5. Submit

**Time:** 10 min

---

## 5. BetaList (early-adopter audience)

**URL:** https://betalist.com → "Submit"

Steps:
1. Sign in
2. Submit startup: name, tagline, description, logo, screenshots
3. BetaList is more selective — emphasize "free," "students," "local-first"
4. They may ask for a longer description or founding story

**Time:** 15 min

---

## 6. Uneed (curated discovery)

**URL:** https://www.uneed.best → "Submit"

Steps:
1. Sign in
2. Submit product with name, tagline, description, images
3. They curate heavily — make the "why now" clear (local-first + student
   pain point)

**Time:** 10 min

---

## 7. MicroLaunch (smaller but easy)

**URL:** https://microlaunch.net → "Submit"

Steps:
1. Sign in
2. Submit with basic info + screenshots
3. Less selective than BetaList/Uneed

**Time:** 5 min

---

## 8. Google Search Console (SEO foundation)

**URL:** https://search.google.com/search-console

Steps:
1. Add property: `iterrapp.vercel.app`
2. Verify via HTML meta tag (already in `shell/index.html`? check) or DNS
3. Submit `sitemap.xml`: https://iterrapp.vercel.app/sitemap.xml
4. Use URL Inspection → Request Indexing for `/`, `/tools`, `/guides`

**Time:** 10 min

---

## 9. Bing Webmaster Tools (powers DuckDuckGo/Ecosia)

**URL:** https://www.bing.com/webmasters

Steps:
1. Sign in with Microsoft account
2. Add site: `iterrapp.vercel.app`
3. Verify (XML file already in `public/BingSiteAuth.xml`? check)
4. Submit sitemap

**Time:** 5 min

---

## 10. GitHub repo (if public)

If the repo is public, ensure the README has:
- Project name + one-line description
- Keywords: study, productivity, local-first, flashcards, notes, planner
- Links to live site + docs
- License file

GitHub repos rank well and drive developer/student discovery.

**Time:** 15 min (if not already done)

---

## Post-submission tracking

Keep a simple spreadsheet or note:

| Directory | Submitted | Approved | Live URL | Notes |
|-----------|-----------|----------|----------|-------|
| Product Hunt | | | | |
| AlternativeTo | | | | |
| SaaSHub | | | | |
| StackShare | | | | |
| BetaList | | | | |
| Uneed | | | | |
| MicroLaunch | | | | |
| Google SC | | | | |
| Bing WMT | | | | |

Check back in 1 week for approvals and fix any rejected listings.
