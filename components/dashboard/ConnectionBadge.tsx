"use client";

export type ConnState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "warning"
  | "polling"
  | "down";

const DOT_CLASS: Record<ConnState, string> = {
  live: "bg-status-working",
  polling: "bg-status-working",
  reconnecting: "bg-amber-400",
  warning: "bg-amber-400",
  connecting: "bg-slate-500",
  down: "bg-status-blocked",
};

const LABEL: Record<ConnState, string> = {
  live: "live",
  polling: "polling",
  reconnecting: "reconnecting",
  warning: "live · redis not configured",
  connecting: "connecting",
  down: "down",
};

export function ConnectionBadge({
  state,
  lastAt,
}: {
  state: ConnState;
  lastAt?: number | null;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-slate-500"
      role="status"
      aria-live="polite"
      aria-label={`Realtime connection: ${LABEL[state]}`}
    >
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[state]}`} />
      <span>{LABEL[state]}</span>
      {lastAt != null && (
        <span className="text-slate-600">· last event {secondsAgo(lastAt)}s ago</span>
      )}
    </span>
  );
}

function secondsAgo(ts: number): number {
  return Math.max(0, Math.floor((Date.now() - ts) / 1000));
}
