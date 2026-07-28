"use client";

import { useState, useTransition, useRef } from "react";
import { Upload, CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { importStudentsFromCsv } from "@/app/actions/launch";
import type { ImportJob } from "@/app/actions/launch";

// ── Entity definitions ────────────────────────────────────────────────────

const ENTITIES = [
  {
    type: "students",
    label: "Students",
    description: "Core student roster with name, grade, and enrollment status.",
    implemented: true,
    format: ["full_name", "grade_level", "enrollment_status", "student_display_id (optional)"],
    example: "Jane Doe,3rd,enrolled,RLA-S0001",
  },
  {
    type: "families",
    label: "Families",
    description: "Family records that students are linked to.",
    implemented: false,
    format: ["family_name", "family_display_id (optional)"],
    example: "The Doe Family,RLA-F0001",
  },
  {
    type: "staff",
    label: "Staff",
    description: "Teachers, registrars, and admin staff members.",
    implemented: false,
    format: ["full_name", "email", "role"],
    example: "Jane Smith,jane@rla.edu,teacher",
  },
  {
    type: "emergency_contacts",
    label: "Emergency Contacts",
    description: "Emergency contact info per student.",
    implemented: false,
    format: ["student_display_id", "contact_name", "phone", "relationship"],
    example: "RLA-S0001,John Doe,555-1234,Father",
  },
  {
    type: "medical",
    label: "Medical Alerts",
    description: "Student medical conditions and medication alerts.",
    implemented: false,
    format: ["student_display_id", "alert_type", "description", "severity"],
    example: "RLA-S0001,Allergy,Peanut allergy - carry EpiPen,high",
  },
  {
    type: "authorized_pickup",
    label: "Authorized Pickup",
    description: "Authorized adults who can pick up students.",
    implemented: false,
    format: ["student_display_id", "name", "phone", "relationship"],
    example: "RLA-S0001,Aunt Mary,555-5678,Aunt",
  },
] as const;

// ── CSV parser ────────────────────────────────────────────────────────────

function parseSimpleCsv(text: string): string[][] {
  return text
    .trim()
    .split("\n")
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

// ── Student Import ────────────────────────────────────────────────────────

function StudentImport({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"idle" | "preview" | "done">("idle");
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseSimpleCsv(text);
      if (rows.length < 2) {
        setError("File appears empty or has no data rows.");
        return;
      }
      setHeaders(rows[0]);
      setPreview(rows.slice(1, 6)); // first 5 data rows for preview
      setStep("preview");
    };
    reader.readAsText(file);
  }

  function handleConfirm() {
    if (!fileRef.current?.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseSimpleCsv(text);
      if (rows.length < 2) return;
      const hdrs = rows[0];
      const nameIdx = hdrs.findIndex((h) => h.toLowerCase().includes("name") && !h.toLowerCase().includes("family"));
      const gradeIdx = hdrs.findIndex((h) => h.toLowerCase().includes("grade"));
      const statusIdx = hdrs.findIndex((h) => h.toLowerCase().includes("status") || h.toLowerCase().includes("enrollment"));
      const displayIdx = hdrs.findIndex((h) => h.toLowerCase().includes("display") || h.toLowerCase().includes("id"));

      const mapped = rows.slice(1).map((row) => ({
        full_name: row[nameIdx >= 0 ? nameIdx : 0] ?? "",
        grade_level: row[gradeIdx >= 0 ? gradeIdx : 1] ?? "",
        enrollment_status: row[statusIdx >= 0 ? statusIdx : 2] ?? "enrolled",
        student_display_id: displayIdx >= 0 ? row[displayIdx] : undefined,
      }));

      startTransition(async () => {
        const res = await importStudentsFromCsv(mapped);
        if (res.success) {
          setResult(res.data);
          setStep("done");
          onDone();
        } else {
          setError(res.error);
        }
      });
    };
    reader.readAsText(fileRef.current.files[0]);
  }

  if (step === "done" && result) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span className="font-medium text-emerald-700">Import complete</span>
        </div>
        <p className="text-sm text-emerald-600">{result.imported} students imported.</p>
        {result.errors.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-amber-600 cursor-pointer">{result.errors.length} row errors</summary>
            <ul className="mt-1 space-y-0.5">
              {result.errors.map((e, i) => (
                <li key={i} className="text-xs text-amber-700">• {e}</li>
              ))}
            </ul>
          </details>
        )}
        <button
          onClick={() => { setStep("idle"); setResult(null); setPreview([]); }}
          className="mt-3 text-xs text-emerald-700 underline hover:no-underline"
        >
          Import another file
        </button>
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-sc-gray font-medium">Preview: {filename} (first 5 rows)</p>
        <div className="overflow-x-auto rounded-xl border border-sc-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-sc-gray-100">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold text-sc-navy whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, ri) => (
                <tr key={ri} className="border-t border-sc-gray-100">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-sc-gray whitespace-nowrap">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && (
          <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-xs text-sc-rose-700">{error}</div>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-xl bg-sc-teal text-white px-4 py-2 text-sm font-medium hover:bg-sc-teal-700 transition-colors disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            {isPending ? "Importing…" : "Confirm Import"}
          </button>
          <button
            onClick={() => { setStep("idle"); setError(null); }}
            className="rounded-xl border border-sc-gray-200 px-4 py-2 text-sm text-sc-gray hover:bg-sc-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-2 rounded-xl border-2 border-dashed border-sc-gray-200 bg-sc-gray-100/50 px-4 py-3 text-sm text-sc-gray hover:border-sc-teal hover:text-sc-teal transition-colors"
      >
        <Upload className="size-4" />
        Choose CSV file
      </button>
      {error && (
        <p className="mt-2 text-xs text-sc-rose-700">{error}</p>
      )}
    </div>
  );
}

