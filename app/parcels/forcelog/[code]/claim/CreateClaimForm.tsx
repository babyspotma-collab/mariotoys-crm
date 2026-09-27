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
    <button type="submit" className="btn-primary w-full md:w-fit" disabled={pending || disabled}>
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
    <form action={formAction} className="card flex flex-col gap-5 p-4 md:p-6">
      <div>
        <label className="label" htmlFor="typeId">
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
          className="input"
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
          <label className="label" htmlFor={`extra_${field}`}>
            {fieldLabel(field)}
          </label>
          <input
            id={`extra_${field}`}
            name={`extra_${field}`}
            type={fieldInputType(field)}
            required
            className="input"
          />
        </div>
      ))}

      <div>
        <label className="label" htmlFor="message">
          Message <span className="font-normal text-muted">(1000 caractères max)</span>
        </label>
        <textarea
          id="message"
          name="message"
          required
          maxLength={1000}
          rows={4}
          className="input"
        />
      </div>

      {needsConfirmation && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] bg-pill-amber-bg p-3.5 text-sm text-pill-amber-fg">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-ink"
          />
          Ce type de réclamation change immédiatement le statut du colis. Je confirme vouloir continuer.
        </label>
      )}

      {state.error && <p className="alert-error">{state.error}</p>}

      <SubmitButton
        label={needsConfirmation && !confirmed ? "Confirmez ci-dessus" : "Envoyer la réclamation"}
        disabled={needsConfirmation && !confirmed}
      />
    </form>
  );
}
