# Project memory

Handoff for the next coding agent. `Plan.md` is the spec. This file records what was built, which decisions differ from that spec, and what must stay put. Read this before editing CV, auth, storage, or LLM code. Do not start the next plan phase until the owner asks.

Last updated after Phase 1.7, commit `5fae480` on `master`.

## How to work

- Execute one Plan.md sub-phase, then stop. Mark that phase `**Status:** Done` only after its done-when list and the standard checks pass.
- Before writing Next.js code, read the matching guide in `node_modules/next/dist/docs/`. This is Next.js 16. Leave the generated block in `AGENTS.md` alone.
- Do not commit unless the owner asks. Do not commit `.env` or `.env.local`.
- Tests must not call the network or a real LLM. `bun test`, `bun run lint`, `bunx tsc --noEmit`, and `bun run build` are the standard gate.
- Pure modules must not import `server-only` or `next/*`. Repositories and `*-runtime.ts` wiring modules may.
- `server/domain` is types and interfaces. Repositories extend `MongoRepository`. Services take dependencies in the constructor.
- zod 4. Every CV property is required. Missing values are `.nullable()`, never omitted.
- No `any`, no non-null assertions, no LangChain, LlamaIndex, Vercel AI SDK, or OpenAI SDK. Approved runtime packages are `@vercel/blob` and `@opendocsg/pdf2md`. Ask before adding another.
- Admin form actions are `"use server"`, wrapped with `withAdmin`, with the state type in a separate `*-state.ts`. Forms use `useActionState`. The action signature is `(previous, formData)`.
- `bun:test` matchers are declared in `server/auth/bun-test.d.ts`. Use `try/catch` plus `instanceof` when that file has no sync `toBeInstanceOf`.
- The user's `next dev` on port 3000 is long-running. Do not start a second server. `next build` writes `.next` and can run beside it.
- There is no browser tool in this workspace. For UI changes, use the dev server with curl when possible and say which viewports were not checked.

## Commits on master

Newest first:

| Commit | What it is |
|---|---|
| `5fae480` | Phase 1.7. Public CV page. |
| `3a602a4` | Owner commit: admin CV editor UI fixes and Memory update. |
| `793184c` | Concurrent-write hardening for draft editing and publishing. Do not revert. |
| `e4163e3` | Phase 1.6. Admin review, edit, and publish. |
| `52fd236` | Phase 1.5. LLM extraction for uploaded drafts. |
| `1d6b269` | Upload callback and retry-safe draft registration. Do not revert. |
| `d1f3397` | Phase 1.4. Private PDF upload. |
| `8328b11` | CV entity keys and publication eligibility. Do not revert. |
| `1a0c12a` | Phase 1.3. CV data model and repository. |
| `dc81728` | Phase 1.2 marked done. |
| `8055e60` | Phase 1.2. OpenRouter client and local PDF-to-Markdown. |
| `c3396fe` | Phase 1.1. LLM env and admin nav. |
| `1676201` | Mongo project layer and admin projects page. |

Phases 1.1 through 1.7 are **Done** in `Plan.md`. The owner has not yet approved the 1.7 visual design (Plan.md §3 checkpoint). Phase 1.8 (CV download) has not been started.

## Environment

