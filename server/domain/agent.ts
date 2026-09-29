import type { ChatEvent, ToolCallOutcome } from "@/server/domain/chat";
import type { ToolDefinition } from "@/server/domain/llm";

// The turn a tool runs in.
export type ToolContext = { conversationId: string; sessionId: string; now: Date };

export type ToolOutcome = {
  // The tool message the model reads in the next round, as JSON text.
  resultForModel: string;
  // Sent to the visitor, e.g. the draft card. Null when there is nothing to show.
  event: ChatEvent | null;
  // For the trace.
  outcome: ToolCallOutcome;
  draftId: string | null;
};

// A function the answer model may call. The answer loop parses the model's arguments with
// `parse` and runs the tool only on a non-null result.
export interface AgentTool<Args = unknown> {
  readonly definition: ToolDefinition;
  // zod inside; null means the arguments are invalid.
  parse(args: unknown): Args | null;
  run(args: Args, context: ToolContext): Promise<ToolOutcome>;
}
