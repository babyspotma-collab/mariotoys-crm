"use client";

import { useFormState, useFormStatus } from "react-dom";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { declareOzonPickup, sendForcelogPickup, type PickupState } from "@/app/parcels/actions";

type Defaults = { phone: string; city: string; address: string; comment: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full md:w-fit" disabled={pending}>
      {pending ? "Envoi…" : label}
    </button>
  );
}

// Forcelog : envoi réel par l'API. Ozon : pas d'API, on ouvre leur page
// puis on note la demande (solution choisie par l'utilisateur).
export default function PickupForm({
  carrier,
  defaults,
  cities,
  ozonUrl,
}: {
  carrier: "forcelog" | "ozon";
  defaults: Defaults;
  cities: { code: string; name: string }[];
  ozonUrl: string;
}) {
  const initial: PickupState = { ok: false, message: null };
  const [state, formAction] = useFormState(carrier === "forcelog" ? sendForcelogPickup : declareOzonPickup, initial);
  const isOzon = carrier === "ozon";

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h2 className="text-sm font-semibold">Nouvelle demande de ramassage</h2>
        <p className="hint">
          {isOzon
            ? "Ozon n'a pas d'API pour le ramassage : faites la demande sur leur site, puis notez-la ici pour l'historique."
            : "Envoyée directement à Forcelog. Les champs reprennent votre dernière demande."}
        </p>
      </div>

      {isOzon && (
        <a href={ozonUrl} target="_blank" rel="noreferrer" className="btn-secondary w-full md:w-fit">
          Ouvrir la page Ramassage d&apos;Ozon
          <ArrowSquareOut size={16} aria-hidden="true" />
        </a>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="pickup-phone">
            Téléphone
          </label>
          <input id="pickup-phone" name="phone" type="tel" required={!isOzon} maxLength={14} defaultValue={defaults.phone} className="input tabular-nums" />
        </div>
        <div>
          <label className="label" htmlFor="pickup-city">
            Ville
          </label>
          {cities.length > 0 ? (
            <select id="pickup-city" name="city" required defaultValue={defaults.city} className="input">
              <option value="" disabled>
                Sélectionner une ville…
              </option>
              {cities.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input id="pickup-city" name="city" required={!isOzon} maxLength={50} defaultValue={defaults.city} className="input" />
          )}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="pickup-address">
          Adresse de ramassage
        </label>
        <textarea id="pickup-address" name="address" required rows={2} maxLength={100} defaultValue={defaults.address} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="pickup-comment">
          Commentaire <span className="font-normal text-muted">(optionnel)</span>
        </label>
        <textarea id="pickup-comment" name="comment" rows={2} maxLength={100} defaultValue={defaults.comment} className="input" />
      </div>
      {!isOzon && (
        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" name="stickers" className="h-4 w-4 accent-ink" />
          J&apos;ai déjà collé les étiquettes (stickers)
        </label>
      )}

      {state.message && (
        <p className={state.ok ? "rounded-[10px] bg-pill-green-bg px-3.5 py-3 text-sm text-pill-green-fg" : "alert-error"} role="status">
          {state.message}
        </p>
      )}
      <Submit label={isOzon ? "Noter la demande faite sur Ozon" : "Demander un ramassage"} />
    </form>
  );
}
