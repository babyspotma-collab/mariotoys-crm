"use client";

import { useEffect, useState } from "react";

// Barre fixe en bas qui compte les cases cochées d'un formulaire (par son
// id, les cases pouvant être ailleurs dans la page via l'attribut form=)
// et affiche son bouton d'envoi dès qu'au moins une est cochée.
export default function SelectionBar({ formId, buttonLabel }: { formId: string; buttonLabel: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () =>
      setCount(document.querySelectorAll(`input[type=checkbox][form="${formId}"]:checked`).length);
    document.addEventListener("change", update);
    update();
    return () => document.removeEventListener("change", update);
  }, [formId]);

  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] z-30 flex justify-center px-4 md:bottom-6 md:pl-[228px]">
      <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl shadow-zinc-900/20">
        <span className="text-sm tabular-nums">{count} colis sélectionné{count > 1 ? "s" : ""}</span>
        <button type="submit" form={formId} className="btn h-10 bg-white px-4 text-ink hover:bg-cream">
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
