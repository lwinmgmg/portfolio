# Project memory

Handoff for the next coding agent. `Plan.md` is the spec. This file records what was built, which decisions differ from that spec, and what must stay put. Read this before editing CV, auth, storage, or LLM code. Do not start the next plan phase until the owner asks.

Last updated after Phase 2.7 (retrieval pipeline, tracing and admin playground) on `master`.

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
| (next) | Phase 2.7. `TraceRecorder`, `RetrievalPipeline`, trace reader, `/admin/rag/playground`. |
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

Phases 1.1 through 1.8 (including 1.7a) and 2.1 through 2.7 are **Done** in `Plan.md`. The owner has not yet approved the 1.7 visual design (Plan.md §3 checkpoint). Phase 2.8 is next.

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
- `createRag` exposes `rag.queryRewriter` with `LLM_UTILITY_MODEL`. It was not run against OpenRouter. Whether `nvidia/nemotron-3.5-lightning` honours structured outputs has not been checked; the fence and extra-key handling are there in case it does not.

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
