import { prisma } from "@/lib/db";
import { getReturnEligibleParcels } from "@/lib/forcelog";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";

export const dynamic = "force-dynamic";

// Vocabulaire de statuts Forcelog non documenté (voir lib/forcelog.ts) :
// recherche par sous-chaîne sur le libellé FR plutôt qu'un statut exact
// deviné, pour rester robuste tant qu'on n'a pas confirmé les valeurs
// réelles utilisées côté Forcelog pour un retour.
const RETURN_KEYWORDS = ["retour", "return", "refus"];

export default async function ReturnsPage() {
  let eligibleCodes: string[] = [];
  let eligibleError: string | null = null;
  try {
    eligibleCodes = await getReturnEligibleParcels();
  } catch (err) {
    eligibleError = err instanceof Error ? err.message : String(err);
  }

  const [eligibleOrders, allConfirmed] = await Promise.all([
    eligibleCodes.length > 0
      ? prisma.order.findMany({ where: { forcelogCode: { in: eligibleCodes } } })
      : Promise.resolve([]),
    prisma.order.findMany({ where: { status: "CONFIRMEE", forcelogStatus: { not: null } } }),
  ]);

  const eligibleByCode = new Map(eligibleOrders.map((o) => [o.forcelogCode, o]));
  const suspectedReturns = allConfirmed.filter((o) =>
    RETURN_KEYWORDS.some((kw) => o.forcelogStatus?.toLowerCase().includes(kw))
  );

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="returns" />

      <h2 className="text-sm font-medium mb-3">Éligibles au retour (Forcelog)</h2>
      {eligibleError && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-6">
          Impossible de charger la liste Forcelog : {eligibleError}
        </p>
      )}
      {!eligibleError && eligibleCodes.length === 0 && (
        <p className="text-sm text-muted mb-8">Aucun colis éligible au retour pour l&apos;instant.</p>
      )}
      <div className="flex flex-col gap-2 mb-10">
        {eligibleCodes.map((code) => {
          const order = eligibleByCode.get(code);
          return (
            <a
              key={code}
              href={`/parcels/${encodeURIComponent(code)}`}
              className="block bg-white border border-line rounded-2xl p-4 hover:border-sage-dark transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium font-mono">{code}</p>
                  {order && (
                    <p className="text-xs text-muted">
                      {order.customerName} — {order.city}
                    </p>
                  )}
                </div>
                {order && <p className="text-sm font-semibold">{Number(order.totalPrice)} DH</p>}
              </div>
            </a>
          );
        })}
      </div>

      <h2 className="text-sm font-medium mb-3">Statuts Forcelog évoquant un retour</h2>
      <p className="text-xs text-muted mb-3">
        Recherche par mot-clé sur le statut brut (le vocabulaire exact de
        Forcelog n&apos;est pas documenté) — à vérifier au cas par cas.
      </p>
      {suspectedReturns.length === 0 && (
        <p className="text-sm text-muted">Aucun statut suspect détecté.</p>
      )}
      <div className="flex flex-col gap-2">
        {suspectedReturns.map((order) => (
          <a
            key={order.id}
            href={order.forcelogCode ? `/parcels/${encodeURIComponent(order.forcelogCode)}` : "#"}
            className="block bg-white border border-line rounded-2xl p-4 hover:border-sage-dark transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  #{order.orderNumber} — {order.customerName}
                </p>
                <p className="text-xs text-muted">{order.city}</p>
              </div>
              <span className="badge bg-danger/10 text-danger">{order.forcelogStatus}</span>
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
