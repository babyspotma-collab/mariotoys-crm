export type ParcelsSubTab =
  | "all"
  | "newParcel"
  | "waitingPickup"
  | "inProgress"
  | "stuck"
  | "returns";

const SUB_TABS: { id: ParcelsSubTab; label: string; href: string }[] = [
  { id: "all", label: "Tous les colis", href: "/parcels" },
  { id: "newParcel", label: "Nouveau colis", href: "/parcels/new-parcel" },
  { id: "waitingPickup", label: "Attente de ramassage", href: "/parcels/waiting-pickup" },
  { id: "inProgress", label: "Livraison en cours", href: "/parcels/in-progress" },
  { id: "stuck", label: "Pas de réponse", href: "/parcels/stuck" },
  { id: "returns", label: "Annulé / Refusé / Retour", href: "/parcels/returns" },
];

export default function ParcelsSubNav({ active }: { active: ParcelsSubTab }) {
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {SUB_TABS.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            active === tab.id ? "bg-ink text-white" : "bg-stone text-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </a>
      ))}
    </div>
  );
}
