import { getReturnEligibleParcels, getCities } from "@/lib/forcelog";
import ReturnForm from "./ReturnForm";

export default async function ReturnPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code);

  let eligible = false;
  let eligibilityError: string | null = null;
  try {
    const eligibleCodes = await getReturnEligibleParcels();
    eligible = eligibleCodes.includes(code);
  } catch (err) {
    eligibilityError = err instanceof Error ? err.message : String(err);
  }

  let cities: Awaited<ReturnType<typeof getCities>> = [];
  try {
    cities = await getCities();
  } catch {
    // Géré par ReturnForm (liste vide -> message "indisponible")
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <p className="text-xs text-muted mb-2">
        <a href={`/parcels/forcelog/${encodeURIComponent(code)}`}>← Retour au colis</a>
      </p>
      <h1 className="text-xl font-semibold mb-1 font-mono">Retour — {code}</h1>
      <p className="text-sm text-muted mb-8">
        Demande de retour envoyée directement à Forcelog pour ce colis.
      </p>

      {eligibilityError && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-6">
          Impossible de vérifier l&apos;éligibilité : {eligibilityError}
        </p>
      )}

      {!eligibilityError && !eligible ? (
        <p className="text-sm text-muted bg-stone rounded-lg p-4">
          Ce colis n&apos;apparaît pas dans la liste des colis éligibles au retour côté Forcelog
          pour l&apos;instant.
        </p>
      ) : (
        !eligibilityError && <ReturnForm code={code} cities={cities} />
      )}
    </main>
  );
}
