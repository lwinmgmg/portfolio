// Shared class names for the RAG admin pages. They follow the CV version page's look.
export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export const card =
  "rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export const primaryButton = `w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const smallButton = `w-fit rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 ${focusRing}`;

export const smallDangerButton = `w-fit rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950 ${focusRing}`;

export const link = `font-medium text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`;

export const note = "text-sm text-zinc-600 dark:text-zinc-400";

export const errorText = "text-sm text-red-700 dark:text-red-400";
