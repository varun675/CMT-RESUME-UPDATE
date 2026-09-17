# Resume Builder CMT

A static, client-side app: upload a resume (PDF/DOCX), review the extracted fields, and export it in the CMT theme as a PDF. Everything — parsing and PDF generation — runs in the browser; nothing is uploaded to a server.

## Redaction policy

The generated PDF always redacts client-facing details automatically:
- Only the candidate's first name is shown.
- Phone and email are never printed (kept only in the review form for internal reference).
- Employer names are dropped; only the role title and an optional project name (entered during review) are shown per job.

## Local preview

This is a plain static site (no build step). Serve the folder with any static file server, for example:

```
npx serve .
```

Then open the printed local URL. Opening `index.html` directly via `file://` will not work because the browser blocks `fetch`/module-style loading for local files in some cases — always serve it over HTTP.

## AI-assisted parsing (optional)

Check "Use AI parsing (Claude)" and paste an Anthropic API key to have Claude extract the resume fields instead of the built-in heuristic parser — more accurate on resumes with unusual formatting.

**Security note**: the key is stored only in your own browser's `localStorage` and is sent directly from your browser to Anthropic's API — it is never committed to this repo or sent anywhere else. That said, GitHub Pages sites are publicly reachable regardless of whether the source repo is private (only GitHub Enterprise Cloud restricts a published Pages site itself), so anyone who finds this app's public URL sees the same static files — they just don't get *your* key, since it's never in those files. Only enable this on a copy of the app you consider fully personal, and be aware the key is visible in your own browser's network tab / devtools while you use it.

If the API call fails (bad key, rate limit, network issue) or the checkbox is left unchecked, parsing falls back to the built-in heuristic parser automatically.

## Deploying to GitHub Pages

This repo includes a GitHub Actions workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) that deploys automatically on every push to `main`.

1. Push this repository to GitHub.
2. In the repo settings, go to **Pages**.
3. Under "Build and deployment", set **Source** to **"GitHub Actions"**.
4. Push to `main` (or run the workflow manually from the **Actions** tab) — the "Deploy to GitHub Pages" workflow builds and publishes the site.
5. GitHub publishes the site at `https://<username>.github.io/<repo>/` within a minute or two; the workflow run shows the exact URL.

No build step is needed — the workflow just uploads the repo root (`index.html` and friends) as the Pages artifact.

## Updating the logo

Replace `assets/logo.png` with your own logo. If the file is missing, the resume falls back to a plain placeholder avatar automatically.
