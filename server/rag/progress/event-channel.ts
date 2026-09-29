// A push-to-pull queue: callbacks push items and a reader takes them with `for await`, so events
// from a pending promise's callbacks can be yielded while it runs. Unbounded, so it suits short
// streams such as one chat turn's step events.
type End = { kind: "closed" } | { kind: "failed"; error: unknown };

export class EventChannel<T> implements AsyncIterable<T> {
  private readonly buffer: T[] = [];
  private readonly waiting: PromiseWithResolvers<IteratorResult<T, undefined>>[] = [];
  private end: End | null = null;

  // Ignored once the channel has ended.
  push(item: T): void {
    if (this.end) return;
    const reader = this.waiting.shift();
    if (reader) {
      reader.resolve({ value: item, done: false });
    } else {
      this.buffer.push(item);
    }
  }

  // The reader gets the items already pushed, then finishes.
  close(): void {
    this.finish({ kind: "closed" });
  }

  // The reader gets the items already pushed, then `error` is thrown.
  fail(error: unknown): void {
    this.finish({ kind: "failed", error });
  }

  [Symbol.asyncIterator](): AsyncIterator<T, undefined> {
    return {
      next: () => this.next(),
      // A reader that stops early drops what is buffered and ignores later pushes.
      return: async () => {
        this.buffer.length = 0;
        this.close();
        return { value: undefined, done: true };
      },
    };
  }

  private next(): Promise<IteratorResult<T, undefined>> {
    if (this.buffer.length > 0) {
      return Promise.resolve({ value: this.buffer.shift() as T, done: false });
    }
    const { end } = this;
    if (end?.kind === "failed") {
      // The error is thrown once; after that the channel reads as closed.
      this.end = { kind: "closed" };
      return Promise.reject(end.error);
    }
    if (end) return Promise.resolve({ value: undefined, done: true });
    const reader = Promise.withResolvers<IteratorResult<T, undefined>>();
    this.waiting.push(reader);
    return reader.promise;
  }

  private finish(end: End): void {
    if (this.end) return;
    // Readers only wait on an empty buffer, so a reader waiting now gets the end.
    const readers = this.waiting.splice(0);
    for (const reader of readers) {
      if (end.kind === "failed") {
        reader.reject(end.error);
      } else {
        reader.resolve({ value: undefined, done: true });
      }
    }
    // An error a waiting reader already got is not thrown again.
    this.end = end.kind === "failed" && readers.length > 0 ? { kind: "closed" } : end;
  }
}
