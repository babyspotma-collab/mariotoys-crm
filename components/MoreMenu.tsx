import { DotsThree } from "@phosphor-icons/react/dist/ssr";

// Menu "⋯" — <details>/<summary> natif, pas besoin de JS client pour un
// simple menu déroulant (moins de boutons visibles par ligne, le reste
// dans ce menu).
//
// rowAnchored (lignes de liste, voir app/page.tsx) : sous lg le panneau
// s'ancre au bord droit de la ligne (qui doit être "relative") et le bouton se
// place à droite de la ligne — le menu ne sort jamais de l'écran sur
// téléphone, même quand le bouton suit un badge au lieu d'être au bord.
export default function MoreMenu({
  children,
  label = "Plus d'actions",
  rowAnchored = false,
}: {
  children: React.ReactNode;
  label?: string;
  rowAnchored?: boolean;
}) {
  return (
    <details className={`group ${rowAnchored ? "static ml-auto lg:relative lg:ml-0" : "relative"}`}>
      <summary
        aria-label={label}
        className="btn-icon cursor-pointer list-none text-muted hover:bg-cream-dark hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <DotsThree size={22} weight="bold" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 flex min-w-[200px] flex-col gap-0.5 rounded-xl border border-line bg-white p-1.5 shadow-lg shadow-zinc-900/5">
        {children}
      </div>
    </details>
  );
}
