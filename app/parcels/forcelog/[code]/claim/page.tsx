import { getClaim, getClaimTypes } from "@/lib/forcelog";
import PageHeader from "@/components/PageHeader";
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
    <div className="flex max-w-2xl flex-col gap-5 md:gap-6">
      <PageHeader
        back={{ href: `/parcels/forcelog/${encodeURIComponent(code)}`, label: "Retour au colis" }}
        title="Réclamation"
        subtitle={<span className="break-all font-mono">{code}</span>}
      />

      {claimError && <p className="alert-error">Impossible de vérifier la réclamation existante : {claimError}</p>}

      {!claimError && exists && (
        <section className="card flex flex-col gap-5 p-4 md:p-6">
          <p className="text-sm text-muted">
            Une réclamation est déjà ouverte pour ce colis. Un colis ne peut en avoir qu&apos;une à la fois : vos
            nouveaux messages s&apos;y ajoutent.
          </p>

          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.from === "CUSTOMER" ? "ml-auto self-end rounded-br-md bg-ink text-white" : "rounded-bl-md bg-cream-dark text-ink"
                }`}
              >
                <p className="mb-1 text-[11px] font-medium opacity-70">
                  {m.from === "CUSTOMER" ? "Vous" : "Support Forcelog"}
                </p>
                {m.message}
              </div>
            ))}
            {messages.length === 0 && <p className="text-sm text-muted">Pas encore de message dans cette réclamation.</p>}
          </div>

          <div className="border-t border-line-soft pt-5">
            <ReplyForm code={code} />
          </div>
        </section>
      )}

      {!claimError && !exists && <CreateClaimForm code={code} types={types} />}
    </div>
  );
}
