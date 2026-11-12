"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Suggestion } from "@/lib/profit/suggest";
import { linkSuggestion, searchArticles } from "../actions";

const dh = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} DH`;

// Choix parmi les articles ALBASEET+ suggérés (ou trouvés avec la recherche),
// puis « Valider ». Sans suggestion, la recherche est ouverte d'office.
export default function SuggestionPicker({
  suggestions,
  variantId,
  itemIds,
  defaultQuery,
}: {
  suggestions: Suggestion[];
  variantId: string | null;
  itemIds: string[];
  defaultQuery: string;
}) {
  const router = useRouter();
  const [choices, setChoices] = useState<Suggestion[]>(suggestions);
  const [pick, setPick] = useState(suggestions.length ? 0 : -1);
  const [searching, setSearching] = useState(suggestions.length === 0);
  const [q, setQ] = useState(suggestions.length === 0 ? defaultQuery : "");
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const [finding, find] = useTransition();

  useEffect(() => {
    if (!searching || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(
      () =>
        find(async () => {
          const res = await searchArticles(q);
          setHits(
            res
              .filter((h) => h.unitCost !== null)
              .map((h) => ({ code: h.code, designation: h.designation, unitCost: h.unitCost!, costLabel: h.costLabel, score: -1, via: null }))
          );
        }),
      250
    );
    return () => clearTimeout(t);
  }, [q, searching]);

  if (done) return <p className="text-sm font-medium text-pill-green-fg">Relié. Le coût est pris en compte.</p>;

  const choose = (s: Suggestion) => {
    const i = choices.findIndex((c) => c.code === s.code);
    if (i >= 0) setPick(i);
    else {
      setChoices((c) => [...c, s]);
      setPick(choices.length);
    }
    setSearching(false);
    setQ("");
  };

  const validate = () => {
    const s = choices[pick];
    if (!s) return setError("Choisis un article.");
    start(async () => {
      const res = await linkSuggestion({ variantId, itemIds: variantId ? undefined : itemIds, code: s.code, viaVariantId: s.via?.variantId ?? null });
      if (res.error) setError(res.error);
      else {
        setDone(true);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {choices.length === 0 && <p className="text-sm text-muted">Aucun article ressemblant trouvé automatiquement : cherche-le ci-dessous.</p>}
      {choices.length > 0 && (
        <fieldset className="flex flex-col gap-1.5" disabled={pending}>
          <legend className="sr-only">Article ALBASEET+</legend>
          {choices.map((s, i) => (
            <label
              key={s.code}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${i === pick ? "border-ink bg-cream" : "border-line-soft hover:bg-cream/60"}`}
            >
              <input type="radio" checked={i === pick} onChange={() => setPick(i)} className="mt-1 h-4 w-4 accent-ink" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{s.designation}</span>
                <span className="text-xs text-muted">
                  code {s.code} · {dh(s.unitCost)} ({s.costLabel})
                  {s.via ? ` · comme « ${s.via.name} »` : ""}
                </span>
              </span>
              {s.score >= 0 && <span className="shrink-0 text-xs tabular-nums text-muted">{Math.round(s.score * 100)} %</span>}
            </label>
          ))}
        </fieldset>
      )}

      {searching && (
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus={suggestions.length > 0}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Code, code-barres ou désignation ALBASEET+"
            className="input"
            aria-label="Rechercher un article ALBASEET+"
          />
          {finding && <p className="text-xs text-muted">Recherche…</p>}
          {!finding && q.trim().length >= 2 && hits.length === 0 && <p className="text-xs text-muted">Aucun article avec un prix pour « {q} ». Essaie un autre mot.</p>}
          {hits.length > 0 && (
            <ul className="flex flex-col divide-y divide-line-soft rounded-lg border border-line-soft">
              {hits.map((h) => (
                <li key={h.code}>
                  <button type="button" onClick={() => choose(h)} className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-cream">
                    <span className="font-medium">{h.designation}</span>
                    <span className="text-xs text-muted">
                      code {h.code} · {dh(h.unitCost)} ({h.costLabel})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="alert-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary h-9 px-4 md:h-9" disabled={pending || pick < 0} onClick={validate}>
          {pending ? "Enregistrement…" : itemIds.length > 1 && !variantId ? `Valider pour les ${itemIds.length} lignes` : "Valider"}
        </button>
        {!searching && (
          <button type="button" className="btn-secondary h-9 px-3 text-sm md:h-9" onClick={() => setSearching(true)}>
            Chercher un autre article
          </button>
        )}
      </div>
    </div>
  );
}
