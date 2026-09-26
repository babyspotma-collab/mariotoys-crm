"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { uploadProductPhotos, type UploadState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Envoi…" : "Créer les produits"}
    </button>
  );
}

export default function UploadPhotosForm() {
  const initialState: UploadState = { error: null, skipped: [] };
  const [state, formAction] = useFormState(uploadProductPhotos, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formAction(formData);
        formRef.current?.reset();
      }}
      className="bg-white border border-line rounded-2xl p-6 mb-8"
    >
      <label className="block text-sm font-medium mb-2" htmlFor="photos">
        Photos produit
      </label>
      <p className="text-xs text-muted mb-3">
        Le prix (coût d&apos;achat) doit être à la fin du nom de fichier, ex :{" "}
        <span className="font-mono">299.jpg</span> ou{" "}
        <span className="font-mono">voiture-police_299.jpg</span>.
      </p>
      <input
        id="photos"
        name="photos"
        type="file"
        accept="image/*"
        multiple
        required
        className="block w-full text-sm border border-line rounded-lg px-3 py-2 mb-4"
      />

      {state.error && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-4">{state.error}</p>
      )}

      <SubmitButton />
    </form>
  );
}
