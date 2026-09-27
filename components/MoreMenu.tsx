// Menu "⋯" — <details>/<summary> natif, pas besoin de JS client pour un
// simple menu déroulant (moins de boutons visibles par ligne, le reste
// dans ce menu).
export default function MoreMenu({ children }: { children: React.ReactNode }) {
  return (
    <details className="group relative">
      <summary
        aria-label="Plus d'actions"
        className="flex h-[34px] w-[34px] cursor-pointer list-none items-center justify-center rounded-lg text-muted hover:bg-cream-dark [&::-webkit-details-marker]:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </summary>
      <div className="absolute right-0 z-10 mt-1 flex min-w-[160px] flex-col gap-0.5 rounded-lg border border-line bg-white p-1.5 shadow-md">
        {children}
      </div>
    </details>
  );
}
