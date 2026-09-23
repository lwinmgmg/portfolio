import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import {
  runTransaction,
  type TransactionContext,
} from "@/server/db/transaction";
import type { NewProject, Project, ProjectRepository } from "@/server/domain/project";
import { MongoProjectRepository } from "@/server/repositories/project-repository";

export class InvalidProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectError";
  }
}

type TransactionRunner = <T>(
  work: (tx: TransactionContext) => Promise<T>,
) => Promise<T>;

export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly transaction: TransactionRunner = runTransaction,
  ) {}

  async list(): Promise<Project[]> {
    await connection();
    return this.projects.list();
  }

  async findById(id: string): Promise<Project | null> {
    await connection();
    return this.projects.findById(id);
  }

  async create(input: NewProject): Promise<Project> {
    await connection();
    const project = validateProject(input);
    // createIndex is rejected inside a transaction, so the index is built first.
    await this.projects.ensureReady();
    return this.transaction((tx) => this.projects.create(project, tx));
  }
}

function validateProject(input: NewProject): NewProject {
  const title = input.title.trim();
  const summary = input.summary.trim();
  const url = normalizeUrl(input.url);

  if (title.length === 0) {
    throw new InvalidProjectError("Title is required.");
  }
  if (summary.length === 0) {
    throw new InvalidProjectError("Summary is required.");
  }
  if (input.url?.trim() && !url) {
    throw new InvalidProjectError("URL must start with http:// or https://.");
  }

  return { title, summary, url };
}

function normalizeUrl(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

const projectService = new ProjectService(new MongoProjectRepository());

export const listProjects = cache(() => projectService.list());
export const findProject = cache((id: string) => projectService.findById(id));

export function createProject(input: NewProject): Promise<Project> {
  return projectService.create(input);
}
