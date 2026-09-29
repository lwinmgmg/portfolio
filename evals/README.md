# Retrieval evaluation

Runs golden questions through the retrieval pipeline against the real database and OpenRouter,
and compares presets and indexes.

## Run

```sh
bun run eval:rag -- --index active --presets vector-only,lexical-only,hybrid,hybrid-rerank,full
```

| Option | Default | Meaning |
|---|---|---|
| `--index <id\|active>[,...]` | `active` | Indexes to compare, e.g. a structured contextual index against a token-window plain one. Repeatable. Each must be `ready`. |
| `--presets <name>[,...]` | all | `vector-only`, `lexical-only`, `hybrid`, `hybrid-rerank`, `hybrid-rerank-rewrite`, `full`. |
| `--k <n>[,...]` | `1,3,5` | Cutoffs for hit@k and recall@k, 1 to 10. |
| `--tag <tag>[,...]` | none | Only questions with any of these tags. Repeatable. |
| `--golden <path>` | `evals/cv-retrieval.golden.json` | Golden file. |

It needs `.env.local` with the database and OpenRouter settings and a published CV. Questions run
one at a time. Presets with `rewrite` or `rerank` make paid or rate-limited calls for every question.
Traces are not saved.

## Output

- stdout: a markdown table with one row per index and preset (hit@k for each k, recall at the largest
  k, MRR, mean total and rerank milliseconds, errors), then the questions with no relevant chunk
  within the largest k and their top 3 retrieved titles, then golden keys the index does not contain.
- `evals/reports/<timestamp>.json`: every question's retrieved chunks, metrics and stage timings.
  Git ignores this folder.

## Golden file

A JSON array. Every item:

```json
{
  "id": "experience-1",
  "question": "Where does she work now?",
  "history": [{ "role": "user", "text": "..." }, { "role": "assistant", "text": "..." }],
  "relevantEntityKeys": ["experience:acme-senior-software-engineer-2021-04"],
  "tags": ["experience"]
}
```

- `id` must be unique. `history` (oldest first) and `tags` may be left out.
- `relevantEntityKeys` needs at least one key. A retrieved chunk is relevant when it carries any of
  them. Keys are shown on `/admin/rag/<indexId>` for each chunk: `profile`, `experience:<id>`,
  `project:<id>`, `education:<id>`, `skills:<id>`, `certification:<id>`, `language:<id>`, `other:<id>`.
- The five items tagged `example` use the test fixture CV (Jane Doe), not the published CV, so they
  score 0 against the real index. Replace them with real questions.

## Metrics

Computed over each preset's final chunks (`finalK`, 5 in every preset), so a relevant chunk below
that counts as missed.

- hit@k: 1 when a relevant chunk is in the top k.
- recall@k: share of the relevant keys that the top k chunks carry.
- MRR: mean of 1 / rank of the first relevant chunk (0 when none is in the top 10).

A question whose retrieval failed scores 0 and is counted under errors.
