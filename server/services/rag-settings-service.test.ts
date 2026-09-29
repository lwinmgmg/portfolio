import { expect, test } from "bun:test";

import { InvalidRetrievalConfigError, RagError } from "@/server/domain/rag";
import { MemoryRagSettings } from "@/server/rag/__fixtures__/memory-rag-repositories";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";
import { RagSettingsService } from "@/server/services/rag-settings-service";

const now = new Date("2026-09-29T10:00:00.000Z");
const tuned = { ...DEFAULT_RETRIEVAL_CONFIG, finalK: 3, minRerankScore: 0.2 };

function setup() {
  const repository = new MemoryRagSettings();
  const warnings: unknown[][] = [];
  const service = new RagSettingsService(
    repository,
    () => now,
    (...args) => warnings.push(args),
  );
  return { repository, warnings, service };
}

test("without a saved config the chat uses the defaults", async () => {
  const { service, warnings } = setup();

  expect(await service.chatSettings()).toEqual({
    config: { ...DEFAULT_RETRIEVAL_CONFIG },
    updatedAt: null,
  });
  expect(warnings).toEqual([]);
});

test("a saved config is returned with its save time", async () => {
  const { service, repository } = setup();
  repository.chat = { config: tuned, updatedAt: "2026-09-28T00:00:00.000Z" };

  expect(await service.chatSettings()).toEqual({
    config: tuned,
    updatedAt: "2026-09-28T00:00:00.000Z",
  });
});

test("a saved config missing a newer field gets that field's default", async () => {
  const { service, repository } = setup();
  const older: Record<string, unknown> = { ...tuned };
  delete older.minRerankScore;
  repository.chat = { config: older, updatedAt: "2026-09-28T00:00:00.000Z" };

  expect((await service.chatSettings()).config).toEqual({
    ...tuned,
    minRerankScore: DEFAULT_RETRIEVAL_CONFIG.minRerankScore,
  });
});

test("a saved config that no longer parses gives the defaults and a warning", async () => {
  const { service, repository, warnings } = setup();
  repository.chat = {
    config: { ...tuned, finalK: 99, removedField: true },
    updatedAt: "2026-09-28T00:00:00.000Z",
  };

  expect(await service.chatSettings()).toEqual({
    config: { ...DEFAULT_RETRIEVAL_CONFIG },
    updatedAt: null,
  });
  expect(warnings).toHaveLength(1);
  expect(String(warnings[0]?.[0])).toContain("no longer parses");
});

test("a saved config round-trips with the clock's time", async () => {
  const { service } = setup();

  const saved = await service.saveChatConfig(tuned);

  expect(saved).toEqual({ config: tuned, updatedAt: "2026-09-29T10:00:00.000Z" });
  expect(await service.chatSettings()).toEqual(saved);
});

test("an invalid config is rejected with a message naming the field, and nothing is saved", async () => {
  const { service, repository } = setup();

  const error = await service.saveChatConfig({ ...tuned, minRerankScore: 1.5 }).catch(
    (failure: unknown) => failure,
  );

  expect(error instanceof InvalidRetrievalConfigError).toBe(true);
  expect(error instanceof RagError).toBe(true);
  expect(error instanceof Error ? error.message.split(":")[0] : "").toBe("Min rerank score");
  expect(repository.chat).toBeNull();
});
