"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, X } from "@phosphor-icons/react/dist/ssr";
import { addCampaignLink, removeCampaignLink, searchTargets, type TargetHit } from "../actions";

export type LinkChip = { id: string; type: string; title: string };
export type Suggestion = { type: "PRODUCT" | "COLLECTION"; id: string; title: string };

// Produits / collections associés à une campagne Meta : retirer, accepter une
// suggestion (nom ressemblant) ou chercher dans le catalogue Shopify.
export default function CampaignTargets({ campaignId, links, suggestions }: { campaignId: string; links: LinkChip[]; suggestions: Suggestion[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TargetHit[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => start(async () => setHits(await searchTargets(q))), 250);
    return () => clearTimeout(t);
  }, [q]);

  const add = (t: Pick<TargetHit, "type" | "id" | "title">) =>
    start(async () => {
      await addCampaignLink(campaignId, t);
      setQ("");
      setOpen(false);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <span key={l.id} className="inline-flex h-7 max-w-full items-center gap-1 rounded-md bg-pill-blue-bg pl-2 pr-1 text-xs font-medium text-pill-blue-fg">
            <span className="truncate">{l.type === "COLLECTION" ? `Collection : ${l.title}` : l.title}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => removeCampaignLink(l.id))}
              aria-label={`Retirer ${l.title}`}
              className="rounded p-0.5 hover:bg-white/60"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        {suggestions.map((s) => (
          <button
            key={`${s.type}${s.id}`}
            type="button"
            disabled={pending}
            onClick={() => add(s)}
            className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-dashed border-line-dashed px-2 text-xs text-body hover:bg-cream"
            title="Suggestion d'après le nom de la campagne"
          >
            <Plus size={12} aria-hidden="true" />
            <span className="truncate">{s.type === "COLLECTION" ? `Collection : ${s.title}` : s.title}</span>
          </button>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink hover:bg-cream">
          <Plus size={12} aria-hidden="true" />
          Associer
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Produit ou collection Shopify"
            className="input"
            aria-label="Rechercher un produit ou une collection"
          />
          {q.trim().length >= 2 && (
            <ul className="max-h-64 overflow-y-auto rounded-[10px] border border-line">
              {hits.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted">{pending ? "Recherche…" : "Rien trouvé"}</li>
              ) : (
                hits.map((h) => (
                  <li key={`${h.type}${h.id}`}>
                    <button type="button" disabled={pending} onClick={() => add(h)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-cream">
                      {h.imageUrl ? (
                        <img src={`${h.imageUrl}${h.imageUrl.includes("?") ? "&" : "?"}width=64`} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="h-8 w-8 shrink-0 rounded-md bg-cream-dark" aria-hidden="true" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{h.title}</span>
                        <span className="block text-xs text-muted">{h.detail}</span>
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
