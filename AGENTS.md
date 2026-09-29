# Role

You are a senior TypeScript engineer on a Next.js 16 portfolio: a CV site plus a hand-built contextual-RAG chat agent.

- Write small, strictly typed, testable modules. Name things well; comment only the non-obvious *why*.
- Use structural patterns where they remove coupling, not by default. This repo already uses: interfaces in `server/domain`, adapters for external systems (Mongo, Vercel Blob, OpenRouter), constructor injection in services, and composition roots in `*-runtime.ts` / `rag-composition.ts`.
- Know the current TypeScript ecosystem and recommend the best package for a job, but do not install one on your own. Runtime dependencies need owner approval (Plan.md §0.1): name the package, why it beats a hand-written version, and its size and maintenance, then wait.
- Match the existing code over your own defaults. If `Plan.md`, `Memory.md` and the code disagree, stop and ask.

# Start here

Use this file to find code instead of rescanning the repo. Before a task, read:

1. **This file**: role, stack, project map.
2. **`Memory.md`**: what is built, where it differs from the plan, what must not change, and which phase is next.
3. **`Plan.md`**: the spec. §0 rules, §0.1 code conventions, §0.2 done-when gate, §1 fixed decisions and env vars, then the section for the current phase. (§2 is the *target* layout and lists files that do not exist yet.)

Then open only the files the task touches.

# Keeping this file current

This file is only useful while it matches the code. Before you report a task done, check whether your change made anything here wrong or incomplete. If it did, edit this file in the same change.

Update it when you:

- add, rename, move or delete a folder, or a file the map names;
- move a responsibility to a different module (for example, where requireAdmin or the RAG wiring lives);
- add a new kind of code with its own home or pattern (add a row to "Where new code goes");
- add, remove or upgrade a major dependency, or change a gate command (update "Stack");
- change a rule in the Role section because the owner decided something new.

Do not update it for new files inside a folder that is already mapped, bug fixes, or changes inside a module. Keep entries to one line and describe what exists now. Plans go in `Plan.md` and history goes in `Memory.md`. Never edit between the `nextjs-agent-rules` markers; `next dev` overwrites that block.

In your final report, say whether you updated AGENTS.md and why, or "AGENTS.md: no change needed".

# Stack

Next.js 16.3 (App Router; `proxy.ts` replaces middleware) · React 19.2 · TypeScript strict · Tailwind 4 · zod 4 · MongoDB driver 7 on Atlas (replica set, transactions) · Vercel Blob (private) · jose (JWT) · TanStack Query 5 · OpenRouter through a hand-written `fetch` client · Bun 1.3 (package manager and `bun:test`).

Import alias: `@/*` maps to the repo root.

Gate (all must pass): `bun test` · `bun run lint` · `bunx tsc --noEmit` · `bun run build`. The owner keeps `next dev` running on :3000; do not start another.

# Project map

Tests are colocated as `*.test.ts`. Shared test fakes live in `__fixtures__/`.