// ── Entity card ───────────────────────────────────────────────────────────

function EntityCard({
  entity,
  recentJob,
  onRefresh,
}: {
  entity: typeof ENTITIES[number];
  recentJob?: ImportJob;
  onRefresh: () => void;
}) {
  const [showFormat, setShowFormat] = useState(false);

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sc-navy">{entity.label}</h3>
          <p className="text-label-sm text-sc-gray mt-0.5">{entity.description}</p>
        </div>
        {recentJob && (
          <span className={cn(
            "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
            recentJob.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          )}>
            {recentJob.status}
          </span>
        )}
      </div>

      {entity.implemented ? (
        <StudentImport onDone={onRefresh} />
      ) : (
        <div className="rounded-xl bg-sc-gold-50 border border-sc-gold-300 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Info className="size-3.5 text-sc-gold-700 shrink-0" />
            <span className="text-xs font-semibold text-sc-gold-800">Preview validation only</span>
          </div>
          <p className="text-xs text-sc-gold-700">
            Full bulk import coming in v2. Use this tool to validate your data format before manual entry via Supabase dashboard.
          </p>
        </div>
      )}

      <button
        onClick={() => setShowFormat((v) => !v)}
        className="flex items-center gap-1 text-xs text-sc-teal hover:text-sc-teal-700 transition-colors"
      >
        {showFormat ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Expected CSV format
      </button>

      {showFormat && (
        <div className="rounded-xl bg-sc-gray-100 p-3 text-xs font-mono space-y-1">
          <p className="text-sc-gray font-semibold not-italic">Columns:</p>
          <p className="text-sc-navy">{entity.format.join(", ")}</p>
          <p className="text-sc-gray font-semibold not-italic mt-2">Example row:</p>
          <p className="text-sc-navy">{entity.example}</p>
        </div>
      )}

      {recentJob && (
        <p className="text-[10px] text-sc-gray-400">
          Last import: {new Date(recentJob.created_at).toLocaleDateString()} ·{" "}
          {recentJob.total_rows ?? 0} rows
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function DataImport({ initialJobs }: { initialJobs: ImportJob[] }) {
  const [jobs, setJobs] = useState(initialJobs);

  function getRecentJob(entityType: string) {
    return jobs.find((j) => j.entity_type === entityType);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-sc-navy">Data Import</h2>
        <p className="text-label-sm text-sc-gray mt-0.5">
          Import your school data. Students can be bulk-imported via CSV. Other entities show format guides for manual entry.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ENTITIES.map((entity) => (
          <EntityCard
            key={entity.type}
            entity={entity}
            recentJob={getRecentJob(entity.type)}
            onRefresh={() => {
              // Refresh job list (jobs state is local — page reload needed for full refresh)
            }}
          />
        ))}
      </div>

      {/* Recent jobs */}
      {jobs.length > 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5">
          <h3 className="font-semibold text-sc-navy mb-3">Recent Import Jobs</h3>
          <div className="space-y-2">
            {jobs.slice(0, 10).map((job) => (
              <div key={job.id} className="flex items-center justify-between text-xs text-sc-gray border-b border-sc-gray-100 pb-2 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "rounded-full w-1.5 h-1.5",
                    job.status === "completed" ? "bg-emerald-500" : "bg-amber-400"
                  )} />
                  <span className="text-sc-navy font-medium">{job.entity_type ?? "unknown"}</span>
                  <span>{job.file_name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span>{job.total_rows ?? 0} rows</span>
                  <span className="text-sc-gray-400">{new Date(job.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
