# Project memory

Handoff for the next coding agent. `Plan.md` is the spec. This file records what was built, which decisions differ from that spec, and what must stay put. Read this before editing CV, auth, storage, or LLM code. Do not start the next plan phase until the owner asks.

Last updated after Phase 4.5 (draft card in the chat UI) on `master`, after 4.4, 4.2a, 4.3, 4.2, 4.1, 2.14 steps 3–9, 2.14a and 2.14 steps 1–2.

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
| (next) | Phase 5 plan in Plan.md, and Phase 5.1: `robotMood`, `lastScope`, `ROBOT_MOODS`, `ROBOT_NAME` in `app/(public)/_components/robot/robot-mood.ts`. Done (no UI). |
| `eba6edc` | Phase 4.5. Draft card under the answer (`chat-email-draft.tsx`), `email_draft` guard, `postPublicJson`, `client/api/contact-email.ts`, draft states in the reducer and storage, `ownerFirstName`. Built, not browser-checked. |
| `857019f` | Phase 4.4. `POST /api/public/chat/email` (send or discard a draft), `ContactEmailService`, `EmailDraftStore` (atomic claim, marks, counts, stuck sweep) on the conversation repository, `EmailService.outbox()`. Built; the real-send done-when waits for the owner. |
| `e316ee3` | Phase 4.2a. `/admin/email` connects Gmail through OAuth routes; the refresh token moves from the env to `email_connections`; `EmailService`; the two email scripts removed; chat tools looked up per turn. Gmail connected by 2026-09-30. |
| `55b4ec8` | Phase 4.3. `send_email` draft tool, `runAnswerLoop`, `contact` scope, email drafts on conversations, `tool` trace stage and step. Built; the done-when waits on the email settings. |
| `58890ae` | Phase 4.2. `EmailSender` domain, `readEmailEnv`, MIME builder, `GmailEmailSender`, OAuth helpers, `email:token` and `email:test` scripts (the scripts were removed in 4.2a). Built. |
| `557bbe4` | Phase 4.1. Tools, tool choice, tool messages and streamed `tool_call` events in `OpenRouterClient`. Done; live-checked on `z-ai/glm-5.3-flash`. |
| `03a5e16` | Phase 2.14 steps 3–9. `DecisionScopeRouter`, `scopeRouter` / `minRouteConfidence`, `route` stage, trace panel, public step, playground fields, eval scope columns; router default `typesafe/jev-1.13`. Built, not browser-checked. |
| `03a5e16` | Phase 2.14a. Small talk gets the fixed `smalltalkReply` (no answer-model call) and, like off topic, stops retrieval after `rewrite`. Built, not live-checked. |
| `26fa3fa` | Phase 2.14 steps 1–2. `OpenRouterClient.decide` (Decisions API), `LLM_ROUTER_MODEL`, route question and cutoff rule, `scripts/probe-scope-router.ts`. Probe: no-go for `respan/span-01-lite:free`; waiting on the owner. |
| (next) | Phase 2.10d. `dropBelowMeanRerank` config toggle (default on): the filter also drops reranked hits below the turn's mean rerank score. Built, not live-checked. |
| (next) | Phase 2.10c. `ignoreSubjectInRerank` config toggle (default on): the subject's name is removed from the rerank query and candidate texts. Built, not live-checked. |
| (next) | Phase 2.10b. `ignoreSubjectInLexical` config toggle (default on): BM25 drops the published name's terms from queries. Built, not live-checked. |
| (next) | Phase 2.10a. Saved chat retrieval config (`rag_settings`, `RagSettingsService`), "Use for chat" in the playground, no-information reply, eval preset `chat`. Built, not live-checked. |
| `10a47f8` | Phase 3.5. Steps panel in the chat (`chat-activity.tsx`, `chat-step-detail.tsx`, `chat-steps-text.ts`). Built, not browser-checked. |
| `c6036c8` | Phase 3.4. Client step guards (`client/api/chat-steps.ts`), steps and reasoning on `AssistantEntry`, stored in `sessionStorage`. |
| `55befe4` | Phase 3.3. `ChatService` streams `step` and `reasoning` events (`EventChannel`), reasoning saved on the trace's `generate` stage. |
| `c4fa917` | Owner: answer Markdown rendering (`chat-markdown.ts`, split out of `chat-text.ts`). |
| `386739a` | Phase 3.2. `TraceObserver` on the recorder and pipeline, public `ChatStep` types and events, `chat-steps.ts` projection. |
| `6d8b82e` | Phase 3.1. OpenRouter `reasoning` request field and stream events, `LLM_ANSWER_REASONING`, reasoning off for utility calls. |
| `1bca9f1` | Phase 2.10. Chat widget on `/`, `streamChat`, `postPublicStream`. |
| `a0e6c32` | Phase 2.9. `ChatService`, answer prompt, citations, conversations, `POST /api/public/chat`. |
| `ddafbbb` | Phase 2.8. Golden set, retrieval metrics, `RetrievalEvaluator`, `scripts/rag-eval.ts`. |
| `e91daff` | Phase 2.7. `TraceRecorder`, `RetrievalPipeline`, trace reader, `/admin/rag/playground`. |
| `800eff7` | Phase 2.6. `reciprocalRankFusion`, `ApiReranker`, `PassthroughReranker`. |
| `95be32f` | Owner commit: AGENTS.md rewrite (project map, gate) and the Plan.md §0.2 AGENTS.md check. |
| `7a77cbb` | Phase 2.5. `LlmQueryRewriter`, `ChatTurn`, shared `unwrapJsonFence`. |
| `fd0299b` | Phase 2.4. Text analyzer, BM25, vector index, `InMemoryRetriever`. |
| `3d401b6` | Phase 2.3. Contextualizers, index builder, `RagIndexService`, `/admin/rag`. |
| `0d681f8` | Phase 2.2. `CvCorpusSource`, structured and token-window chunkers. |
| `ec21fd3` | Phase 2.1. RAG domain types, retrieval config, RAG repositories. |
| `312381e` | Phase 1.8. Public CV download. |
| `8dd619d` | Phase 1.7a. Project detail pages; `details` on CV projects. |
| `b7e2c3f` | Removed the scaffold project slice from `1676201`. |
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

Phases 1.1 through 1.8 (including 1.7a) and 2.1 through 2.7 are **Done** in `Plan.md`. Phases 2.8, 2.9 and 2.10 are built but not marked Done: their live checks need an active RAG index, and the database has none. The owner asked for 2.9 and 2.10 before the 2.8 checkpoint (golden questions, eval run, default presets). The owner has not yet approved the 1.7 visual design (Plan.md §3 checkpoint). By 2026-09-29 the owner had an active index (a chat turn showed its steps), but no agent has rerun the 2.8–2.10 checks. Phase 2.10a (chat retrieval settings) is built but not Done: its done-when needs the playground in a browser, a live chat turn and a paid eval run. Phase 2.10b (subject name out of BM25) is built but not Done for the same reason (playground in a browser, paid eval run). Next: those checks, then Phase 2.11.

Phase 2.14 (scope routing) is built, not Done: the owner chose `typesafe/jev-1.13` after Respan failed the probe, Jev passed, and steps 3–9 are in. Its done-when still needs the playground in a browser and a chat turn with `scopeRouter: "decision"` saved through "Use for chat", which only the owner should do. The owner's `.env.local` still names Respan as router model (see the Phase 2.14 section). Phase 2.14a (fixed small-talk reply, owner's request) is built, not Done: its done-when needs a live chat turn.

Phases 3.1 through 3.4 are **Done**. The owner started Phase 3 (visible chat workflow) before the 2.x checkpoints. Phase 3.5 (workflow UI) is built but not marked Done: its done-when needs a browser (live steps, reload, 375 px and 1440 px, dark mode, keyboard only). Next: that browser check.

Phase 4.1 (tool calling in the LLM client) is **Done**. The owner asked for 4.2 without a separate answer on the 4.1 checkpoint, and the Gmail API plan was built as written. Phase 4.2 (Gmail sender) is built. On 2026-09-29 the owner chose to keep the Gmail API (not SMTP with an app password) but to connect Gmail from the admin UI, so Phase 4.2a replaced the token script and carries the done-when: a Google OAuth client (Web application, redirect URI `<origin>/api/admin/email/callback`, Gmail API on, publishing status In production), the values in `.env.local` and Vercel, then **Connect Gmail** and **Send test email** on `/admin/email`. By 2026-09-30 the owner had connected Gmail. Phase 4.3 (tools in the chat turn) is **Done**: the owner tested it and reported that it works. Phase 4.4 (send endpoint) is built. Its done-when needs the owner: send a real draft with curl, see it arrive, and see a second Send do nothing. Phase 4.5 (draft card) is built but not browser-checked. Its done-when needs the owner in a browser: Send from the card, Discard, a second Send, 375 px and keyboard only. Next: those checks. Phase 4 has no further sub-phase in Plan.md.

Phase 5 (robot guide) was planned on 2026-09-30. The owner chose a cute mascot that greets visitors unprompted and points them to the projects. The owner left the build approach to the agent, which chose inline SVG with CSS keyframes and no new package. The owner asked for 5.1 without a separate answer on the 5.1 checkpoint, so the fixed decisions, the moods table and the name `Bit` stand as planned. Phase 5.1 (mood model, `app/(public)/_components/robot/robot-mood.ts`) is **Done**; it has no UI. Next: Phase 5.2 (the SVG robot and `/admin/robot`) when the owner asks.

## Environment

