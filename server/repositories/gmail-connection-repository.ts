import "server-only";

import type { WithId } from "mongodb";

import type { GmailConnection, GmailConnectionRepository } from "@/server/domain/email";
import { parseInstant } from "@/server/repositories/mongo-dates";
import { MongoRepository } from "@/server/repositories/mongo-repository";

const GMAIL_ID = "gmail";

// One document. The refresh token is stored as Google returned it: without GMAIL_CLIENT_SECRET,
// which only the env holds, it cannot be exchanged for an access token.
type GmailConnectionDocument = {
  _id: string;
  email: string | null;
  refreshToken: string;
  scopes: string[];
  connectedAt: Date;
};

type StoredConnection = GmailConnection & { id: string };

export class MongoGmailConnectionRepository
  extends MongoRepository<StoredConnection, GmailConnectionDocument>
  implements GmailConnectionRepository
{
  constructor() {
    super("email_connections");
  }

  protected toEntity(document: WithId<GmailConnectionDocument>): StoredConnection {
    return {
      id: document._id,
      email: document.email,
      refreshToken: document.refreshToken,
      scopes: document.scopes,
      connectedAt: document.connectedAt.toISOString(),
    };
  }

  async find(): Promise<GmailConnection | null> {
    const document = await this.collection().findOne({ _id: GMAIL_ID });
    if (!document) return null;
    const { email, refreshToken, scopes, connectedAt } = this.toEntity(document);
    return { email, refreshToken, scopes, connectedAt };
  }

  async save(connection: GmailConnection): Promise<void> {
    await this.collection().replaceOne(
      { _id: GMAIL_ID },
      {
        email: connection.email,
        refreshToken: connection.refreshToken,
        scopes: [...connection.scopes],
        connectedAt: parseInstant(connection.connectedAt),
      },
      { upsert: true },
    );
  }

  async remove(): Promise<void> {
    await this.collection().deleteOne({ _id: GMAIL_ID });
  }
}
