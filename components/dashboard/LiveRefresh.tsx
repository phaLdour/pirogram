"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectionBadge, type ConnState } from "@/components/dashboard/ConnectionBadge";

const RETRY_LIMIT = 4;

export function LiveRefresh() {
  const router = useRouter();
  const [state, setState] = useState<ConnState>("connecting");
  const [lastAt, setLastAt] = useState<number | null>(null);
  const errorBurstRef = useRef(0);

  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    let cancelled = false;

    es.addEventListener("ready", () => {
      if (cancelled) return;
      errorBurstRef.current = 0;
      setState("live");
    });
    es.addEventListener("warning", () => {
      if (!cancelled) setState("warning");
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
      setState(errorBurstRef.current >= RETRY_LIMIT ? "down" : "reconnecting");
    };
    es.onopen = () => {
      if (cancelled) return;
      errorBurstRef.current = 0;
      setState("live");
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [router]);

  return <ConnectionBadge state={state} lastAt={lastAt} />;
}
