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

/** What the chat's Send needs: a ready sender, the fixed recipient and the send limits. */
export type ContactOutbox = {
  sender: EmailSender;
  to: string;
  sessionLimit: number;
  dailyLimit: number;
};

/** The owner's Gmail account, connected on the admin Email page. Server-only: holds the token. */
export type GmailConnection = {
  /** The connected address, from the ID token. Null if Google did not return one. */
  email: string | null;
  refreshToken: string;
  scopes: string[];
  connectedAt: string;
};

export interface GmailConnectionRepository {
  find(): Promise<GmailConnection | null>;
  /** Replaces any earlier connection. */
  save(connection: GmailConnection): Promise<void>;
  remove(): Promise<void>;
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