`.env.local` has `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `ADMIN_USERNAME`, the LLM variables, and (by Phase 1.8) `BLOB_READ_WRITE_TOKEN` and `OPENROUTER_API_KEY`. Whether the OpenRouter key is valid was not checked. Without the blob token the upload form stays hidden and `/cv/download` returns 500. Without a valid OpenRouter key, extraction cannot run. Do not run `vercel env pull` unless the owner asks. Restart the dev server after those values change.

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
- `LLM_ANSWER_REASONING=low` (`off` | `low` | `medium` | `high`)

Both Nemotron models reason by default, and OpenRouter's `max_tokens` includes reasoning tokens. A utility call without `reasoning: { enabled: false }` spends its whole budget thinking and returns blank text (see Phase 3.1).

`getLlm()` is server-only and throws `LlmConfigError` when `readLlmEnv()` is null. Call it inside the operation, not at module init, or `/admin/cv` crashes when the key is missing. Callers pass `pdfEngine` on each chat request. The shared client keeps its 60 second per-attempt timeout and 2 retries. An aborted outer signal is not retried.

Do not move the `getLlm()` cache back onto `globalThis`. A client shared across Next module graphs (or kept from before a hot reload) throws `LlmProviderError` from another copy of the class, so `AdaptiveChatClient`'s `instanceof` check fails and it never adapts. Fixed 2026-09-29: every public chat rewrite fell back on "Reasoning is mandatory" with `z-ai/glm-5.3-flash`, while the admin playground, running in a different module graph, rewrote fine.

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
- The Download CV button links to `/cv/download` (Phase 1.8).

## Project detail pages (Phase 1.7a)

- Projects are CV data only. `CvProject.details: string | null` holds the long write-up (blank line = new paragraph). It is in both zod schemas, the extraction prompt, `toProject`, and `renderCvMarkdown`, so the Phase 2 corpus sees it.
- Older stored versions have no `details`. `upgradeStoredCvData` (`server/cv/cv-legacy.ts`) fills `null` inside `MongoCvVersionRepository.toEntity`, and the document type is `StoredCvData`. Keep this while old versions exist. A later added CV field follows the same pattern. No Mongo write migration was done.
- `/projects/[projectId]` (`app/(public)/projects/[projectId]/page.tsx`) uses `getPublishedProject(id)` from `cv-runtime` and calls `notFound()` otherwise. Build internal links with `cvProjectPath(id)` from `cv-sections.ts`. The back link targets `/#projects-<id>`. Metadata comes from `projectPageMeta` in `cv-seo.ts`.
- The card title links to the project page, and the external URL is a separate "Visit ↗" link.
- Project ids are the page URLs. Extracted projects get name slugs. Projects added in the editor get `project-<uuid>`, so their URLs are uuid-style. Renaming a project does not change its id.
- The published CV had no projects when this shipped. The page was verified by rendering the components with the fixture. Curl confirmed a 404 with `noindex` for an unknown id, and that the pre-1.7a published CV still renders. No browser check at 375 px, 1440 px or in dark mode.

## CV download (Phase 1.8)

- `GET /cv/download` (`app/cv/download/route.ts`) is public and not behind `withPublicSession`. It calls `openPublishedCvPdf()` in `cv-runtime`, which returns null without a database, and then `CvService.openPublishedPdf()`, which returns `{ stream, size, filename, versionId }` or null. Null means 404. A thrown error is logged and becomes a 500.
- The filename is `cvDownloadFilename(fullName)` (`server/cv/cv-download.ts`): name words joined by `-`, then `-CV.pdf`, falling back to `CV.pdf`. Non-ASCII letters are kept. `attachmentDisposition` (`server/http/download-headers.ts`) sends an ASCII `filename` (accents stripped, other scripts dropped) plus an RFC 5987 `filename*`.
- `ETag` is `"<versionId>"`. Every publish, including a republished copy, has a new id, so the tag changes. `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=86400` is on both the 200 and the 304, so a new publish reaches visitors within 5 minutes.
- `If-None-Match` uses weak comparison (`ifNoneMatchIncludes`, `*` matches). A 304 still opens the blob once and then cancels the stream. That keeps the service shape the plan asks for. If blob reads become a cost, add a metadata-only lookup before opening.
- Verified with curl against the dev server and the live published CV: 200 with `%PDF-` body and `LWIN-MAUNG-MAUNG-CV.pdf`, 304 for strong and weak tags, 200 for a different tag. The 404 path was covered by unit tests only, because a CV is published. The browser save dialog was not checked.

## RAG domain and storage (Phase 2.1)

- Types and repository interfaces are in `server/domain/rag.ts`. `RetrievalConfig`, `RetrievalTrace` and `TraceStage` are declared there too, so the trace repository exists before Phase 2.7. `TraceStage.startedAt` is milliseconds from the trace start (`performance.now()` offsets), not a date.
- `server/rag/pipeline/retrieval-config.ts`: strict zod `RetrievalConfigSchema` (`satisfies z.ZodType<RetrievalConfig>`, so the schema and the domain type cannot drift), frozen `DEFAULT_RETRIEVAL_CONFIG`, `RETRIEVAL_PRESETS` and `isRetrievalPresetName`. Presets change only `rewrite`, `search` and `rerank`: `vector-only`, `lexical-only`, `hybrid` and `hybrid-rerank` use `rewrite: "none"`; `hybrid-rerank-rewrite` equals the default; `full` is multi + hybrid + rerank.
- Vector storage decision (owner discussion): embeddings live in Mongo `rag_chunks` as plain number arrays, searched in memory (2.4). Atlas Vector Search stays the optional 2.13 adapter. Its search index updates asynchronously, so a freshly activated index can briefly return incomplete results there.
- `rag_indexes`: `{ createdAt: -1 }` and a partial unique `{ active: 1 }` where `active: true`. `create` needs `sourceId`, so the 2.3 builder must load the corpus **before** creating the index (the plan lists create first). `markReady`/`markFailed` apply only while `state = "building"` and return null otherwise. `activate(id, tx)` checks the target in the session, throws `RagIndexNotFoundError` / `RagIndexStateError` before any write, then deactivates the others and activates the target only if `ready`. Call `ensureReady()` before the transaction. `delete` removes only an inactive index (the 2.3 service check is a second guard).
- `rag_chunks`: `indexId` is stored as an ObjectId, index `{ indexId: 1, ordinal: 1 }`. `insertMany` throws on a malformed index id and returns 0 for an empty batch. `listByIndex` sorts by `ordinal`.
- `rag_traces`: `_id` is the recorder's string trace id (so a chat message can reference it before the save). `{ createdAt: -1 }` plus a TTL index on `{ createdAt: 1 }`, 30 days (`RAG_TRACE_TTL_SECONDS`).
- `parseInstant` moved to `server/repositories/mongo-dates.ts` and is shared by the CV and RAG repositories.
- Repository tests are in `server/repositories/rag-repositories.test.ts` with a mocked collection, like the CV repository test. The collections were not created against the real database yet; nothing uses them until 2.3.

## Corpus source and chunkers (Phase 2.2)

- `CvCorpusSource` (`server/rag/corpus/cv-corpus-source.ts`) takes `Pick<CvVersionRepository, "findPublished">`, so a full repository still fits and tests pass a one-method fake. `sourceId` is the published version id, `title` is `cvCorpusTitle(profile)` (`"<fullName> — <headline>"`, or just the name), `markdown` is `renderCvMarkdown(data)`. Null when nothing is published or the version has no data.
- Both chunkers are pure `Chunker` strategies in `server/rag/chunking/` and return `ChunkDraft`s with 0-based consecutive `ordinal`s and `tokenCount = estimateTokens(text)` (`ceil(length / 4)`). 2.3 should key a `Record<ChunkerKind, Chunker>` with them.
- `section` is the entity key prefix (`profile`, `experience`, `project`, `education`, `skills`, `certification`, `language`, `other`), via `entitySection`. These are key prefixes, not the page anchor section names (`project` vs `projects`); use `anchorForEntityKey` for links.
- `StructuredCvChunker({ maxEntityTokens = 350, mergeSkillsMaxTokens = 200 })`. An unsplit chunk's text is exactly `renderCvEntity`. `title` is the entity's last heading (the full name for `profile`). Splitting is done on the rendered text by `entity-splitter.ts`: the heading blocks (`## Section` + `### Heading`, or `# Name`) repeat in every part; body blocks are units, list blocks (`Highlights:`, `Details:`, plain `- ` lists) split per item and repeat their label line in each part that continues them; a unit bigger than a part is cut on word boundaries. Parts are packed greedily, in order, each ≤ 350 tokens. This applies to all body blocks, not only highlights/details.
- Skills merge only when there are at least 2 groups and their renderings joined with a blank line (an exact substring of the markdown) are ≤ 200 tokens. The merged chunk is titled `Skills`, lists every skill key, and takes the first group's place. `mergeSkillsMaxTokens: null` disables merging.
- `TokenWindowChunker({ windowTokens = 200, overlapTokens = 40 })`. Windows are `markdown.slice` of whole words (whitespace and newlines kept), as many as fit (at least one word). The next window starts at the earliest word keeping the shared tail ≤ `overlapTokens`, always after the previous start. `entityKeys` are the entities whose span overlaps the window (half-open), in document order. Spans come from `locateEntitySpans`, which searches each `renderCvEntity` output forward from the previous match and throws `ChunkingError` (a `RagError`) when one is missing. The fixture gives 2 windows with the defaults.
- Options are validated in the constructors (`RangeError`). Test helpers `corpusDocumentFor`, `sampleCvWith`, `thrownBy` are in `server/rag/__fixtures__/sample-corpus.ts`.

## Contextualization, embedding and index building (Phase 2.3)

