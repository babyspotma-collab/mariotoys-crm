import { CaretRight, CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { AutoConfirmMatch, ReviewItem } from "@/lib/auto-confirm";

// Résultat de lib/auto-confirm.ts sur la page Commandes : les cas ambigus
// ("À vérifier") et, en attendant la prochaine synchro qui les appliquera,
// les commandes qui vont être confirmées automatiquement.
const carrierName = (c: string) => (c === "OZON" ? "Ozon Express" : "Forcelog");

function Section({
  icon,
  title,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm font-medium md:px-5 [&::-webkit-details-marker]:hidden">
        <span className={tone}>{icon}</span>
        {title}
        <span className="rounded-md bg-cream-dark px-1.5 text-xs tabular-nums text-body">{count}</span>
        <CaretRight size={14} aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-90" />
      </summary>
      <ul className="divide-y divide-line-soft border-t border-line-soft">{children}</ul>
    </details>
  );
}

export default function AutoConfirmPanel({ toConfirm, toReview }: { toConfirm: AutoConfirmMatch[]; toReview: ReviewItem[] }) {
  if (toConfirm.length === 0 && toReview.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {toReview.length > 0 && (
        <Section
          icon={<WarningCircle size={18} weight="fill" aria-hidden="true" />}
          tone="text-pill-amber-fg"
          title="À vérifier : colis envoyés sans commande certaine"
          count={toReview.length}
        >
          {toReview.map((r) => (
            <li key={r.parcel.id} className="flex flex-col gap-2 px-4 py-3 text-sm md:px-5">
              <div>
                <span className="font-medium">{r.parcel.receiver || "Destinataire inconnu"}</span>
                <span className="text-muted">
                  {" "}
                  · {carrierName(r.parcel.carrier)} <span className="font-mono text-[13px]">{r.parcel.code}</span>
                  {r.parcel.phone && <span className="tabular-nums"> · {r.parcel.phone}</span>}
                </span>
              </div>
              <p className="text-xs text-pill-amber-fg">
                {r.reason === "multiple"
                  ? "Plusieurs commandes ont ce numéro de téléphone. Rien n'a été confirmé."
                  : "Seul le nom correspond, pas le téléphone. Rien n'a été confirmé."}
              </p>
              <div className="flex flex-wrap gap-2">
                {r.candidates.map((c) =>
                  c.status === "NOUVELLE" ? (
                    <a key={c.id} href={`/orders/${c.id}/confirm`} className="btn-secondary h-9 px-3 text-[13px] md:h-8">
                      {c.orderNumber} {c.customerName}
                    </a>
                  ) : (
                    <span key={c.id} className="inline-flex h-9 items-center rounded-[10px] bg-cream px-3 text-[13px] text-muted md:h-8">
                      {c.orderNumber} {c.customerName} (confirmée)
                    </span>
                  )
                )}
              </div>
            </li>
          ))}
        </Section>
      )}

      {toConfirm.length > 0 && (
        <Section
          icon={<CheckCircle size={18} weight="fill" aria-hidden="true" />}
          tone="text-pill-green-fg"
          title="Seront confirmées automatiquement à la prochaine synchronisation"
          count={toConfirm.length}
        >
          {toConfirm.map((m) => (
            <li key={m.order.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between md:gap-4 md:px-5">
              <span>
                <span className="font-medium">{m.order.orderNumber}</span> {m.order.customerName}
                <span className="tabular-nums text-muted"> · {m.order.phone}</span>
              </span>
              <span className="text-xs text-muted">
                Colis {carrierName(m.parcel.carrier)} <span className="font-mono">{m.parcel.code}</span>
              </span>
            </li>
          ))}
        </Section>
      )}
    </div>
  );
}
