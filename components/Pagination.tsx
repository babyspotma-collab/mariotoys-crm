import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

// Précédent / Suivant + numéro de page. hrefFor construit l'URL d'une page
// en conservant les autres filtres de la page appelante.
export default function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const disabled = "btn-secondary pointer-events-none opacity-40";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 md:justify-center">
      {page <= 1 ? (
        <span className={disabled} aria-disabled="true">
          <CaretLeft size={16} aria-hidden="true" />
          Précédent
        </span>
      ) : (
        <a href={hrefFor(page - 1)} className="btn-secondary">
          <CaretLeft size={16} aria-hidden="true" />
          Précédent
        </a>
      )}
      <span className="text-sm tabular-nums text-muted">
        Page {page} / {totalPages}
      </span>
      {page >= totalPages ? (
        <span className={disabled} aria-disabled="true">
          Suivant
          <CaretRight size={16} aria-hidden="true" />
        </span>
      ) : (
        <a href={hrefFor(page + 1)} className="btn-secondary">
          Suivant
          <CaretRight size={16} aria-hidden="true" />
        </a>
      )}
    </nav>
  );
}