- `LlmContextualizer(chat, model, { concurrency = 4, timeoutMs = 20_000, onError })` (`server/rag/contextualize/`). The prompt is `buildContextMessages` in `context-prompt.ts`: one user message, part 1 `<document>…</document>` with `cacheControl: true`, part 2 the plan's instruction verbatim. `temperature: 0`, `maxTokens: 150`, and a per-chunk `AbortSignal.timeout`. A thrown or blank answer becomes `null` and calls `onError` (default `console.warn`). Concurrency uses `mapWithConcurrency` (`server/rag/map-with-concurrency.ts`), which keeps input order.
- `NoopContextualizer` returns nulls. `composeIndexText(context, text)` is `context + "\n\n" + text`, or `text`.
- `server/rag/embedding/`: `embedInBatches(client, model, texts, 64)` runs batches one after another and rejects wrong counts, mixed dimensions and non-finite numbers (`EmbeddingError`, a `RagError`). `l2Normalize` throws on a zero vector. Phase 2.4/2.7 should reuse both for query vectors.
- `UsageMeter` (`server/llm/usage-meter.ts`) wraps `ChatClient`/`EmbeddingClient` as decorators and sums usage. `costUsd` is null when no call reported a cost. Calls that report no cost add nothing, so the total can be low.
- `IndexConfigSchema`/`parseIndexConfig` (`server/rag/indexing/index-config.ts`) is strict. `contextModel` must be set exactly when `contextualize` is true. `defaultIndexConfig(env)` is structured + contextualized with `EMBEDDING_MODEL` / `LLM_UTILITY_MODEL`. `indexConfigFor(choice, env)` builds the admin's choice. `CHUNKER_KINDS`, `CHUNKER_LABELS` and `isChunkerKind` are in `chunker-kinds.ts`, which has no zod, so the client form can import it.
- `IndexBuilder` (`server/rag/indexing/index-builder.ts`) has two steps. `start(config)` parses the config and loads the corpus (`IndexBuildError` when nothing is published; nothing is written). Then it creates the `building` row and returns `{ index, run }`. `run()` (once only) chunks, contextualizes via the injected factory `(meteredChat, model) => Contextualizer`, embeds `indexText`, normalizes, `insertMany`, then `markReady`. On any error it calls `deleteByIndex` and `markFailed(message ≤ 500 code points)`, then rethrows. Cleanup errors are only logged. If `markReady` returns null (the index was deleted during the build), its chunks are deleted and the build throws.
- Stats: `chunks`; `tokens` = the sum of `estimateTokens(indexText)`; `durationMs` from before the corpus load to the end; `costUsd` from the meter; `contextFailures` = null contexts when contextualizing (added to `RagIndexStats`, 0 otherwise). `Chunk.tokenCount` stays the chunker's count of `text`.
- `RagIndexService` (`server/services/rag-index-service.ts`, pure): `list`, `get`, `getWithChunks`, `startBuild`, `build`, `activate` (`ensureReady` then the transaction), `buildAndActivate`, `delete`, and `onCvPublished` → `buildAndActivate(defaultConfig)`. `delete` refuses the active index and a build still in progress. It then deletes the row (the repository also refuses an active index) and the chunks. A build still `building` after 5 minutes counts as stalled (`isIndexBuildStalled`) and can be deleted. There is no retry; build again instead.
- `createRag(env, { llm, cvVersions, indexes, chunks, transaction, now? })` in `server/rag/rag-composition.ts` has no `server-only`, so scripts can use it. `server/rag/rag-runtime.ts` builds it lazily on first use, because `getLlm()` throws without a key. `isRagConfigured()` = database + valid LLM env.
- Publish hook: `ragPublishListener` (rag-runtime) is registered in `cv-runtime.ts`. It schedules `onCvPublished` with `after()` and logs errors, or warns and skips when RAG is not configured. `/admin/cv/[versionId]` now sets `maxDuration = 60` because publishing runs there. A failed build leaves the previous active index in place.
- `/admin/rag` (`maxDuration = 60`): shows setup text when RAG is not configured; otherwise the active-index summary, the build form (chunker select + contextualize checkbox, default on), and the index table. The table has created (links to the viewer), chunker, contextualize, embedding model, state/active badges plus the error, stall and context-failure notes, chunks, tokens, duration, cost, and Activate/Delete. `buildRagIndexAction` awaits `startRagIndexBuild` and then runs the job in `after()`. The page refreshes every 3 s while a build is in progress. `/admin/rag/[indexId]` lists every chunk: ordinal, title, section, entity keys, the context (amber callout), the text and the token count.
- The CV refresher moved to `app/admin/(panel)/_components/auto-refresh.tsx` as `AutoRefresh({ message })`. `formatWhen` moved to `_components/format-when.ts`. Both CV pages use them.
- Test fakes `MemoryRagIndexes`, `MemoryRagChunks` and `fakeTransaction` are in `server/rag/__fixtures__/memory-rag-repositories.ts`. `toBeCloseTo` was added to `bun-test.d.ts`.
- Not verified live: no CV was published and no index was built against Atlas or OpenRouter in this session (that needs an admin session and paid calls). Curl confirmed only that `/admin/rag` redirects to login when signed out. No browser check at 375 px / 1440 px or in dark mode.

## Lexical and vector search (Phase 2.4)

- Everything is pure and lives in `server/rag/search/`. `TextAnalyzer` and `Retriever` interfaces were added to `server/domain/rag.ts`. Phase 2.7 should depend on `Retriever`, not on the class.
- `EnglishTextAnalyzer`: NFKC, lowercase, the plan's token regex. Dotted tokens are also emitted as their parts (a stopword part such as `i` is dropped), then stopwords are removed and `lightStem` runs. `ENGLISH_STOPWORDS` (~130 words) deliberately leaves out `go`, `c`, `r`, `net` and `js`. It includes `it`, so "IT" is not searchable lexically.
- `lightStem` rules, in order, first match wins: `ies→y`, `es` only after `ss|x|ch|sh`, `s` (not after `s` or `u`), `ing`, `ed`. The part left after stripping must have at least 3 characters, or the next rule is tried. Tokens containing `.`, `+` or `#` are not stemmed. Known imperfect matches, which are accepted: `caches→cach` vs `cache`, `managed→manag` vs `manage`, `redis→redi` (query and document still agree).
- `Bm25Index(docs, analyzer, { k1 = 1.2, b = 0.75 })`: postings per term, deduplicated query terms, only documents with a score above 0, and ties kept in document order. `VectorIndex(items)`: equal dimensions are checked (`VectorDimensionError`), and both the stored vectors and the query are `l2Normalize`d, so a zero query vector throws `EmbeddingError`. An empty index returns `[]`. Both use `topRankedHits` (`ranked-hits.ts`) for 1-based ranks, and `k` must be a positive integer (`RangeError`).
- `InMemoryRetriever(chunks: Pick<RagChunkRepository, "listByIndex">, { analyzer, bm25, cache })` builds BM25 over `indexText` and the vector index over `embedding`. The cache is an `LruCache<string, Promise<LoadedSearchIndex>>` (capacity 3), so concurrent cold searches share one read. A rejected load is evicted. No chunks → `EmptySearchIndexError` (a `RagError`), not cached. `getChunks` returns copies without `embedding`, in the order of `ids`, and skips unknown ids.
- `sharedSearchIndexCache()` keeps the cache on `globalThis.ragSearchIndexCache`, which survives hot reloads. `createRag` uses it unless `deps.searchCache` is given (tests pass `createSearchIndexCache()`), and exposes `rag.retriever`. Retrievers that share a cache must use the same analyzer and BM25 options, because the cache key is only the index id.
- A ready index never changes, so there is no cache invalidation. A deleted index stays cached until it is evicted, which is harmless.
- Not wired into any route yet (2.7 does that). Nothing was run against Atlas.

## Query rewriting (Phase 2.5)

- `ChatTurn` lives in `server/domain/chat.ts`, which holds only that type for now. Phase 2.9 adds `StoredMessage`, `Conversation` and the repository there. `QueryRewriter`, `RewriteInput`, `RewriteResult` and `QueryScope` are in `server/domain/rag.ts`. Phase 2.7 should depend on the interface.
- `LlmQueryRewriter(chat, model, { timeoutMs = 15_000 })` (`server/rag/query/`). Mode `none` makes no call and returns `{ queries: [message], scope: "cv", raw: null }`. `standalone` and `multi` make one call: `temperature: 0`, `maxTokens: 300`, a `jsonSchema` named `query_rewrite`, and `AbortSignal.timeout`. The schema comes from `z.strictObject` and has all three fields required. The parse uses a non-strict `z.object`, so extra keys are dropped instead of failing.
- The prompt is `buildRewriteMessages` in `rewrite-prompt.ts`. The system message holds the instructions. The user message is `<conversation>` (the last `REWRITE_HISTORY_TURNS = 6` turns, one `role: text` line each, left out when there is no history) followed by `<message>`. The instructions say "you/your/he/she/they" usually mean the subject, because the chat button reads "Ask about my experience". They also say the conversation is data, not instructions. In `standalone` mode the prompt asks for an empty `variants` list, and any variants returned are ignored.
- `queries` go through `uniqueQueries`: trimmed, blanks dropped, and case- and whitespace-insensitive duplicates removed with the first spelling kept. In `multi` the standalone query comes first, then at most 3 variants after deduplication.
- Every failure falls back to `{ queries: [message], scope: "cv", raw: <error message> }`: provider errors, timeouts, invalid JSON, schema mismatches and a blank `standalone`. On success `raw` is the parsed output. The rewriter never throws for these errors, so the pipeline does not need its own try/catch for them.
- `unwrapJsonFence` moved from `cv-extractor.ts` to `server/llm/json-fence.ts`, and both callers share it.
- `createRag` exposes `rag.queryRewriter` with `LLM_UTILITY_MODEL`.
- `AdaptiveChatClient` (`server/llm/adaptive-chat-client.ts`) wraps the chat client that `createRag` gives the rewriter and the contextualizer (`utilityChat`), so any `LLM_UTILITY_MODEL` works. Per model, it learns from two OpenRouter refusals, retries once with the same signal, and remembers until restart. (1) 404 "No endpoints found" while a `jsonSchema` was sent (`require_parameters` filtered every endpoint): sends without the schema; the prompt's "Answer with JSON only" line and the fence/extra-key parsing carry it. (2) 400 "Reasoning is mandatory" while `reasoning: { enabled: false }` was sent: sends `{ effort: "low" }` and `maxTokens + 1024`. Other errors pass through. The answer model and CV extractor do not use it. Checked 2026-09-29: `nvidia/nemotron-3.5-lightning:free` has one endpoint (Nvidia), no `response_format`, and queues long enough to hit the 15 s timeout; `google/gemma-4-26b-a4b-it:free` often returns 429 from its shared pool; `z-ai/glm-5.3-flash` refuses reasoning off and rewrites in 1.6-3.9 s at low effort.

## Fusion and reranking (Phase 2.6)

