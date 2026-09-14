"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createManualOrder, type NewOrderState } from "./actions";
import type { ShopifyProductSummary } from "@/lib/shopify-admin";

type Line = { productId: string; title: string; price: number; quantity: number };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
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
    <form action={formAction} className="flex flex-col gap-5 bg-white border border-line rounded-2xl p-6">
      {state.error && <p className="text-sm text-danger bg-danger/10 rounded-lg p-3">{state.error}</p>}

      <input type="hidden" name="items" value={JSON.stringify(lines)} />

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="customerName">
          Nom du client
        </label>
        <input
          id="customerName"
          name="customerName"
          required
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="phone">
          Téléphone
        </label>
        <input
          id="phone"
          name="phone"
          required
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="city">
          Ville
        </label>
        <input
          id="city"
          name="city"
          required
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted mt-1">
          La correspondance avec la vraie ville Forcelog se fera sur l&apos;écran de vérification,
          à l&apos;étape Confirmer.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="address">
          Adresse
        </label>
        <textarea
          id="address"
          name="address"
          required
          rows={2}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <p className="block text-sm font-medium mb-2">Articles</p>
        <div className="flex flex-col gap-3">
          {lines.map((line, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={line.productId}
                onChange={(e) => selectProduct(i, e.target.value)}
                className="flex-1 min-w-[180px] border border-line rounded-lg px-3 py-2 text-sm bg-white"
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
                className="w-20 border border-line rounded-lg px-3 py-2 text-sm"
                aria-label="Quantité"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={line.price}
                onChange={(e) => updateLine(i, { price: Number(e.target.value) })}
                className="w-28 border border-line rounded-lg px-3 py-2 text-sm"
                aria-label="Prix unitaire (DH)"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="text-sm text-danger px-2"
                  aria-label="Retirer cet article"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine} className="text-sm text-sage-dark mt-3">
          + Ajouter un article
        </button>
      </div>

      <p className="text-sm font-semibold">Total : {total} DH</p>

      <SubmitButton />
    </form>
  );
}
