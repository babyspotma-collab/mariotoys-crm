"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Suggestion } from "@/lib/profit/suggest";
import { linkSuggestion } from "../actions";

const dh = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} DH`;

// Choix parmi les articles ALBASEET+ suggérés, puis « Valider ». La première
// suggestion est cochée d'office ; « Autre article » ouvre la fiche à corriger.
export default function SuggestionPicker({
  suggestions,
  variantId,
  itemIds,
  otherHref,
}: {
  suggestions: Suggestion[];
  variantId: string | null;
  itemIds: string[];
  otherHref: string;
}) {
  const router = useRouter();
  const [pick, setPick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) return <p className="text-sm font-medium text-pill-green-fg">Relié. Le coût est pris en compte.</p>;

  const validate = () => {
    const s = suggestions[pick];
    if (!s) return;
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
      <fieldset className="flex flex-col gap-1.5" disabled={pending}>
        <legend className="sr-only">Article ALBASEET+ suggéré</legend>
        {suggestions.map((s, i) => (
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
            <span className="shrink-0 text-xs tabular-nums text-muted">{Math.round(s.score * 100)} %</span>
          </label>
        ))}
      </fieldset>
      {error && <p className="alert-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary h-9 px-4 md:h-9" disabled={pending} onClick={validate}>
          {pending ? "Enregistrement…" : itemIds.length > 1 && !variantId ? `Valider pour les ${itemIds.length} lignes` : "Valider"}
        </button>
        <a href={otherHref} className="text-sm text-body underline">
          Autre article
        </a>
      </div>
    </div>
  );
}
