"use client";

import { useState } from "react";
import { CheckCircle2, Clock, BookOpen, Users, AlertTriangle, BarChart2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { QuarterCourseRow, QuarterWorkflowStatus } from "@/app/actions/quarterWorkflow";

interface QuarterCourseRowProps {
  course:          QuarterCourseRow;
  periodId:        string;
  orgId:           string;
  canFinalize:     boolean;   // registrar+
  onMoveToReview:  (sectionId: string) => Promise<void>;
  onFinalize:      (sectionId: string) => Promise<void>;
  onReopen:        (sectionId: string, reason: string) => Promise<void>;
  selected:        boolean;
  onSelectToggle:  (sectionId: string) => void;
}

export function QuarterCourseRowItem({
  course,
  periodId,
  orgId,
  canFinalize,
  onMoveToReview,
  onFinalize,
  onReopen,
  selected,
  onSelectToggle,
}: QuarterCourseRowProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);

  const { workflow } = course;

  async function handleMoveToReview() {
    setLoadingAction("review");
    try { await onMoveToReview(course.courseSectionId); }
    finally { setLoadingAction(null); }
  }

  async function handleFinalize() {
    setShowFinalizeConfirm(false);
    setLoadingAction("finalize");
    try { await onFinalize(course.courseSectionId); }
    finally { setLoadingAction(null); }
  }

  async function handleReopen() {
    if (!reopenReason.trim()) return;
    setShowReopenDialog(false);
    setLoadingAction("reopen");
    try { await onReopen(course.courseSectionId, reopenReason.trim()); }
    finally {
      setLoadingAction(null);
      setReopenReason("");
    }
  }

  const isLoading = !!loadingAction;

  return (
    <>
      <div className={cn(
        "flex items-center gap-4 rounded-xl border px-4 py-3 transition-all",
        selected ? "border-sc-teal bg-sc-teal/5" : "border-sc-gray-100 bg-white hover:border-sc-gray-200",
      )}>
        {/* Checkbox (only for review courses and canFinalize) */}
        {canFinalize && workflow.status === "review" && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelectToggle(course.courseSectionId)}
            className="h-4 w-4 rounded accent-sc-teal cursor-pointer"
            aria-label={`Select ${course.courseName}`}
          />
        )}
        {(!canFinalize || workflow.status !== "review") && (
          <div className="w-4" /> // Spacer
        )}

        {/* Status badge */}
        <WorkflowStatusBadge status={workflow.status} />

        {/* Course info */}
        <div className="flex-1 min-w-0">
          <p className="text-label-md text-sc-navy truncate">{course.courseName}</p>
          <p className="text-label-sm text-sc-gray-400 truncate">
            {course.subject}
            {course.teacherName ? ` · ${course.teacherName}` : ""}
          </p>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-6 text-label-sm text-sc-gray-400">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" />
            {course.enrolledCount}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="size-3.5" />
            {course.assignmentCount}
          </span>
          {course.missingCount > 0 && (
            <span className="flex items-center gap-1 text-sc-rose">
              <AlertTriangle className="size-3.5" />
              {course.missingCount} missing
            </span>
          )}
          {course.ungradedCount > 0 && (
            <span className="flex items-center gap-1 text-sc-gold-700">
              <AlertTriangle className="size-3.5" />
              {course.ungradedCount} ungraded
            </span>
          )}
        </div>

        {/* Readiness indicator */}
        <div className="hidden md:block text-right shrink-0">
          {course.workflow.status === "finalized" ? null
            : course.readyToFinalize ? (
              <span className="text-label-sm font-medium text-sc-teal">Ready</span>
            ) : (
              <span className="text-label-sm text-sc-gold-700">Needs Review</span>
            )
          }
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-sc-teal hover:text-sc-teal hover:bg-sc-teal/10 gap-1 text-label-sm"
          >
            <a href={`/dashboard/courses/${course.courseSectionId}?period=${periodId}`}>
              <span className="hidden sm:inline">Gradebook</span>
              <ChevronRight className="size-3.5" />
            </a>
          </Button>

          {canFinalize && workflow.status === "open" && (
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={handleMoveToReview}
              className="text-sc-gold-700 border-sc-gold-300 hover:bg-sc-gold-50 text-label-sm"
            >
              {loadingAction === "review" ? "…" : "Start Review"}
            </Button>
          )}

          {canFinalize && workflow.status === "review" && (
            <Button
              variant="default"
              size="sm"
              disabled={isLoading}
              onClick={() => setShowFinalizeConfirm(true)}
              className="bg-sc-teal hover:bg-sc-teal-700 text-label-sm"
            >
              {loadingAction === "finalize" ? "Finalizing…" : "Finalize"}
            </Button>
          )}

          {canFinalize && workflow.status === "finalized" && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading}
              onClick={() => setShowReopenDialog(true)}
              className="text-sc-rose hover:bg-sc-rose-50 text-label-sm"
            >
              {loadingAction === "reopen" ? "…" : "Reopen"}
            </Button>
          )}
        </div>
      </div>

      {/* Finalize Confirmation Dialog */}
      <Dialog open={showFinalizeConfirm} onOpenChange={setShowFinalizeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Quarter Grade</DialogTitle>
            <DialogDescription>
              This will freeze the current grades for all enrolled students in{" "}
              <strong>{course.courseName}</strong> as the official Q1 record.
              This action can be reversed by reopening the course.
            </DialogDescription>
          </DialogHeader>
          {course.missingCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-sc-gold-50 border border-sc-gold-300 px-3 py-2 text-label-sm text-sc-gold-800">
              <AlertTriangle className="size-4 shrink-0 text-sc-gold-600" />
              <span>
                {course.missingCount} missing assignment{course.missingCount !== 1 ? "s" : ""} will be
                frozen as missing in the snapshot.
              </span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalizeConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleFinalize}
              className="bg-sc-teal hover:bg-sc-teal-700"
            >
              Confirm Finalize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Dialog */}
      <Dialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Finalized Quarter</DialogTitle>
            <DialogDescription>
              Reopening <strong>{course.courseName}</strong> will delete the frozen grade snapshots
              and return the course to REVIEW status. You can then re-finalize after making corrections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reopen-reason">Reason for reopening (required)</Label>
            <Textarea
              id="reopen-reason"
              placeholder="e.g. Grade entry error for student Kiona — correcting before issuing report cards"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReopenDialog(false); setReopenReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reopenReason.trim()}
              onClick={handleReopen}
            >
              Reopen Course
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function WorkflowStatusBadge({ status }: { status: "open" | "review" | "finalized" }) {
  if (status === "finalized") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-sc-teal/10 px-2.5 py-1 text-[11px] font-medium text-sc-teal shrink-0">
        <CheckCircle2 className="size-3" />
        Finalized
      </span>
    );
  }
  if (status === "review") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-sc-gold-50 px-2.5 py-1 text-[11px] font-medium text-sc-gold-700 shrink-0">
        <BarChart2 className="size-3" />
        Review
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-sc-gray-100 px-2.5 py-1 text-[11px] font-medium text-sc-gray-400 shrink-0">
      <Clock className="size-3" />
      Open
    </span>
  );
}
