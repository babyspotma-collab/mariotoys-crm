"use client";

import { useEffect, useId, useState } from "react";
import type { AlbaseetSuggestion } from "@/app/api/albaseet/search/route";
import { formatDh } from "@/lib/format";

// Recherche d'un article ALBASEET+ par code ou désignation (produit absent de Shopify).
export default function AlbaseetPicker({ onPick }: { onPick: (a: AlbaseetSuggestion) => void }) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AlbaseetSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/albaseet/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        setResults(((await res.json()) as { articles: AlbaseetSuggestion[] }).articles);
        setError(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(true);
      }
      setLoading(false);
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
        role="combobox"
        aria-expanded={q.trim().length >= 2}
        aria-controls={listId}
        aria-label="Article ALBASEET+"
        placeholder="Code ou désignation ALBASEET+"
        className="input w-full"
      />
      {q.trim().length >= 2 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-[10px] border border-line bg-white py-1 shadow-lg">
          {results.map((a) => (
            <li
              key={a.code}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(a);
                setQ("");
              }}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-cream"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{a.designation}</span>
                <span className="text-xs text-muted">
                  Code {a.code}
                  {!a.hasCost && " · sans prix d'achat"}
                </span>
              </span>
              {a.prixVente !== null && <span className="shrink-0 tabular-nums text-muted">{formatDh(a.prixVente)}</span>}
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">{loading ? "Recherche…" : error ? "Recherche indisponible." : "Aucun article trouvé."}</li>
          )}
        </ul>
      )}
    </div>
  );
}
