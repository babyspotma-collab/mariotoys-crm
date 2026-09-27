"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { uploadProductPhotos, type UploadState } from "./actions";

function PendingLabel() {
  const { pending } = useFormStatus();
  return pending ? <span className="text-[13px] text-muted">Envoi…</span> : null;
}

export default function UploadPhotosForm() {
  const initialState: UploadState = { error: null };
  const [state, formAction] = useFormState(uploadProductPhotos, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <form
        ref={formRef}
        action={(formData) => {
          formAction(formData);
          formRef.current?.reset();
        }}
        className="card flex items-center gap-6 border-dashed border-line-dashed p-7"
      >
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-cream-dark text-body">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4" />
            <path d="M7 9l5-5 5 5" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
        </div>
        <div className="flex flex-grow flex-col gap-1">
          <div className="text-base font-semibold">Glisse tes photos ici</div>
          <div className="text-[13px] text-muted">
            Photos WhatsApp acceptées telles quelles. Sans prix lisible, le produit est quand même créé, à compléter.
          </div>
        </div>
        <PendingLabel />
        <label htmlFor="photos" className="btn-primary cursor-pointer">
          Choisir des photos
        </label>
        <input
          id="photos"
          name="photos"
          type="file"
          accept="image/*"
          multiple
          required
          className="absolute -left-[9999px]"
          onChange={(e) => {
            if (e.currentTarget.files && e.currentTarget.files.length > 0) formRef.current?.requestSubmit();
          }}
        />
      </form>

      {state.error && <p className="rounded-lg bg-pill-red-bg p-3 text-sm text-pill-red-fg">{state.error}</p>}
    </div>
  );
}
