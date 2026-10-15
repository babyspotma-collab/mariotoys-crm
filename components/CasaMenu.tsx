import { Moped } from "@phosphor-icons/react/dist/ssr";
import CourierPicker from "@/components/CourierPicker";

// Bouton "Livraison Casa" (« Casa » sur mobile) : menu natif <details>
// (comme MoreMenu, sans JavaScript client). Choisir un livreur confirme la
// commande ET la remet à ce livreur — aucun colis Forcelog/Ozon.
export default function CasaMenu({
  action,
  compact = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  compact?: boolean;
}) {
  return (
    // static sous lg : le panneau s'ancre alors au bord droit de la ligne (la
    // ligne est "relative", voir app/page.tsx) et ne sort jamais de l'écran sur
    // téléphone ; relative à partir de lg : il s'ancre au bouton lui-même.
    <details className="group static lg:relative">
      <summary
        aria-label="Livraison Casablanca : remettre la commande à un livreur"
        className={`btn-secondary cursor-pointer list-none px-3 [&::-webkit-details-marker]:hidden ${
          compact ? "lg:h-9 lg:text-[13px]" : ""
        }`}
      >
        <Moped size={17} aria-hidden="true" />
        {/* libellé complet seulement quand la colonne d'actions est assez large (xl) */}
        <span className="hidden xl:inline">Livraison Casa</span>
        <span className="xl:hidden">Casa</span>
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-[230px] rounded-xl border border-line bg-white p-1.5 shadow-lg shadow-zinc-900/5">
        <p className="px-2.5 pb-1 pt-1 text-xs font-medium text-muted">Remettre à un livreur</p>
        <CourierPicker action={action} />
      </div>
    </details>
  );
}
