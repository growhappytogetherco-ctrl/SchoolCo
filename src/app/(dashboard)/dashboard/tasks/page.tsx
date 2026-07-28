import Link from "next/link";
import { getTasks } from "@/app/actions/planning";
import type { TaskStatus, TaskPriority } from "@/app/actions/planning";
import { TaskCard } from "@/components/planning/TaskCard";
import { requireStaff } from "@/lib/roleGuard";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from "@/lib/planning-config";

export const metadata = { title: "Tasks" };

interface SearchParams {
  status?: string;
  priority?: string;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireStaff();
  const params = await searchParams;

  const status = params.status as TaskStatus | undefined;
  const tasksRes = await getTasks({ status: status !== "overdue" ? status : undefined });
  const allTasks = tasksRes.success ? tasksRes.data : [];

  const now = new Date();
  const tasks = status === "overdue"
    ? allTasks.filter((t) => t.due_at && new Date(t.due_at) < now && t.status !== "completed" && t.status !== "cancelled")
    : allTasks;

  const statuses: Array<{ value: string; label: string }> = [
    { value: "", label: "All" },
    { value: "not_started", label: "Not Started" },
    { value: "in_progress", label: "In Progress" },
    { value: "waiting", label: "Waiting" },
    { value: "blocked", label: "Blocked" },
    { value: "overdue", label: "Overdue" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-serif text-heading-1 text-sc-navy">Tasks</h1>
        <p className="text-body-md text-sc-gray">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {statuses.map(({ value, label }) => (
          <Link
            key={value}
            href={value ? `/dashboard/tasks?status=${value}` : "/dashboard/tasks"}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              (status ?? "") === value
                ? "bg-sc-teal text-white border-sc-teal"
                : "bg-white text-sc-gray border-sc-gray-200 hover:bg-sc-gray-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-12 text-center text-sc-gray">
          No tasks{status ? ` with status "${status}"` : ""}.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}
