"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import CatalogLinePicker, { type CatalogPick } from "@/components/CatalogLinePicker";
import { formatDh } from "@/lib/format";
import { relinkOrderItem } from "./actions";

type Row = { key: number; pick: CatalogPick | null; quantity: number; price: number };
let nextKey = 1;

// Bouton « Relier au catalogue » d'une ligne de commande sans produit du catalogue.
// Une ligne combinée (« Quad x1, Vespa x1 ») se découpe en plusieurs produits ;
// le total de la ligne doit rester le même.
export default function RelinkItem({ itemId, quantity, price }: { itemId: string; quantity: number; price: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const original = price * quantity;
  const total = rows.reduce((s, r) => s + r.price * r.quantity, 0);
  const balanced = Math.abs(total - original) <= 0.01;

  const update = (key: number, patch: Partial<Row>) => {
    setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setError(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setRows([{ key: nextKey++, pick: null, quantity, price }]);
          setError(null);
          setOpen(true);
        }}
        className="btn-secondary w-fit px-3 text-sm"
      >
        Relier au catalogue
      </button>
    );
  }

  function save() {
    if (rows.some((r) => !r.pick)) return setError("Choisis pour chaque ligne un produit avec sa variante, ou un article ALBASEET+.");
    if (!balanced) return setError(`Le total doit rester ${formatDh(original)}.`);
    start(async () => {
      const res = await relinkOrderItem(
        itemId,
        rows.map((r) => ({ variantId: r.pick!.variantId, albaseetCode: r.pick!.albaseetCode, quantity: r.quantity, price: r.price }))
      );
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-cream/40 p-3">
      <p className="text-xs text-muted">
        Choisis le produit du catalogue (ou un article ALBASEET+ s&apos;il n&apos;est pas sur Shopify). Si la ligne contient plusieurs produits, ajoute une ligne par produit et répartis le prix payé.
      </p>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[70px_minmax(0,1fr)_40px] gap-2 md:grid-cols-[minmax(0,1fr)_70px_110px_40px]">
          <div className="col-span-3 md:col-span-1">
            <CatalogLinePicker onChange={(pick) => update(r.key, { pick })} />
          </div>
          <input
            type="number"
            min={1}
            value={r.quantity}
            onChange={(e) => update(r.key, { quantity: Number(e.target.value) })}
            className="input tabular-nums"
            aria-label="Quantité"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={r.price}
            onChange={(e) => update(r.key, { price: Number(e.target.value) })}
            className="input tabular-nums"
            aria-label="Prix unitaire payé (DH)"
          />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))}
              className="btn-icon text-muted hover:bg-pill-red-bg hover:text-accent"
              aria-label="Retirer ce produit"
            >
              <Trash size={18} aria-hidden="true" />
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((p) => [...p, { key: nextKey++, pick: null, quantity: 1, price: 0 }])}
        className="btn-ghost w-fit px-3 text-sm"
      >
        <Plus size={16} weight="bold" aria-hidden="true" />
        Ajouter un produit
      </button>
      <div className={`text-sm tabular-nums ${balanced ? "text-muted" : "text-accent"}`}>
        Total : {formatDh(total)} / {formatDh(original)} payé
      </div>
      {error && <p className="alert-error">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className="btn-primary">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-ghost px-3">
          Annuler
        </button>
      </div>
    </div>
  );
}
