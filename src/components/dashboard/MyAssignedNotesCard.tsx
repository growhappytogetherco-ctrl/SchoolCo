"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, ChevronRight, AlertTriangle } from "lucide-react";
import { getAssignedNotes, type StaffNote } from "@/app/actions/staffNotes";
import { cn } from "@/lib/utils";

type AssignedNote = StaffNote & { student_name: string };

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-sc-rose",
  high:   "bg-sc-gold",
  normal: "bg-sc-teal",
  low:    "bg-sc-gray-300",
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MyAssignedNotesCard() {
  const [notes, setNotes]   = useState<AssignedNote[]>([]);
  const [loading, setLoad]  = useState(true);

  useEffect(() => {
    getAssignedNotes().then((data) => {
      setNotes(data);
      setLoad(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5">
        <div className="h-5 w-40 rounded-lg bg-sc-gray-100 animate-pulse mb-3" />
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-10 rounded-xl bg-sc-gray-50 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (notes.length === 0) return null;

  const today = new Date().toISOString().split("T")[0];
  const overdue = notes.filter((n) => n.due_date && n.due_date < today).length;

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-card overflow-hidden",
      overdue > 0 ? "border-sc-rose/30" : "border-sc-gray-100"
    )}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            overdue > 0 ? "bg-sc-rose-50 border border-sc-rose-200" : "bg-sc-teal-50 border border-sc-teal-200"
          )}>
            <ClipboardCheck className={cn("size-4", overdue > 0 ? "text-sc-rose" : "text-sc-teal")} />
          </div>
          <div>
            <p className="text-label-md font-semibold text-sc-navy">
              My Assigned Notes
              <span className="ml-2 rounded-full bg-sc-teal px-2 py-0.5 text-label-sm text-white font-medium">
                {notes.length}
              </span>
              {overdue > 0 && (
                <span className="ml-1 rounded-full bg-sc-rose px-2 py-0.5 text-label-sm text-white font-medium flex-inline items-center gap-1">
                  {overdue} overdue
                </span>
              )}
            </p>
            <p className="text-label-sm text-sc-gray">Notes assigned to you requiring action</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-sc-gray-50">
        {notes.map((note) => {
          const isOverdue = note.due_date && note.due_date < today;
          return (
            <Link
              key={note.id}
              href={`/dashboard/students/${note.student_id}?tab=notes`}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-sc-gray-50 transition-colors"
            >
              <span className={cn("size-2 rounded-full shrink-0", PRIORITY_DOT[note.priority] ?? "bg-sc-gray-300")} />
              <div className="flex-1 min-w-0">
                <p className="text-label-sm font-semibold text-sc-navy truncate">{note.student_name}</p>
                <p className="text-label-sm text-sc-gray truncate">{note.title ?? note.body.slice(0, 80)}</p>
              </div>
              <div className="shrink-0 text-right">
                {note.due_date ? (
                  <span className={cn(
                    "text-label-sm font-medium",
                    isOverdue ? "text-sc-rose-700" : "text-sc-gray"
                  )}>
                    {isOverdue && <AlertTriangle className="size-3 inline mr-0.5" />}
                    {fmtDate(note.due_date)}
                  </span>
                ) : (
                  <span className="text-label-sm text-sc-gray-400">No due date</span>
                )}
              </div>
              <ChevronRight className="size-4 text-sc-gray-300 shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
