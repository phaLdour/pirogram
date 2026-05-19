import { signIn } from "@/lib/auth";

export const metadata = { title: "Sign in · AgentWatch" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl ?? "/";

  async function authenticate() {
    "use server";
    await signIn("github", { redirectTo });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-8">
        <h1 className="text-2xl font-bold tracking-tight">Sign in to AgentWatch</h1>
        <p className="mt-2 text-sm text-slate-400">
          Use GitHub to access the live dashboard.
        </p>
        <form className="mt-6" action={authenticate}>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
          >
            Continue with GitHub
          </button>
        </form>
      </div>
    </main>
  );
}
