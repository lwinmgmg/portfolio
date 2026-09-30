import type { ChatFeedback, MessageFeedbackStore } from "@/server/domain/chat";

export type FeedbackRequest = {
  sessionId: string;
  conversationId: string;
  messageIndex: number;
  value: ChatFeedback;
};

export type FeedbackResult = "saved" | "not_found";

// The visitor's thumb on an answer. Ownership is checked by the store, which matches on the
// session id, so one visitor cannot rate another's conversation.
export class ChatFeedbackService {
  constructor(private readonly store: Pick<MessageFeedbackStore, "setFeedback">) {}

  async rate(request: FeedbackRequest): Promise<FeedbackResult> {
    const saved = await this.store.setFeedback(
      request.conversationId,
      request.sessionId,
      request.messageIndex,
      request.value,
    );
    return saved ? "saved" : "not_found";
  }
}
