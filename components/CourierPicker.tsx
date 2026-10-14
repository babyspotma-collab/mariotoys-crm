import { DEFAULT_COURIERS } from "@/lib/local-delivery";

// Choix d'un livreur : un bouton par livreur par défaut, plus un champ "Autre
// livreur". Fonctionne sans JavaScript client (formulaires natifs envoyés à
// une server action qui lit le champ "courier").
//
// DEUX formulaires séparés : la touche Entrée dans le champ "Autre livreur"
// n'envoie que ce champ — jamais le premier bouton (Amine) par erreur.
export default function CourierPicker({
  action,
  current,
}: {
  action: (formData: FormData) => void | Promise<void>;
  current?: string | null;
}) {
  const item =
    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-cream disabled:cursor-default disabled:text-muted";
  return (
    <div className="flex flex-col gap-1">
      <form action={action} className="flex flex-col gap-0.5">
        {DEFAULT_COURIERS.map((name) => (
          <button key={name} type="submit" name="courier" value={name} className={item} disabled={current === name}>
            {name}
            {current === name && <span className="text-xs text-muted">actuel</span>}
          </button>
        ))}
      </form>
      <form action={action} className="flex items-center gap-1.5 border-t border-line-soft px-1 pt-2">
        <input
          name="courier"
          required
          maxLength={40}
          autoComplete="off"
          aria-label="Autre livreur"
          placeholder="Autre livreur"
          className="input min-w-0 flex-1 !min-h-9 !px-2.5 !py-1 !text-[13px] md:!min-h-9"
        />
        <button type="submit" className="btn-secondary h-9 shrink-0 px-3 text-[13px] md:h-9">
          OK
        </button>
      </form>
    </div>
  );
}
