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
  "w-full border border-gray-300 bg-white px-2 py-1 text-base text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 read-only:bg-gray-100";
const secondaryButton =
  "w-fit border border-gray-400 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

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
    <details open className="border border-gray-300 bg-white">
      <summary className="cursor-pointer px-3 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        {title}
      </summary>
      <div className="space-y-3 border-t border-gray-200 p-3">{children}</div>
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
      {items.length === 0 ? <p className="text-sm">None yet.</p> : null}
      {items.map((item, index) => (
        <article key={getKey(item, index)} className="space-y-3 border border-gray-200 p-3">
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
  if (readOnly) return null;
  return (
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
      <button type="button" className={secondaryButton} onClick={onRemove}>
        Remove {label}
      </button>
    </div>
  );
}

type TextFieldProps = {
  label: string;
  path: string;
  multiline?: boolean;
  placeholder?: string;
};

export function TextField({
  label,
  path,
  value,
  multiline = false,
  placeholder,
  onChange,
}: TextFieldProps & { value: string; onChange: (value: string) => void }) {
  const { issues, readOnly } = use(CvFieldContext);
  const error = cvFieldMessage(issues, path);
  const describedBy = error ? `${path}-error` : undefined;
  const control = {
    value,
    readOnly,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: controlClass,
  };
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {multiline ? (
        <textarea {...control} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...control} onChange={(event) => onChange(event.target.value)} />
      )}
      {error ? (
        <span id={`${path}-error`} className="text-red-700">
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
      label={`${label} (one item per line)`}
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
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
