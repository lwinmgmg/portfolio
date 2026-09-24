type SseEvent =
  | { kind: "continue"; dataLines: string[] }
  | { kind: "yield"; value: string; dataLines: string[] }
  | { kind: "stop" };

// Comment lines are ignored. `[DONE]` ends iteration. Payloads may span chunks.
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const split = splitCompleteLines(buffer, done);
      buffer = split.rest;

      for (const line of split.lines) {
        const event = consumeLine(line, dataLines);
        if (event.kind === "stop") return;
        dataLines = event.dataLines;
        if (event.kind === "yield") yield event.value;
      }

      if (!done) continue;
      if (dataLines.length === 0) return;

      const payload = dataLines.join("\n");
      if (payload !== "[DONE]") yield payload;
      return;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function splitCompleteLines(buffer: string, flush: boolean): { lines: string[]; rest: string } {
  const lines: string[] = [];
  let start = 0;
  let index = 0;

  while (index < buffer.length) {
    const char = buffer[index];
    if (char !== "\n" && char !== "\r") {
      index += 1;
      continue;
    }

    const atEnd = index + 1 === buffer.length;
    if (char === "\r" && atEnd && !flush) break;

    const pairedCrlf = char === "\r" && buffer[index + 1] === "\n";
    lines.push(buffer.slice(start, index));
    index += pairedCrlf ? 2 : 1;
    start = index;
  }

  if (flush && start < buffer.length) {
    lines.push(buffer.slice(start));
    return { lines, rest: "" };
  }

  return { lines, rest: buffer.slice(start) };
}

function consumeLine(line: string, dataLines: string[]): SseEvent {
  if (line === "") {
    if (dataLines.length === 0) return { kind: "continue", dataLines };
    const payload = dataLines.join("\n");
    if (payload === "[DONE]") return { kind: "stop" };
    return { kind: "yield", value: payload, dataLines: [] };
  }

  if (line.startsWith(":") || !line.startsWith("data:")) {
    return { kind: "continue", dataLines };
  }

  let value = line.slice("data:".length);
  if (value.startsWith(" ")) value = value.slice(1);
  return { kind: "continue", dataLines: [...dataLines, value] };
}
