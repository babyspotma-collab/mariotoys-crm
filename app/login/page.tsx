import { login } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <form action={login} className="card w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-accent text-[15px] font-bold text-white">
            M
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Mario Toys</h1>
            <p className="text-xs text-muted">Accès réservé</p>
          </div>
        </div>

        <label className="mb-2 block text-sm font-medium" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="mb-4 w-full rounded-[10px] border border-line-input px-3.5 py-2.5 text-base md:text-sm min-h-[44px]"
        />

        {searchParams.error && <p className="mb-4 text-sm text-accent">Mot de passe incorrect.</p>}

        <button type="submit" className="btn-primary w-full">
          Se connecter
        </button>
      </form>
    </div>
  );
}
