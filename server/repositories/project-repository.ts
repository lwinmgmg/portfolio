import "server-only";

import type { WithId } from "mongodb";

import type { TransactionContext } from "@/server/db/transaction";
import type { NewProject, Project, ProjectRepository } from "@/server/domain/project";
import { MongoRepository } from "@/server/repositories/mongo-repository";

type ProjectDocument = {
  title: string;
  summary: string;
  url: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class MongoProjectRepository
  extends MongoRepository<Project, ProjectDocument>
  implements ProjectRepository
{
  constructor() {
    super("projects");
  }

  protected toEntity(document: WithId<ProjectDocument>): Project {
    return {
      id: document._id.toHexString(),
      title: document.title,
      summary: document.summary,
      url: document.url,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  protected override createIndexes(): Promise<string> {
    return this.collection().createIndex({ createdAt: -1 });
  }

  ensureReady(): Promise<void> {
    return this.ensureIndexes();
  }

  async list(): Promise<Project[]> {
    await this.ensureReady();
    const documents = await this.collection()
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    return documents.map((document) => this.toEntity(document));
  }

  async findById(id: string): Promise<Project | null> {
    const objectId = this.parseId(id);
    if (!objectId) return null;
    return this.findByObjectId(objectId);
  }

  create(input: NewProject, tx: TransactionContext): Promise<Project> {
    const now = new Date();
    return this.insert(
      {
        title: input.title,
        summary: input.summary,
        url: input.url,
        createdAt: now,
        updatedAt: now,
      },
      tx,
    );
  }
}
