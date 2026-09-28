import type { CvData, CvProject } from "@/server/domain/cv";

// Versions saved before a field existed lack it in Mongo. Each later field is
// optional here, so both old and current documents type-check as stored data.
type StoredCvProject = Omit<CvProject, "details"> & Partial<Pick<CvProject, "details">>;

export type StoredCvData = Omit<CvData, "projects"> & { projects: StoredCvProject[] };

// Reads fill fields added after a version was written, so every caller sees
// complete `CvData` and strict saves of an older draft still validate.
export function upgradeStoredCvData(data: StoredCvData): CvData {
  return {
    ...data,
    projects: data.projects.map((project) => ({ ...project, details: project.details ?? null })),
  };
}