`.env.local` has `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, and `ADMIN_USERNAME`. It does not have `BLOB_READ_WRITE_TOKEN` or `OPENROUTER_API_KEY`. Without the blob token the upload form stays hidden. Without a valid OpenRouter key, extraction cannot run. Do not run `vercel env pull` unless the owner asks. Restart the dev server after those values change.

During Phase 1.6 new MongoDB clients failed the Atlas TLS handshake. By Phase 1.7 the dev server reached Atlas and a published CV ("LWIN MAUNG MAUNG — Lead Software & AI Engineer") rendered on `/`. Its origin (owner upload vs. extraction) was not verified by an agent. Do not invent live results you did not observe.

## Architecture that must stay

- `proxy.ts` only redirects `/admin` and `/admin/:path*`. It must not import `server-only`, Mongo, or the rate limiter. `requireAdmin()` is the real gate for pages and server actions.
- Admin session cookie is `admin_session`: HS256 JWT, `sub` `admin`, issuer `portfolio`, audience `admin`. Public visitors use `public_session`. The two cookies are not interchangeable.
- `cookies().set` is not allowed during Server Component render.
- Transactions need a replica set. Call `ensureReady()` before `runTransaction`. `create` and `publish` must not build indexes inside the transaction.
- Dates are stored as BSON dates and returned as ISO strings.
- Public session keys live in an HttpOnly cookie. New session rows are created only by `GET /api/public/session/issue`, behind issuance limits.

## OpenRouter and models

Do not switch model slugs. Defaults:

- `LLM_PDF_ENGINE=pdf-to-md`
- `LLM_UTILITY_MODEL=nvidia/nemotron-3.5-lightning`
- `LLM_EXTRACT_MODEL=deepseek/deepseek-v4.1-flash` (structured output, text and image input; extraction sends Markdown, not a native PDF)
- `LLM_ANSWER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free` (does not list `structured_outputs`; do not silently replace it)

`getLlm()` is server-only and throws `LlmConfigError` when `readLlmEnv()` is null. Call it inside the operation, not at module init, or `/admin/cv` crashes when the key is missing. Callers pass `pdfEngine` on each chat request. The shared client keeps its 60 second per-attempt timeout and 2 retries. An aborted outer signal is not retried.

`pdf-to-md` converts a PDF data URL locally and omits OpenRouter's file-parser plugin. Empty or image-only PDFs fail. `cloudflare-ai` and `mistral-ocr` are the OCR modes. Local conversion does not observe the abort signal until it returns, so a very slow conversion can overrun the extraction budget before the HTTP call starts.

## CV data

- `CvExtractionSchema` has no ids. `CvDataSchema` adds a string `id` on each section item, not on profile links.
- `assignIds` makes deterministic kebab-case slugs and suffixes duplicates with `-2`, `-3`. `ensureIds` fills blank ids and rejects duplicate existing ids.
- Entity keys: `profile`, `experience:<id>`, `project:<id>`, `education:<id>`, `skills:<id>`, `certification:<id>`, `language:<id>`, `other:<id>`.
- `renderCvMarkdown` must contain each entity rendering as an exact substring.

## Upload and registration

- Browser upload goes to a private blob at `cv/<name>-<suffix>.pdf` through `POST /api/admin/cv/upload`. Limits are `application/pdf` and 10 MB, with `addRandomSuffix`.
- `onUploadCompleted` does not run on localhost. The database write is `registerCvUploadAction`, which calls `requireAdmin()` itself and takes one object argument. Do not wrap that action in `withAdmin`.
- `registerUpload` is idempotent. `findByPdfPathname` returns the original upload, and a duplicate-key or `UnknownTransactionCommitResult` error recovers by reading that upload again.
- The unique key for that recovery is `uploadPathname`, not `pdf.pathname`. Original uploads set `uploadPathname` to the blob path. See the publish section for why the path itself is not unique.

## Extraction (Phase 1.5)

- `CvService` constructor order is repository, blob store, extractor, transaction runner, clock, then optional publish listeners.
- `LlmCvExtractor` is pure. It sends the PDF as a data URL, asks for schema `cv_extraction`, temperature 0, max tokens 8000, parses JSON, and repairs once. Both calls share one 45 second `AbortSignal` (`CV_EXTRACTION_BUDGET_MS`). A blank provider model falls back to the configured model inside the extractor. A blank model after trim becomes `InvalidCvError` in the service before `saveData`.
- `/admin/cv` sets `maxDuration = 60`. That covers the page's server actions and `after()`.
- `registerCvUploadAction` schedules `runExtraction` with `after()` only when the saved draft is `pending` or `failed`. The `after` callback must be `async` and return its promise. Success copy is "CV draft saved. Extraction is starting."
- `rerunExtractionAction` is `(previous, formData)` with a hidden `versionId`, wrapped in `withAdmin`. It awaits extraction instead of using `after()`, so the button stays pending until the outcome.
- `runExtraction` allows `pending`, `failed`, or `running` for at least 5 minutes. A fresh `running` extraction, a `succeeded` extraction, and any non-draft are rejected before any write. Stored errors are at most 500 Unicode code points.
- The list polls every 3 seconds only while `isExtractionInProgress` is true. A stalled run stops polling and shows "Extraction stalled. Retry it." Use the helpers in `cv-service.ts`. Do not copy the 5-minute rule into the page.
- The PDF file part in `server/cv/cv-extractor.ts` is a real `data:application/pdf;base64,...` URL. A reader may redact that prefix. Do not "fix" it back to a placeholder.

## Review and publish (Phase 1.6)

- Editor route: `app/admin/(panel)/cv/[versionId]/page.tsx`. PDF route: `app/api/admin/cv/[versionId]/pdf/route.ts`. The PDF route uses `readSession()` and returns 401 when signed out. It streams the private blob inline.
- Drafts with data are editable. Published and archived versions are read-only. String lists are one item per line and blank lines are dropped on save. Array items can be added, removed, and reordered. Raw JSON is validated on save and when switching back to the form.
- `saveDraft` parses with `CvDataSchema`, compacts list lines, runs `ensureIds`, and writes with `saveData`. It rejects non-drafts and refuses to edit while extraction is pending or freshly running.
- `publish` requires a draft whose extraction succeeded and whose data is present. It calls `ensureReady()`, then `publish` inside `runTransaction`. The repository archives the current published row first. The partial unique index on `{ status: 1 }` where status is `published` allows only one published version.
- Publish uses the last saved draft, not unsaved keystrokes. The page says to save first. The publish button asks for confirmation. After success the action calls `revalidatePath("/")`, `revalidatePath("/admin/cv")`, and `revalidatePath("/admin/cv/<id>")`.
- `CvPublishedListener.onCvPublished` runs after a successful publish. Listener errors are logged and not thrown. The runtime registers no listeners.
- `duplicateAsDraft` copies any version that already has CV data into a new draft with extraction `succeeded`, the same PDF metadata, and the same blob path. Versions with null data are rejected. The button is shown for published and archived versions.
- Because copies share `pdf.pathname`, that field is indexed but not unique. `ensureReady` drops the older unique `pdf.pathname` index when it finds one, backfills missing `uploadPathname` from the blob path, and creates a partial unique index on `uploadPathname`. Copies set `uploadPathname` to `copy:<uuid>` so a later backfill cannot collide with the original upload.
- `deleteDraft` deletes the draft row, then deletes the blob only when `countByPdfPathname` is zero. If blob deletion throws, the error is logged and the draft stays deleted. The delete button asks for confirmation.
- Filename links on `/admin/cv` open the editor. The version page also shows retry and the 3-second refresh while extraction is still in progress.

## Public CV page (Phase 1.7)

- `/` (`app/(public)/page.tsx`) server-renders the published CV via `getPublishedCv()` in `cv-runtime` (`cache` + `connection()`), shared by the page and `generateMetadata`. It returns null when the database is not configured, so the page shows "CV coming soon" instead of failing. `CvService.getPublishedData()` returns the published version's data or null.
- The CV name is the page's only `<h1>`. The page renders the CV only; the scaffold "side projects" list was removed (see "Scaffold removal" below).
- Components live in `app/(public)/_components/cv/`, one per section, composed in page order by `cv-document.tsx`. Pure helpers with tests: `cv-format.ts` (dates, safe links, truncation), `cv-sections.ts` (section registry, anchors), `cv-seo.ts` (title/description, Person JSON-LD). Shared class names are in `cv-styles.ts`.
- Anchors are public URLs used by Phase 2 citations. Header is `id="profile"`, summary `summary`, sections `experience`, `projects`, `skills`, `education`, `certifications`, `languages`, `other`. Items are `<section>-<itemId>`. Use `anchorForEntityKey(entityKey)` (e.g. `project:x` → `projects-x`); do not rebuild the mapping elsewhere. `CV_LIST_SECTIONS` declaration order is the nav order; keep `cv-document.tsx` in the same order.
- Only `http(s)` URLs (bare hosts get `https://`) and plain email addresses become hrefs. CV data comes from an LLM and admin edits; keep going through `safeWebUrl` / `mailtoHref`. External links use `target="_blank" rel="noopener noreferrer"`.
- The phone number is intentionally not rendered (plan lists email and links only). Ask the owner before adding it.
- JSON-LD `Person` (name, jobTitle, sameAs) is serialized with `<` escaped to `<`.
- `globals.css` defines `--accent` / `--accent-foreground` for light and dark, exposed as Tailwind `accent` colors. Body uses `var(--font-sans)`. Smooth scroll only under `prefers-reduced-motion: no-preference`. The print sheet forces black on white; `print:hidden` hides the nav and Download button; `[data-cv-item]` avoids page breaks inside an entry.
- Desktop (≥ lg) sticky nav with `IntersectionObserver` scroll-spy (`use-scroll-spy.ts`); hidden on mobile.
- `app/(public)/error.tsx` catches database failures on the public page.
- Root layout metadata defaults are "Portfolio" / "CV.".
- Verified with curl only (anchors, metadata, JSON-LD, nav). Not visually checked at 375 px / 1440 px or in dark mode.
- The Download CV button links to `/cv/download`, which 404s until Phase 1.8.

