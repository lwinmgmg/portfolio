import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import type { CvVersion } from "@/server/domain/cv";
import {
  RetrievalError,
  type RetrievalRequest,
  type RetrievalResult,
  type RetrievalTrace,
} from "@/server/domain/rag";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";
import {
  PlaygroundSubjectError,
  RetrievalPlaygroundService,
} from "@/server/services/retrieval-playground-service";

const at = "2026-09-29T08:00:00.000Z";

const trace: RetrievalTrace = {
  id: "trace-1",
  kind: "playground",
  indexId: "index-1",
  config: { ...DEFAULT_RETRIEVAL_CONFIG },
  stages: [],
  sources: [],
  totalMs: 3,
  createdAt: at,
};

const published: CvVersion = {
  id: "cv-1",
  status: "published",
  pdf: {
    pathname: "cv/resume.pdf",
    filename: "resume.pdf",
    size: 1,
    contentType: "application/pdf",
    uploadedAt: at,
  },
  extraction: { status: "succeeded", model: "m", error: null, startedAt: at, finishedAt: at },
  data: sampleCv,
  createdAt: at,
  updatedAt: at,
  publishedAt: at,
};

function setup(options: { run?: (request: RetrievalRequest) => Promise<RetrievalResult>; saveFails?: boolean; cv?: CvVersion | null } = {}) {
  const requests: RetrievalRequest[] = [];
  const saved: RetrievalTrace[] = [];
  const logged: string[] = [];
  const service = new RetrievalPlaygroundService(
    {
      run: async (request) => {
        requests.push(request);
        if (options.run) return options.run(request);
        return { chunks: [], scope: "cv", queries: [request.message], trace };
      },
    },
    {
      save: async (value) => {
        if (options.saveFails) throw new Error("database down");
        saved.push(value);
      },
    },
    { findPublished: async () => (options.cv === undefined ? published : options.cv) },
    (message) => logged.push(message),
  );
  return { service, requests, saved, logged };
}

const request = {
  message: "Where did she work?",
  history: [{ role: "user" as const, text: "Hi" }],
  config: { ...DEFAULT_RETRIEVAL_CONFIG, finalK: 3 },
  indexId: null,
};

async function rejection(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => null,
    (error: unknown) => error,
  );
}

test("a run uses the published CV's name, a playground trace, and saves the trace", async () => {
  const { service, requests, saved } = setup();

  const run = await service.run(request);

  expect(requests).toEqual([
    {
      message: "Where did she work?",
      history: [{ role: "user", text: "Hi" }],
      config: { ...DEFAULT_RETRIEVAL_CONFIG, finalK: 3 },
      indexId: undefined,
      subjectName: sampleCv.profile.fullName,
      kind: "playground",
    },
  ]);
  expect(run).toEqual({ trace, error: null, saved: true });
  expect(saved).toEqual([trace]);
});

test("a chosen index is passed through", async () => {
  const { service, requests } = setup();
  await service.run({ ...request, indexId: "index-2" });
  expect(requests[0]?.indexId).toBe("index-2");
});

test("a failed stage still returns and saves the partial trace", async () => {
  const failedTrace = { ...trace, id: "trace-2" };
  const { service, saved, logged } = setup({
    run: async () => {
      throw new RetrievalError(
        {
          ...failedTrace,
          stages: [
            { name: "rerank", input: null, output: null, startedAt: 0, durationMs: 1, error: "down" },
          ],
        },
        new Error("down"),
      );
    },
  });

  const run = await service.run(request);

  expect(run.error).toBe("Retrieval failed at the rerank stage.");
  expect(run.trace.id).toBe("trace-2");
  expect(run.saved).toBe(true);
  expect(saved.map((entry) => entry.id)).toEqual(["trace-2"]);
  expect(logged).toEqual(["Playground retrieval failed."]);
});

test("a trace that cannot be saved is still returned", async () => {
  const { service, logged } = setup({ saveFails: true });

  const run = await service.run(request);

  expect(run).toEqual({ trace, error: null, saved: false });
  expect(logged).toEqual(["Could not save the playground trace."]);
});

test("other errors, such as a missing index, are rethrown and nothing is saved", async () => {
  const failure = new Error("index missing");
  const { service, saved } = setup({
    run: async () => {
      throw failure;
    },
  });

  expect(await rejection(service.run(request))).toBe(failure);
  expect(saved.length).toBe(0);
});

test("without a published CV there is no subject to search for", async () => {
  const { service, requests } = setup({ cv: null });

  expect((await rejection(service.run(request))) instanceof PlaygroundSubjectError).toBe(true);
  expect(requests.length).toBe(0);
});
