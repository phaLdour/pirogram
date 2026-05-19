"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ConnState = "connecting" | "live" | "reconnecting" | "warning";

export function LiveRefresh() {
  const router = useRouter();
  const [state, setState] = useState<ConnState>("connecting");
  const [lastAt, setLastAt] = useState<number | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    let cancelled = false;

    es.addEventListener("ready", () => {
      if (!cancelled) setState("live");
    });
    es.addEventListener("warning", () => {
      if (!cancelled) setState("warning");
    });
    es.addEventListener("event", () => {
      if (cancelled) return;
      setLastAt(Date.now());
      router.refresh();
    });
    es.onerror = () => {
      if (!cancelled) setState("reconnecting");
    };
    es.onopen = () => {
      if (!cancelled) setState("live");
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [router]);

  return (
    <div
      className="flex items-center gap-2 text-xs text-slate-500"
      role="status"
      aria-live="polite"
    >
      <Dot state={state} />
      <span>{labelFor(state)}</span>
      {lastAt && (
        <span className="text-slate-600">· last event {secondsAgo(lastAt)}s ago</span>
      )}
    </div>
  );
}

function Dot({ state }: { state: ConnState }) {
  const cls =
    state === "live"
      ? "bg-status-working"
      : state === "warning"
        ? "bg-amber-400"
        : state === "reconnecting"
          ? "bg-status-blocked"
          : "bg-slate-500";
  return <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function labelFor(state: ConnState): string {
  switch (state) {
    case "live":
      return "live";
    case "reconnecting":
      return "reconnecting";
    case "warning":
      return "live · redis not configured";
    case "connecting":
      return "connecting";
  }
}

function secondsAgo(ts: number): number {
  return Math.max(0, Math.floor((Date.now() - ts) / 1000));
}
