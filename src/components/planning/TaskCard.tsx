"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar, User, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanningTask } from "@/app/actions/planning";
import { updateTask } from "@/app/actions/planning";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_COLORS, TASK_PRIORITY_COLORS } from "@/lib/planning-config";
import { toast } from "sonner";

interface TaskCardProps {
  task: PlanningTask;
  onUpdated?: (task: PlanningTask) => void;
  className?: string;
}

export function TaskCard({ task, onUpdated, className }: TaskCardProps) {
  const [completing, setCompleting] = useState(false);
  const isCompleted = task.status === "completed";
  const isOverdue = task.due_at && new Date(task.due_at) < new Date() && !isCompleted;

  async function handleComplete() {
    if (isCompleted || completing) return;
    setCompleting(true);
    const result = await updateTask(task.id, { status: "completed" });
    if (result.success) {
      toast.success("Task marked complete");
      onUpdated?.(result.data);
    } else {
      toast.error(result.error);
    }
    setCompleting(false);
  }

  return (
    <div className={cn(
      "rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4",
      isCompleted && "opacity-60",
      className
    )}>
      <div className="flex items-start gap-3">
        <button
          onClick={handleComplete}
          disabled={isCompleted || completing}
          className="mt-0.5 shrink-0 text-sc-teal hover:text-sc-teal-700 disabled:cursor-default transition-colors"
          aria-label={isCompleted ? "Completed" : "Mark complete"}
        >
          {isCompleted
            ? <CheckCircle2 className="size-5 text-emerald-500" />
            : <Circle className="size-5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TASK_PRIORITY_COLORS[task.priority])}>
              {TASK_PRIORITY_LABELS[task.priority]}
            </span>
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TASK_STATUS_COLORS[task.status])}>
              {TASK_STATUS_LABELS[task.status]}
            </span>
          </div>

          <p className={cn("font-medium text-sc-navy mt-1", isCompleted && "line-through")}>{task.title}</p>

          {task.event_title && (
            <p className="text-xs text-sc-teal mt-0.5">↳ {task.event_title}</p>
          )}

          <div className="mt-2 flex items-center gap-3 flex-wrap">
            {task.due_at && (
              <span className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-sc-rose font-medium" : "text-sc-gray")}>
                <Calendar className="size-3" />
                {isOverdue ? "Overdue · " : ""}{format(new Date(task.due_at), "MMM d")}
              </span>
            )}
            {task.assigned_name && (
              <span className="flex items-center gap-1 text-xs text-sc-gray">
                <User className="size-3" />
                {task.assigned_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
