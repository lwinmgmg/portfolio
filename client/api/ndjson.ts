// Yields each JSON line of a newline-delimited body as soon as it is complete. A chunk can end
// mid-line or mid-character, so text is buffered until its newline arrives. Lines that are not
// valid JSON are skipped.
// Aborting `signal` cancels the body, which also ends the request, and the reader then stops.
export async function* readNdjson(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<unknown, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const cancel = () => {
    reader.cancel().catch(() => {});
  };
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });

  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        yield* parsed(line);
        newline = buffer.indexOf("\n");
      }
      if (done) break;
    }
    yield* parsed(buffer);
  } finally {
    signal?.removeEventListener("abort", cancel);
    // A no-op once the body has ended; otherwise the consumer stopped early and the body is dropped.
    cancel();
  }
}

function* parsed(line: string): Generator<unknown, void, undefined> {
  const trimmed = line.trim();
  if (!trimmed) return;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return;
  }
  yield value;
}
