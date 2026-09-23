import type { TransactionContext } from "@/server/db/transaction";

export type Project = {
  id: string;
  title: string;
  summary: string;
  url: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewProject = {
  title: string;
  summary: string;
  url: string | null;
};

export interface ProjectRepository {
  ensureReady(): Promise<void>;
  list(): Promise<Project[]>;
  findById(id: string): Promise<Project | null>;
  create(input: NewProject, tx: TransactionContext): Promise<Project>;
}
