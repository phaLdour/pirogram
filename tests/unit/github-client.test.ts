import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GitHubApiError,
  deleteRepoWebhook,
  hasRequiredScopes,
  installRepoWebhook,
  listMyRepos,
} from "@/lib/github";

type FetchCall = { input: string; init?: RequestInit };

let calls: FetchCall[];
let queue: Array<Response | Error>;
let origFetch: typeof globalThis.fetch;

function nextResponse(): Response | Error {
  const next = queue.shift();
  if (!next) throw new Error("fetch queue exhausted in test");
  return next;
}

beforeEach(() => {
  calls = [];
  queue = [];
  origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    const next = nextResponse();
    if (next instanceof Error) throw next;
    return next;
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = origFetch;
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("hasRequiredScopes", () => {
  it("requires both repo and admin:repo_hook", () => {
    expect(hasRequiredScopes("repo admin:repo_hook")).toBe(true);
    expect(hasRequiredScopes("read:user user:email repo admin:repo_hook")).toBe(true);
    expect(hasRequiredScopes("repo, admin:repo_hook")).toBe(true);
    expect(hasRequiredScopes("repo")).toBe(false);
    expect(hasRequiredScopes("admin:repo_hook")).toBe(false);
    expect(hasRequiredScopes("")).toBe(false);
    expect(hasRequiredScopes(null)).toBe(false);
    expect(hasRequiredScopes(undefined)).toBe(false);
  });
});

describe("listMyRepos", () => {
  it("sends an authenticated request and maps to GhRepo", async () => {
    queue.push(
      jsonResponse(200, [
        {
          id: 1,
          full_name: "alice/foo",
          name: "foo",
          description: "demo",
          private: false,
          html_url: "https://github.com/alice/foo",
          default_branch: "main",
          updated_at: "2026-05-20T00:00:00Z",
        },
      ]),
    );
    const result = await listMyRepos("tok-1");
    expect(result).toEqual([
      {
        id: 1,
        fullName: "alice/foo",
        name: "foo",
        description: "demo",
        private: false,
        htmlUrl: "https://github.com/alice/foo",
        defaultBranch: "main",
        updatedAt: "2026-05-20T00:00:00Z",
      },
    ]);
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok-1");
    expect(headers.get("Accept")).toBe("application/vnd.github+json");
    expect(calls[0]?.input).toContain("/user/repos");
  });

  it("throws a classified GitHubApiError on 401", async () => {
    queue.push(jsonResponse(401, { message: "Bad creds" }));
    await expect(listMyRepos("bad")).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
    });
  });
});

describe("installRepoWebhook", () => {
  it("POSTs the expected payload and returns the new hook id", async () => {
    queue.push(jsonResponse(201, { id: 7777 }));
    const result = await installRepoWebhook(
      "tok",
      "alice/foo",
      "https://aw.example/api/webhook/github",
      "shh",
    );
    expect(result).toEqual({ id: 7777, alreadyExisted: false });
    expect(calls[0]?.input).toBe("https://api.github.com/repos/alice/foo/hooks");
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      events: string[];
      config: { url: string; secret: string; content_type: string };
    };
    expect(body.events).toEqual(["push", "pull_request", "issues", "workflow_run"]);
    expect(body.config.url).toBe("https://aw.example/api/webhook/github");
    expect(body.config.secret).toBe("shh");
    expect(body.config.content_type).toBe("json");
  });

  it("422 'already exists' → finds existing hook by url and returns its id", async () => {
    queue.push(jsonResponse(422, { message: "Hook already exists on this repository" }));
    queue.push(
      jsonResponse(200, [
        { id: 1, config: { url: "https://aw.example/other" } },
        { id: 99, config: { url: "https://aw.example/api/webhook/github" } },
      ]),
    );
    const result = await installRepoWebhook(
      "tok",
      "alice/foo",
      "https://aw.example/api/webhook/github",
      "shh",
    );
    expect(result).toEqual({ id: 99, alreadyExisted: true });
  });

  it("propagates non-422 errors as GitHubApiError", async () => {
    queue.push(jsonResponse(403, { message: "no" }));
    await expect(
      installRepoWebhook("t", "alice/foo", "https://x/y", "s"),
    ).rejects.toBeInstanceOf(GitHubApiError);
  });
});

describe("deleteRepoWebhook", () => {
  it("uses DELETE and treats 204 + 404 as success", async () => {
    queue.push(new Response(null, { status: 204 }));
    await expect(deleteRepoWebhook("t", "alice/foo", 1)).resolves.toBeUndefined();
    expect(calls[0]?.init?.method).toBe("DELETE");

    queue.push(jsonResponse(404, { message: "Not Found" }));
    await expect(deleteRepoWebhook("t", "alice/foo", 2)).resolves.toBeUndefined();
  });

  it("throws on other status codes", async () => {
    queue.push(jsonResponse(500, { message: "boom" }));
    await expect(deleteRepoWebhook("t", "alice/foo", 1)).rejects.toBeInstanceOf(
      GitHubApiError,
    );
  });
});
