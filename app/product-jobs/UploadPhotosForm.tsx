"use client";

import { useRef, useState } from "react";
import { ImageSquare } from "@phosphor-icons/react/dist/ssr";
import { useFormState, useFormStatus } from "react-dom";
import { uploadProductPhotos, type UploadState } from "./actions";

function PendingLabel() {
  const { pending } = useFormStatus();
  return pending ? <span className="text-[13px] font-medium text-muted">Envoi en cours…</span> : null;
}

export default function UploadPhotosForm() {
  const initialState: UploadState = { error: null };
  const [state, formAction] = useFormState(uploadProductPhotos, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <form
        ref={formRef}
        action={(formData) => {
          formAction(formData);
          formRef.current?.reset();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!inputRef.current || e.dataTransfer.files.length === 0) return;
          inputRef.current.files = e.dataTransfer.files;
          formRef.current?.requestSubmit();
        }}
        className={`relative flex flex-col items-center gap-4 rounded-[14px] border border-dashed p-6 text-center transition-colors md:flex-row md:gap-5 md:p-7 md:text-left ${
          dragging ? "border-ink bg-cream-dark" : "border-line-dashed bg-white"
        }`}
      >
        <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cream-dark text-body md:flex">
          <ImageSquare size={24} aria-hidden="true" />
        </div>
        <div className="flex flex-grow flex-col gap-1">
          <div className="text-[15px] font-semibold">
            <span className="md:hidden">Ajouter des photos produit</span>
            <span className="hidden md:inline">Glissez vos photos ici</span>
          </div>
          <div className="text-[13px] text-muted">
            Photos WhatsApp acceptées telles quelles. Sans prix lisible, le produit est créé quand même, à compléter.
          </div>
        </div>
        <PendingLabel />
        <label htmlFor="photos" className="btn-primary w-full cursor-pointer md:w-auto">
          Choisir des photos
        </label>
        <input
          ref={inputRef}
          id="photos"
          name="photos"
          type="file"
          accept="image/*"
          multiple
          required
          className="sr-only"
          onChange={(e) => {
            if (e.currentTarget.files && e.currentTarget.files.length > 0) formRef.current?.requestSubmit();
          }}
        />
      </form>

      {state.error && <p className="alert-error">{state.error}</p>}
    </div>
  );
}
