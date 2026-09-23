import "server-only";

import { type Db, MongoClient } from "mongodb";

const globalForMongo = globalThis as unknown as {
  mongoClient?: MongoClient;
};

function readEnv(name: "MONGODB_URI" | "MONGODB_DB"): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(readEnv("MONGODB_URI") && readEnv("MONGODB_DB"));
}

export class DatabaseConfigError extends Error {
  constructor() {
    super("Set MONGODB_URI and MONGODB_DB in .env.local.");
    this.name = "DatabaseConfigError";
  }
}

function requireEnv(name: "MONGODB_URI" | "MONGODB_DB"): string {
  const value = readEnv(name);
  if (!value) throw new DatabaseConfigError();
  return value;
}

// One pool per process. globalThis keeps that pool across dev hot reloads,
// which would otherwise construct a new client on every edit.
export function getMongoClient(): MongoClient {
  if (!globalForMongo.mongoClient) {
    globalForMongo.mongoClient = new MongoClient(requireEnv("MONGODB_URI"), {
      maxPoolSize: 10,
      retryWrites: true,
      writeConcern: { w: "majority", journal: true },
    });
  }
  return globalForMongo.mongoClient;
}

export function getDb(): Db {
  return getMongoClient().db(requireEnv("MONGODB_DB"));
}
