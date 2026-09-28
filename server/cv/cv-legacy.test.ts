import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import { type StoredCvData, upgradeStoredCvData } from "@/server/cv/cv-legacy";
import { CvDataSchema } from "@/server/cv/cv-schema";

test("fills project details missing from versions saved before the field existed", () => {
  const legacyProject: StoredCvData["projects"][number] = { ...sampleCv.projects[0] };
  delete legacyProject.details;
  const stored: StoredCvData = { ...sampleCv, projects: [legacyProject] };

  const upgraded = upgradeStoredCvData(stored);

  expect(upgraded.projects[0].details).toBeNull();
  expect(CvDataSchema.safeParse(upgraded).success).toBe(true);
});

test("keeps current data unchanged", () => {
  expect(upgradeStoredCvData(sampleCv)).toEqual(sampleCv);
});
