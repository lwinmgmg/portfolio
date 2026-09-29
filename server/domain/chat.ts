// One message of a visitor conversation, without sources or metadata.
export type ChatTurn = { role: "user" | "assistant"; text: string };
