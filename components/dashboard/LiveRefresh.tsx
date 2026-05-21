"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectionBadge, type ConnState } from "@/components/dashboard/ConnectionBadge";

const RETRY_LIMIT = 4;
const POLL_INTERVAL_MS = 3000;

export function LiveRefresh() {
  const router = useRouter();
  const [state, setState] = useState<ConnState>("connecting");
  const [lastAt, setLastAt] = useState<number | null>(null);
  const errorBurstRef = useRef(0);
  const pollCursorRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    const startPolling = () => {
      if (pollTimerRef.current) return;
      esRef.current?.close();
      esRef.current = null;
      setState("polling");
      const tick = async () => {
        if (cancelled) return;
        try {
          const res = await fetch("/api/dashboard/snapshot", { cache: "no-store" });
          if (!res.ok) return;
          const { cursor } = (await res.json()) as { cursor: string };
          if (pollCursorRef.current === null) {
            pollCursorRef.current = cursor;
            return;
          }
          if (cursor !== pollCursorRef.current) {
            pollCursorRef.current = cursor;
            setLastAt(Date.now());
            router.refresh();
          }
        } catch {
          // network blip; next tick will retry
        }
      };
      tick();
      pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    };

    const es = new EventSource("/api/events/stream");
    esRef.current = es;

    es.addEventListener("ready", () => {
      if (cancelled) return;
      errorBurstRef.current = 0;
      setState("live");
    });
    es.addEventListener("warning", () => {
      if (cancelled) return;
      // Redis isn't configured — switch the client to a polling loop so the
      // dashboard stays "live-ish" without paying for an Upstash plan.
      startPolling();
    });
    es.addEventListener("event", () => {
      if (cancelled) return;
      errorBurstRef.current = 0;
      setLastAt(Date.now());
      setState("live");
      router.refresh();
    });
    es.onerror = () => {
      if (cancelled) return;
      errorBurstRef.current += 1;
      if (errorBurstRef.current >= RETRY_LIMIT) {
        startPolling();
      } else {
        setState("reconnecting");
      }
    };
    es.onopen = () => {
      if (cancelled) return;
      errorBurstRef.current = 0;
      setState("live");
    };

    return () => {
      cancelled = true;
      es.close();
      esRef.current = null;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [router]);

  return <ConnectionBadge state={state} lastAt={lastAt} />;
}
