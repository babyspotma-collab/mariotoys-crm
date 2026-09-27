import { login } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex min-h-[80dvh] items-center justify-center">
      <form action={login} className="card flex w-full max-w-sm flex-col gap-5 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-base font-bold text-white">M</div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Mario Toys</h1>
            <p className="text-xs text-muted">Accès réservé</p>
          </div>
        </div>

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