- Types are in `server/domain/rag.ts`: `NamedHitList`, `FusedHit`, `RerankCandidate`, `RerankedHit`, `RerankOutcome` and the `Reranker` interface. Phase 2.7 should depend on `Reranker`, not on the classes.
- `reciprocalRankFusion(lists, k)` (`server/rag/fusion/`) is pure. It uses each hit's `rank` field, not its position. `score = Σ 1/(k + rank)`, summed in ascending rank order so equal rank sets give bit-identical scores. Ties go to the best single rank, then the smaller chunk id (code-unit order, not `localeCompare`). A chunk repeated inside one list counts once, at its first rank. `contributions` are in list order. It returns every fused chunk; cutting to `fusedLimit` is the pipeline's job. `k` and ranks must be positive integers (`RangeError`).
- `Reranker.rerank(query, candidates, topN)` returns `{ hits, fallback, error }` rather than the plan's bare array, so the trace gets the fallback flag and reason. Candidate `text` should be the chunk's `indexText`.
- `PassthroughReranker` keeps the input order with `score = 1 / rank`. `passthroughHits` and `assertTopN` are shared with the API reranker.
- `ApiReranker(client, model, { timeoutMs = 15_000 })` sends `min(topN, candidates)` as `topN`, maps indices back, sorts by score (ties keep candidate order) and cuts to `topN`. It does not rely on the client's sorting. An out-of-range or repeated index is a `RerankError` (a `RagError`). Provider errors, timeouts and those errors all fall back to passthrough with `fallback: true` and the message in `error`. No candidates means no call. An invalid `topN` still throws, because it is a programming error.
- Fallback scores are `1 / rank`, so the 2.7 `minRerankScore` filter also applies to them. Decide there whether to skip the filter on fallback.
- `RerankClient.rerank` takes an optional `signal`. `OpenRouterClient` now passes it to `execute`, like `complete`. Its 60 s per-attempt timeout and retries are unchanged.
- `createRag` needs `llm: ChatClient & EmbeddingClient & RerankClient` (the OpenRouter client is all three) and exposes `rag.reranker` with `RERANK_MODEL`. Not run against OpenRouter. Whether `nvidia/llama-nemotron-rerank-vl-1b-v2:free` returns scores in 0..1 (what `minRerankScore` assumes) has not been checked.

## Retrieval pipeline, tracing and playground (Phase 2.7)

