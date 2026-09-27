import { getReturnEligibleParcels, getCities } from "@/lib/forcelog";
import PageHeader from "@/components/PageHeader";
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
    <div className="flex max-w-2xl flex-col gap-5 md:gap-6">
      <PageHeader
        back={{ href: `/parcels/forcelog/${encodeURIComponent(code)}`, label: "Retour au colis" }}
        title="Demande de retour"
        subtitle={<span className="break-all font-mono">{code}</span>}
      />

      {eligibilityError && <p className="alert-error">Impossible de vérifier l&apos;éligibilité : {eligibilityError}</p>}

      {!eligibilityError && !eligible ? (
        <div className="card p-4 text-sm text-muted md:p-6">
          Ce colis n&apos;apparaît pas pour l&apos;instant dans la liste des colis éligibles au retour chez Forcelog.
        </div>
      ) : (
        !eligibilityError && <ReturnForm code={code} cities={cities} />
      )}
    </div>
  );
}
