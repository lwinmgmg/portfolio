import type { TransactionContext } from "@/server/db/transaction";

export type CvVersionStatus = "draft" | "published" | "archived";

export type ExtractionStatus = "pending" | "running" | "succeeded" | "failed";

export type CvLink = {
  label: string;
  url: string;
};

export type CvProfile = {
  fullName: string;
  headline: string;
  location: string | null;
  summary: string | null;
  email: string | null;
  phone: string | null;
  links: CvLink[];
};

export type CvExperience = {
  id: string;
  company: string;
  role: string;
  location: string | null;
  employmentType: string | null;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  summary: string | null;
  highlights: string[];
  technologies: string[];
};

export type CvProject = {
  id: string;
  name: string;
  role: string | null;
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  summary: string;
  highlights: string[];
  technologies: string[];
};

export type CvEducation = {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  details: string[];
};

export type CvSkillGroup = {
  id: string;
  category: string;
  items: string[];
};

export type CvCertification = {
  id: string;
  name: string;
  issuer: string | null;
  date: string | null;
  url: string | null;
};

export type CvLanguage = {
  id: string;
  name: string;
  proficiency: string | null;
};

export type CvOtherSection = {
  id: string;
  title: string;
  items: string[];
};

export type CvData = {
  profile: CvProfile;
  experience: CvExperience[];
  projects: CvProject[];
  education: CvEducation[];
  skills: CvSkillGroup[];
  certifications: CvCertification[];
  languages: CvLanguage[];
  otherSections: CvOtherSection[];
};

export type CvExtraction = {
  profile: CvProfile;
  experience: Omit<CvExperience, "id">[];
  projects: Omit<CvProject, "id">[];
  education: Omit<CvEducation, "id">[];
  skills: Omit<CvSkillGroup, "id">[];
  certifications: Omit<CvCertification, "id">[];
  languages: Omit<CvLanguage, "id">[];
  otherSections: Omit<CvOtherSection, "id">[];
};

export type CvPdf = {
  pathname: string;
  filename: string;
  size: number;
  contentType: "application/pdf";
  uploadedAt: string;
};

export type CvVersion = {
  id: string;
  status: CvVersionStatus;
  pdf: CvPdf;
  extraction: {
    status: ExtractionStatus;
    model: string | null;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
  data: CvData | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export class CvVersionNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`CV version "${id}" was not found.`);
    this.name = "CvVersionNotFoundError";
    this.id = id;
  }
}

export interface CvVersionRepository {
  ensureReady(): Promise<void>;
  create(input: { pdf: CvPdf }, tx: TransactionContext): Promise<CvVersion>;
  findById(id: string): Promise<CvVersion | null>;
  findByPdfPathname(pathname: string): Promise<CvVersion | null>;
  findPublished(): Promise<CvVersion | null>;
  list(limit: number): Promise<CvVersion[]>;
  markExtraction(id: string, patch: Partial<CvVersion["extraction"]>): Promise<void>;
  saveData(id: string, data: CvData): Promise<CvVersion | null>;
  publish(id: string, tx: TransactionContext): Promise<CvVersion>;
  deleteDraft(id: string): Promise<boolean>;
}
