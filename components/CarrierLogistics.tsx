import { ArrowSquareOut, FilePdf } from "@phosphor-icons/react/dist/ssr";
import EmptyState from "@/components/EmptyState";
import Pill from "@/components/Pill";
import PickupForm from "@/components/PickupForm";
import { prisma } from "@/lib/db";
import { formatDateTimeMa } from "@/lib/format";
import { FORCELOG_DELIVERY_NOTE_URLS, getCities as getForcelogCities } from "@/lib/forcelog";
import { getDeliveryNotePdfUrl, OZON_PICKUP_URL } from "@/lib/ozon";

type Carrier = "forcelog" | "ozon";

// Onglet "Bons de livraison" de la page Colis.
export async function DeliveryNotesView({ carrier, created }: { carrier: Carrier; created?: string }) {
  if (carrier === "forcelog") {
    return (
      <section className="card flex flex-col gap-3 p-4 md:p-6">
        <h2 className="text-sm font-semibold">Bons de livraison Forcelog</h2>
        <p className="max-w-[65ch] text-sm text-muted">
          L&apos;API Forcelog ne permet pas de créer un bon de livraison : il se crée sur leur tableau de bord.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={FORCELOG_DELIVERY_NOTE_URLS.create} target="_blank" rel="noreferrer" className="btn-primary">
            Créer un bon sur Forcelog
            <ArrowSquareOut size={16} aria-hidden="true" />
          </a>
          <a href={FORCELOG_DELIVERY_NOTE_URLS.list} target="_blank" rel="noreferrer" className="btn-secondary">
            Voir mes bons Forcelog
            <ArrowSquareOut size={16} aria-hidden="true" />
          </a>
        </div>
      </section>
    );
  }

  const notes = await prisma.deliveryNote.findMany({ where: { carrier: "OZON" }, orderBy: { createdAt: "desc" }, take: 50 });
  const pdfs = [
    { variant: "standard" as const, label: "Bon" },
    { variant: "a4" as const, label: "Étiquettes A4" },
    { variant: "10x10" as const, label: "Étiquettes 10×10" },
  ];
  return (
    <>
      {created && (
        <p className="rounded-[10px] bg-pill-green-bg px-3.5 py-3 text-sm text-pill-green-fg" role="status">
          Bon de livraison {created} créé chez Ozon Express.
        </p>
      )}
      {notes.length === 0 ? (
        <EmptyState title="Aucun bon de livraison">
          Dans l&apos;onglet Colis, cochez les colis Ozon à remettre au livreur, puis « Créer un bon de livraison ».
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line-soft">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:px-5">
              <div className="min-w-0">
                <div className="break-all font-mono text-[13px] font-medium">{note.ref}</div>
                <div className="mt-0.5 text-xs tabular-nums text-muted">
                  {formatDateTimeMa(note.createdAt)} · {note.parcelCodes.length} colis
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {pdfs.map((p) => (
                  <a
                    key={p.variant}
                    href={getDeliveryNotePdfUrl(note.ref, p.variant)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary h-9 px-3 text-[13px] md:h-8"
                  >
                    <FilePdf size={16} aria-hidden="true" />
                    {p.label}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const PICKUP_STATUS: Record<string, { tone: "green" | "red" | "gray"; label: string }> = {
  SENT: { tone: "green", label: "Envoyée" },
  FAILED: { tone: "red", label: "Échec" },
  DECLARED: { tone: "gray", label: "Faite sur Ozon" },
};

// Onglet "Ramassages" de la page Colis : formulaire + historique.
export async function PickupsView({ carrier }: { carrier: Carrier }) {
  const dbCarrier = carrier === "forcelog" ? "FORCELOG" : "OZON";
  const [history, cities] = await Promise.all([
    prisma.pickupRequest.findMany({ where: { carrier: dbCarrier }, orderBy: { createdAt: "desc" }, take: 50 }),
    carrier === "forcelog" ? getForcelogCities().catch(() => []) : Promise.resolve([]),
  ]);
  // Adresse variable : on repart de la dernière demande, modifiable.
  const last = history[0];
  const defaults = { phone: last?.phone ?? "", city: last?.city ?? "", address: last?.address ?? "", comment: "" };
  const cityName = (code: string) => cities.find((c) => c.code === code)?.name ?? code;

  return (
    <>
      <PickupForm carrier={carrier} defaults={defaults} cities={cities} ozonUrl={OZON_PICKUP_URL} />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Historique</h2>
          {carrier === "forcelog" && (
            <a href={FORCELOG_DELIVERY_NOTE_URLS.pickups} target="_blank" rel="noreferrer" className="text-xs text-muted underline-offset-4 hover:underline">
              Suivi sur Forcelog
            </a>
          )}
        </div>
        {history.length === 0 ? (
          <EmptyState title="Aucune demande pour l'instant" />
        ) : (
          <ul className="card divide-y divide-line-soft">
            {history.map((r) => {
              const status = PICKUP_STATUS[r.status] ?? { tone: "gray" as const, label: r.status };
              return (
                <li key={r.id} className="flex flex-col gap-1.5 p-4 md:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium tabular-nums">{formatDateTimeMa(r.createdAt)}</span>
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </div>
                  <div className="text-[13px] text-body">
                    {r.address}
                    {r.city && <span className="text-muted"> · {cityName(r.city)}</span>}
                    {r.phone && <span className="tabular-nums text-muted"> · {r.phone}</span>}
                  </div>
                  {r.message && (
                    <p className={`text-xs ${r.status === "FAILED" ? "text-pill-red-fg" : "text-muted"}`}>{r.message}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
