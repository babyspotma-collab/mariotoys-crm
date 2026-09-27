"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createParcel, type ConfirmState } from "./actions";
import type { ForcelogCity } from "@/lib/forcelog";
import type { OzonCity } from "@/lib/ozon";

type InitialValues = {
  receiver: string;
  phone: string;
  city: string;
  quartier: string;
  address: string;
  comment: string;
  productNature: string;
  price: number;
  fragile: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary flex-1 md:flex-none" disabled={pending}>
      {pending ? "Création du colis…" : "Créer le colis"}
    </button>
  );
}

export default function ConfirmForm({
  orderId,
  forcelogCities,
  ozonCities,
  initialValues,
}: {
  orderId: string;
  forcelogCities: ForcelogCity[];
  ozonCities: OzonCity[];
  initialValues: InitialValues;
}) {
  const action = createParcel.bind(null, orderId);
  const initialState: ConfirmState = { error: null };
  const [state, formAction] = useFormState(action, initialState);
  const [carrier, setCarrier] = useState<"FORCELOG" | "OZON">("FORCELOG");

  // Présélectionne la ville si son nom correspond à la ville Shopify
  // d'origine ; sinon on laisse le choix explicite à l'utilisateur plutôt
  // que de deviner (c'est tout le but de cet écran).
  const matchedForcelogCity = forcelogCities.find(
    (c) => c.name.toLowerCase() === initialValues.city.toLowerCase()
  );
  const matchedOzonCity = ozonCities.find(
    (c) => c.name.toLowerCase() === initialValues.city.toLowerCase()
  );

  const cityWarning = (
    <p className="hint text-pill-amber-fg">
      Ville Shopify « {initialValues.city} » non reconnue automatiquement. Choisissez la bonne ville dans la liste.
    </p>
  );

  return (
    <form action={formAction} className="card flex flex-col lg:order-1">
      <fieldset className="flex flex-col gap-3 p-4 md:p-6">
        <legend className="sr-only">Transporteur</legend>
        <h2 className="text-sm font-semibold">Transporteur</h2>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["FORCELOG", "Forcelog"],
              ["OZON", "Ozon Express"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-line-input text-sm font-medium text-body transition-colors hover:border-zinc-400 has-[:checked]:border-ink has-[:checked]:bg-cream has-[:checked]:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink"
            >
              <input
                type="radio"
                name="carrier"
                value={value}
                checked={carrier === value}
                onChange={() => setCarrier(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-line-soft p-4 md:p-6">
        <legend className="sr-only">Destinataire</legend>
        <h2 className="text-sm font-semibold">Destinataire</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="receiver">
              Nom
            </label>
            <input id="receiver" name="receiver" required defaultValue={initialValues.receiver} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Téléphone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              defaultValue={initialValues.phone}
              className="input tabular-nums"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-line-soft p-4 md:p-6">
        <legend className="sr-only">Livraison</legend>
        <h2 className="text-sm font-semibold">Livraison</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {carrier === "FORCELOG" ? (
            <div>
              <label className="label" htmlFor="forcelogCity">
                Ville
              </label>
              <select
                id="forcelogCity"
                name="forcelogCity"
                required
                defaultValue={matchedForcelogCity?.code ?? ""}
                className="input"
              >
                <option value="" disabled>
                  {forcelogCities.length === 0 ? "Liste des villes indisponible" : "Sélectionner une ville…"}
                </option>
                {forcelogCities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!matchedForcelogCity && initialValues.city && cityWarning}
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="ozonCity">
                Ville
              </label>
              <select
                id="ozonCity"
                name="ozonCity"
                required
                defaultValue={matchedOzonCity?.id ?? ""}
                className="input"
              >
                <option value="" disabled>
                  {ozonCities.length === 0 ? "Liste des villes indisponible" : "Sélectionner une ville…"}
                </option>
                {ozonCities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!matchedOzonCity && initialValues.city && cityWarning}
            </div>
          )}

          {carrier === "FORCELOG" && (
            <div>
              <label className="label" htmlFor="quartier">
                Quartier <span className="font-normal text-muted">(optionnel)</span>
              </label>
              <input id="quartier" name="quartier" defaultValue={initialValues.quartier} className="input" />
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="address">
            Adresse
          </label>
          <textarea id="address" name="address" required rows={2} defaultValue={initialValues.address} className="input" />
        </div>

        <div>
          <label className="label" htmlFor="comment">
            Commentaire <span className="font-normal text-muted">(optionnel)</span>
          </label>
          <textarea id="comment" name="comment" rows={2} defaultValue={initialValues.comment} className="input" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-line-soft p-4 md:p-6">
        <legend className="sr-only">Colis</legend>
        <h2 className="text-sm font-semibold">Colis</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
          <div>
            <label className="label" htmlFor="productNature">
              Nature du produit
            </label>
            <input
              id="productNature"
              name="productNature"
              required
              defaultValue={initialValues.productNature}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="price">
              Prix (DH)
            </label>
            <input
              id="price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={initialValues.price}
              className="input tabular-nums"
            />
          </div>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" name="fragile" defaultChecked={initialValues.fragile} className="h-4 w-4 accent-ink" />
          Colis fragile
        </label>
      </fieldset>

      {/* Barre d'action : collée en bas sur mobile (au-dessus des onglets) */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+56px)] flex flex-col gap-3 rounded-b-[14px] border-t border-line bg-white/95 p-4 backdrop-blur md:static md:bottom-auto md:px-6">
        {state.error && <p className="alert-error">{state.error}</p>}
        <div className="flex gap-2">
          <SubmitButton />
          <a href="/" className="btn-ghost">
            Plus tard
          </a>
        </div>
      </div>
    </form>
  );
}
