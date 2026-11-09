"use client";

import { useState, useTransition } from "react";
import { Plus, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addGuidanceReview, type GuidanceReview } from "@/app/actions/graduationPlan";

interface Props {
  planId: string;
  reviews: GuidanceReview[];
  onUpdate: () => void;
}

export function GuidanceReviews({ planId, reviews, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    advisor_name: "",
    advisor_recommendations: "",
    student_goals: "",
    next_steps: "",
    next_review_date: "",
  });

  async function handleSubmit() {
    if (!form.advisor_name.trim()) {
      setError("Advisor name is required");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addGuidanceReview(planId, {
        advisor_name: form.advisor_name,
        advisor_recommendations: form.advisor_recommendations || undefined,
        student_goals: form.student_goals || undefined,
        next_steps: form.next_steps || undefined,
        next_review_date: form.next_review_date || undefined,
      });
      if (result.success) {
        setShowForm(false);
        setForm({ advisor_name: "", advisor_recommendations: "", student_goals: "", next_steps: "", next_review_date: "" });
        onUpdate();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
      <div className="flex items-center justify-between p-6 pb-4">
        <button
          className="flex items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <h3 className="text-label-md font-semibold text-sc-navy">Guidance Reviews</h3>
          <span className="text-label-sm text-sc-gray-400">({reviews.length})</span>
          {expanded ? <ChevronUp className="size-4 text-sc-gray-400" /> : <ChevronDown className="size-4 text-sc-gray-400" />}
        </button>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="size-4 mr-1" />
          Add Review
        </Button>
      </div>

      {showForm && (
        <div className="border-t border-sc-gray-100 p-6 space-y-4 bg-sc-cream">
          <h4 className="text-label-sm font-semibold text-sc-navy">New Guidance Review</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gr-advisor">Advisor Name *</Label>
              <Input
                id="gr-advisor"
                value={form.advisor_name}
                onChange={(e) => setForm((f) => ({ ...f, advisor_name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="gr-next-date">Next Review Date</Label>
              <Input
                id="gr-next-date"
                type="date"
                value={form.next_review_date}
                onChange={(e) => setForm((f) => ({ ...f, next_review_date: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="gr-recommendations">Recommendations</Label>
            <textarea
              id="gr-recommendations"
              rows={2}
              className="w-full rounded-lg border border-sc-gray-200 p-2 text-body-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal"
              value={form.advisor_recommendations}
              onChange={(e) => setForm((f) => ({ ...f, advisor_recommendations: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gr-goals">Student Goals</Label>
              <textarea
                id="gr-goals"
                rows={2}
                className="w-full rounded-lg border border-sc-gray-200 p-2 text-body-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal"
                value={form.student_goals}
                onChange={(e) => setForm((f) => ({ ...f, student_goals: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="gr-next-steps">Next Steps</Label>
              <textarea
                id="gr-next-steps"
                rows={2}
                className="w-full rounded-lg border border-sc-gray-200 p-2 text-body-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal"
                value={form.next_steps}
                onChange={(e) => setForm((f) => ({ ...f, next_steps: e.target.value }))}
              />
            </div>
          </div>
          {error && <p className="text-xs text-sc-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
              Save Review
            </Button>
          </div>
        </div>
      )}

      {expanded && reviews.length > 0 && (
        <div className="border-t border-sc-gray-100 divide-y divide-sc-gray-100">
          {reviews.map((review) => (
            <div key={review.id} className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-label-sm font-semibold text-sc-navy">{review.advisor_name}</span>
                <span className="text-xs text-sc-gray-400">{review.review_date}</span>
              </div>
              {review.advisor_recommendations && (
                <div>
                  <span className="text-xs font-medium text-sc-gray-400">Recommendations: </span>
                  <span className="text-body-md text-sc-navy">{review.advisor_recommendations}</span>
                </div>
              )}
              {review.student_goals && (
                <div>
                  <span className="text-xs font-medium text-sc-gray-400">Student Goals: </span>
                  <span className="text-body-md text-sc-navy">{review.student_goals}</span>
                </div>
              )}
              {review.next_steps && (
                <div>
                  <span className="text-xs font-medium text-sc-gray-400">Next Steps: </span>
                  <span className="text-body-md text-sc-navy">{review.next_steps}</span>
                </div>
              )}
              {review.next_review_date && (
                <p className="text-xs text-sc-gray-400">Next review: {review.next_review_date}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && reviews.length === 0 && (
        <div className="border-t border-sc-gray-100 p-5 text-center text-body-md text-sc-gray-400">
          No guidance reviews yet.
        </div>
      )}
    </div>
  );
}
