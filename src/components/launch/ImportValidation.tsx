"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getImportValidationSummary } from "@/app/actions/launch";
import type { ValidationResult } from "@/app/actions/launch";

// ── Check row ─────────────────────────────────────────────────────────────

function CheckRow({
  label,
  passed,
  detail,
  items,
}: {
  label: string;
  passed: boolean;
  detail?: string;
  items?: string[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "border-b border-sc-gray-100 last:border-b-0 px-4 py-3",
      !passed && "bg-sc-rose-50/30"
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {passed ? (
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
          ) : (
            <XCircle className="size-4 text-sc-rose shrink-0" />
          )}
          <span className={cn(
            "text-label-sm",
            passed ? "text-sc-navy/70" : "text-sc-navy font-medium"
          )}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {detail && (
            <span className={cn(
              "text-[11px] font-semibold",
              passed ? "text-emerald-600" : "text-sc-rose"
            )}>
              {detail}
            </span>
          )}
          {items && items.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-sc-teal hover:text-sc-teal-700"
            >
              {expanded ? "Hide" : "Show"}
            </button>
          )}
        </div>
      </div>
      {expanded && items && (
        <ul className="mt-2 ml-6 space-y-0.5">
          {items.slice(0, 20).map((item, i) => (
            <li key={i} className="text-xs text-sc-rose-700">• {item}</li>
          ))}
          {items.length > 20 && (
            <li className="text-xs text-sc-gray-400">…and {items.length - 20} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function ImportValidation({
  initialResult,
}: {
  initialResult: ValidationResult | null;
}) {
  const [result, setResult] = useState<ValidationResult | null>(initialResult);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    setError(null);
    startTransition(async () => {
      const res = await getImportValidationSummary();
      if (res.success) setResult(res.data);
      else setError(res.error);
    });
  }

  const issueCount = result
    ? [
        result.studentsWithoutFamily > 0,
        result.studentsWithoutGrade > 0,
        result.studentsWithoutEnrollmentStatus > 0,
        result.guardiansWithoutStudent > 0,
        result.familiesWithNoStudents > 0,
        result.familiesWithNoGuardians > 0,
        result.invalidEmails.length > 0,
        result.duplicateStudents.length > 0,
      ].filter(Boolean).length
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-sc-navy">Import Validation</h2>
          <p className="text-label-sm text-sc-gray mt-0.5">
            Live data integrity checks — run these before going live.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isPending}
          className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">
          {error}
        </div>
      )}

      {result === null ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 text-center text-sc-gray text-label-sm">
          Click Refresh to run validation checks.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className={cn(
            "rounded-2xl border px-4 py-3 flex items-center gap-3",
            issueCount === 0
              ? "bg-emerald-50 border-emerald-200"
              : "bg-sc-rose-50 border-sc-rose-200"
          )}>
            {issueCount === 0 ? (
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="size-5 text-sc-rose shrink-0" />
            )}
            <div>
              <p className={cn(
                "font-semibold text-sm",
                issueCount === 0 ? "text-emerald-700" : "text-sc-rose-700"
              )}>
                {issueCount === 0
                  ? "All checks passed — data looks clean"
                  : `${issueCount} issue${issueCount === 1 ? "" : "s"} found — review before going live`}
              </p>
            </div>
          </div>

          {/* Checks */}
          <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
            <CheckRow
              label="Duplicate students"
              passed={result.duplicateStudents.length === 0}
              detail={result.duplicateStudents.length === 0 ? "None found" : `${result.duplicateStudents.length} duplicate names`}
              items={result.duplicateStudents.map((d) => `"${d.full_name}" (${d.count}×)`)}
            />
            <CheckRow
              label="Students without family link"
              passed={result.studentsWithoutFamily === 0}
              detail={result.studentsWithoutFamily === 0 ? "All linked" : `${result.studentsWithoutFamily} unlinked`}
            />
            <CheckRow
              label="Students missing grade level"
              passed={result.studentsWithoutGrade === 0}
              detail={result.studentsWithoutGrade === 0 ? "All have grade" : `${result.studentsWithoutGrade} missing`}
            />
            <CheckRow
              label="Students missing enrollment status"
              passed={result.studentsWithoutEnrollmentStatus === 0}
              detail={result.studentsWithoutEnrollmentStatus === 0 ? "All set" : `${result.studentsWithoutEnrollmentStatus} missing`}
            />
            <CheckRow
              label="Guardians without linked student"
              passed={result.guardiansWithoutStudent === 0}
              detail={result.guardiansWithoutStudent === 0 ? "All linked" : `${result.guardiansWithoutStudent} orphaned`}
            />
            <CheckRow
              label="Families with no students"
              passed={result.familiesWithNoStudents === 0}
              detail={result.familiesWithNoStudents === 0 ? "None" : `${result.familiesWithNoStudents} empty families`}
            />
            <CheckRow
              label="Families with no guardians"
              passed={result.familiesWithNoGuardians === 0}
              detail={result.familiesWithNoGuardians === 0 ? "None" : `${result.familiesWithNoGuardians} families`}
            />
            <CheckRow
              label="Invalid email addresses"
              passed={result.invalidEmails.length === 0}
              detail={result.invalidEmails.length === 0 ? "All valid" : `${result.invalidEmails.length} invalid`}
              items={result.invalidEmails.map((e) => `${e.name}: ${e.email}`)}
            />
            <CheckRow
              label="Duplicate phone numbers"
              passed={result.duplicatePhones.length === 0}
              detail={result.duplicatePhones.length === 0 ? "None found" : `${result.duplicatePhones.length} duplicates`}
              items={result.duplicatePhones.map((p) => `${p.phone}: ${p.names.join(", ")}`)}
            />
          </div>
        </>
      )}
    </div>
  );
}
