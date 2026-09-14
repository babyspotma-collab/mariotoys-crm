import { getClaim, getClaimTypes } from "@/lib/forcelog";
import CreateClaimForm from "./CreateClaimForm";
import ReplyForm from "./ReplyForm";

export const dynamic = "force-dynamic";

export default async function ClaimPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code);

  let exists = false;
  let messages: Awaited<ReturnType<typeof getClaim>>["messages"] = [];
  let claimError: string | null = null;
  try {
    const result = await getClaim(code);
    exists = result.exists;
    messages = result.messages;
  } catch (err) {
    claimError = err instanceof Error ? err.message : String(err);
  }

  let types: Awaited<ReturnType<typeof getClaimTypes>> = [];
  if (!exists) {
    try {
      types = await getClaimTypes();
    } catch {
      // Géré par CreateClaimForm (liste vide -> message "indisponible")
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <p className="text-xs text-muted mb-2">
        <a href={`/parcels/${encodeURIComponent(code)}`}>← Retour au colis</a>
      </p>
      <h1 className="text-xl font-semibold mb-1 font-mono">Réclamation — {code}</h1>

      {claimError && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-6">
          Impossible de vérifier la réclamation existante : {claimError}
        </p>
      )}

      {!claimError && exists && (
        <>
          <p className="text-sm text-muted mb-6">
            Une réclamation existe déjà pour ce colis — un colis ne peut en avoir qu&apos;une
            seule ouverte à la fois, donc les nouveaux messages s&apos;ajoutent à celle-ci.
          </p>

          <div className="flex flex-col gap-3 mb-6">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                  m.from === "CUSTOMER" ? "bg-ink text-white self-end ml-auto" : "bg-stone"
                }`}
              >
                <p className="text-[11px] opacity-70 mb-1">
                  {m.from === "CUSTOMER" ? "Vous" : "Support Forcelog"}
                </p>
                {m.message}
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-sm text-muted">Pas encore de message dans cette réclamation.</p>
            )}
          </div>

          <ReplyForm code={code} />
        </>
      )}

      {!claimError && !exists && <CreateClaimForm code={code} types={types} />}
    </main>
  );
}
