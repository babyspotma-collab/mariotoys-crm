import type { Parcel } from "@prisma/client";
import { Phone } from "@phosphor-icons/react/dist/ssr";
import PageHeader from "@/components/PageHeader";
import { formatDh } from "@/lib/format";
import { normalizeMoroccanPhone } from "@/lib/phone";

export type TrackingEvent = { status: string; time: string; comment?: string | null };

// Fiche colis commune Forcelog / Ozon : chaque page charge ses données et
// passe ici un historique déjà normalisé.
export default function ParcelView({
  carrier,
  code,
  parcel,
  history,
  trackingError,
  actions,
}: {
  carrier: "forcelog" | "ozon";
  code: string;
  parcel: Parcel | null;
  history: TrackingEvent[];
  trackingError: string | null;
  actions?: React.ReactNode;
}) {
  const phone = parcel?.phone ? normalizeMoroccanPhone(parcel.phone) : null;
  const details: [string, React.ReactNode][] = parcel
    ? [
        ["Destinataire", parcel.receiver || "-"],
        [
          "Téléphone",
          phone ? (
            <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 tabular-nums underline-offset-4 hover:underline">
              <Phone size={15} aria-hidden="true" />
              {phone}
            </a>
          ) : (
            "-"
          ),
        ],
        ["Ville", parcel.cityName || "-"],
        ["Montant COD", <span key="p" className="font-semibold tabular-nums">{formatDh(parcel.price)}</span>],
        ["Statut", parcel.status || "-"],
      ]
    : [];

  return (
    <div className="flex max-w-3xl flex-col gap-5 md:gap-6">
      <PageHeader
        back={{ href: `/parcels?carrier=${carrier}`, label: "Colis" }}
        title={<span className="break-all font-mono text-xl md:text-2xl">{code}</span>}
        subtitle={carrier === "forcelog" ? "Forcelog" : "Ozon Express"}
      />

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}

      <section className="card p-4 md:p-6">
        <h2 className="text-sm font-semibold">Détails</h2>
        {!parcel ? (
          <p className="mt-3 text-sm text-muted">
            Pas encore synchronisé. Réessayez après le prochain passage de la synchronisation (toutes les 2 h).
          </p>
        ) : (
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 sm:flex-col sm:justify-start sm:gap-0.5">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right text-ink sm:text-left">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="card p-4 md:p-6">
        <h2 className="text-sm font-semibold">Suivi</h2>
        {trackingError ? (
          <p className="alert-error mt-3">Suivi indisponible pour l&apos;instant : {trackingError}</p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucun événement pour l&apos;instant.</p>
        ) : (
          <ol className="mt-4 flex flex-col">
            {history.map((event, i) => (
              <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                {i < history.length - 1 && (
                  <span aria-hidden="true" className="absolute left-[5px] top-4 h-full w-px bg-line" />
                )}
                <span
                  aria-hidden="true"
                  className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 ${
                    i === 0 ? "border-ink bg-ink" : "border-line-input bg-white"
                  }`}
                />
                <div className="min-w-0">
                  <p className={`text-sm ${i === 0 ? "font-semibold" : "font-medium text-body"}`}>{event.status}</p>
                  {event.time && <p className="text-xs tabular-nums text-muted">{event.time}</p>}
                  {event.comment && <p className="mt-1 text-xs text-muted">{event.comment}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
