// Carte chiffre-clé de l'Accueil : libellé, grande valeur, précision. Devient un
// lien (vers la page détaillée) quand `href` est donné.
export default function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className="mt-1 truncate text-[26px] font-semibold leading-tight tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[13px] text-muted">{sub}</div>}
    </>
  );
  const base = "card flex min-w-0 flex-col p-4";
  return href ? (
    <a href={href} className={`${base} no-underline transition-colors hover:bg-cream`}>
      {body}
    </a>
  ) : (
    <div className={base}>{body}</div>
  );
}
