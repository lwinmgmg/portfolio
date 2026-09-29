export type NdjsonStreamOptions<T> = {
  // Turns an error thrown by the events into a last line, or null to end without one.
  onError: (error: unknown) => T | null;
  // Called when the reader cancels, e.g. because the client disconnected.
  onCancel?: () => void;
};

export type NdjsonStream = {
  body: ReadableStream<Uint8Array>;
  // Settles once the events are exhausted, failed, or were closed after a cancel. Work the
  // iterator does on its way out (such as saving a stopped answer) has finished by then.
  finished: Promise<void>;
};

// Serializes events as newline-delimited JSON, pulling the next event only when the reader wants it.
export function ndjsonStream<T>(
  events: AsyncIterable<T>,
  options: NdjsonStreamOptions<T>,
): NdjsonStream {
  const iterator = events[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const line = (value: T) => encoder.encode(`${JSON.stringify(value)}\n`);
  const { promise: finished, resolve: finish } = Promise.withResolvers<void>();
  let cancelled = false;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (cancelled) return;
        if (next.done) {
          controller.close();
          finish();
          return;
        }
        controller.enqueue(line(next.value));
      } catch (error) {
        const last = options.onError(error);
        if (!cancelled) {
          if (last !== null) controller.enqueue(line(last));
          controller.close();
        }
        finish();
      }
    },
    async cancel() {
      cancelled = true;
      options.onCancel?.();
      try {
        // Waits for a pending `next()`, then runs the iterator's `finally` blocks.
        await iterator.return?.();
      } catch (error) {
        options.onError(error);
      } finally {
        finish();
      }
    },
  });

  return { body, finished };
}
