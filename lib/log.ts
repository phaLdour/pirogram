import { AsyncLocalStorage } from "node:async_hooks";

export type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;
type Ctx = { requestId?: string; route?: string };

const store = new AsyncLocalStorage<Ctx>();

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function activeLevel(): number {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_RANK[(env as Level) in LEVEL_RANK ? (env as Level) : "info"];
}

function serializeError(err: unknown): Fields {
  if (err instanceof Error) {
    return {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack?.split("\n").slice(0, 8).join("\n"),
      },
    };
  }
  return { err: String(err) };
}

function emit(level: Level, msg: string, extra: Fields | undefined): void {
  if (LEVEL_RANK[level] < activeLevel()) return;
  const ctx = store.getStore() ?? {};
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx.route ? { route: ctx.route } : {}),
    ...(extra ?? {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else process.stdout.write(out + "\n");
}

export const log = {
  debug(msg: string, fields?: Fields) {
    emit("debug", msg, fields);
  },
  info(msg: string, fields?: Fields) {
    emit("info", msg, fields);
  },
  warn(msg: string, fields?: Fields) {
    emit("warn", msg, fields);
  },
  error(msg: string, errOrFields?: unknown, fields?: Fields) {
    let merged: Fields = {};
    if (errOrFields && typeof errOrFields === "object" && !(errOrFields instanceof Error)) {
      merged = { ...(errOrFields as Fields), ...(fields ?? {}) };
    } else if (errOrFields !== undefined) {
      merged = { ...serializeError(errOrFields), ...(fields ?? {}) };
    } else {
      merged = fields ?? {};
    }
    emit("error", msg, merged);
  },
};

export function withRequestContext<T>(ctx: Ctx, fn: () => Promise<T> | T): Promise<T> | T {
  return store.run(ctx, fn);
}

export function currentRequestId(): string | undefined {
  return store.getStore()?.requestId;
}

export function generateRequestId(): string {
  // 64-bit random in 16 hex chars — enough entropy for tracing.
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
