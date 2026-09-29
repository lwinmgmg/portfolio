import type { ChatTurn } from "@/server/domain/chat";
import type { CvVersionRepository } from "@/server/domain/cv";
import {
  RagError,
  RetrievalError,
  type RagTraceRepository,
  type RetrievalConfig,
  type RetrievalRunner,
  type RetrievalTrace,
} from "@/server/domain/rag";

export type PlaygroundRequest = {
  message: string;
  history: ChatTurn[];
  config: RetrievalConfig;
  // Null searches the active index.
  indexId: string | null;
};

export type PlaygroundRun = {
  trace: RetrievalTrace;
  // Why retrieval failed. The trace shows the failed stage and its error.
  error: string | null;
  saved: boolean;
};

// The rewriter needs the name of the person whose CV is searched.
export class PlaygroundSubjectError extends RagError {
  constructor() {
    super("Publish a CV with a name before testing retrieval.");
    this.name = "PlaygroundSubjectError";
  }
}

type Log = (message: string, error: unknown) => void;

// Runs retrieval for the admin playground and keeps every trace, failed runs included, so a
// run can be reopened later.
export class RetrievalPlaygroundService {
  constructor(
    private readonly pipeline: RetrievalRunner,
    private readonly traces: Pick<RagTraceRepository, "save">,
    private readonly cvVersions: Pick<CvVersionRepository, "findPublished">,
    private readonly log: Log = (message, error) => console.error(message, error),
  ) {}

  async run(request: PlaygroundRequest): Promise<PlaygroundRun> {
    const subjectName = await this.subjectName();

    let trace: RetrievalTrace;
    let error: string | null = null;
    try {
      ({ trace } = await this.pipeline.run({
        message: request.message,
        history: request.history,
        config: request.config,
        indexId: request.indexId ?? undefined,
        subjectName,
        kind: "playground",
      }));
    } catch (failure) {
      if (!(failure instanceof RetrievalError)) throw failure;
      this.log("Playground retrieval failed.", failure.cause);
      trace = failure.trace;
      error = failure.message;
    }

    return { trace, error, saved: await this.save(trace) };
  }

  private async subjectName(): Promise<string> {
    const published = await this.cvVersions.findPublished();
    const name = published?.data?.profile.fullName.trim();
    if (!name) throw new PlaygroundSubjectError();
    return name;
  }

  // A trace that cannot be saved is still shown, so the run is not lost to a database error.
  private async save(trace: RetrievalTrace): Promise<boolean> {
    try {
      await this.traces.save(trace);
      return true;
    } catch (error) {
      this.log("Could not save the playground trace.", error);
      return false;
    }
  }
}
