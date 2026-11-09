"use client";

import { useState, useTransition } from "react";
import { Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateGraduationPlan, type GraduationPlan } from "@/app/actions/graduationPlan";
import { cn } from "@/lib/utils";

interface Props {
  plan: GraduationPlan;
  totals: {
    measure_a: number;
    measure_b: number;
    completion_pct: number;
  };
  onEdit: () => void;
}

const POST_GRAD_GOALS = [
  { value: "university", label: "University / 4-Year College" },
  { value: "community_college", label: "Community College" },
  { value: "technical_trade", label: "Technical / Trade School" },
  { value: "military", label: "Military Service" },
  { value: "workforce", label: "Workforce / Employment" },
  { value: "other", label: "Other" },
];

export function GraduationOverview({ plan, totals, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    ninth_grade_entry_year: plan.ninth_grade_entry_year?.toString() ?? "",
    expected_graduation_year: plan.expected_graduation_year?.toString() ?? "",
    advisor_name: plan.advisor_name ?? "",
    post_graduation_goal: plan.post_graduation_goal ?? "",
    staff_notes: plan.staff_notes ?? "",
  });

  async function handleSave() {
    startTransition(async () => {
      await updateGraduationPlan(plan.id, {
        ninth_grade_entry_year: form.ninth_grade_entry_year ? parseInt(form.ninth_grade_entry_year) : null,
        expected_graduation_year: form.expected_graduation_year ? parseInt(form.expected_graduation_year) : null,
        advisor_name: form.advisor_name || null,
        post_graduation_goal: form.post_graduation_goal || null,
        staff_notes: form.staff_notes || null,
      });
      setEditing(false);
      onEdit();
    });
  }

  const pct = totals.completion_pct;
  const barColor = pct >= 100 ? "bg-sc-teal" : pct >= 60 ? "bg-sc-teal" : pct >= 30 ? "bg-sc-gold-600" : "bg-sc-rose";

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
      <div className="flex items-start justify-between mb-5">
        <h3 className="text-label-md font-semibold text-sc-navy">Credit Summary</h3>
        <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
          <Edit2 className="size-4 mr-1" />
          {editing ? "Cancel" : "Edit Plan Info"}
        </Button>
      </div>

      {/* Credit totals */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl bg-sc-cream p-4 text-center">
          <p className="text-2xl font-bold text-sc-navy">{totals.measure_b.toFixed(1)}</p>
          <p className="text-label-sm text-sc-gray-400 mt-1">Earned (applied)</p>
        </div>
        <div className="rounded-xl bg-sc-cream p-4 text-center">
          <p className="text-2xl font-bold text-sc-navy">{totals.measure_a.toFixed(1)}</p>
          <p className="text-label-sm text-sc-gray-400 mt-1">Total verified</p>
        </div>
        <div className="rounded-xl bg-sc-cream p-4 text-center">
          <p className={cn("text-2xl font-bold", pct >= 100 ? "text-sc-teal" : "text-sc-navy")}>{pct}%</p>
          <p className="text-label-sm text-sc-gray-400 mt-1">Complete</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="h-2.5 rounded-full bg-sc-gray-100 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {/* Plan info */}
      {!editing ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-body-md">
          <div>
            <dt className="text-label-sm text-sc-gray-400">9th Grade Entry Year</dt>
            <dd className="text-sc-navy font-medium">{plan.ninth_grade_entry_year ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-label-sm text-sc-gray-400">Expected Graduation</dt>
            <dd className="text-sc-navy font-medium">{plan.expected_graduation_year ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-label-sm text-sc-gray-400">Advisor</dt>
            <dd className="text-sc-navy font-medium">{plan.advisor_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-label-sm text-sc-gray-400">Post-Graduation Goal</dt>
            <dd className="text-sc-navy font-medium">
              {POST_GRAD_GOALS.find((g) => g.value === plan.post_graduation_goal)?.label ?? "—"}
            </dd>
          </div>
          {plan.staff_notes && (
            <div className="col-span-2">
              <dt className="text-label-sm text-sc-gray-400">Staff Notes</dt>
              <dd className="text-sc-navy">{plan.staff_notes}</dd>
            </div>
          )}
        </dl>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="entry-year">9th Grade Entry Year</Label>
              <Input
                id="entry-year"
                placeholder="2023"
                value={form.ninth_grade_entry_year}
                onChange={(e) => setForm((f) => ({ ...f, ninth_grade_entry_year: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="grad-year">Expected Graduation Year</Label>
              <Input
                id="grad-year"
                placeholder="2027"
                value={form.expected_graduation_year}
                onChange={(e) => setForm((f) => ({ ...f, expected_graduation_year: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="advisor">Advisor Name</Label>
              <Input
                id="advisor"
                value={form.advisor_name}
                onChange={(e) => setForm((f) => ({ ...f, advisor_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Post-Graduation Goal</Label>
              <Select
                value={form.post_graduation_goal}
                placeholder="Select…"
                onChange={(e) => setForm((f) => ({ ...f, post_graduation_goal: e.target.value }))}
              >
                {POST_GRAD_GOALS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="staff-notes">Staff Notes</Label>
            <textarea
              id="staff-notes"
              className="w-full rounded-lg border border-sc-gray-200 p-2 text-body-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal"
              rows={3}
              value={form.staff_notes}
              onChange={(e) => setForm((f) => ({ ...f, staff_notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
