"use client";

import { useState } from "react";
import { HandoffPanel } from "@/components/sprints/HandoffPanel";
import {
  DriveOnGitHubPanel,
  type DriverMessage,
  type DriverStatus,
  type RepoOption,
} from "@/components/sprints/DriveOnGitHubPanel";

type Tab = "handoff" | "drive";

export function RunSprintTabs({
  sprintId,
  driverMode,
  driverStatus,
  driverIssueUrl,
  driverRepoFullName,
  bindableRepos,
  messages,
  prefilledPrompt,
}: {
  sprintId: string;
  driverMode: "HANDOFF" | "AUTO_ACTION" | null;
  driverStatus: DriverStatus;
  driverIssueUrl: string | null;
  driverRepoFullName: string | null;
  bindableRepos: RepoOption[];
  messages: DriverMessage[];
  prefilledPrompt: string | null;
}) {
  // When a sprint is already being driven, lock the tab to the active mode so
  // the user sees the correct panel state. Default to "handoff" for fresh
  // sprints — the free option is the recommended path.
  const initialTab: Tab =
    driverMode === "AUTO_ACTION" ? "drive" : driverMode === "HANDOFF" ? "handoff" : "handoff";
  const [tab, setTab] = useState<Tab>(initialTab);
  const locked = driverMode !== null;
  const activeTab: Tab = locked ? initialTab : tab;

  return (
    <section className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Run this sprint</h2>
        <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => !locked && setTab("handoff")}
            disabled={locked && activeTab !== "handoff"}
            className={`rounded px-2 py-1 ${
              activeTab === "handoff"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-400 hover:text-slate-200"
            } ${locked && activeTab !== "handoff" ? "cursor-not-allowed opacity-30" : ""}`}
          >
            Hand off (free)
          </button>
          <button
            type="button"
            onClick={() => !locked && setTab("drive")}
            disabled={locked && activeTab !== "drive"}
            className={`rounded px-2 py-1 ${
              activeTab === "drive"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-400 hover:text-slate-200"
            } ${locked && activeTab !== "drive" ? "cursor-not-allowed opacity-30" : ""}`}
          >
            Auto (paid)
          </button>
        </div>
      </header>

      <div className="mt-4">
        {activeTab === "handoff" ? (
          <HandoffPanel
            sprintId={sprintId}
            state={{ driverStatus, driverIssueUrl, driverRepoFullName }}
            bindableRepos={bindableRepos}
            messages={messages}
            prefilledPrompt={prefilledPrompt}
          />
        ) : (
          <DriveOnGitHubPanel
            sprintId={sprintId}
            driverStatus={driverStatus}
            driverIssueUrl={driverIssueUrl}
            driverRepoFullName={driverRepoFullName}
            bindableRepos={bindableRepos}
            messages={messages}
          />
        )}
      </div>

      {locked && (
        <p className="mt-3 text-[10px] text-slate-600">
          Mode locked because the sprint is already bound to an issue. Start a new sprint
          to switch modes.
        </p>
      )}
    </section>
  );
}
