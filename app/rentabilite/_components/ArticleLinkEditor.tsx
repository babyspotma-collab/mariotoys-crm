"use client";

import { useEffect, useState, useTransition } from "react";
import { confirmLink, resetLink, searchArticles, setManualLink, type ArticleHit } from "../actions";

// Actions sur l'association d'une variante Shopify : valider un lien trouvé par
// le nom, choisir un autre article ALBASEET+, « aucun article », ou rendre la
// main à l'association automatique.
export default function ArticleLinkEditor({ variantId, method, hasCode }: { variantId: string; method: string | null; hasCode: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ArticleHit[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => start(async () => setHits(await searchArticles(q))), 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const run = (fn: () => Promise<void>) => start(async () => {
    await fn();
    setOpen(false);
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {method === "NAME" && (
          <button type="button" className="btn-secondary h-8 px-3 text-xs md:h-8" disabled={pending} onClick={() => run(() => confirmLink(variantId))}>
            Valider
          </button>
        )}
        <button type="button" className="btn-secondary h-8 px-3 text-xs md:h-8" disabled={pending} onClick={() => setOpen((o) => !o)}>
          {hasCode ? "Changer" : "Associer"}
        </button>
        {method !== "MANUAL" || hasCode ? (
          <button type="button" className="btn-ghost h-8 px-3 text-xs md:h-8" disabled={pending} onClick={() => run(() => setManualLink(variantId, null))}>
            Aucun article
          </button>
        ) : null}
        {method === "MANUAL" && (
          <button type="button" className="btn-ghost h-8 px-3 text-xs md:h-8" disabled={pending} onClick={() => run(() => resetLink(variantId))}>
            Automatique
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Code, code-barres ou désignation ALBASEET+"
            className="input"
            aria-label="Rechercher un article ALBASEET+"
          />
          {q.trim().length >= 2 && (
            <ul className="max-h-64 overflow-y-auto rounded-[10px] border border-line">
              {hits.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted">{pending ? "Recherche…" : "Aucun article trouvé"}</li>
              ) : (
                hits.map((h) => (
                  <li key={h.code}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setManualLink(variantId, h.code))}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-cream"
                    >
                      <span className="font-medium">{h.designation}</span>
                      <span className="text-xs text-muted">
                        {h.code}
                        {h.barcode ? ` · ${h.barcode}` : ""}
                        {h.fournisseur ? ` · ${h.fournisseur}` : ""} · {h.unitCost === null ? "sans prix" : `${Math.round(h.unitCost)} DH`} ({h.costLabel})
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
