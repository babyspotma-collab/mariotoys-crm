"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitCreateClaim, type ClaimState } from "./actions";
import type { ClaimType } from "@/lib/forcelog";

function fieldLabel(name: string) {
  if (name.includes("PRICE")) return "Nouveau prix (DH)";
  if (name.includes("DATE")) return "Nouvelle date";
  return name;
}

function fieldInputType(name: string) {
  if (name.includes("PRICE")) return "number";
  if (name.includes("DATE")) return "date";
  return "text";
}

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending || disabled}>
      {pending ? "Envoi…" : label}
    </button>
  );
}

export default function CreateClaimForm({ code, types }: { code: string; types: ClaimType[] }) {
  const action = submitCreateClaim.bind(null, code);
  const initialState: ClaimState = { error: null };
  const [state, formAction] = useFormState(action, initialState);
  const [typeId, setTypeId] = useState<number | "">("");
  const [confirmed, setConfirmed] = useState(false);

  const selectedType = useMemo(() => types.find((t) => t.id === typeId), [types, typeId]);
  const needsConfirmation = selectedType?.changesParcel ?? false;

  return (
    <form action={formAction} className="flex flex-col gap-5 bg-white border border-line rounded-2xl p-6">
      {state.error && <p className="text-sm text-danger bg-danger/10 rounded-lg p-3">{state.error}</p>}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="typeId">
          Type de réclamation
        </label>
        <select
          id="typeId"
          name="typeId"
          required
          value={typeId}
          onChange={(e) => {
            setTypeId(Number(e.target.value));
            setConfirmed(false);
          }}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="" disabled>
            {types.length === 0 ? "Liste indisponible" : "Choisir un type…"}
          </option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {selectedType?.requires.map((field) => (
        <div key={field}>
          <label className="block text-sm font-medium mb-1" htmlFor={`extra_${field}`}>
            {fieldLabel(field)}
          </label>
          <input
            id={`extra_${field}`}
            name={`extra_${field}`}
            type={fieldInputType(field)}
            required
            className="w-full border border-line rounded-lg px-3 py-2 text-sm"
          />
        </div>
      ))}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="message">
          Message <span className="text-muted font-normal">(1000 caractères max)</span>
        </label>
        <textarea
          id="message"
          name="message"
          required
          maxLength={1000}
          rows={4}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {needsConfirmation && (
        <label className="flex items-start gap-2 text-sm bg-danger/10 text-danger rounded-lg p-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          Ce type de réclamation change le statut du colis immédiatement — je confirme vouloir
          continuer.
        </label>
      )}

      <SubmitButton
        label={needsConfirmation && !confirmed ? "Confirmez ci-dessus" : "Envoyer la réclamation"}
        disabled={needsConfirmation && !confirmed}
      />
    </form>
  );
}
