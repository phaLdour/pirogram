import type { ActivityNode as ActivityNodeT } from "@/lib/queries/dashboard";
import { LiveDuration } from "@/components/dashboard/LiveDuration";

const LEAF_PREFIX = "└─ ";
const BRANCH_PREFIX = "├─ ";

export function ActivityTree({ nodes, depth = 0 }: { nodes: ActivityNodeT[]; depth?: number }) {
  if (nodes.length === 0) return null;
  return (
    <ul className="space-y-0.5" role="tree">
      {nodes.map((n, i) => (
        <ActivityRow
          key={n.id}
          node={n}
          depth={depth}
          isLast={i === nodes.length - 1}
        />
      ))}
    </ul>
  );
}

function ActivityRow({
  node,
  depth,
  isLast,
}: {
  node: ActivityNodeT;
  depth: number;
  isLast: boolean;
}) {
  const running = node.endedAt === null;
  const failed = node.ok === false;
  const isTask = node.toolName === "Task";
  const label =
    isTask && node.subagentType
      ? `Task: ${node.subagentType}`
      : node.toolName;
  const indent = "  ".repeat(depth);
  const prefix = depth === 0 ? "" : isLast ? LEAF_PREFIX : BRANCH_PREFIX;

  return (
    <li role="treeitem" aria-expanded={node.children.length > 0 ? true : undefined}>
      <div
        className={`flex items-baseline gap-2 text-xs ${
          running ? "text-slate-200" : failed ? "text-red-300" : "text-slate-400"
        }`}
      >
        <span aria-hidden className="font-mono text-slate-600">{indent}{prefix}</span>
        <span aria-hidden className="text-[10px]">
          {running ? "▶" : failed ? "✗" : "✓"}
        </span>
        <span className="font-medium">{label}</span>
        {node.description && (
          <span className="truncate text-slate-500" title={node.description}>
            · {node.description}
          </span>
        )}
        <span className="ml-auto whitespace-nowrap text-slate-500">
          <LiveDuration
            startedAt={node.startedAt.toString()}
            endedAt={node.endedAt ? node.endedAt.toString() : null}
          />
        </span>
      </div>
      {node.children.length > 0 && (
        <div className="ml-4">
          <ActivityTree nodes={node.children} depth={depth + 1} />
        </div>
      )}
    </li>
  );
}
