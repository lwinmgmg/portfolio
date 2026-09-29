import {
  parseAnswer,
  type AnswerBlock,
  type InlineNode,
} from "@/app/(public)/_components/chat/chat-markdown";
import { CHAT_NOTICES, type ChatState } from "@/app/(public)/_components/chat/chat-state";

// About two lines of the bubble: enough to see what the answer is about.
export const ANSWER_PREVIEW_MAX_CHARS = 160;

const FALLBACK = "Your answer is ready.";

// What the robot's bubble says when an answer finished while the chat was closed: the notice if
// the turn went wrong, otherwise the start of the answer as plain text (no Markdown or [S#]).
export function answerPreview(chat: ChatState): string {
  if (chat.notice) return CHAT_NOTICES[chat.notice];
  const last = chat.entries.at(-1);
  if (last?.role !== "assistant") return FALLBACK;
  const text = plainText(parseAnswer(last.text, false));
  return text ? shorten(text, ANSWER_PREVIEW_MAX_CHARS) : FALLBACK;
}

function plainText(blocks: readonly AnswerBlock[]): string {
  return blocks.map(blockText).join(" ").replace(/\s+/g, " ").trim();
}

function blockText(block: AnswerBlock): string {
  switch (block.kind) {
    case "paragraph":
    case "heading":
      return inlineText(block.content);
    case "list":
      return block.items
        .map((item) => [inlineText(item.content), ...item.lists.map(blockText)].join(" "))
        .join(" ");
    case "code":
      return block.text;
    case "rule":
      return "";
  }
}

function inlineText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
        case "code":
          return node.text;
        case "strong":
        case "em":
        case "link":
          return inlineText(node.children);
        case "cite":
          return "";
      }
    })
    .join("");
}

// Cut at a word, so the preview never ends mid-word.
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const words = space > max / 2 ? cut.slice(0, space) : cut;
  return `${words.replace(/[\s,;:.–-]+$/, "")}…`;
}
