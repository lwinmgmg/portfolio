"use client";

import { createContext, use, type ReactNode } from "react";

import {
  emptyTextToNull,
  moveItem,
  removeAt,
  replaceAt,
} from "@/app/admin/(panel)/cv/[versionId]/cv-form";
import { cvFieldMessage } from "@/server/cv/cv-issues";
import type { CvFieldIssue } from "@/server/domain/cv";

const controlClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 read-only:border-zinc-200 read-only:bg-zinc-50 read-only:text-zinc-700 read-only:shadow-none aria-invalid:border-red-600 aria-invalid:ring-red-600/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/30 dark:read-only:border-zinc-800 dark:read-only:bg-zinc-900 dark:read-only:text-zinc-300";
const labelClass = "text-sm font-medium text-zinc-800 dark:text-zinc-200";
const hintClass = "text-xs text-zinc-500 dark:text-zinc-400";
const secondaryButton =
  "w-fit rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";
const dangerTextButton =
  "w-fit rounded-md px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-red-400 dark:hover:bg-red-950";

type CvFieldSettings = {
  issues: readonly CvFieldIssue[];
  readOnly: boolean;
};

// Every field in one editor shares the same issues and read-only mode.
export const CvFieldContext = createContext<CvFieldSettings>({ issues: [], readOnly: true });

// What an item editor receives: the item, its issue path, and a patch callback.
export type ItemEditorProps<T> = {
  item: T;
  path: string;
  update: (patch: Partial<T>) => void;
};

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details
      open
      className="group overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-zinc-50 px-4 py-3 text-base font-semibold hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden className="text-zinc-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-700">{children}</div>
    </details>
  );
}

// An ordered list of items with add, remove, move up, and move down.
export function ItemList<T>({
  itemLabel,
  addLabel,
  path,
  items,
  create,
  getKey,
  onChange,
  children,
}: {
  itemLabel: string;
  addLabel: string;
  path: string;
  items: readonly T[];
  create: () => T;
  getKey: (item: T, index: number) => string;
  onChange: (items: T[]) => void;
  children: (props: ItemEditorProps<T>) => ReactNode;
}) {
  const { readOnly } = use(CvFieldContext);
  return (
    <>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
          None yet.
        </p>
      ) : null}
      {items.map((item, index) => (
        <article
          key={getKey(item, index)}
          className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-950/40"
        >
          <ItemActions
            index={index}
            total={items.length}
            label={itemLabel}
            onMove={(direction) => onChange(moveItem(items, index, direction))}
            onRemove={() => onChange(removeAt(items, index))}
          />
          {children({
            item,
            path: `${path}.${index}`,
            update: (patch) => onChange(replaceAt(items, index, patch)),
          })}
        </article>
      ))}
      {readOnly ? null : (
        <button type="button" className={secondaryButton} onClick={() => onChange([...items, create()])}>
          {addLabel}
        </button>
      )}
    </>
  );
}

export function byId(item: { id: string }): string {
  return item.id;
}

function ItemActions({
  index,
  total,
  label,
  onMove,
  onRemove,
}: {
  index: number;
  total: number;
  label: string;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { readOnly } = use(CvFieldContext);
  const heading = (
    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {label} {index + 1} of {total}
    </p>
  );
  if (readOnly) return heading;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700">
      {heading}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          Move up
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          Move down
        </button>
        <button type="button" className={dangerTextButton} onClick={onRemove}>
          Remove {label}
        </button>
      </div>
    </div>
  );
}

type TextFieldProps = {
  label: string;
  path: string;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
};

export function TextField({
  label,
  path,
  value,
  multiline = false,
  placeholder,
  hint,
  optional = false,
  onChange,
}: TextFieldProps & { value: string; optional?: boolean; onChange: (value: string) => void }) {
  const { issues, readOnly } = use(CvFieldContext);
  const error = cvFieldMessage(issues, path);
  // Hints are about how to type; a read-only view has no use for them.
  const hintId = hint && !readOnly ? `${path}-hint` : undefined;
  const errorId = error ? `${path}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = {
    value,
    readOnly,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: controlClass,
  };
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className={labelClass}>{label}</span>
        {optional && !readOnly ? <span className={hintClass}>Optional</span> : null}
      </span>
      {multiline ? (
        <textarea {...control} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...control} onChange={(event) => onChange(event.target.value)} />
      )}
      {hintId ? (
        <span id={hintId} className={hintClass}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </label>
  );
}

// A nullable text value. An empty field stores null.
export function OptionalTextField({
  value,
  onChange,
  ...props
}: TextFieldProps & { value: string | null; onChange: (value: string | null) => void }) {
  return (
    <TextField
      {...props}
      optional
      value={value ?? ""}
      onChange={(text) => onChange(emptyTextToNull(text))}
    />
  );
}

// A string list edited as one item per line. The schema drops blank lines on save.
export function LineField({
  label,
  path,
  value,
  onChange,
}: {
  label: string;
  path: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <TextField
      label={label}
      hint="One item per line."
      path={path}
      value={value.join("\n")}
      multiline
      onChange={(text) => onChange(text.split("\n"))}
    />
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { readOnly } = use(CvFieldContext);
  return (
    <label className="flex w-fit items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-zinc-300 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      />
      <span className={labelClass}>{label}</span>
    </label>
  );
}
