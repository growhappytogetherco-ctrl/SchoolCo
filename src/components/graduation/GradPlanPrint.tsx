"use client";

import { useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  GraduationPlan,
  StudentGraduationRequirement,
  GraduationPlanEntry,
  ManualCredit,
  GuidanceReview,
} from "@/app/actions/graduationPlan";
import type { CreditTotals } from "@/lib/graduation/creditCalculator";

type FullEntry = GraduationPlanEntry & {
  course_record: {
    course_name: string;
    credits_earned: number | null;
    verification_status: string;
    completion_status: string;
    school_year: string | null;
  } | null;
  enrollment: { status: string; credits_attempted: number | null } | null;
  manual_credits: ManualCredit[];
};

interface Props {
  studentName: string;
  gradeLevel: string | null;
  plan: GraduationPlan;
  requirements: StudentGraduationRequirement[];
  entries: FullEntry[];
  reviews: GuidanceReview[];
  totals: CreditTotals;
}

function entryDisplayName(entry: FullEntry) {
  return entry.display_name ?? entry.course_record?.course_name ?? null;
}

function entryCreditsEarned(entry: FullEntry): number {
  if (entry.course_record) return entry.course_record.credits_earned ?? 0;
  const mc = entry.manual_credits.find(
    m => m.verification_status === "verified" && m.duplicate_status === "confirmed_unique" && !m.reconciled_course_record_id
  );
  return mc?.credits_claimed ?? 0;
}

function entryCreditsPlanned(entry: FullEntry): number {
  return entry.display_credits_planned ?? entry.course_record?.credits_earned ?? 0;
}

function entryStatus(entry: FullEntry): string {
  if (entry.course_record) {
    if (entry.course_record.verification_status === "verified" && entry.course_record.completion_status === "completed") return "Completed";
    if (["in_progress", "enrolled"].includes(entry.course_record.completion_status)) return "In Progress";
    return "Planned";
  }
  const mc = entry.manual_credits[0];
  if (mc) {
    if (mc.duplicate_status === "confirmed_duplicate") return "Duplicate";
    if (mc.verification_status === "verified" && mc.duplicate_status === "confirmed_unique") return "Completed";
    return "Pending Verification";
  }
  if (entry.entry_status === "in_progress") return "In Progress";
  if (entry.entry_status === "completed") return "Completed";
  return "Planned";
}

