import { expect, test } from "bun:test";

import type { ChatFeedback } from "@/server/domain/chat";
import type { RetrievalTrace, TraceListFilter } from "@/server/domain/rag";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";
import { TraceHistoryService } from "@/server/services/trace-history-service";

function trace(id: string, kind: RetrievalTrace["kind"]): RetrievalTrace {
  return {
    id,
    kind,
    indexId: null,
    config: { ...DEFAULT_RETRIEVAL_CONFIG },
    stages: [
      {
        name: "rewrite",
        input: { message: `q-${id}`, history: [], mode: "none", subjectName: "J" },
        output: { queries: [`q-${id}`], scope: "cv", raw: null },
        startedAt: 0,
        durationMs: 1,
        error: null,
      },
    ],
    sources: [],
    totalMs: 5,
    createdAt: "2026-09-30T08:00:00.000Z",
  };
}

function setup() {
  const stored = [trace("t1", "chat"), trace("t2", "playground"), trace("t3", "chat")];
  const lists: TraceListFilter[] = [];
  const ratings = new Map<string, ChatFeedback>([
    ["t1", "down"],
    ["t3", "up"],
  ]);
  const service = new TraceHistoryService({
    traces: {
      list: async (_limit, filter = {}) => {
        lists.push(filter);
        return stored.filter(
          (item) =>
            (!filter.kind || item.kind === filter.kind) && (!filter.ids || filter.ids.includes(item.id)),
        );
      },
      findById: async (id) => stored.find((item) => item.id === id) ?? null,
    },
    feedback: {
      feedbackByTraceId: async (ids) =>
        new Map([...ratings].filter(([id]) => ids.includes(id))),
      traceIdsWithFeedback: async (value) =>
        [...ratings].filter(([, rating]) => rating === value).map(([id]) => id),
    },
  });
  return { service, lists };
}

test("the list carries each trace's feedback", async () => {
  const { service } = setup();
  const rows = await service.list();

  expect(rows.map((row) => [row.id, row.feedback, row.question])).toEqual([
    ["t1", "down", "q-t1"],
    ["t2", null, "q-t2"],
    ["t3", "up", "q-t3"],
  ]);
});

test("the kind filter is passed to the repository", async () => {
  const { service, lists } = setup();
  const rows = await service.list({ kind: "playground" });

  expect(rows.map((row) => row.id)).toEqual(["t2"]);
  expect(lists).toEqual([{ kind: "playground" }]);
});

test("the thumbs-down filter lists only the traces rated down, as chat traces", async () => {
  const { service, lists } = setup();
  const rows = await service.list({ feedback: "down" });

  expect(rows.map((row) => row.id)).toEqual(["t1"]);
  expect(lists).toEqual([{ kind: "chat", ids: ["t1"] }]);
});

test("a trace opens with its feedback and golden snippet, or is missing", async () => {
  const { service } = setup();
  const detail = await service.get("t1");

  expect(detail?.summary.feedback).toBe("down");
  expect(detail?.golden?.question).toBe("q-t1");
  expect(await service.get("nope")).toBeNull();
});
