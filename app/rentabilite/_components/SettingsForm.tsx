"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import type { ActionResult } from "../actions";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-fit">
      {pending ? "Enregistrement…" : label}
    </button>
  );
}

// Formulaire de réglage : envoie à l'action serveur et affiche son message.
export function SettingsForm({
  action,
  children,
  submitLabel = "Enregistrer",
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Save label={submitLabel} />
        {state && <p className={`text-sm ${state.ok ? "text-pill-green-fg" : "text-accent"}`}>{state.message}</p>}
      </div>
    </form>
  );
}

export type Column = { key: string; label: string; type?: "text" | "number"; placeholder?: string; className?: string };

// Lignes modifiables (ajout, suppression, recherche) envoyées en JSON dans le
// champ caché "rows" du formulaire parent.
export function EditableRows({ columns, initial, addLabel, searchable = false }: { columns: Column[]; initial: Record<string, string>[]; addLabel: string; searchable?: boolean }) {
  const [rows, setRows] = useState<Record<string, string>[]>(() => initial.map((r, i) => ({ ...r, _id: String(i) })));
  const [filter, setFilter] = useState("");
  const [nextId, setNextId] = useState(initial.length);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = useMemo(
    () => (filter.trim() ? rows.filter((r) => columns.some((c) => norm(r[c.key] ?? "").includes(norm(filter.trim())))) : rows),
    [rows, filter, columns]
  );
  const update = (id: string, key: string, value: string) => setRows((rs) => rs.map((r) => (r._id === id ? { ...r, [key]: value } : r)));

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="rows" value={JSON.stringify(rows.map(({ _id, ...r }) => r))} />
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        {searchable && (
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer…" className="input md:max-w-[260px]" aria-label="Filtrer les lignes" />
        )}
        <button
          type="button"
          onClick={() => {
            setRows((rs) => [{ _id: `n${nextId}` }, ...rs]);
            setNextId((n) => n + 1);
            setFilter("");
          }}
          className="btn-secondary w-fit"
        >
          <Plus size={16} aria-hidden="true" />
          {addLabel}
        </button>
        <span className="text-xs text-muted">{rows.length} ligne(s)</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto rounded-[10px] border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-cream">
            <tr className="text-left text-xs text-muted">
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {visible.map((r) => (
              <tr key={r._id}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-2 py-1.5 ${c.className ?? ""}`}>
                    <input
                      value={r[c.key] ?? ""}
                      onChange={(e) => update(r._id, c.key, e.target.value)}
                      inputMode={c.type === "number" ? "decimal" : undefined}
                      placeholder={c.placeholder}
                      aria-label={c.label}
                      className={`h-9 w-full rounded-md border border-transparent bg-transparent px-2 hover:border-line-input focus:border-ink focus:outline-none ${c.type === "number" ? "text-right tabular-nums" : ""}`}
                    />
                  </td>
                ))}
                <td className="px-1">
                  <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x._id !== r._id))} aria-label="Supprimer la ligne" className="btn-ghost h-8 w-8 px-0 md:h-8">
                    <Trash size={15} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-xs text-muted">
                  Aucune ligne.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
