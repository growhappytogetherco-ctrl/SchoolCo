"use client";

import { useState, useEffect, useTransition } from "react";
import { GraduationCap, Plus, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getOrCreateGraduationPlan,
  getGraduationPlanFull,
  getAvailableTemplates,
  initializeStudentRequirements,
  type GraduationPlan,
  type StudentGraduationRequirement,
  type GraduationPlanEntry,
  type GraduationRequirementTemplate,
  type GuidanceReview,
  type ManualCredit,
} from "@/app/actions/graduationPlan";
import { computeCreditTotals } from "@/lib/graduation/creditCalculator";
import { GraduationOverview } from "@/components/graduation/GraduationOverview";
import { NeedsClassificationSection } from "@/components/graduation/NeedsClassificationSection";
import { RequirementRow } from "@/components/graduation/RequirementRow";
import { FourYearPlan } from "@/components/graduation/FourYearPlan";
import { GuidanceReviews } from "@/components/graduation/GuidanceReviews";
import { AddCourseDialog } from "@/components/graduation/AddCourseDialog";

type FullEntry = GraduationPlanEntry & {
  course_record: {
    course_name: string;
    subject_area: string | null;
    credits_earned: number | null;
    verification_status: string;
    completion_status: string;
    counts_toward_high_school_credit: boolean;
    school_year: string | null;
  } | null;
  enrollment: {
    status: string;
    counts_toward_high_school_credit: boolean;
    credits_attempted: number | null;
  } | null;
  manual_credits: ManualCredit[];
};

interface Props {
  studentId: string;
}

export function GraduationPlanTab({ studentId }: Props) {
  const [plan, setPlan] = useState<GraduationPlan | null>(null);
  const [requirements, setRequirements] = useState<StudentGraduationRequirement[]>([]);
  const [entries, setEntries] = useState<FullEntry[]>([]);
  const [reviews, setReviews] = useState<GuidanceReview[]>([]);
  const [templates, setTemplates] = useState<GraduationRequirementTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [addCourseReqId, setAddCourseReqId] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [planResult, templateResult] = await Promise.all([
        getOrCreateGraduationPlan(studentId),
        getAvailableTemplates(),
      ]);

      if (!planResult.success) {
        setError(planResult.error);
        setLoading(false);
        return;
      }
      if (templateResult.success) setTemplates(templateResult.data);

      setPlan(planResult.data);

      const fullResult = await getGraduationPlanFull(studentId);
      if (fullResult.success) {
        setRequirements(fullResult.data.requirements);
        setEntries(fullResult.data.entries as FullEntry[]);
        setReviews(fullResult.data.reviews);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load graduation plan");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [studentId]);

  async function handleInitializeTemplate(templateId: string) {
    if (!plan) return;
    startTransition(async () => {
      const result = await initializeStudentRequirements(plan.id, templateId);
      if (result.success) {
        await loadData();
      } else {
        setError(result.error);
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-sc-teal" />
        <span className="ml-2 text-body-md text-sc-gray-400">Loading graduation plan…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-sc-rose-50 border border-sc-rose-200 p-6 flex items-start gap-3">
        <AlertCircle className="size-5 text-sc-rose-700 mt-0.5 shrink-0" />
        <div>
          <p className="text-label-md font-medium text-sc-rose-700">Error loading graduation plan</p>
          <p className="text-body-md text-sc-rose-700 mt-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={loadData}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const totals = requirements.length > 0
    ? computeCreditTotals(requirements, entries)
    : { measure_a: 0, measure_b: 0, completion_pct: 0, by_requirement: {} };

  const unclassifiedEntries = entries.filter((e) => !e.student_requirement_id);
  const needsReview = entries.filter((e) =>
    e.manual_credits.some((mc) => mc.duplicate_status === "not_reviewed")
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-5 text-sc-navy" />
          <h2 className="text-heading-1 text-sc-navy">Graduation Planner</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setAddCourseReqId(undefined); setShowAddCourse(true); }}
        >
          <Plus className="size-4 mr-1" />
          Add Course
        </Button>
      </div>

      {/* Template setup prompt if no requirements yet */}
      {requirements.length === 0 && templates.length > 0 && (
        <div className="rounded-2xl bg-sc-gold-50 border border-sc-gold-300 p-6">
          <p className="text-label-md font-medium text-sc-gold-800 mb-3">
            No graduation requirements set up yet.
          </p>
          <p className="text-body-md text-sc-gray mb-3">
            Choose a framework to initialize this student's graduation requirements:
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => handleInitializeTemplate(t.id)}
              >
                {isPending && <Loader2 className="size-3 mr-1 animate-spin" />}
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Needs duplicate review banner */}
      {needsReview.length > 0 && (
        <div className="rounded-2xl bg-sc-gold-50 border border-sc-gold-300 p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-sc-gold-700 mt-0.5 shrink-0" />
          <div>
            <p className="text-label-sm font-medium text-sc-gold-800">
              {needsReview.length} manual credit{needsReview.length > 1 ? "s" : ""} pending duplicate review
            </p>
            <p className="text-body-md text-sc-gold-700 text-sm mt-0.5">
              These credits are excluded from graduation totals until reviewed.
            </p>
          </div>
        </div>
      )}

      {/* Overview / credit summary */}
      {requirements.length > 0 && (
        <GraduationOverview
          plan={plan}
          totals={totals}
          onEdit={loadData}
        />
      )}

      {/* Needs classification section */}
      {unclassifiedEntries.length > 0 && (
        <NeedsClassificationSection
          planId={plan.id}
          entries={unclassifiedEntries}
          requirements={requirements}
          onUpdate={loadData}
        />
      )}

      {/* Requirements breakdown */}
      {requirements.length > 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
          <h3 className="text-label-md font-semibold text-sc-navy mb-4">Requirements</h3>
          <div className="space-y-3">
            {requirements.map((req) => {
              const slot = totals.by_requirement[req.id];
              const reqEntries = entries.filter((e) => e.student_requirement_id === req.id);
              return (
                <RequirementRow
                  key={req.id}
                  requirement={req}
                  entries={reqEntries}
                  earnedCredits={slot?.earned ?? 0}
                  pct={slot?.pct ?? 0}
                  planId={plan.id}
                  onAddCourse={() => { setAddCourseReqId(req.id); setShowAddCourse(true); }}
                  onUpdate={loadData}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Four-year plan grid */}
      {entries.length > 0 && (
        <FourYearPlan
          planId={plan.id}
          entries={entries}
          requirements={requirements}
          onUpdate={loadData}
        />
      )}

      {/* Guidance reviews */}
      <GuidanceReviews
        planId={plan.id}
        reviews={reviews}
        onUpdate={loadData}
      />

      {/* Add course dialog */}
      {showAddCourse && (
        <AddCourseDialog
          planId={plan.id}
          studentId={studentId}
          requirementId={addCourseReqId}
          requirements={requirements}
          onClose={() => setShowAddCourse(false)}
          onSuccess={() => { setShowAddCourse(false); loadData(); }}
        />
      )}
    </div>
  );
}
