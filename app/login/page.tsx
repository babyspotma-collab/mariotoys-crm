import { login } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form action={login} className="w-full max-w-sm bg-white border border-line rounded-2xl p-8">
        <h1 className="text-xl font-semibold mb-1">Mario Toys CRM</h1>
        <p className="text-sm text-muted mb-6">Accès réservé.</p>

        <label className="block text-sm font-medium mb-2" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="w-full border border-line rounded-lg px-3 py-2 mb-4 text-sm"
        />

        {searchParams.error && (
          <p className="text-sm text-danger mb-4">Mot de passe incorrect.</p>
        )}

        <button type="submit" className="btn-primary w-full">
          Se connecter
        </button>
      </form>
    </main>
  );
}
