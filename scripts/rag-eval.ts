// Retrieval evaluation against the real database and OpenRouter. Usage: evals/README.md.
// Runs with `--conditions=react-server`, which turns `server-only` into an empty module, so the
// repositories load outside Next.js. Nothing here may import `next/*`.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DatabaseConfigError, getMongoClient, isDatabaseConfigured } from "../server/db/client";
import { runTransaction } from "../server/db/transaction";
import { RagError, type RagTraceRepository } from "../server/domain/rag";
import { getLlm, LlmConfigError } from "../server/llm/llm-runtime";
import {
  ACTIVE_INDEX,
  EVAL_USAGE,
  EvalArgsError,
  parseEvalArgs,
  type EvalArgs,
} from "../server/rag/eval/eval-args";
import { renderEvalMarkdown, reportFileName } from "../server/rag/eval/eval-report";
import { GoldenSetError, parseGoldenSet, selectByTags } from "../server/rag/eval/golden-set";
import {
  CHAT_PRESET,
  RetrievalEvaluator,
  type EvalTarget,
} from "../server/rag/eval/retrieval-evaluator";
import { createRag } from "../server/rag/rag-composition";
import { MongoCvVersionRepository } from "../server/repositories/cv-version-repository";
import { MongoRagChunkRepository } from "../server/repositories/rag-chunk-repository";
import { MongoRagIndexRepository } from "../server/repositories/rag-index-repository";
import { MongoRagSettingsRepository } from "../server/repositories/rag-settings-repository";

const REPORTS_DIR = "evals/reports";

// Eval traces are not saved. Only the playground, which the eval never calls, would save one.
const unsavedTraces: Pick<RagTraceRepository, "save"> = { save: () => Promise.resolve() };

class EvalSetupError extends Error {}

// Setup, config and golden-file errors print as their message; anything else keeps its stack.
function isForTheReader(error: unknown): error is Error {
  return (
    error instanceof EvalSetupError ||
    error instanceof GoldenSetError ||
    error instanceof DatabaseConfigError ||
    error instanceof LlmConfigError ||
    error instanceof RagError ||
    error instanceof SyntaxError
  );
}

async function main(args: EvalArgs): Promise<void> {
  const golden = parseGoldenSet(JSON.parse(await readFile(args.goldenPath, "utf8")));
  const items = selectByTags(golden, args.tags);
  if (items.length === 0) throw new EvalSetupError(`No golden questions are tagged ${args.tags.join(", ")}.`);
  if (!isDatabaseConfigured()) throw new DatabaseConfigError();

  const llm = getLlm();
  const indexes = new MongoRagIndexRepository();
  const chunks = new MongoRagChunkRepository();
  const cvVersions = new MongoCvVersionRepository();
  const rag = createRag(llm.env, {
    llm: llm.client,
    cvVersions,
    indexes,
    chunks,
    traces: unsavedTraces,
    settings: new MongoRagSettingsRepository(),
    transaction: runTransaction,
  });
  // The `chat` row runs what the chat uses: the saved config, or the defaults when none is.
  const chatConfig = args.presets.includes(CHAT_PRESET)
    ? (await rag.settings.chatSettings()).config
    : undefined;

  const subjectName = (await cvVersions.findPublished())?.data?.profile.fullName.trim();
  if (!subjectName) throw new EvalSetupError("Publish a CV with a name before evaluating retrieval.");

  const targets: EvalTarget[] = [];
  for (const ref of args.indexes) {
    const index = ref === ACTIVE_INDEX ? await indexes.findActive() : await indexes.findById(ref);
    if (!index) {
      throw new EvalSetupError(ref === ACTIVE_INDEX ? "No RAG index is active." : `RAG index "${ref}" was not found.`);
    }
    if (index.state !== "ready") throw new EvalSetupError(`RAG index "${index.id}" is ${index.state}, not ready.`);
    if (targets.some((target) => target.index.id === index.id)) continue;
    const entityKeys = new Set((await chunks.listByIndex(index.id)).flatMap((chunk) => chunk.entityKeys));
    // Loads the index into the search cache, so the first question does not pay for the read.
    await rag.retriever.searchLexical(index.id, subjectName, 1);
    targets.push({ index, entityKeys });
  }

  const evaluator = new RetrievalEvaluator({
    runner: rag.pipeline,
    onProgress: ({ indexId, preset, result, done, total }) => {
      const k = Math.max(...args.ks);
      const outcome = result.error
        ? `error at ${result.error.stage ?? "?"}`
        : `hit@${k}=${result.metrics.hitAt[k]}`;
      console.error(
        `[${done}/${total}] ${indexId.slice(-6)} ${preset} ${result.itemId}: ${outcome}, ${Math.round(result.totalMs)} ms`,
      );
    },
  });
  const report = await evaluator.evaluate({
    items,
    targets,
    presets: args.presets,
    chatConfig,
    ks: args.ks,
    subjectName,
    tags: args.tags,
  });

  process.stdout.write(`${renderEvalMarkdown(report)}\n`);
  await mkdir(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, reportFileName(report.createdAt));
  await writeFile(file, `${JSON.stringify({ goldenPath: args.goldenPath, ...report }, null, 2)}\n`);
  console.error(`Full report: ${file}`);
}

let args: EvalArgs;
try {
  args = parseEvalArgs(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof EvalArgsError)) throw error;
  console.error(`${error.message}\n\n${EVAL_USAGE}`);
  process.exit(2);
}

if (args.help) {
  console.log(EVAL_USAGE);
} else {
  try {
    await main(args);
  } catch (error) {
    console.error(isForTheReader(error) ? error.message : error);
    process.exitCode = 1;
  } finally {
    // The open connection pool would keep the process alive.
    if (isDatabaseConfigured()) await getMongoClient().close();
  }
}