- `RetrievalRunner`, `RetrievalRequest` (with the trace `kind`), `RetrievalResult`, `RetrievedChunk`, `TraceSource`, `RetrievalError` and `NoActiveRagIndexError` are in `server/domain/rag.ts`. 2.8 and 2.9 should depend on `RetrievalRunner`; `createRag` exposes it as `rag.pipeline`.
- `RetrievalTrace.sources` is new (final `S#` chunks with title, section, entity keys, context, text, fused and rerank scores). The trace repository stores it; no traces existed before, so there is no legacy fallback.
- `TraceRecorder` (`server/rag/pipeline/trace-recorder.ts`): `stage(name, input, fn, summarize?)` reserves the stage's slot when it starts (start order, even if stages overlap), records `startedAt` relative to the trace start, and on failure stores the message and rethrows. `clock`, `now` and `id` are injectable. `toTrace(sources)` copies everything.
- `RetrievalPipeline` (`server/rag/pipeline/retrieval-pipeline.ts`) resolves `indexId` or the active index first (`RagIndexNotFoundError`, `NoActiveRagIndexError`, `RagIndexStateError` for a non-ready index; no trace exists yet). Stages: `rewrite`, `embed-queries` (one `embedInBatches` call with the **index's** `embeddingModel`), `vector-search`, `lexical-search` (per query in parallel), `fuse` (lists `vector:qN`, `bm25:qN`, cut to `fusedLimit`), `rerank` (query `queries[0]`, candidate text `indexText`, `topN = finalK`), `filter` (`rerankScore < minRerankScore` dropped). Skipped stages are not recorded. Off-topic stops after `rewrite`; smalltalk still retrieves.
- Rerank fallback decision (left open by 2.6): on fallback `rerankScore` is null and `filter` does not run, since `1 / rank` is not relevance. The filter otherwise assumes rerank scores in 0..1; with the default 0 a model returning negative logits would drop everything. Check the real scores in the playground before 2.9.
- Chunk details are fetched once per id with `retriever.getChunks` and carried into every traced hit (title, section, entity keys), so traces read without the index. A hit whose chunk is missing throws `UnknownChunkError`.
- Any failure inside a stage becomes `RetrievalError` with `trace` (partial, `sources: []`) and `stage` (last stage with an error). It is not a `RagError`: callers show the trace, not a provider message.
- Stage output schemas are in `trace-stages.ts` (the pipeline builds those types). `readTrace` (`trace-reader.ts`) turns a stored trace into a `TraceView` with a typed `detail` per stage; failed, unknown or unparseable stages become `{ kind: "raw", input, output }` JSON strings. 2.9's `generate` stage will show as raw until 2.11 adds a panel.
- `retrieval-config-fields.ts` holds the config's modes, number bounds and labels without zod; `RetrievalConfigSchema` is built from it. Client code imports that module, never `retrieval-config.ts` (except `import type`). The built playground chunk was checked to contain no zod.
- `RetrievalPlaygroundService` (`server/services/`) takes the subject name from the published CV's `profile.fullName` (`PlaygroundSubjectError` otherwise), runs with kind `playground`, saves the trace even when a stage failed, and returns `{ trace, error, saved }`. A save failure is logged and the run is still shown. `createRag` now needs `deps.traces` and exposes `rag.playground`; the runtime passes `MongoRagTraceRepository` and exports `runRetrievalPlayground`.
- `/admin/rag/playground` (`maxDuration = 60`): ready indexes only (default: `?index=<id>`, else the active one, else the newest), question (≤ 500 chars), optional history (`user:`/`assistant:` lines, parsed by `playground-input.ts`), preset select (shows "Custom" after an edit via `matchingPreset`), every config field, Cmd/Ctrl+Enter to run. Inputs are controlled so values survive the post-action form reset. The action returns `readTrace(trace)` in its state and renders `TraceView` below the form. Links: "Open the retrieval playground" on `/admin/rag`, "Test retrieval on this index" on a ready index's page.
- Trace UI lives in `app/admin/(panel)/rag/_components/` (`trace-view`, `trace-stage-panel`, `trace-timing`, `trace-format`). No hooks or `"use client"`, so 2.11's server pages can reuse them.
- The embedding call in `embed-queries` has no timeout of its own (the client's 60 s per attempt and 2 retries apply). Consider a deadline before the chat path depends on it in 2.9.
- Not verified live: no admin session here, so no run against Atlas or OpenRouter. Curl confirmed only that `/admin/rag/playground` redirects to login when signed out. `TraceView` was rendered with `renderToStaticMarkup` from a faked pipeline run over the sample CV (all seven stages parsed into their panels). No browser check at 375 px / 1440 px or in dark mode.

## Retrieval evaluation (Phase 2.8)

- **Bun cannot load the MongoDB driver as is.** BSON's `ObjectId` static block calls `v8.startupSnapshot.isBuildingSnapshot()`, and Bun 1.3.14 throws `NotImplementedError` there. That is why the repository tests mock `mongodb`. Any Bun script that touches the database needs `--preload ./scripts/bun-v8-snapshot-shim.ts`, which makes the probe return `false`. `--conditions=react-server` is still needed so `server-only` resolves to its empty module. Remove the shim once Bun implements the probe.
- `bun run eval:rag -- [--index <id|active>,...] [--presets a,b] [--k 1,3,5] [--tag t] [--golden path]`. Usage is in `evals/README.md`. Defaults: the active index, every preset, k = 1,3,5.
- Pure modules in `server/rag/eval/`: `golden-set.ts` (strict zod items; `history` and `tags` default to `[]`; `relevantEntityKeys` needs at least one; ids must be unique), `metrics.ts` (hit@k, recall@k over distinct relevant keys, reciprocal rank up to depth 10, means), `eval-args.ts` (`node:util` `parseArgs`, strips a leading `--`), `retrieval-evaluator.ts` and `eval-report.ts`. `scripts/rag-eval.ts` only wires them: repositories + `getLlm()` + `createRag`, with a no-op trace `save`, since eval traces are not persisted.
- `RetrievalEvaluator` depends on `RetrievalRunner`. It runs index → preset → question in order, one question at a time, with kind `eval` and `RETRIEVAL_PRESETS[preset]` unchanged (finalK 5). Metrics are over the returned chunks only, so ranks beyond finalK are misses, and MRR never sees ranks 6 to 10. A `RetrievalError` becomes a zero-scored result with the failed stage's own error message. Any other error (missing index) stops the run.
- Stage latency comes from each trace: `stageMs` per stage, and `meanStageMs` averages only over questions that ran that stage. Before timing, the script runs one lexical search per index so the first question does not pay for the index read.
- The report flags golden keys that no chunk of an index carries (`unknownEntityKeys`). That catches typos and CV edits.
- The 5 seed items (tag `example`) use the fixture CV's (Jane Doe) keys. A test checks they still exist in the structured chunks of the fixture. They score 0 against the real CV. The owner writes the real questions (Plan.md §3 checkpoint). Do not invent them.
- `FakeRetrievalRunner` and `readyIndex` are in `server/rag/__fixtures__/fake-retrieval-runner.ts`.
- Verified live: the script connects to Atlas under Bun with the shim. The database has a published CV ("LWIN MAUNG MAUNG") and **no RAG indexes**, so the done-when command stops with "No RAG index is active." Its unknown-index, bad-golden-file and empty-tag errors were checked against the real database. The comparison table has only been exercised in unit tests. Next step: build and activate an index in `/admin/rag`, then run the done-when command and mark 2.8 Done.

## Answer generation and chat API (Phase 2.9)

- `withPublicSession(request, produce)` now calls `produce({ sessionId })`. `RotatedPublicSession.sessionId` is the session document id, which stays the same while the key rotates. The chat ties conversations to it.
- `server/domain/chat.ts` holds `StoredMessage`, `Conversation`, `ConversationRepository`, `ChatSource`, `ChatEvent` and the constants `CHAT_MESSAGE_MAX_CHARS` (500, UTF-16 units), `CHAT_SESSION_MESSAGE_LIMIT` (20) and `CHAT_CONVERSATION_TTL_SECONDS`. 2.10's client should import these types, not redefine them.
- `MongoConversationRepository` (`chat_conversations`): indexes `{ sessionId: 1 }` and a TTL on `{ updatedAt: 1 }`, 30 days. Messages are embedded in the conversation. `append` does `$push` plus `$max` on `updatedAt`, using the newest message time. The counts are aggregations that `$filter` the embedded messages. The daily count first matches `updatedAt >= since`. A malformed id finds nothing, and `append` throws on one.
- `server/rag/answer/`: `buildAnswerMessages` (system rules, the last 6 history turns with `[S#]` markers stripped from assistant text, then one user turn with `<sources>…</sources>` and `<question>`), `buildSmalltalkMessages` (no sources), `offTopicReply`, and `extractCitations` / `citedEntityKeys` / `stripCitations`. Source attributes are escaped. The question and source text are not escaped, like the rewrite prompt. `citations.ts` imports `anchorForEntityKey` from `app/(public)/_components/cv/cv-sections.ts`: the first `server/` → `app/` import. It is pure, and it keeps a single anchor mapping. Move the registry to `server/cv/` if that direction becomes a problem.
- `ChatService.reply` (`server/services/chat-service.ts`) is an async generator. Order: message check, then the limits (session ≥ 20 stored user messages, then the day's count from `startOfUtcDay` ≥ `CHAT_DAILY_MESSAGE_LIMIT`), then the published name and the active index. All three run before a conversation exists. Then `meta`, retrieval (the saved chat config since 2.10a, kind `chat`), then the answer. Off topic gives a single fixed `delta` with no LLM call and no `generate` stage.
- Stored messages: failed turns (retrieval or answer-model error) are not stored, and their trace is saved. Stored turns are appended **before** `sources`/`done`. A stopped turn (the request signal aborted, or the reader called `return()`, which runs the generator's `finally`) is stored as `<partial> [stopped]` with the keys it cited so far, and ends without `sources`/`done`. Save errors are logged and do not break the stream.
- The `generate` stage is appended to the pipeline's trace: `startedAt = trace.totalMs + (start − retrievedAt)`, and `totalMs` grows to cover it. Its output keeps the raw answer (without `[stopped]`), usage, `stopped` and the cited source ids. The schemas are in `trace-stages.ts` (`STAGE.generate`). `readTrace` has no case for it yet, so 2.11 adds the case and the panel.
- `server/http/ndjson-stream.ts`: a pull-based `ReadableStream`. A thrown error becomes the `onError` line. `cancel` calls `onCancel` and then `iterator.return()`. `finished` settles after either. The route registers `after(() => stream.finished)` so a stopped answer is saved before the function ends. It also aborts the answer model on `request.signal` abort or on stream cancel.
- `POST /api/public/chat`: 503 `unavailable` when RAG is not configured (checked before the session is consumed), then `withPublicSession`, then zod `{ conversationId: string(1..64) | null, message: trimmed 1..500 }`, where a failure is 400 `invalid_request`. The response is NDJSON with `no-store` and `nosniff`, and `maxDuration = 60`.
- `server/services/chat-runtime.ts` builds `ChatService` lazily with `getRag().pipeline` (`getRag` is now exported) and its own repository instances. `isChatConfigured()` = `isRagConfigured()`.
- The answer stream has no deadline of its own beyond the client's 60 s per attempt. A slow model can reach the route's 60 s `maxDuration` before a stopped answer is saved. The embedding call in retrieval still has no deadline (see 2.7).
- Verified live with curl against the dev server: a session from `POST /api/public/session`, then 400 `invalid_request` for a blank message, then a 200 NDJSON stream with a rotated `public_session` cookie that ended in `{"type":"error","code":"unavailable"}`. The database has a published CV and **no RAG index**, and no conversation row was created. The `meta` → `delta` → `sources` → `done` path is covered by unit tests only. No answer-model call has been made.

## Chat UI (Phase 2.10)

- `client/api/public-http.ts`: `sessionFetch(path, request)` now takes `{ method: "GET" }` or `{ method: "POST", json }`. The body is a string so the 401 → issue → retry path can resend it. `postPublicStream` returns once headers arrive, which also releases the session lock. It takes no `AbortSignal`, for the same reason as `sessionFetch`: stop by cancelling the body after the headers. `errorKindFor` is exported.
- `client/api/ndjson.ts`: `readNdjson(body, signal)` buffers split lines and split UTF-8, skips blank and invalid lines, and cancels the body on abort or early exit. `client/api/chat.ts`: `streamChat(request, onEvent, { signal })` → `"complete" | "stopped" | "interrupted"`, throws `PublicApiError` (429 `limited`, 503 `unavailable`, other statuses `http`). `parseChatEvent` validates events by hand (no zod in the client bundle) and skips unknown types. `isChatSource` requires anchors to start with `#`, because they become hrefs. The built chunk was checked: no zod or Mongo code.
- Widget files are in `app/(public)/_components/chat/`. Pure and tested: `chat-markdown.ts` (answer Markdown and `[S#]` / grouped markers, hidden partial marker while streaming), `chat-text.ts` (chip numbering, section labels), `chat-state.ts` (reducer and `CHAT_NOTICES`), `chat-storage.ts`, `chat-suggestions.ts`. Components: `chat-widget.tsx` (button + `<dialog>`), `chat-messages.tsx` (empty state, `role="log"` with `aria-busy` while streaming, follows the bottom only while the reader is there), `chat-answer.tsx`, `chat-composer.tsx`, and the `use-chat.ts` hook.
- The panel is a native modal `<dialog>` opened with `showModal()`. That gives the inert page, `Esc`, and the top layer. `onClose` focuses the button with `preventScroll`. Below `md` (48rem) a source link closes the panel first, so the browser's fragment scroll lands on the CV item (items already have `scroll-mt-12`). At `md` and up the panel stays open and the page scrolls behind it. On narrow screens the input is not auto-focused, so the keyboard does not cover the suggestions.
- Answers render a Markdown subset (owner request after the first build). `chat-markdown.ts` is a hand-written parser to a tree (`AnswerBlock` / `InlineNode`) that `chat-answer.tsx` renders as React elements, so there is still no `dangerouslySetInnerHTML`. Blocks: paragraphs (single newlines kept), `#` headings (a bold `<p>`, so the chat log adds no document headings), `-`/`*`/`+`/`1.`/`1)` lists nested by 2+ spaces of indentation (`<ol start>` keeps numbering across blank lines), code fences (an unclosed fence shows while streaming), `---` rules. Inline: `**`/`__` strong, `*`/`_` em (`_` never inside a word), code spans, `\` escapes, `[S#]` citations (also inside strong), and links through `safeWebUrl` / `mailtoHref` (anything else keeps only its text). Unmatched delimiters stay literal, so `**open` shows its asterisks until the stream closes it. Tables, images and HTML are shown as text. The answer prompt still says "Write plain text"; it was not changed.
- `sessionStorage`: `cv-chat:conversationId` plus `cv-chat:messages` (the settled transcript, validated on read). It is read on the first open and written by an effect only while no answer is streaming. "New chat" clears both. Every access is guarded.
- Entry ids use a time-prefixed counter, not `crypto.randomUUID`, which needs a secure context (a phone on the LAN over http).
- `isChatAvailable()` (`chat-runtime.ts`, `cache` + `connection()`) is true when RAG is configured and `findActive()` returns an index. A failed lookup is logged and hides the widget. The page calls it only when a CV is published.
- Verified: unit tests, lint, types, build, and static markup of the widget and a sample answer (escaped HTML, chips, source links, the unknown `[S7]` dropped). Against the dev server, `/` renders the CV **without** the widget, and `POST /api/public/chat` still returns `unavailable` because there is no active index. No browser was available here, so nothing was checked in one: no streaming, 375 px layout, keyboard-only use, dark mode, or anchor scrolling.

## Chat retrieval settings (Phase 2.10a)

- Built after Phase 3.5. The owner saw "Kept 5 chunks scoring at least 0.00" in the steps panel and asked to be able to tune the threshold.
- `rag_settings` collection: a single document `{ _id: "chat", retrieval, updatedAt }`, upserted by `MongoRagSettingsRepository`. `retrieval` is stored and returned raw (`unknown`).
- `RagSettingsService` (`server/services/rag-settings-service.ts`):
  - `chatSettings()` parses the document with `RetrievalConfigSchema` on every read. A missing field gets its schema default. A document that fails the strict parse gives the defaults with `updatedAt: null` and a warning.
  - `saveChatConfig(unknown)` throws `InvalidRetrievalConfigError` (a `RagError`). Its message comes from `retrievalConfigErrorMessage`, which the playground form parser now shares.
- Wiring:
  - `RagDependencies.settings` is required, and `Rag.settings` is the service.
  - `rag-runtime` exports `getChatRetrievalSettings` (`cache` + `connection()`) and `saveChatRetrievalConfig`.
  - `chat-runtime` passes `retrievalConfig: () => rag.settings.chatSettings().config`.
- `ChatService`:
  - It no longer imports `DEFAULT_RETRIEVAL_CONFIG`. It reads `deps.retrievalConfig()` once per turn, after the availability checks and before the conversation is created.
  - A `cv`-scope retrieval with zero chunks streams `noInformationReply(subjectName)` with no LLM call. It is stored and traced like the off-topic path, with no `generate` stage.
- Playground:
  - A "Chat uses" card (`chat-config-summary.tsx`).
  - A "Chat config" preset, listed first, that the form opens with.
  - A "Use for chat" button: a second submit in the same form with `formAction`, `formNoValidate` and a `window.confirm`. It calls `saveChatConfigAction` (`withAdmin`, `ChatConfigState` in `playground-state.ts`) and then `revalidatePath("/admin/rag/playground")`.
  - `secondaryButton` was added to `rag-styles.ts`.
- Eval: `--presets chat` runs the saved config (`CHAT_PRESET` / `EvalPresetName` in `retrieval-evaluator.ts`). It is not in the default list. The script reads the config only when `chat` is asked for.
- Verified: unit tests, lint, types and build. Not checked: the playground in a browser (needs an admin login), a live chat turn with a raised threshold, and `bun run eval:rag -- --presets hybrid-rerank,chat` (makes paid or rate-limited calls). Whether the reranker's scores really fall in 0..1 is still unchecked (see 2.6), so pick the threshold from the filter panel's actual scores.

## Subject name out of BM25 (Phase 2.10b)

- Built after 2.10a. The owner saw the rewritten query "What has Lwin Maung Maung built recently?" pull BM25 toward chunks that mention the name. Every chunk is about the owner, so the name is noise for BM25.
- `RetrievalConfig.ignoreSubjectInLexical` (default `true`, label "Ignore name in BM25"). Presets inherit it. A saved chat config without the field parses with the default.
- `Retriever.searchLexical(indexId, query, k, { ignoreTermsOf })`. `Bm25Index.search` analyzes `ignoreTermsOf` with the index's analyzer and skips those query terms, so case, possessives and stems match. A query left with no terms returns `[]`. Only the query side changes: no index rebuild, and BM25 statistics still count the name.
- The name is the request's `subjectName` (the published `profile.fullName`). It is not in `ENGLISH_STOPWORDS`; do not hard-code it.
- Vector search, the reranker (until 2.10c) and the trace keep the full rewritten query. The `lexical-search` output gets `ignoredTermsOf` (optional in `SearchStageOutputSchema`); the trace panel shows it. The public chat steps do not.
- Verified: unit tests, lint, types and build. Not checked: the playground in a browser and `bun run eval:rag -- --presets hybrid-rerank-rewrite,chat` with the toggle off in the saved chat config (`evals/README.md` explains the comparison).

## Subject name out of the reranker (Phase 2.10c)

- Built after 2.10b, at the owner's request. For "What is Lwin Maung Maung's role at Clinics Medical Group?" a certification chunk reranked third. The context prompt tells the contextualizer to mention the person's name "when relevant", so only some candidates' `indexText` carries it, and the cross-encoder rewards the overlap with the name in the query.
- `RetrievalConfig.ignoreSubjectInRerank` (default `true`, label "Ignore name in rerank"). Presets inherit it. A saved chat config without the field parses with the default.
- `withoutName(text, name)` (`server/rag/rerank/without-name.ts`) removes the name as a phrase (case-insensitive, any whitespace, optional `'s` / `’s` / `'`), tidies the spaces and keeps newlines. A single word of the name ("Lwin's") stays, on purpose. A text that would be empty keeps its original.
- The pipeline applies it to the rerank query and each candidate's `indexText`. The `rerank` stage input's `query` is the query sent; the output gets `ignoredName` (optional in `RerankStageOutputSchema`), shown in the rerank panel and not in the public chat steps. Chunks, sources and other stages keep the name.
- Verified: unit tests, lint, types and build. Not checked: the playground in a browser and `bun run eval:rag -- --presets hybrid-rerank-rewrite,chat` with the toggle off.

## Drop reranked hits below the mean (Phase 2.10d)

- Built after 2.10c, at the owner's request: a cut relative to each turn's scores, since the scores' scale moves (0.93 → 0.56 top score for the same question after 2.10c).
- `RetrievalConfig.dropBelowMeanRerank` (default `true`, label "Drop below mean rerank"). Presets inherit it. A saved chat config without the field parses with the default.
- The `filter` stage takes the mean over the reranked hits (at most `finalK`) and drops a hit below `mean - 1e-9` (so equal scores all stay). A hit must also pass `minRerankScore`. Skipped on reranker fallback, like the floor. The top hit always passes, so this cut alone never empties the list.
- Trace: filter input gains `dropBelowMean`; output gains `meanRerankScore` (optional in `FilterStageOutputSchema`), shown in the filter panel. The public chat steps do not expose it.
- Owner was told the trade-off: in their example (0.5553, 0.2820, 0.2259, 0.1674, 0.1340; mean 0.2729) it keeps "Key Skills" and drops the second Clinics Medical Group chunk. With 5 hits the mean always drops the weaker part. If that hurts answers, the largest-gap cut discussed before is the alternative.
- Tests that assert every reranked hit becomes a source (`rag-composition.test.ts`, some pipeline tests) set `dropBelowMeanRerank: false`.
- Verified: unit tests, lint, types and build. Not checked: the playground in a browser and an eval run with the toggle off.

## Reasoning in the LLM client (Phase 3.1)

- `ChatRequest.reasoning?: ReasoningSetting` (`{ effort }` or `{ enabled: false }`) maps to OpenRouter's `reasoning` body field. When it is absent, the body has no key. `ChatStreamEvent` gains `{ type: "reasoning"; text }`, read from `choices[0].delta.reasoning` in `interpretChunk`. Empty strings are skipped. A chunk with both fields yields reasoning first. A yielded reasoning event blocks a retry, like a delta. `complete()` ignores reasoning.
- `LLM_ANSWER_REASONING` is parsed in `llm-env.ts`. An invalid value makes `readLlmEnv()` null. The domain type is `ReasoningLevel`.
- `answerGenerationSettings(level)` (`answer-prompt.ts`): `off` → `{ enabled: false }`, 600 tokens. Any effort → `{ effort }`, 1,600 tokens (`ANSWER_MAX_TOKENS` 600 + `ANSWER_REASONING_TOKENS` 1,000). `ChatService` takes `answerReasoning` and, until Phase 3.3, drops `reasoning` events.
- Measured live on 2026-09-29. The answer model used 270–365 reasoning tokens at every effort, so `effort` has no measurable effect; `off` works. Reasoning makes answers slower: 8–29 s against 4–9 s. The free endpoint can return 503 `provider_overloaded`.
- `LlmContextualizer` and `LlmQueryRewriter` send `reasoning: { enabled: false }`. Without it the utility model returned blank content at `finish_reason: length`. That caused the active index's `contextFailures: 11/11` and the rewriter fallbacks. That index still has no contexts; rebuilding it from `/admin/rag` fixes that. Keep reasoning off for any new short utility call.

## Stage progress from the pipeline (Phase 3.2)

- `TraceObserver` (`server/domain/rag.ts`): `stageStarted(name, startedAt)` after the recorder reserves the stage slot, then `stageEnded(copy)` from a `finally`, so a failed stage ends with `error` set before the error is rethrown. Observer throws are caught and logged through the recorder's `log` option (default `console.error`). `RetrievalRequest.observer` is passed to the recorder; playground and eval pass none.
- Public step types (`ChatStep`, `ChatStepDetail`, `ChatStepHit`, `CHAT_STEP_HITS = 10`) and the `step` / `reasoning` `ChatEvent`s are in `server/domain/chat.ts`. The client imports them from there. 3.3 emits them and 3.4 keeps them on the answer entry.
- `server/rag/progress/chat-steps.ts` is pure. `runningStep(name, startedAt)`, `finishedStep(stage)` (null for a stage that is not a chat step) and `isChatStepName`. Each detail is built field by field from the `trace-stages.ts` schema parse, so no chunk text, context, `raw`, model or error text can pass through. A failed stage gives `status: "failed"` and `detail: null`; an unparseable output gives `detail: null`. `startedAt` and `durationMs` are rounded to whole ms.
- The readers map is typed by both `STAGE` values and `ChatStepName`, so adding a stage to one and not the other fails to compile.
- `generate` reads `sources` from the stage **input** (`GenerateStageInputSchema`), not the output. `reasoning` always has `{ kind: "reasoning" }`.
- `entityAnchor(entityKeys)` is now exported from `citations.ts` and shared by citations and steps.

## Chat service and API events (Phase 3.3)

- **Event order** for a CV question: `meta`, then a `running` and a finished `step` per retrieval stage as it happens, then:
  - with reasoning: `reasoning` running, the `reasoning` text events, `reasoning` done, `generate` running;
  - without: `generate` running only.
  After that come the `delta`s, `generate` done, `sources` and `done`.
  - Off-topic: only the `rewrite` pair, then the fixed reply (no `generate`).
  - Small talk: `rewrite`, then the answer steps with `sources: 0`.
- **Retrieval steps.** `ChatService.reply` passes a `TraceObserver` that pushes `runningStep` / `finishedStep` into an `EventChannel` (`server/rag/progress/event-channel.ts`). It yields them while `pipeline.run` is pending, then awaits the run in `settleRetrieval`. That one place logs and saves a `RetrievalError`'s partial trace and maps `RagError` to `unavailable`.
- **Answer steps.** A private `AnswerSteps` class in `chat-service.ts` sends them and projects them with `finishedStep`, like the retrieval stages. `reasoning` is timed from when the model was asked. `generate` is timed from the first answer text, or from the ask when there was no reasoning. Step times use the trace timeline: `totalMs + (t − retrievedAt)`.
- **Failures and stops.**
  - A failure sends the running step as `failed` (with no detail or message), then `error`. A failure before any output fails `generate`.
  - A stop sends no step event; the client marks the running step stopped (3.4).
  - A reader that leaves during retrieval stores nothing; the generator's `finally` awaits the pipeline and saves the trace. An abort noticed between retrieval and generation does the same, without calling the model.
- **Trace.** The trace's `generate` stage output has `reasoning` (string or null, capped at `CHAT_REASONING_MAX_CHARS` = 8,000, in `domain/chat.ts`). Older traces have no key, so the schema has it `.optional()`. The stream to the visitor is not capped.
- **Dev server caveat.** `getLlm()` keeps the `OpenRouterClient` instance on `globalThis`, so hot reloads do not replace it. After a change to `openrouter-client.ts`, restart `next dev`. On 2026-09-29 the running dev server still had the pre-3.1 client: no `reasoning` events, and the rewriter fell back.

## Client events, state and storage (Phase 3.4)

- **Guards.** `client/api/chat-steps.ts` checks steps by hand (no zod in the client bundle). `readChatStep(value, statuses)` takes the statuses to accept. `parseChatStep` accepts the server's three statuses, and storage reads the client's four. `isRecord` and `isCvAnchor` live there and `chat.ts` uses them too.
  - A step with an unknown name, status or detail `kind` is skipped (`parseChatEvent` returns null).
  - A malformed detail becomes `detail: null`. So does a known kind on the wrong step (`DETAIL_KIND` maps each step to its kind), or a hit whose anchor does not start with `#`.
- **State.** `AssistantEntry` has `steps: AnswerStep[]` and `reasoning: string`. `AnswerStep` widens the status with a client-only `"stopped"` (`AnswerStepStatus`, `ANSWER_STEP_STATUSES` in `chat-state.ts`). The server type is unchanged.
  - A `step` event is upserted by name in start order. A finished step replaces its running one in place. A `running` event never replaces a step that is already listed.
  - `reasoning` text is appended as it arrives; the reducer does not cap it.
  - Every way an answer ends goes through `settle`, which marks any still-running step `stopped`: `done`, `complete`, `stopped`, `interrupted`, `error` and `limit`.
  - `settlePending` drops an answer only when it has no text **and** no steps. A failed turn with steps is kept as `interrupted` with empty text. It renders its open steps panel, then "This answer is incomplete."
- **Storage.** Entries are rebuilt field by field on read, not returned as stored.
  - Steps are read with `readChatStep(…, ANSWER_STEP_STATUSES)`, and unreadable ones are skipped.
  - Missing `steps` and `reasoning` load as `[]` and `""`.
  - Reasoning is cut to `CHAT_REASONING_MAX_CHARS` both on write and on read.
  - A `steps` that is not an array, or a `reasoning` that is not a string, drops the transcript, like other malformed entries.
- **Bundle check.** After `bun run build`, the chat chunk (the only one with `cv-chat:messages`, loaded by `(public)`) has no zod. The one client chunk with zod is loaded only by `admin/(panel)/cv/[versionId]`.

## Workflow UI (Phase 3.5)

- **Files.** `chat-steps-text.ts` is pure and tested: labels, summaries, score formats and hints, durations, the panel heading and the screen-reader announcement. `chat-activity.tsx` is the panel and its rows. `chat-step-detail.tsx` is the expanded content per detail kind, plus `ReasoningText`. `ChatAnswer` renders `ChatActivity` first; the old `Thinking` dots are gone.
- **Panel.** It is one `<details>` per answer, holding a list of rows.
  - Before the first step it is a spinner line, "Working…". An entry with no steps (legacy) has no panel.
  - While streaming, its heading is the label of the step started last. After the answer ends it reads "Worked for 3.4 s · N sources" (the cited sources), "Stopped after", "Failed after" or "Cut off after".
- **Open state.**
  - `useDisclosure(auto)` follows `auto` until the visitor toggles. A `toggle` event that leaves the element as rendered came from React and is ignored.
  - The panel's `auto` is `live && text === ""`. `live` is whether the entry was streaming when it mounted, so restored entries start closed.
  - The reasoning row's `auto` is `live && no generate step yet`.
- **Rows.** Only a row with a readable detail (or reasoning text) is a `<details>`; the rest are plain rows. Failed and stopped rows use the "doing" wording without "…". Named Tailwind groups (`group/panel`, `group/row`) keep the chevrons apart.
- **Scores.** Cosine, BM25 and rerank to 2 decimals, RRF to 4. Each list has a one-line hint. A rerank fallback shows no scores (they are 1 / rank). Fusion's summary is "N chunks combined", because the event has no count after the cut.
- **Accessibility.** A hidden `role="status"` in `chat-messages.tsx`, outside the `aria-busy` log, announces step changes only. Icons have hidden status text. The spinner is `motion-reduce:animate-none`.
- **Not checked.** There was no browser. A static render, the built CSS and a 200 for `/` from the owner's dev server were checked. Live streaming, reload, 375 px and 1440 px, dark mode and keyboard use were not.

## Scope routing with a decision model (Phase 2.14, steps 1–2)

- **Endpoint.** `POST https://openrouter.ai/api/alpha/decisions`, beside `/api/v1`, not under it (the Plan's doubled-prefix suspicion was right). `DECISIONS_PATH = "/api/alpha/decisions"` is resolved against the base URL's origin in `OpenRouterClient.endpoint`. Confirmed live on 2026-09-29: requests reached Respan and came back with provider 400s.
- **`decide()`.** One attempt (no `execute` retry loop), the client's per-attempt timeout plus the caller's signal, same headers and `mapTransportError`. The body is `{ model, state, questions }`. The response is zod-parsed (`answers.<key>.{ choice, confidence, probabilities }`; `type` and other keys are dropped). Usage is `input_tokens` / `output_tokens` / `cost`, mapped to `Usage`. A missing `model` falls back to the requested one. The domain types (`DecisionQuestion`, `DecisionRequest`, `ChoiceAnswer`, `DecisionResult`, `DecisionClient`) only model `choice` questions.
- **`LLM_ROUTER_MODEL`** is in `llm-env.ts` and `.env.example`, default `typesafe/jev-1.13` since the owner's choice (it was `respan/span-01-lite:free`). **The owner's `.env.local` still sets `LLM_ROUTER_MODEL=respan/span-01-lite:free`**, which overrides the default: with it, every route falls back (a Respan 400) and the rewriter decides. The agent did not edit `.env.local`.
- **Route question** (`server/rag/route/route-question.ts`): `buildRouteQuestion` (a `choice` over `scopeDefinitions`, now exported from `rewrite-prompt.ts` and shared, so both classifiers use the same definitions; the rewrite prompt text is byte-identical to before), `buildRouteState` (`{ subject, history: last 6 turns, message }`), `readScopeAnswer` (unknown option, extra key, missing or out-of-range probability → `{ ok: false }`), `shortCircuitScope` (the cutoff rule on `probabilities[choice]`), `ROUTE_TIMEOUT_MS = 5_000`. Step 3's `DecisionScopeRouter` should reuse these.
- **Probe.** `scripts/probe-scope-router.ts` (`--model`, `--file`), scoring in `server/rag/route/scope-probe.ts`, 24 labelled items in `evals/scope-probe.json` (6 small talk, 8 off topic, 10 cv including mixed and follow-ups; the Respan run below used the first 22). Usage in `evals/README.md`.
- **Probe result, 2026-09-29: no-go for `respan/span-01-lite:free`.** All 22 calls failed with provider 400s before any classification. (1) The Plan's state `{ subject, history, message }` is refused: "Respan state must be a string or an object with only input (a message array) and output (a message) … and the output role is assistant". (2) With a plain-string state (3 throwaway calls), it refuses the question: "Respan only accepts noul questions whose instructions and criteria are plain strings". Span-01 is a yes/no behaviour scorer for conversation spans, not a `choice` classifier. The 22nd call also hit `429 Rate limit exceeded: free-models-per-min`. Latency of the rejections was about 0.3 s.
- **Owner chose Jev; probe passed, 2026-09-29.** `typesafe/jev-1.13` (served as `typesafe/jev-1.13-20260917`) on all 24 items: no errors, top choice right on 23/24, correct at every cutoff 0.6–0.9 with no CV question skipped, median 568 ms. The one miss, "Can LWIN MAUNG MAUNG help me set up a VM on GCP?", chose `off_topic` at 0.59, below every cutoff, so it defers. At the default 0.8, "What can you help me with?" (small talk at 0.69) also defers. Paid, billed on input tokens only.

## Scope routing, steps 3–9 (Phase 2.14)

- **Router.** `DecisionScopeRouter(DecisionClient, model, { timeoutMs = ROUTE_TIMEOUT_MS })` in `server/rag/route/decision-scope-router.ts`. It catches everything and returns `{ scope: null, fallback: true, error }`; an unreadable answer keeps the served model. `ScopeRouter` (domain) also has `readonly model` so the stage input can name it (Plan deviation). `createRag` builds it from `LLM_ROUTER_MODEL` and exposes `rag.scopeRouter`; `RagDependencies.llm` now also needs `DecisionClient`.
- **Config.** `scopeRouter` (`SCOPE_ROUTERS`, default `rewriter`) and `minRouteConfidence` (0.5–1, step 0.01, default 0.8; a `boundedNumber` like `minRerankScore`). A saved config without them parses with the defaults. Preset `hybrid-rerank-rewrite-route`; the other presets set `scopeRouter: "rewriter"` in `PRESET_SHAPES`.
- **Pipeline.** With `decision`, `route` (`STAGE.route`) runs first. A short-circuit returns `scope`, `queries: [message]`, no chunks and a trace with only `route`. Otherwise the rewrite and the rest run as before, and the rewriter's scope wins. `result()` now takes `(scope, queries, selected)`.
- **Trace.** `RouteStageInput { model, minConfidence, historyTurns }`, `RouteStageOutput` = the decision including `model` (the dated served version; Plan deviation). `readTrace` has a `route` case; `trace-stage-panel.tsx` shows the outcome, model, cutoff, history, three probability bars with a red cutoff mark on small talk and off topic, and the fallback error. `trace-view.tsx` takes the final scope from a route short-circuit, else the rewrite, for its "retrieval was skipped" note.
- **Public step.** `route` is a `ChatStepName`; detail `{ kind: "route"; scope; fallback }` only. Words: "Reading your message" / "Read your message"; summary is the scope label ("Small talk", "Out of scope") or "Checking your question" after a deferral or a fallback.
- **Playground.** A "Scope router" select and a "Min route confidence" number field with hints; both are in `configRows`, so "Chat uses" lists them.
- **Eval.** `GoldenItemSchema.expectedScope` (default `cv`); `relevantEntityKeys` may be empty only for non-`cv` items. `QuestionResult` gains `expectedScope` and `routerFallback` (read from the trace's route stage; null without one); `metrics` is null for non-`cv` items and `RunSummary.metrics` is null when a run has none. `RunSummary.scope` = `{ correct, cvSkipped, routerFallbacks }`; the report adds "scope acc", "cv skipped" (n/cv questions) and "router fallbacks" columns and a "Scope mismatches" section. "cv skipped" counts every `cv` item that ended as small talk or off topic, by router or rewriter (Plan deviation, so both rows compare). Four `scope`-tagged examples were added to the golden file. `FakeRetrievalRunner` takes `{ scopes, routerFallbacks }`.
- **Live eval, 2026-09-29** (`--presets hybrid-rerank-rewrite,hybrid-rerank-rewrite-route`, active index `…50cb3f`, 9 questions). With `.env.local`'s Respan: 9/9 router fallbacks, 0 errors, same scopes as the rewriter (this covers the done-when's bad-model case). With `LLM_ROUTER_MODEL=typesafe/jev-1.13` set for the run: 0 fallbacks, scope accuracy 0.778 in both rows, mean 1531 ms vs 1858 ms; routed small talk and off topic took about 0.55 s vs 0.9–1.9 s. Both rows show the two "Jane" example questions as `off_topic`, which is right for the real CV (Jane is another person). hit@k is 0 because the `example` items target the fixture CV. The rewriter is not deterministic: in the first run it also called the Jane follow-up `off_topic`.
- **Not checked.** No browser: the playground (route panel, bars, the two fields) and the chat steps were not seen. "Use for chat" with `decision` was not saved; that changes live answers and is the owner's call (Plan.md §3).

## Fixed replies for small talk and off topic (Phase 2.14a)

- Owner's request after the 2.14 probe: small talk and off topic answer with default messages. The rewriter's scope still decides; no decision model is involved.
- `RetrievalPipeline` returns after `rewrite` for any non-`cv` scope (it used to for `off_topic` only), so small talk no longer pays for embedding, search and rerank.
- `ChatService.reply` sends `smalltalk` to `fixedReply(smalltalkReply(name))`, beside `off_topic` and the no-information reply. `generate` now only answers CV questions and writes `mode: "cv"`. The `smalltalk` value stays in `GenerateStageInputSchema` so older traces parse.
- `buildSmalltalkMessages` and its instructions were deleted. The public chat steps need no change: a small-talk turn shows the rewrite step ("Small talk"), then the reply.
- Eval effect: a golden CV question the rewriter misreads as small talk now retrieves nothing, so it counts as a miss (before, it retrieved but the chat ignored the chunks). That matches what the chat does.
- Not checked live: no chat turn was sent.
- **"Can he do X?" vs "do X for me".** "Can LWIN MAUNG MAUNG help me set up a VM on GCP?" risked `off_topic` (the definition listed "coding help"), which now means a canned reply to a possible client. `scopeDefinitions` now puts "whether <name> can help with some work (skills, services, availability)" under `cv` and "asking this assistant itself to do a task" under `off_topic`. `offTopicReply` adds "If you'd like <name>'s help with something, you can contact <name> directly." as a safety net. Live check 2026-09-29 on `z-ai/glm-5.3-flash`: the GCP pair (`cv-can-help`, `off-do-task` in `scope-probe.json`) and two controls all classified as expected, 1.0–1.8 s each. The golden set still holds only the Jane examples, so no golden item was added.

## Tool calling in the LLM client (Phase 4.1)

- **Types.** `ChatMessage` is a union keyed on `role`: assistant messages may carry `toolCalls`, and `tool` messages have `toolCallId`. Code that switches on `content` alone no longer narrows; check `role === "tool"` first (see `pdf-chat-request.ts`). `ChatResult.toolCalls` is present only when the model called a tool.
- **Transport only.** The client never parses tool arguments. A call with no id or name, or arguments that are not valid JSON, is still emitted (`""` for missing fields). 4.3's tools validate the arguments.
- **Stream order.** `tool_call` events come at the end of the stream, after all `delta`s and before `done`. Until then a failure is still retried; once one is yielded, it is not.
- **Wire details.** `tool_choice` is sent only with a non-empty `tools`. A call-only assistant message is sent with `content: null`.
- **Consumers.** Any `for await` over `stream()` that treats "not reasoning, not done" as a delta must now skip `tool_call`. `ChatService.generate` does this until 4.3 offers tools.
- **Live behaviour of `z-ai/glm-5.3-flash`** (the configured answer model, 2026-09-29):
  - It called the tool 3/3 times with `auto`, in 4–10 fragments, with no text in that round.
  - A follow-up with the tool result and `none` answered in text.
  - Under `none` the tool definitions are dropped from the prompt (200 → 28 prompt tokens). In 4.3, put the tool rules in the system prompt, not only in the tool description.

## Gmail sender (Phase 4.2)

- **Where.** `server/domain/email.ts` (types, `EmailSendError`, `GmailConnection`) and `server/email/`: `email-env.ts`, `mime-message.ts`, `gmail-oauth.ts`, `google-oauth-client.ts` and `gmail-email-sender.ts`. None of them imports `server-only`. The runtime wiring is `server/services/email-runtime.ts` (4.2a).
- **Env.** `readEmailEnv()` is null unless `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `CONTACT_EMAIL_TO` are set and valid (`GMAIL_REFRESH_TOKEN` was removed in 4.2a; a leftover value is ignored). It also reads `CONTACT_EMAIL_SESSION_LIMIT` (default 2), which step 2 left out but the fixed decisions name.
- **At most once.** `EmailSendError.retryable` is true only when Gmail cannot have taken the message: token-request failures, and a 429 on send. A timeout, network error or 5xx on the send request is final, and the sender never retries a send itself. The one resend is after a Gmail 401, which Gmail refused before sending. 4.4's claim (`pending` → `sending`) relies on this.
- **Headers.** Only `To` and `Subject` are built from input, and a line break in either throws before any request. The body is base64, so its text cannot add headers. No `From` or `Date`: Gmail fills them in.
- **Scripts.** The 4.2 scripts (`email:token`, `email:test`) were removed in 4.2a.
- **Test matchers.** The new tests use only the matchers in `server/auth/bun-test.d.ts`. `test.each`, `toMatch`, `toStartWith`, `toContainEqual` and `resolves` pass at runtime but fail `tsc` and the build.

## Connect Gmail from the admin page (Phase 4.2a)

- **Flow.** `/admin/email` links to `GET /api/admin/email/connect`, which puts `state.verifier` in the HttpOnly `gmail_connect` cookie (path `/api/admin/email`, 10 minutes) and redirects to Google. `GET /api/admin/email/callback` checks the state, exchanges the code with PKCE, requires `gmail.send` and a refresh token, saves the connection and redirects back with `connected=1` or `error=<ConnectFailure>`. Both routes need the admin session. The redirect URI is built from the request's origin, so it must be registered on the Google client for every address the owner connects from.
- **Storage.** One document `{ _id: "gmail" }` in `email_connections`, holding the refresh token as Google returned it. This is safe without encryption because the token is useless without `GMAIL_CLIENT_SECRET`, which only the env holds. Never return the token from `status()` or render it.
- **Do not revoke on reconnect.** Revoking any token ends the whole grant for that client and account, which would kill the new token too. Disconnect revokes (best effort) and then deletes the document.
- **Chat.** `ChatService.tools` is async and called per turn (`contact`, and `cv` with sources). The runtime offers `EmailDraftTool` only when `getEmail().isReady()`: the env is set and a connection is stored. A failed lookup logs and answers without tools.
- **Sending (for 4.4).** Get the sender from `getEmail().sender()`: it is null when email is not ready, and it reuses one `GmailEmailSender` per refresh token so the access token stays cached.
- **Agents must not click Connect or Send test email** with real credentials. Only the owner does that. Without an admin session, both routes redirect to login (checked with curl on 2026-09-29).

## Tools in the chat turn (Phase 4.3)

- **Where.** `server/domain/agent.ts` (`AgentTool`, `ToolContext`, `ToolOutcome`), `server/agent/email-draft-tool.ts` (`EmailDraftTool`, `SEND_EMAIL_TOOL`) and `server/agent/answer-loop.ts` (`runAnswerLoop`). `chat-runtime.ts` offers the tool only when email is ready (since 4.2a: env set and Gmail connected, looked up per turn).
- **The model only drafts.** `run` stores a `pending` draft on the conversation (`emailDrafts`, kept out of `messages`) and sends `email_draft` to the visitor. Nothing in 4.3 sends mail; 4.4 adds the Send endpoint. A draft holds visitor contact details: it lives in `chat_conversations` (30-day TTL) and the admin trace, never in a public step.
- **Scopes.** The rewriter has four scopes; the decision router keeps three (`RouteScope`) and reads a contact request as `cv`, so it defers. Small talk keeps its fixed reply and gets no tools (Plan deviation: step 6 listed small talk). Without email settings, `contact` gets `contactUnavailableReply`.
- **One tool round.** Round 1 has the tools on `auto`; round 2, only after a call, has them on `none` and must see a `tool` message for every call id. Tool rules are in the system prompt because the provider drops tool definitions under `none` (4.1).
- **Steps.** The client lists one step per name, so `AnswerSteps` sends `reasoning` and `generate` once each across both rounds. Ignored calls are in the trace only.
- **Checked live without email settings** (2026-09-29): the done-when message is rewritten as `contact` and gets the fixed reply; "What is Lwin's email address?" stays `cv`. The tool path (draft, round 2) is covered by unit tests only.

## Send endpoint (Phase 4.4)

- **Where.**
  - `POST /api/public/chat/email` (`app/api/public/chat/email/route.ts`), with the body `{ conversationId, draftId, action: "send" | "discard" }`.
  - `server/services/contact-email-service.ts` (`ContactEmailService`), wired in `chat-runtime.ts` as `sendContactEmail` / `discardContactEmail`.
  - `EmailDraftStore` in `domain/chat.ts`, implemented by `MongoConversationRepository`.
  - `EmailService.outbox()`, which returns the sender, `to` and the limits, or null.
- **At most once rests on the claim.** `claimEmailDraft` is one `findOneAndUpdate` from `pending` to `sending`. Never send without winning it. Never put a `sending` or `failed` draft back to `pending`: Gmail may have taken it. A `retryable` error still ends as `failed` (as in Plan.md), so the visitor needs a new draft to try again.
- **Stuck sends.** A draft `sending` for more than 2 minutes (`EMAIL_SEND_STUCK_MS`, from the stored-only `claimedAt`) reads as `failed`. Every Send first writes that with `failEmailDraftsStuckSince`.
- **Limits.** They count `sent` plus `sending` drafts, the daily one by `claimedAt` since UTC midnight. They are soft by one when two different drafts are sent at the same moment.
- **Results and codes.**
  - `sent` / `discarded` → 200.
  - `limit` → 429, `not_found` → 404, `expired` → 410, `failed` → 502.
  - `unavailable` → 503 `{ error: "unavailable" }`. It is not in the plan and means the env is unset or Gmail is not connected.
  - A bad body → 400.
  - Only a pending newest draft past the hour is `expired`. Everything else that cannot be claimed is `not_found`.
- **For 4.5.** The route rotates the public session like the chat route, so call it through `sessionFetch`. Discard works without email settings.
- **Live check (2026-09-30, made-up ids, no email sent).** Without a session: 401. With a session:
  - a bad body got 400;
  - an unknown draft got 404, which means email was ready on the owner's server;
  - a malformed conversation id on discard got 404.

  Agents must not send a real draft unless the owner asks.

## Draft card in the chat UI (Phase 4.5)

- **Where.**
  - `app/(public)/_components/chat/chat-email-draft.tsx` holds the card. Its pure text is in `chat-email-text.ts`: `ownerFirstName`, `sendDraftLabel` and `draftResultText`.
  - `chat-state.ts` has `EmailDraftState`, `EmailDraftCard`, `isDraftSendable`, `draftStateFor` and the `draft` action.
  - `use-chat.ts` has `actOnDraft`.
  - The client calls are `client/api/contact-email.ts` (`sendContactEmail`, `contactEmailOutcome`) and `postPublicJson` in `public-http.ts`.
- **The card is the confirmation.** Send asks nothing more. The draft text is plain text (`whitespace-pre-wrap`), never Markdown, since the visitor and the model wrote it.
- **Retry is safe because of 4.4's claim.** A `failed` card keeps Send. If the first request reached Gmail, the server answers 404 and the card reads "can no longer be sent". Do not add a client-side resend or a second claim path.
- **States the plan did not list.** `sending` ("Sending…") and `discarded` ("Discarded."). `not_found` shows as `expired`, and `unavailable` shows as `failed`. Discard does not wait for the server.
- **Focus.** It moves to the result line only after a button press (the `acted` ref), so a restored or superseded card never moves focus.
- **Not browser-checked** (no browser tool here). The home page renders with `ownerName: "Lwin"` on the owner's dev server. Agents must not press Send on a real draft unless the owner asks.

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
- Do not run the RAG index build inside the publish transaction or await it in the publish action. It runs in `after()` through `ragPublishListener`.
- Do not create the RAG runtime (`getRag()`) at module scope.