function gradeLabel(slot: string | null): string {
  if (!slot) return "";
  if (slot === "pre_9th") return "Pre-9th";
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

const GRADE_SLOTS = ["pre_9th", "9th", "10th", "11th", "12th"] as const;

export function PrintGradPlanButton(props: Props) {
  const [open, setOpen] = useState(false);

  const printDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const totalRequired = props.requirements.reduce((s, r) => s + Number(r.credits_required), 0);
  const remaining = Math.max(0, totalRequired - props.totals.measure_b);

  // Build 4-year plan
  const entriesByGrade: Partial<Record<string, FullEntry[]>> = {};
  for (const slot of GRADE_SLOTS) {
    const slotEntries = props.entries.filter(e => e.grade_level_slot === slot);
    if (slotEntries.length) entriesByGrade[slot] = slotEntries;
  }
  const unassigned = props.entries.filter(e => !e.grade_level_slot);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Printer className="size-4 mr-1" />
        Print Planner
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-white overflow-auto"
          id="grad-plan-print-overlay"
        >
          {/* Print controls — hidden when printing */}
          <div className="no-print sticky top-0 z-10 bg-sc-navy text-white px-6 py-3 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <Printer className="size-5" />
              <span className="font-semibold">Graduation Checklist — {props.studentName}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="bg-white text-sc-navy text-sm font-semibold px-4 py-2 rounded-lg hover:bg-sc-cream transition-colors"
              >
                Print / Save PDF
              </button>
              <button onClick={() => setOpen(false)} className="p-2 hover:bg-white/10 rounded-lg">
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* ── Print content ── */}
          <div className="max-w-[850px] mx-auto px-8 py-6 print:px-4 print:py-4 print:max-w-none font-sans text-sm">

            {/* Page header */}
            <div className="border-b-2 border-sc-navy pb-4 mb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold tracking-widest uppercase text-sc-teal mb-1">
                    Rising Leaders Academy
                  </div>
                  <h1 className="text-2xl font-bold text-sc-navy leading-tight">
                    High School Graduation Checklist
                  </h1>
                  <div className="text-sm text-sc-navy font-semibold mt-1">{props.studentName}</div>
                  <div className="text-xs text-sc-gray mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {props.gradeLevel && <span>Grade {props.gradeLevel}</span>}
                    {props.plan.ninth_grade_entry_year && <span>9th Grade Entry: {props.plan.ninth_grade_entry_year}</span>}
                    {props.plan.expected_graduation_year && <span>Expected Graduation: {props.plan.expected_graduation_year}</span>}
                    {props.plan.advisor_name && <span>Advisor: {props.plan.advisor_name}</span>}
                  </div>
                </div>
                <div className="text-right text-xs text-sc-gray shrink-0">
                  <div className="font-semibold text-sc-navy">Graduation Checklist</div>
                  <div>Printed: {printDate}</div>
                  <div className="mt-1 text-[10px] italic">For planning purposes only.</div>
                </div>
              </div>
            </div>

            {/* Credit Summary */}
            <section className="mb-6 print:mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-sc-navy border-b border-sc-gray-200 pb-1 mb-2">
                Credit Summary
              </h2>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Credits Earned & Applied", value: props.totals.measure_b.toFixed(1) },
                  { label: "Total Verified", value: props.totals.measure_a.toFixed(1) },
                  { label: "Total Required", value: totalRequired.toFixed(1) },
                  { label: "Credits Remaining", value: remaining.toFixed(1), highlight: remaining > 0 },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="border border-sc-gray-200 rounded-lg p-2 text-center">
                    <div className={`text-xl font-bold ${highlight ? "text-sc-rose-700" : "text-sc-navy"}`}>{value}</div>
                    <div className="text-[9px] text-sc-gray uppercase tracking-wide mt-0.5 leading-tight">{label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Subject Requirements ── */}
            <section className="mb-6 print:mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-sc-navy border-b-2 border-sc-navy pb-1 mb-3">
                Graduation Requirements
              </h2>

              {props.requirements.map(req => {
                const slot = props.totals.by_requirement[req.id];
                const earned = slot?.earned ?? 0;
                const reqEntries = props.entries
                  .filter(e => e.student_requirement_id === req.id)
                  .sort((a, b) => a.sort_order - b.sort_order);
                const slotEntries = reqEntries.filter(e => e.slot_label != null);
                const extraEntries = reqEntries.filter(e => e.slot_label == null);
                const rem = Math.max(0, Number(req.credits_required) - earned);
                const met = earned >= Number(req.credits_required);

                return (
                  <div key={req.id} className="mb-4 print:mb-3 break-inside-avoid">
                    {/* Requirement header */}
                    <div className="flex items-center justify-between bg-sc-gray-100 px-3 py-1.5 rounded-t-lg print:bg-gray-100">
                      <span className="text-xs font-bold text-sc-navy uppercase tracking-wide">
                        {req.custom_name ?? "—"}
                      </span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-sc-gray">Required: <strong>{Number(req.credits_required).toFixed(1)}</strong></span>
                        <span className={met ? "text-sc-teal font-semibold" : "text-sc-gray"}>
                          Earned: <strong>{earned.toFixed(1)}</strong>
                        </span>
                        <span className={rem > 0 ? "text-sc-rose-700 font-semibold" : "text-sc-teal font-semibold"}>
                          Remaining: <strong>{rem.toFixed(1)}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Course slot rows */}
                    <table className="w-full text-xs border border-sc-gray-200 rounded-b-lg overflow-hidden border-collapse">
                      <thead>
                        <tr className="border-b border-sc-gray-200 text-sc-gray bg-white">
                          <th className="w-5 p-1.5 print:p-1" />
                          <th className="text-left p-1.5 print:p-1 font-semibold w-32">Course Slot</th>
                          <th className="text-left p-1.5 print:p-1 font-semibold">Actual Course Taken</th>
                          <th className="text-center p-1.5 print:p-1 font-semibold w-14">Credits</th>
                          <th className="text-center p-1.5 print:p-1 font-semibold w-20">Earned</th>
                          <th className="text-left p-1.5 print:p-1 font-semibold w-28">Status</th>
                          <th className="text-center p-1.5 print:p-1 font-semibold w-10">Inst</th>
                          <th className="text-center p-1.5 print:p-1 font-semibold w-14">Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Named slot entries */}
                        {slotEntries.map(entry => {
                          const name = entryDisplayName(entry);
                          const earnedCr = entryCreditsEarned(entry);
                          const plannedCr = entryCreditsPlanned(entry);
                          const st = entryStatus(entry);
                          return (
                            <tr key={entry.id} className="border-b border-sc-gray-100 last:border-b-0">
                              <td className="p-1.5 print:p-1 text-center">
                                <span className="inline-block w-3.5 h-3.5 border border-sc-gray-400 rounded-sm print:border-black align-middle" />
                              </td>
                              <td className="p-1.5 print:p-1 font-medium text-sc-navy">
                                {entry.slot_label}
                              </td>
                              <td className="p-1.5 print:p-1">
                                {name ? (
                                  <span className="text-sc-navy">{name}</span>
                                ) : (
                                  <span className="text-sc-gray-400 italic border-b border-sc-gray-300 inline-block w-48 print:w-full">&nbsp;</span>
                                )}
                                {entry.notes && (
                                  <div className="text-[10px] text-sc-gray-400 mt-0.5">{entry.notes}</div>
                                )}
                              </td>
                              <td className="p-1.5 print:p-1 text-center text-sc-gray">{plannedCr > 0 ? plannedCr.toFixed(1) : "—"}</td>
                              <td className="p-1.5 print:p-1 text-center font-semibold text-sc-navy">{earnedCr > 0 ? earnedCr.toFixed(1) : "—"}</td>
                              <td className="p-1.5 print:p-1">
                                <span className={
                                  st === "Completed" ? "text-sc-teal font-medium" :
                                  st === "In Progress" ? "text-sc-teal-700" :
                                  st === "Duplicate" ? "text-sc-rose-700" :
                                  st === "Pending Verification" ? "text-sc-gold-700" :
                                  "text-sc-gray-400"
                                }>{st}</span>
                              </td>
                              <td className="p-1.5 print:p-1 text-center text-sc-gray">{entry.institution_code ?? "—"}</td>
                              <td className="p-1.5 print:p-1 text-center text-sc-gray">{gradeLabel(entry.grade_level_slot)}</td>
                            </tr>
                          );
                        })}

                        {/* Extra (non-slot) entries */}
                        {extraEntries.map(entry => {
                          const name = entryDisplayName(entry);
                          const earnedCr = entryCreditsEarned(entry);
                          const plannedCr = entryCreditsPlanned(entry);
                          const st = entryStatus(entry);
                          return (
                            <tr key={entry.id} className="border-b border-sc-gray-100 last:border-b-0 bg-sc-gold-50/30">
                              <td className="p-1.5 print:p-1 text-center">
                                <span className="inline-block w-3.5 h-3.5 border border-sc-gray-400 rounded-sm print:border-black align-middle" />
                              </td>
                              <td className="p-1.5 print:p-1 text-sc-gray italic text-[10px]">Additional</td>
                              <td className="p-1.5 print:p-1">
                                <span className="text-sc-navy font-medium">{name ?? "—"}</span>
                                {entry.notes && <div className="text-[10px] text-sc-gray-400 mt-0.5">{entry.notes}</div>}
                              </td>
                              <td className="p-1.5 print:p-1 text-center text-sc-gray">{plannedCr > 0 ? plannedCr.toFixed(1) : "—"}</td>
                              <td className="p-1.5 print:p-1 text-center font-semibold text-sc-navy">{earnedCr > 0 ? earnedCr.toFixed(1) : "—"}</td>
                              <td className="p-1.5 print:p-1 text-sc-gray">{st}</td>
                              <td className="p-1.5 print:p-1 text-center text-sc-gray">{entry.institution_code ?? "—"}</td>
                              <td className="p-1.5 print:p-1 text-center text-sc-gray">{gradeLabel(entry.grade_level_slot)}</td>
                            </tr>
                          );
                        })}

                        {/* Empty message */}
                        {reqEntries.length === 0 && (
                          <tr>
                            <td colSpan={8} className="p-1.5 print:p-1 text-sc-gray-400 italic text-[10px] text-center">
                              No courses assigned yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </section>

            {/* Four-Year Course Plan */}
            {props.entries.length > 0 && (
              <section className="mb-6 print:mb-4 break-inside-avoid-page">
                <h2 className="text-xs font-bold uppercase tracking-wider text-sc-navy border-b-2 border-sc-navy pb-1 mb-3">
                  Four-Year Course Plan
                </h2>
                <div className="grid grid-cols-2 gap-3 print:gap-2">
                  {GRADE_SLOTS.filter(s => entriesByGrade[s]?.length).map(slot => (
                    <div key={slot} className="border border-sc-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-sc-gray-100 px-3 py-1 text-xs font-bold text-sc-navy print:bg-gray-100">
                        {slot === "pre_9th" ? "Pre-9th Grade / Middle School" : `${gradeLabel(slot)} Grade`}
                      </div>
                      {entriesByGrade[slot]!.map(entry => {
                        const name = entryDisplayName(entry) ?? entry.slot_label ?? "—";
                        const cr = entryCreditsEarned(entry) || entryCreditsPlanned(entry);
                        const st = entryStatus(entry);
                        return (
                          <div key={entry.id} className="flex items-baseline justify-between px-3 py-1 border-t border-sc-gray-100 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="inline-block w-2.5 h-2.5 border border-sc-gray-400 rounded-sm shrink-0 print:border-black" />
                              <span className="text-sc-navy truncate">{name}</span>
                            </div>
                            <div className="text-[10px] text-sc-gray ml-2 shrink-0">
                              {cr > 0 ? `${Number(cr).toFixed(1)} cr` : ""}{" "}
                              <span className={st === "Completed" ? "text-sc-teal" : "text-sc-gray-400"}>{st}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {unassigned.length > 0 && (
                    <div className="border border-sc-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-sc-gray-100 px-3 py-1 text-xs font-bold text-sc-navy print:bg-gray-100">Unassigned</div>
                      {unassigned.map(entry => {
                        const name = entryDisplayName(entry) ?? entry.slot_label ?? "—";
                        return (
                          <div key={entry.id} className="flex items-baseline justify-between px-3 py-1 border-t border-sc-gray-100 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="inline-block w-2.5 h-2.5 border border-sc-gray-400 rounded-sm shrink-0 print:border-black" />
                              <span className="text-sc-navy truncate">{name}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Guidance Reviews */}
            {props.reviews.length > 0 && (
              <section className="mb-5 print:mb-4 break-inside-avoid-page">
                <h2 className="text-xs font-bold uppercase tracking-wider text-sc-navy border-b-2 border-sc-navy pb-1 mb-3">
                  Guidance Reviews ({props.reviews.length})
                </h2>
                <div className="space-y-3">
                  {props.reviews.map(r => (
                    <div key={r.id} className="border border-sc-gray-200 rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-sc-navy">{r.advisor_name}</span>
                        <span className="text-sc-gray">{new Date(r.review_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                      </div>
                      {r.student_goals && <p className="mb-1"><span className="font-medium">Student Goals:</span> {r.student_goals}</p>}
                      {r.advisor_recommendations && <p className="mb-1"><span className="font-medium">Advisor Recommendations:</span> {r.advisor_recommendations}</p>}
                      {r.next_steps && <p className="mb-1"><span className="font-medium">Next Steps:</span> {r.next_steps}</p>}
                      {r.next_review_date && (
                        <p className="mt-1 text-[10px] text-sc-gray">Next review: {new Date(r.next_review_date).toLocaleDateString()}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Advisor Notes */}
            {props.plan.staff_notes && (
              <section className="mb-5 print:mb-4 break-inside-avoid">
                <h2 className="text-xs font-bold uppercase tracking-wider text-sc-navy border-b border-sc-gray-200 pb-1 mb-2">Advisor Notes</h2>
                <p className="text-xs text-sc-navy whitespace-pre-wrap">{props.plan.staff_notes}</p>
              </section>
            )}

            {/* Signature lines */}
            <section className="mt-8 pt-4 border-t-2 border-sc-gray-200 break-inside-avoid">
              <div className="grid grid-cols-2 gap-12">
                <div>
                  <div className="border-b border-sc-navy pb-6 mb-1" />
                  <div className="text-xs text-sc-gray">Student Signature &amp; Date</div>
                </div>
                <div>
                  <div className="border-b border-sc-navy pb-6 mb-1" />
                  <div className="text-xs text-sc-gray">Parent / Guardian Signature &amp; Date</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-12">
                <div>
                  <div className="border-b border-sc-navy pb-6 mb-1" />
                  <div className="text-xs text-sc-gray">Advisor Signature &amp; Date</div>
                </div>
                <div>
                  <div className="border-b border-sc-navy pb-6 mb-1" />
                  <div className="text-xs text-sc-gray">Review Date</div>
                </div>
              </div>
            </section>

            {/* Footer */}
            <div className="mt-6 pt-3 border-t border-sc-gray-100 text-[10px] text-sc-gray flex items-center justify-between">
              <span>Rising Leaders Academy · High School Graduation Checklist</span>
              <span>This document is for planning purposes. Credits are subject to official transcript verification.</span>
              <span>Printed {printDate}</span>
            </div>
          </div>
        </div>
      )}

      {/* Print-specific global styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #grad-plan-print-overlay {
            display: block !important;
            position: static !important;
            overflow: visible !important;
          }
          #grad-plan-print-overlay .no-print { display: none !important; }
          @page { size: letter; margin: 0.65in 0.65in 0.65in 0.65in; }
        }
      `}</style>
    </>
  );
}
