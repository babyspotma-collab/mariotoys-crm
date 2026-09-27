"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createManualOrder, type NewOrderState } from "./actions";
import type { ShopifyProductSummary } from "@/lib/shopify-admin";
import { formatDh } from "@/lib/format";
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";

type Line = { productId: string; title: string; price: number; quantity: number };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary flex-1 md:flex-none" disabled={pending}>
      {pending ? "Création…" : "Créer la commande"}
    </button>
  );
}

export default function NewOrderForm({ products }: { products: ShopifyProductSummary[] }) {
  const initialState: NewOrderState = { error: null };
  const [state, formAction] = useFormState(createManualOrder, initialState);
  const [lines, setLines] = useState<Line[]>([{ productId: "", title: "", price: 0, quantity: 1 }]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateLine(index, {
      productId,
      title: product?.title ?? "",
      price: product?.price ?? 0,
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: "", title: "", price: 0, quantity: 1 }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  return (
    <form action={formAction} className="card flex flex-col">
      <input type="hidden" name="items" value={JSON.stringify(lines)} />

      <fieldset className="flex flex-col gap-4 p-4 md:p-6">
        <legend className="sr-only">Client</legend>
        <h2 className="text-sm font-semibold">Client</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="customerName">
              Nom du client
            </label>
            <input id="customerName" name="customerName" required autoComplete="off" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Téléphone
            </label>
            <input id="phone" name="phone" type="tel" required autoComplete="off" className="input tabular-nums" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="city">
            Ville
          </label>
          <input id="city" name="city" required className="input" />
          <p className="hint">La ville exacte du transporteur se choisit à l&apos;étape Confirmer.</p>
        </div>
        <div>
          <label className="label" htmlFor="address">
            Adresse
          </label>
          <textarea id="address" name="address" required rows={2} className="input" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-line-soft p-4 md:p-6">
        <legend className="sr-only">Articles</legend>
        <h2 className="text-sm font-semibold">Articles</h2>

        <div className="hidden grid-cols-[minmax(0,1fr)_80px_120px_40px] gap-2 text-xs font-medium text-muted md:grid">
          <span>Produit</span>
          <span>Quantité</span>
          <span>Prix unitaire</span>
          <span />
        </div>

        <div className="flex flex-col gap-4 md:gap-2">
          {lines.map((line, i) => (
            <div
              key={i}
              className="grid grid-cols-[80px_minmax(0,1fr)_44px] gap-2 md:grid-cols-[minmax(0,1fr)_80px_120px_40px]"
            >
              <select
                value={line.productId}
                onChange={(e) => selectProduct(i, e.target.value)}
                aria-label="Produit"
                className="input col-span-3 md:col-span-1"
              >
                <option value="" disabled>
                  {products.length === 0 ? "Catalogue indisponible" : "Choisir un produit…"}
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                className="input tabular-nums"
                aria-label="Quantité"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={line.price}
                onChange={(e) => updateLine(i, { price: Number(e.target.value) })}
                className="input tabular-nums"
                aria-label="Prix unitaire (DH)"
              />
              {lines.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="btn-icon text-muted hover:bg-pill-red-bg hover:text-accent"
                  aria-label="Retirer cet article"
                >
                  <Trash size={18} aria-hidden="true" />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={addLine} className="btn-ghost w-fit px-3">
          <Plus size={16} weight="bold" aria-hidden="true" />
          Ajouter un article
        </button>
      </fieldset>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+56px)] flex flex-col gap-3 rounded-b-[14px] border-t border-line bg-white/95 p-4 backdrop-blur md:static md:bottom-auto md:px-6">
        {state.error && <p className="alert-error">{state.error}</p>}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted">Total</span>
            <span className="text-lg font-semibold tabular-nums">{formatDh(total)}</span>
          </div>
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}