```
proxy.ts                      Optimistic /admin redirect only. No server-only, Mongo or limiter imports.
scripts/hash-admin-password.ts  Produces ADMIN_PASSWORD_HASH for .env.local.
scripts/rag-eval.ts           `bun run eval:rag`: retrieval eval against the real DB, wired from rag-composition.
scripts/bun-v8-snapshot-shim.ts  Preload for Bun scripts that use Mongo (BSON's v8 probe throws in Bun).
evals/                        Golden set (cv-retrieval.golden.json), usage README; reports/ is git-ignored.

app/                          Routes. Keep them thin: parse input, call a service or runtime, render.
  layout.tsx, globals.css     Root layout, Tailwind 4.
  (public)/                   Visitor site.
    page.tsx                  Published CV at /, plus the chat widget when an index is active.
    projects/[projectId]/     Project detail pages.
    _components/cv/           CV section components. Pure helpers: cv-format, cv-sections, cv-seo.
    _components/chat/         Chat widget (<dialog> panel, use-chat hook). Pure: chat-markdown, chat-text, chat-state, chat-storage, chat-suggestions.
  admin/
    login/                    Login page, form, action, state.
    (panel)/                  Admin shell (nav layout). Pages call requireAdmin().
      actions.ts              logoutAction.
      _components/            Shared admin bits (auto-refresh, format-when).
      cv/                     Upload, extraction retry, version list.
        [versionId]/          Draft editor (cv-form.ts is the pure form mapper).
      rag/                    Build, activate, delete indexes.
        [indexId]/            Index detail with chunks.
        playground/           Retrieval playground: run the pipeline with any config and index, see its trace.
        _components/          Shared trace view (summary, timing bars, stage panels, final sources).
  api/
    admin/cv/upload/          Vercel Blob client-upload token and callback.
    admin/cv/[versionId]/pdf/ Admin PDF download.
    public/session/           Public session status; issue/ creates one (rate limited).
    public/chat/              Chat turn: withPublicSession, NDJSON stream of ChatEvents.
  cv/download/                Public CV PDF download.

client/                       Browser-side data access.
  api/public-http.ts          getPublicJson and postPublicStream, the base for public fetchers (session lock, 401 -> issue -> retry).
  api/chat.ts                 streamChat: NDJSON chat events (reader in api/ndjson.ts, hand-written step guards in api/chat-steps.ts).
  query/                      TanStack Query client and provider.

server/                       All server logic. Layered: domain -> repositories/services -> runtime.
  domain/                     Types and interfaces only, no I/O: auth, blob-store, chat, cv, llm, public-session, rag.
  db/                         Mongo client singleton (getDb) and runTransaction / TransactionContext.
  repositories/               Mongo classes extending MongoRepository: cv-version, public-session, rag-index, rag-chunk, rag-trace, conversation.
  services/                   Business logic with injected dependencies.
    auth-service.ts           requireAdmin, withAdmin (server-action wrapper).
    cv-service.ts             Upload registration, extraction, edit, publish.
    rag-index-service.ts      RAG index lifecycle.
    retrieval-playground-service.ts  Admin playground runs: subject name, pipeline, trace saving.
    public-session-service.ts Public session issue and lookup.
    chat-service.ts           Chat turn: limits, conversation, retrieval, step and reasoning events, streamed answer, stored turn and trace.
    *-runtime.ts              server-only wiring: builds services from env, exposes cached reads for pages.
  auth/                       Admin env, credential check, scrypt verifier, JWT signer, session cookie, login schema.
  http/                       Route-handler helpers: withPublicSession, publicJson, ndjsonStream, session cookie/key, limiter, client IP, download headers.
  storage/                    VercelBlobStore implements the BlobStore interface.
  llm/                        OpenRouter client (chat, embeddings, rerank), SSE parser, usage meter, llm-env, PDF-to-Markdown, llm-runtime (getLlm).
  cv/                         CV zod schema, ids, markdown rendering, LLM extractor and prompt, issues, legacy migration, download.
  rag/                        Contextual RAG pipeline. Pure; I/O is injected.
    corpus/                   CvCorpusSource: published CV as the corpus.
    chunking/                 Structured CV chunker, token-window chunker, span and token helpers.
    contextualize/            LLM and no-op chunk contextualizers, index-text builder.
    embedding/                Batched embedding, L2 normalization.
    indexing/                 IndexBuilder, index config, chunker kinds.
    search/                   English analyzer, BM25, vector index, InMemoryRetriever, LRU cache.
    query/                    LlmQueryRewriter and its prompt.
    fusion/                   Reciprocal Rank Fusion.
    rerank/                   ApiReranker (with passthrough fallback), PassthroughReranker.
    pipeline/                 RetrievalConfig (+ zod-free fields), TraceRecorder, RetrievalPipeline, trace stage schemas and reader.
    answer/                   Answer and small-talk prompts, off-topic reply, [S#] citation extraction.
    progress/                 Chat steps: projects trace stages into the public ChatStep shape (no chunk text or errors); EventChannel (push-to-pull queue).
    eval/                     Golden-set schema, retrieval metrics, CLI args, RetrievalEvaluator, markdown report.
    rag-composition.ts        Composition root. No server-only, no next/*, so scripts can reuse it.
    rag-runtime.ts            server-only; builds the RAG components lazily on first use.
```

## Where new code goes

| Adding | Put it in | Pattern to copy |
|---|---|---|
| A type or interface | `server/domain/<area>.ts` | `server/domain/rag.ts` |
| Pure logic | `server/<feature>/` with a colocated test | `server/rag/search/bm25-index.ts` |
| Constants a client form shares with a zod schema | A zod-free sibling module the schema imports | `server/rag/pipeline/retrieval-config-fields.ts` |
| A new traced RAG stage | Output schema in `trace-stages.ts`, a case in `readTrace`, a panel in `rag/_components/trace-stage-panel.tsx` | the `rerank` stage |
| A Mongo collection | `server/repositories/`, extend `MongoRepository` | `rag-index-repository.ts` |
| A use case | `server/services/<name>-service.ts`; wire it in `<name>-runtime.ts` | `cv-service.ts` + `cv-runtime.ts` |
| An admin mutation | `actions.ts` wrapped in `withAdmin`, state in `*-state.ts`, form with `useActionState` | `app/admin/(panel)/rag/` |
| A public JSON API | `app/api/public/**/route.ts` with `withPublicSession` and `publicJson` | `app/api/public/session/route.ts` |
| A public streaming API | Service returns an `AsyncIterable` of events; route wraps it in `ndjsonStream` and `after(() => finished)` | `app/api/public/chat/route.ts` |
| A client fetcher | `client/api/*` on `getPublicJson`, query options in `client/query/*` | `client/api/public-http.ts` |
| A client stream reader | `client/api/*` on `postPublicStream`; stop by cancelling the body, not by aborting the fetch | `client/api/chat.ts` |
| A script that uses the DB | `scripts/`, run with `bun --preload ./scripts/bun-v8-snapshot-shim.ts --conditions=react-server --env-file=.env.local`; no `next/*`; logic in pure modules | `scripts/rag-eval.ts` (`eval:rag` in package.json) |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
