import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

// En-tête commun à toutes les pages : titre, sous-titre optionnel, lien
// retour optionnel et zone d'actions à droite.
export default function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <a
          href={back.href}
          className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-muted no-underline hover:text-ink"
        >
          <ArrowLeft size={16} />
          {back.label}
        </a>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
