# Plan: Store a Sample PDF and Serve It via the Documents API

## Top-Level Overview

The goal is to:
1. Place a real sample PDF file inside `assets/pdfs/`.
2. Register Express static-file middleware so `assets/pdfs/` is reachable at `http://localhost:8080/assets/pdfs/<filename>`.
3. Update the `url` field of every entry in the `_documents` array (in `controllers/document.controller.js`) to point at those local URLs instead of the external w3.org sample URLs.

After this work the frontend can call `GET /api/v1/documents` or `GET /api/v1/documents/:documentId`, receive a localhost URL, and open a real PDF without any external network dependency.

A secondary fix is included: the server currently logs that it binds to `0.0.0.0` (all interfaces). Per IBM security policy, a mock/dev server must bind to `127.0.0.1`. That is corrected in the same server.js change that adds static-file middleware.

---

## Sub-Tasks

---

### Sub-Task 1 — Add a sample PDF to `assets/pdfs/`

**Intent**
Provide a real PDF file that the mock server can serve. The file needs to exist on disk before the static-file route can deliver it. Because this is a mock server, a minimal, publicly-licensed sample PDF is sufficient; one file can stand in for all six document records (each record will just reference the same filename with a different logical name).

**Expected Outcomes**
- At least one PDF file exists at `assets/pdfs/sample.pdf`.
- The file is a valid, openable PDF (not a placeholder).

**Todo List**
1. Download or copy any freely-licensed sample PDF (e.g. the W3C WCAG PDF technique sample, or a generated minimal PDF) and save it as `assets/pdfs/sample.pdf`.
   - If more distinct files are desired, copy/rename to `assets/pdfs/terms.pdf`, `assets/pdfs/privacy.pdf`, etc. — one per document record.

**Relevant Context**
- `assets/pdfs/` already exists but is empty.
- The choice of one shared file vs. one file per document is a UI/realism trade-off; the plan defaults to one file per document record for realism.

**Status** — `[ ] pending`

---

### Sub-Task 2 — Register Express static-file middleware in `server.js`

**Intent**
Make the `assets/` directory publicly accessible over HTTP so that a URL like `http://localhost:8080/assets/pdfs/terms.pdf` resolves to the file on disk. Express's built-in `express.static` middleware handles this with no extra dependencies.

Additionally, fix the `0.0.0.0` binding issue in the `app.listen` call so the server only accepts connections from localhost (`127.0.0.1`), in compliance with IBM security policy (Network Security rule §3).

**Expected Outcomes**
- `GET http://localhost:8080/assets/pdfs/sample.pdf` (or each named file) returns the PDF with `Content-Type: application/pdf`.
- The server log no longer prints `http://0.0.0.0:${PORT}`; it prints `http://127.0.0.1:${PORT}`.

**Todo List**
1. In `server.js`, after the CORS middleware block and before the V2 API routes, add:
   ```
   app.use('/assets', express.static(path.join(__dirname, 'assets')))
   ```
2. In `server.js`, change the `app.listen` call from binding to no specific host (defaults to `0.0.0.0`) to explicitly bind to `'127.0.0.1'`:
   ```
   app.listen(PORT, '127.0.0.1', ...)
   ```
3. Update the log line inside the listen callback to print `http://127.0.0.1:${PORT}` instead of `http://0.0.0.0:${PORT}`.

**Relevant Context**
- `server.js` lines 44–74: middleware setup.
- `server.js` line 126: `app.listen(PORT, ...)` — add host argument here.
- `server.js` line 127: log line — update the URL string.
- No new npm packages required; `express.static` is built into Express.

**Status** — `[ ] pending`

---

### Sub-Task 3 — Update `_documents` URLs to point at local static files

**Intent**
Replace the external `https://www.w3.org/...` placeholder URLs in the `_documents` array with localhost URLs that resolve to the files added in Sub-Task 1. This makes `GET /api/v1/documents/:documentId` return a `url` the frontend can open without external network access.

**Expected Outcomes**
- Every `url` field in `_documents` is now a relative or localhost URL (e.g. `/assets/pdfs/terms.pdf` or `http://localhost:8080/assets/pdfs/terms.pdf`).
- `GET /api/v1/documents/doc_001` returns `"url": "/assets/pdfs/terms.pdf"` (or equivalent).
- The frontend can load the PDF from the mock server directly.

**Todo List**
1. For each of the six records in `controllers/document.controller.js` (`doc_001` through `doc_006`), replace the `url` value with the corresponding local path, for example:
   - `doc_001` (Terms of Service) → `/assets/pdfs/terms.pdf`
   - `doc_002` (Privacy & POPIA Policy) → `/assets/pdfs/privacy.pdf`
   - `doc_003` (Legal Advice Disclaimer) → `/assets/pdfs/disclaimer.pdf`
   - `doc_004` (Getting Started Guide) → `/assets/pdfs/getting-started.pdf`
   - `doc_005` (NDA Template) → `/assets/pdfs/nda-template.pdf`
   - `doc_006` (Shareholder Agreement Template) → `/assets/pdfs/shareholder-agreement.pdf`
2. Update `sizeKb` values to reflect the actual sizes of the placed files (optional but keeps the mock data accurate).
3. Update the file-header comment in `document.controller.js` to note that in production the `url` field would be a presigned cloud-storage URL, not a localhost path.

**Relevant Context**
- `controllers/document.controller.js` lines 19–80: the `_documents` array.
- The URL format should be a root-relative path (`/assets/pdfs/...`) so the frontend does not need to hardcode the host. The browser/PDF viewer will resolve it against the API origin.

**Status** — `[ ] pending`

---

### Sub-Task 4 — Update `MOCK_API_ENDPOINTS.md` documentation

**Intent**
Keep the API documentation in sync with the implementation. The endpoint descriptions should note that the `url` field now points to a locally-served static file.

**Expected Outcomes**
- `MOCK_API_ENDPOINTS.md` mentions that `url` is a root-relative path to `assets/pdfs/`.
- A note is added explaining that in production this would be a presigned cloud-storage URL.

**Todo List**
1. In `MOCK_API_ENDPOINTS.md`, find the DOC-001 and DOC-002 endpoint descriptions.
2. Add or update a note on the response shape to clarify that `url` is now served locally at `/assets/pdfs/<filename>` by the mock server.

**Relevant Context**
- `MOCK_API_ENDPOINTS.md` lines 1–55 (recently modified, contains DOC-001 and DOC-002 entries).

**Status** — `[ ] pending`

---

## Execution Order

```
Sub-Task 1 (add PDF files)
    ↓
Sub-Task 2 (add static middleware + fix binding)
    ↓
Sub-Task 3 (update document URLs)
    ↓
Sub-Task 4 (update docs)
```

Sub-Tasks 2, 3, and 4 can be batched into a single agent session once the PDF files are confirmed to exist on disk.
