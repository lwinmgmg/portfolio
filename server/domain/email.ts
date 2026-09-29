export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
};

export type SentEmail = {
  /** The provider's id for the sent message. */
  messageId: string;
};

export interface EmailSender {
  send(email: OutgoingEmail, signal?: AbortSignal): Promise<SentEmail>;
}

/**
 * `retryable` is true only when the provider cannot have sent the message, so a later attempt
 * cannot deliver it twice. A send that may have reached the provider is never retryable.
 */
export class EmailSendError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      status: number | null;
      retryable: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "EmailSendError";
    this.status = options.status;
    this.retryable = options.retryable;
  }
}
