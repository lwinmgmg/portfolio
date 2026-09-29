# Retrieval evaluation

Runs golden questions through the retrieval pipeline against the real database and OpenRouter,
and compares presets and indexes.

## Run

```sh
bun run eval:rag -- --index active --presets vector-only,lexical-only,hybrid,hybrid-rerank,full
```

To check a tuned chat config against a fixed preset:

```sh
bun run eval:rag -- --presets hybrid-rerank,chat
```

Every fixed preset leaves the CV owner's name out of BM25 queries ("Ignore name in BM25") and out
of the reranker's query and chunk texts ("Ignore name in rerank"). To measure what one of them
changes, save the same config as `hybrid-rerank-rewrite` with that box unticked ("Use for chat" in
the playground), then compare:

```sh
bun run eval:rag -- --presets hybrid-rerank-rewrite,chat
```

Every fixed preset also drops reranked chunks scoring below the mean of their question's rerank
scores ("Drop below mean rerank"), which lowers recall@k by design; compare it the same way.
Untick one box at a time, so the difference has one cause. Presets without rewriting only see the
name in the query when a golden question names the owner; the rerank toggle still strips it from
chunk contexts.

| Option | Default | Meaning |
|---|---|---|
| `--index <id\|active>[,...]` | `active` | Indexes to compare, e.g. a structured contextual index against a token-window plain one. Repeatable. Each must be `ready`. |
| `--presets <name>[,...]` | all but `chat` | `vector-only`, `lexical-only`, `hybrid`, `hybrid-rerank`, `hybrid-rerank-rewrite`, `hybrid-rerank-rewrite-route` (the same with the decision-model scope router), `full`, and `chat`: the config saved with "Use for chat" in the playground (the defaults when none is saved). |
| `--k <n>[,...]` | `1,3,5` | Cutoffs for hit@k and recall@k, 1 to 10. |
| `--tag <tag>[,...]` | none | Only questions with any of these tags. Repeatable. |
| `--golden <path>` | `evals/cv-retrieval.golden.json` | Golden file. |

It needs `.env.local` with the database and OpenRouter settings and a published CV. Questions run
one at a time. Presets with `rewrite` or `rerank` make paid or rate-limited calls for every question.
Traces are not saved.

## Output

- stdout: a markdown table with one row per index and preset (hit@k for each k, recall at the largest
  k, MRR, scope accuracy, CV questions that skipped retrieval, router fallbacks, mean total and rerank
  milliseconds, errors), then the questions with no relevant chunk within the largest k and their
  top 3 retrieved titles, then the questions whose scope differs from the golden one, then golden
  keys the index does not contain.
- `evals/reports/<timestamp>.json`: every question's retrieved chunks, metrics and stage timings.
  Git ignores this folder.

## Golden file

A JSON array. Every item:

```json
{
  "id": "experience-1",
  "question": "Where does she work now?",
  "history": [{ "role": "user", "text": "..." }, { "role": "assistant", "text": "..." }],
  "expectedScope": "cv",
  "relevantEntityKeys": ["experience:acme-senior-software-engineer-2021-04"],
  "tags": ["experience"]
}
```

- `id` must be unique. `history` (oldest first) and `tags` may be left out.
- `expectedScope` is `cv` (the default), `smalltalk` or `off_topic`: how the chat should classify the
  question. Only `cv` items get retrieval metrics; every item counts for scope accuracy.
- `relevantEntityKeys` needs at least one key on a `cv` item, and may be left out otherwise. A retrieved chunk is relevant when it carries any of
  them. Keys are shown on `/admin/rag/<indexId>` for each chunk: `profile`, `experience:<id>`,
  `project:<id>`, `education:<id>`, `skills:<id>`, `certification:<id>`, `language:<id>`, `other:<id>`.
- The five items tagged `example` use the test fixture CV (Jane Doe), not the published CV, so they
  score 0 against the real index. Replace them with real questions. The four items tagged `scope`
  are small talk and off-topic examples; they work against any CV.

## Metrics

Computed over each preset's final chunks (`finalK`, 5 in every fixed preset; `chat` uses its own),
so a relevant chunk below that counts as missed. With `chat`, chunks dropped by `minRerankScore` also
count as missed.

- hit@k: 1 when a relevant chunk is in the top k.
- recall@k: share of the relevant keys that the top k chunks carry.
- MRR: mean of 1 / rank of the first relevant chunk (0 when none is in the top 10).

A question whose retrieval failed scores 0 and is counted under errors.

Scope columns, over every question:

- scope acc: share of questions whose final scope (the router's short-circuit, else the rewriter's)
  equals `expectedScope`. A failed run counts as a miss.
- cv skipped: `cv` questions answered as small talk or off topic, so they got a fixed reply instead of
  sources. This is the costly mistake; compare it between `hybrid-rerank-rewrite` and
  `hybrid-rerank-rewrite-route` before saving the router for the chat.
- router fallbacks: questions whose route stage failed and went on to the rewriter.

To compare the router with the rewriter:

```sh
bun run eval:rag -- --presets hybrid-rerank-rewrite,hybrid-rerank-rewrite-route
```

# Scope-router probe (Plan.md 2.14)

A go/no-go check of a decision model before scope routing is built on it. It sends every message in
`evals/scope-probe.json` to OpenRouter's alpha Decisions API with the route question, one at a
time, one attempt each with a 5 s timeout, and prints per message the label, the model's choice,
the three scope probabilities, the latency and any error. Then it prints, at cutoffs 0.6 / 0.7 /
0.8 / 0.9, how many answers were right, how many CV questions would have skipped retrieval, how
many small-talk or off-topic messages would still go to the rewriter, and how many short-circuited
to the wrong scope. No database.

```sh
bun --env-file=.env.local scripts/probe-scope-router.ts
bun --env-file=.env.local scripts/probe-scope-router.ts --model typesafe/jev-1.13
```

| Option | Default | Meaning |
|---|---|---|
| `--model <slug>` | `LLM_ROUTER_MODEL` | Decision model to probe. |
| `--file <path>` | `evals/scope-probe.json` | Probe file: `{ "subject", "items": [{ "id", "expected", "message", "history"? }] }`, `expected` one of `cv`, `smalltalk`, `off_topic`. |

Free models allow about 20 requests a minute, so the last items of a full run can return 429.
`respan/span-01-lite:free` refuses the route question (it takes only yes/no questions);
`typesafe/jev-1.13`, the default, passed on 2026-09-29.
