"use client";

import { signIn } from "next-auth/react";

/**
 * Shown when the signed-in user's GitHub Account row lacks the scopes
 * needed for the auto-install picker (`repo + admin:repo_hook`).
 *
 * Triggers `signIn("github")` which re-runs the OAuth flow; GitHub
 * shows the consent screen with the new scopes and NextAuth updates
 * the access_token on the Account row on callback.
 */
export function ReauthorizeCard({ reason }: { reason: "no-account" | "scope" }) {
  return (
    <div className="rounded-md border border-amber-700/40 bg-amber-950/30 p-5">
      <h2 className="text-sm font-semibold text-amber-200">
        {reason === "no-account"
          ? "Connect a GitHub account"
          : "Reconnect GitHub to enable one-click binding"}
      </h2>
      <p className="mt-1 text-xs text-amber-100/80">
        AgentWatch needs the <code>repo</code> and <code>admin:repo_hook</code> scopes to
        list your repositories and install webhooks for you. You&apos;ll see the GitHub
        consent screen and return to this page when approved.
      </p>
      <button
        type="button"
        onClick={() => signIn("github", { callbackUrl: "/repos" })}
        className="mt-4 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900"
      >
        Continue with GitHub →
      </button>
    </div>
  );
}
