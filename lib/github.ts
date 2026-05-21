/**
 * Thin REST client for the few GitHub endpoints AgentWatch needs.
 * No Octokit dependency to keep the bundle small. All calls run
 * server-side — never expose the access token to the client.
 */

export const GH_API = "https://api.github.com";
const TIMEOUT_MS = 8_000;

const REQUIRED_SCOPES = ["repo", "admin:repo_hook"] as const;

export function hasRequiredScopes(scope: string | null | undefined): boolean {
  if (!scope) return false;
  const granted = new Set(scope.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean));
  return REQUIRED_SCOPES.every((s) => granted.has(s));
}

export type GhRepo = {
  id: number;
  fullName: string;
  name: string;
  description: string | null;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  updatedAt: string | null;
};

export type GhError =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "rate-limited"
  | "network"
  | "validation"
  | "unknown";

export class GitHubApiError extends Error {
  constructor(
    public kind: GhError,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function classify(status: number): GhError {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "rate-limited";
  return "unknown";
}

async function ghFetch(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AgentWatch",
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (err) {
    throw new GitHubApiError(
      "network",
      0,
      err instanceof Error ? err.message : "network",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function listMyRepos(token: string): Promise<GhRepo[]> {
  const res = await ghFetch(
    `${GH_API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
    token,
  );
  if (!res.ok) {
    throw new GitHubApiError(classify(res.status), res.status, await res.text());
  }
  const raw = (await res.json()) as Array<{
    id: number;
    full_name: string;
    name: string;
    description: string | null;
    private: boolean;
    html_url: string;
    default_branch: string;
    updated_at: string | null;
  }>;
  return raw.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    name: r.name,
    description: r.description,
    private: r.private,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
  }));
}

export type InstalledHook = { id: number; alreadyExisted: boolean };

export async function installRepoWebhook(
  token: string,
  fullName: string,
  payloadUrl: string,
  secret: string,
): Promise<InstalledHook> {
  const res = await ghFetch(`${GH_API}/repos/${fullName}/hooks`, token, {
    method: "POST",
    body: JSON.stringify({
      name: "web",
      active: true,
      events: ["push", "pull_request", "issues", "workflow_run"],
      config: {
        url: payloadUrl,
        content_type: "json",
        secret,
        insecure_ssl: "0",
      },
    }),
  });
  if (res.status === 201) {
    const json = (await res.json()) as { id: number };
    return { id: json.id, alreadyExisted: false };
  }
  if (res.status === 422) {
    // Hook with the same URL already exists. Look it up so we can store
    // its id and treat unbind symmetrically.
    const existing = await findHookByUrl(token, fullName, payloadUrl);
    if (existing) return { id: existing, alreadyExisted: true };
    throw new GitHubApiError(
      "validation",
      422,
      "Hook with the same URL exists but could not be located.",
    );
  }
  throw new GitHubApiError(classify(res.status), res.status, await res.text());
}

async function findHookByUrl(
  token: string,
  fullName: string,
  payloadUrl: string,
): Promise<number | null> {
  const res = await ghFetch(`${GH_API}/repos/${fullName}/hooks?per_page=100`, token);
  if (!res.ok) return null;
  const hooks = (await res.json()) as Array<{
    id: number;
    config?: { url?: string };
  }>;
  const hit = hooks.find((h) => h.config?.url === payloadUrl);
  return hit?.id ?? null;
}

export async function deleteRepoWebhook(
  token: string,
  fullName: string,
  hookId: number,
): Promise<void> {
  const res = await ghFetch(`${GH_API}/repos/${fullName}/hooks/${hookId}`, token, {
    method: "DELETE",
  });
  if (res.status === 204 || res.status === 404) return; // 404 = already gone
  throw new GitHubApiError(classify(res.status), res.status, await res.text());
}

export type CreatedIssue = { number: number; htmlUrl: string };

export async function createIssue(
  token: string,
  fullName: string,
  body: { title: string; body: string; labels: string[] },
): Promise<CreatedIssue> {
  const res = await ghFetch(`${GH_API}/repos/${fullName}/issues`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new GitHubApiError(classify(res.status), res.status, await res.text());
  }
  const json = (await res.json()) as { number: number; html_url: string };
  return { number: json.number, htmlUrl: json.html_url };
}

export async function createIssueComment(
  token: string,
  fullName: string,
  issueNumber: number,
  body: string,
): Promise<{ id: number; htmlUrl: string }> {
  const res = await ghFetch(
    `${GH_API}/repos/${fullName}/issues/${issueNumber}/comments`,
    token,
    { method: "POST", body: JSON.stringify({ body }) },
  );
  if (!res.ok) {
    throw new GitHubApiError(classify(res.status), res.status, await res.text());
  }
  const json = (await res.json()) as { id: number; html_url: string };
  return { id: json.id, htmlUrl: json.html_url };
}

export type IssueComment = {
  id: number;
  user: string;
  body: string;
  createdAt: string;
  isBot: boolean;
};

export async function listIssueComments(
  token: string,
  fullName: string,
  issueNumber: number,
): Promise<IssueComment[]> {
  const res = await ghFetch(
    `${GH_API}/repos/${fullName}/issues/${issueNumber}/comments?per_page=100`,
    token,
  );
  if (!res.ok) {
    throw new GitHubApiError(classify(res.status), res.status, await res.text());
  }
  const raw = (await res.json()) as Array<{
    id: number;
    user: { login: string; type: string };
    body: string;
    created_at: string;
  }>;
  return raw.map((c) => ({
    id: c.id,
    user: c.user.login,
    body: c.body,
    createdAt: c.created_at,
    isBot: c.user.type === "Bot",
  }));
}

/**
 * Check whether the workflow file (e.g. `.github/workflows/claude.yml`)
 * exists in the repo's default branch. Used by the UI to detect missing
 * setup before kicking off a driver run.
 */
export async function fileExists(
  token: string,
  fullName: string,
  path: string,
): Promise<boolean> {
  const res = await ghFetch(`${GH_API}/repos/${fullName}/contents/${path}`, token);
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw new GitHubApiError(classify(res.status), res.status, await res.text());
}
