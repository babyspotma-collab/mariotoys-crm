"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { classifyArticles } from "../actions";

export type ClassifyRow = {
  code: string;
  designation: string;
  fournisseur: string | null;
  famille: string | null;
  prixAchat: number | null;
  prixGros: number | null;
  costType: "LOCAL" | "IMPORTE" | "NON_CLASSE";
  costLabel: string;
  unitCost: number | null;
  flagged: boolean;
};

const TYPE_LABEL = { LOCAL: "Local", IMPORTE: "Importé", NON_CLASSE: "Non classé" } as const;
const TYPE_CLASS = {
  LOCAL: "bg-pill-green-bg text-pill-green-fg",
  IMPORTE: "bg-pill-blue-bg text-pill-blue-fg",
  NON_CLASSE: "bg-pill-amber-bg text-pill-amber-fg",
} as const;
const dh = (v: number | null) => (v === null ? "—" : `${Math.round(v).toLocaleString("fr-FR")} DH`);

function TypeButtons({ disabledAll }: { disabledAll: boolean }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" name="type" value="LOCAL" disabled={pending || disabledAll} className="btn h-9 bg-white px-3 text-ink hover:bg-cream md:h-9">
        Acheté localement
      </button>
      <button type="submit" name="type" value="IMPORTE" disabled={pending || disabledAll} className="btn h-9 bg-white px-3 text-ink hover:bg-cream md:h-9">
        Importé
      </button>
      <button type="submit" name="type" value="NON_CLASSE" disabled={pending || disabledAll} className="btn h-9 bg-white/80 px-3 text-ink hover:bg-cream md:h-9">
        Non classé
      </button>
    </>
  );
}

// Tableau des articles ALBASEET+ avec cases à cocher ; la barre du bas classe la
// sélection (ou tous les résultats du filtre) en « acheté localement », « importé »
// ou « non classé ». Le type n'est jamais modifié par la synchro.
export default function ClassifyTable({ rows, filter, total }: { rows: ClassifyRow[]; filter: Record<string, string>; total: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.code));
  const toggle = (code: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.code)));

  return (
    <>
      <div className="card overflow-hidden">
        <label className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-xs text-muted">
          <input type="checkbox" checked={allOnPage} onChange={toggleAll} className="h-4 w-4 accent-ink" />
          Tout sélectionner sur cette page
        </label>
        <ul className="divide-y divide-line-soft">
          {rows.map((r) => (
            <li key={r.code}>
              <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-3 hover:bg-cream md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
                <input type="checkbox" checked={selected.has(r.code)} onChange={() => toggle(r.code)} className="mt-0.5 h-4 w-4 accent-ink md:mt-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.designation}</div>
                  <div className="text-xs text-muted">
                    {r.code}
                    {r.fournisseur ? ` · ${r.fournisseur}` : ""}
                    {r.famille ? ` · ${r.famille}` : ""}
                  </div>
                </div>
                <div className="col-start-2 text-xs tabular-nums text-body md:col-start-auto">
                  achat {dh(r.prixAchat)} · gros {dh(r.prixGros)}
                </div>
                <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-1.5 md:col-start-auto">
                  <span className={`inline-block h-6 rounded-md px-2 text-xs font-medium leading-6 ${TYPE_CLASS[r.costType]}`}>{TYPE_LABEL[r.costType]}</span>
                  <span className={`text-xs ${r.flagged ? "text-pill-amber-fg" : "text-muted"}`}>
                    {dh(r.unitCost)} · {r.costLabel}
                  </span>
                </div>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* Barre d'action : sélection de la page, ou tous les résultats du filtre. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] z-10 md:bottom-4">
        <div className="flex flex-col gap-2 rounded-2xl bg-ink p-3 text-white shadow-xl shadow-zinc-900/20 md:flex-row md:items-center md:justify-between">
          {selected.size > 0 ? (
            <form action={async (fd) => { await classifyArticles(fd); setSelected(new Set()); }} className="flex flex-wrap items-center gap-2">
              {[...selected].map((code) => (
                <input key={code} type="hidden" name="code" value={code} />
              ))}
              <span className="mr-1 text-sm tabular-nums">{selected.size} sélectionné(s) →</span>
              <TypeButtons disabledAll={false} />
            </form>
          ) : (
            <form
              action={classifyArticles}
              onSubmit={(e) => {
                if (!window.confirm(`Classer les ${total} articles du filtre actuel ?`)) e.preventDefault();
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="scope" value="filter" />
              {Object.entries(filter).map(([k, v]) => (
                <input key={k} type="hidden" name={k === "type" ? "filterType" : k} value={v} />
              ))}
              <span className="mr-1 text-sm tabular-nums">Les {total.toLocaleString("fr-FR")} résultats du filtre →</span>
              <TypeButtons disabledAll={total === 0} />
            </form>
          )}
        </div>
      </div>
    </>
  );
}
