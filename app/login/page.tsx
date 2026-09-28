import { login } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-6">
      <img
        src="/logo-wordmark.webp"
        alt="Mario Toys CRM Connect"
        width={800}
        height={496}
        className="h-auto w-full max-w-[18rem] rounded-2xl shadow-lg shadow-zinc-900/10 md:max-w-sm"
      />
      <form action={login} className="card flex w-full max-w-sm flex-col gap-5 p-6 md:p-8">
        <h1 className="text-center text-sm text-muted">Accès réservé</h1>

        <div>
          <label className="label" htmlFor="password">
            Mot de passe
          </label>
          <input id="password" name="password" type="password" required autoFocus className="input" />
          {searchParams.error && <p className="mt-2 text-sm text-pill-red-fg">Mot de passe incorrect.</p>}
        </div>

        <button type="submit" className="btn-primary w-full">
          Se connecter
        </button>
      </form>
    </div>
  );
}
