"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/time/duration";

export function LiveDuration({
  startedAt,
  endedAt,
}: {
  startedAt: string;
  endedAt: string | null;
}) {
  const startMs = new Date(startedAt).getTime();
  const endMs = endedAt ? new Date(endedAt).getTime() : null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (endMs !== null) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endMs]);

  return <span>{formatDuration(startMs, endMs, nowMs)}</span>;
}