## Scaffold removal

- The example "project" slice from `1676201` is gone: `server/domain/project.ts`, `project-repository.ts`, `project-service.ts`, `/api/public/projects[/id]`, `client/api/projects.ts`, `client/query/project-queries.ts`, `app/project-list.tsx`, the admin create-project form/state/action, and the `side-projects` anchor. The `projects` Mongo collection is no longer read or written (existing rows were left in the database).
- `/admin` redirects to `/admin/cv`; the admin nav no longer has "Projects".
- Kept as shared infrastructure: `MongoRepository`, `server/db/*`, the public-session flow (`withPublicSession`, `/api/public/session[/issue]`, the public layout's issue redirect), `client/api/public-http.ts` (`getPublicJson`) and the `client/query` provider. Phase 2 chat builds on these. The home page no longer reads `?session=` or session presence; re-add that when a public client component needs it.
- Plan.md §0.1 reference column now points at CV and public-session code.

## Do not redo or undo

- Do not revert `8328b11`, `1d6b269`, `52fd236`, `e4163e3`, `793184c`, or `5fae480`.
- Do not put `maxDuration` on the admin layout. It would also cover every other admin action.
- Do not call `getLlm()` at module scope.
- Do not change OpenRouter retry or timeout defaults to fit extraction. The 45 second deadline is local to `LlmCvExtractor`.
- Do not add `serverExternalPackages` unless a build failure requires it.
- Phase 1.8 owns `GET /cv/download` and `CvService.openPublishedPdf()`. Leave it alone until the owner asks.
