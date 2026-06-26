"use client";

import { useState, useRef, useTransition } from "react";
import {
  Upload, FileText, CheckCircle, AlertTriangle, XCircle,
  ChevronRight, ChevronDown, RefreshCw, Trash2, RotateCcw,
  ArrowLeft, Download, BookOpen, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseCSV } from "@/lib/import/csvParser";
import {
  createImportJob,
  validateCSV,
  dryRunImport,
  executeImport,
  rollbackImport,
} from "@/app/actions/importData";
import type { ImportJob, DryRunResult, ValidationError } from "@/lib/import/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "upload" | "validate" | "dryrun" | "import" | "done" | "history";

interface Props {
  previousJobs: ImportJob[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportCenter({ previousJobs }: Props) {
  const [step, setStep]                 = useState<Step>("upload");
  const [jobs, setJobs]                 = useState<ImportJob[]>(previousJobs);
  const [file, setFile]                 = useState<File | null>(null);
  const [csvText, setCsvText]           = useState<string>("");
  const [jobId, setJobId]               = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();
  const [feedback, setFeedback]         = useState<string>("");
  const [activeTab, setActiveTab]       = useState<"wizard" | "map" | "history">("wizard");

  const [validResult, setValidResult]   = useState<{
    validCount: number; errorCount: number; warnCount: number; errors: ValidationError[]; warnings: ValidationError[]; previewRows: Record<string, string>[];
  } | null>(null);
  const [dryResult, setDryResult]       = useState<DryRunResult | null>(null);
  const [importResult, setImportResult] = useState<{ students: number; families: number; guardians: number; medical: number; notes: number } | null>(null);
  const [skipped, setSkipped]           = useState(0);
  const [errMsg, setErrMsg]             = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Step 1: File upload ────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith(".csv")) { setFeedback("Please upload a .csv file"); return; }
    setFile(f);
    setFeedback("");

    const reader = new FileReader();
    reader.onload = (ev) => { setCsvText(ev.target?.result as string); };
    reader.readAsText(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f || !f.name.endsWith(".csv")) { setFeedback("Please drop a .csv file"); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => { setCsvText(ev.target?.result as string); };
    reader.readAsText(f);
  }

  // ── Step 2: Validate ──────────────────────────────────────────────────────
  function handleValidate() {
    if (!csvText) return;
    setErrMsg(null);
    startTransition(async () => {
      const created = await createImportJob(file?.name ?? "upload.csv", file?.size ?? 0);
      if (!created.success) { setErrMsg(created.error); return; }

      const jId = created.jobId;
      setJobId(jId);

      const res = await validateCSV(jId, csvText);
      if (!res.success) { setErrMsg(res.error); return; }

      setValidResult({
        validCount:  res.validCount,
        errorCount:  res.errorCount,
        warnCount:   res.warnCount,
        errors:      res.errors as ValidationError[],
        warnings:    res.warnings as ValidationError[],
        previewRows: res.previewRows as Record<string, string>[],
      });
      setStep("validate");
    });
  }

  // ── Step 3: Dry run ────────────────────────────────────────────────────────
  function handleDryRun() {
    if (!jobId || !csvText) return;
    setErrMsg(null);
    startTransition(async () => {
      const res = await dryRunImport(jobId, csvText);
      if (!res.success) { setErrMsg(res.error); return; }
      setDryResult(res.result);
      setStep("dryrun");
    });
  }

  // ── Step 4: Execute ────────────────────────────────────────────────────────
  function handleImport() {
    if (!jobId || !csvText) return;
    setErrMsg(null);
    startTransition(async () => {
      const res = await executeImport(jobId, csvText);
      if (!res.success) { setErrMsg(res.error); return; }
      setImportResult(res.inserted);
      setSkipped(res.skipped);
      setStep("done");
    });
  }

  // ── Rollback ───────────────────────────────────────────────────────────────
  function handleRollback(id: string) {
    startTransition(async () => {
      await rollbackImport(id);
      setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: "rolled_back" } : j));
    });
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function reset() {
    setStep("upload"); setFile(null); setCsvText(""); setJobId(null);
    setValidResult(null); setDryResult(null); setImportResult(null);
    setErrMsg(null); setFeedback("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-sc-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-sc-gray-100 px-6 py-5">
        <h1 className="font-serif text-heading-1 text-sc-navy">Data Import Center</h1>
        <p className="text-body-sm text-sc-gray mt-1">Import student records from Airtable CSV exports into SchoolCo.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-sc-gray-100 bg-white px-6">
        <div className="flex gap-6">
          {(["wizard","map","history"] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={cn("py-3 text-label-md font-medium border-b-2 transition-colors capitalize",
                activeTab === t ? "border-sc-teal text-sc-teal" : "border-transparent text-sc-gray hover:text-sc-navy"
              )}>
              {t === "wizard" ? "Import Wizard" : t === "map" ? "Field Mapping" : "Import History"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {activeTab === "wizard" && (
          <WizardPanel
            step={step} file={file} csvText={csvText} isPending={isPending}
            validResult={validResult} dryResult={dryResult} importResult={importResult}
            skipped={skipped} errMsg={errMsg} feedback={feedback}
            fileRef={fileRef}
            onFileChange={handleFileChange} onDrop={handleDrop}
            onValidate={handleValidate} onDryRun={handleDryRun}
            onImport={handleImport} onReset={reset}
          />
        )}
        {activeTab === "map" && <FieldMappingPanel />}
        {activeTab === "history" && (
          <HistoryPanel jobs={jobs} onRollback={handleRollback} isPending={isPending} />
        )}
      </div>
    </div>
  );
}

// ─── Wizard panel ─────────────────────────────────────────────────────────────

function WizardPanel({
  step, file, csvText, isPending, validResult, dryResult, importResult, skipped,
  errMsg, feedback, fileRef,
  onFileChange, onDrop, onValidate, onDryRun, onImport, onReset,
}: {
  step: Step; file: File | null; csvText: string; isPending: boolean;
  validResult: { validCount: number; errorCount: number; warnCount: number; errors: ValidationError[]; warnings: ValidationError[]; previewRows: Record<string,string>[] } | null;
  dryResult: DryRunResult | null;
  importResult: { students: number; families: number; guardians: number; medical: number; notes: number } | null;
  skipped: number; errMsg: string | null; feedback: string;
  fileRef: React.RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onValidate: () => void;
  onDryRun: () => void;
  onImport: () => void;
  onReset: () => void;
}) {
  const STEPS: { id: Step; label: string }[] = [
    { id: "upload",   label: "Upload" },
    { id: "validate", label: "Validate" },
    { id: "dryrun",   label: "Dry Run" },
    { id: "import",   label: "Import" },
    { id: "done",     label: "Done" },
  ];
  const activeIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-1">
        {STEPS.filter((s) => s.id !== "history").map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-label-sm font-bold border-2",
              i < activeIdx  ? "bg-sc-teal border-sc-teal text-white" :
              i === activeIdx ? "bg-white border-sc-teal text-sc-teal" :
              "bg-white border-sc-gray-200 text-sc-gray-300"
            )}>
              {i < activeIdx ? <CheckCircle className="size-4" /> : i + 1}
            </div>
            <span className={cn("text-label-sm hidden sm:block", i === activeIdx ? "text-sc-teal font-semibold" : "text-sc-gray")}>{s.label}</span>
            {i < STEPS.length - 2 && <ChevronRight className="size-4 text-sc-gray-300 mx-1" />}
          </div>
        ))}
      </div>

      {errMsg && (
        <div className="flex items-start gap-3 rounded-2xl border border-sc-rose-200 bg-sc-rose-50 p-4">
          <XCircle className="size-5 text-sc-rose shrink-0 mt-0.5" />
          <p className="text-body-sm text-sc-rose">{errMsg}</p>
        </div>
      )}

      {/* ── Step: Upload ─────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-dashed border-sc-gray-200 bg-white p-10 text-center space-y-4"
            onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sc-teal-50 mx-auto">
              <Upload className="size-8 text-sc-teal" />
            </div>
            <div>
              <p className="text-label-lg font-semibold text-sc-navy">Drop your Airtable CSV here</p>
              <p className="text-label-sm text-sc-gray mt-1">or click to browse</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
            <button onClick={() => fileRef.current?.click()}
              className="rounded-xl bg-sc-teal px-6 py-2.5 text-white text-label-md font-medium hover:bg-sc-teal-700 transition-colors">
              Choose File
            </button>
            {feedback && <p className="text-label-sm text-sc-rose">{feedback}</p>}
          </div>

          {file && (
            <div className="flex items-center gap-3 rounded-2xl border border-sc-gray-100 bg-white shadow-card px-5 py-4">
              <FileText className="size-5 text-sc-teal" />
              <div className="flex-1">
                <p className="text-label-md font-semibold text-sc-navy">{file.name}</p>
                <p className="text-label-sm text-sc-gray">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button onClick={onValidate} disabled={!csvText || isPending}
                className="flex items-center gap-2 rounded-xl bg-sc-navy px-5 py-2.5 text-white text-label-md font-medium disabled:opacity-50 transition-colors hover:bg-sc-navy/90">
                {isPending ? <RefreshCw className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
                {isPending ? "Parsing…" : "Validate"}
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-sc-gold-200 bg-sc-gold-50 p-4">
            <div className="flex items-start gap-2">
              <Info className="size-4 text-sc-gold-700 shrink-0 mt-0.5" />
              <div className="text-label-sm text-sc-gold-800 space-y-1">
                <p className="font-semibold">How to export from Airtable</p>
                <ol className="list-decimal ml-4 space-y-0.5 text-sc-gold-700">
                  <li>Open your Airtable base</li>
                  <li>Go to the Students (or main) table</li>
                  <li>Click <strong>...</strong> → <strong>Download CSV</strong></li>
                  <li>Upload the downloaded .csv file above</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step: Validate ───────────────────────────────────── */}
      {step === "validate" && validResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Valid Rows" value={validResult.validCount} color="teal" />
            <StatCard label="Errors" value={validResult.errorCount} color={validResult.errorCount > 0 ? "rose" : "teal"} />
            <StatCard label="Warnings" value={validResult.warnCount} color={validResult.warnCount > 0 ? "gold" : "teal"} />
          </div>

          {/* Preview table */}
          {validResult.previewRows.length > 0 && (
            <PreviewTable rows={validResult.previewRows.slice(0, 10)} />
          )}

          {/* Errors */}
          {validResult.errors.length > 0 && (
            <ErrorList title="Validation Errors" items={validResult.errors} icon="error" />
          )}
          {validResult.warnings.length > 0 && (
            <ErrorList title="Warnings" items={validResult.warnings} icon="warn" />
          )}

          <div className="flex gap-3">
            <button onClick={onReset} className="flex items-center gap-2 rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-gray hover:border-sc-navy hover:text-sc-navy">
              <ArrowLeft className="size-4" /> Start Over
            </button>
            <button onClick={onDryRun} disabled={isPending || validResult.validCount === 0}
              className="flex items-center gap-2 ml-auto rounded-xl bg-sc-navy px-6 py-2.5 text-white text-label-md font-medium disabled:opacity-50">
              {isPending ? <RefreshCw className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
              {isPending ? "Running…" : "Run Dry Run"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Dry Run ───────────────────────────────────── */}
      {step === "dryrun" && dryResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Will Insert" value={dryResult.toInsert} color="teal" />
            <StatCard label="Will Skip (dup)" value={dryResult.toSkip} color="gray" />
            <StatCard label="Errors" value={dryResult.withErrors} color={dryResult.withErrors > 0 ? "rose" : "teal"} />
          </div>

          {dryResult.existingFamilies.length > 0 && (
            <div className="rounded-2xl border border-sc-gold-200 bg-sc-gold-50 p-4 text-label-sm text-sc-gold-800">
              <p className="font-semibold mb-1">Existing families found — students will be linked:</p>
              {dryResult.existingFamilies.map((f) => <p key={f}>• {f}</p>)}
            </div>
          )}

          {/* Row preview */}
          <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-sc-gray-100">
              <p className="text-label-md font-semibold text-sc-navy">Row-by-row plan</p>
            </div>
            <div className="divide-y divide-sc-gray-50 max-h-96 overflow-y-auto">
              {dryResult.rows.slice(0, 100).map((r) => (
                <div key={r.rowIndex} className="flex items-start gap-3 px-5 py-3">
                  <ActionBadge action={r.action} />
                  <div className="flex-1 min-w-0">
                    <p className="text-label-md font-semibold text-sc-navy">{r.studentName}</p>
                    {r.reason && <p className="text-label-sm text-sc-gray">{r.reason}</p>}
                    {r.guardianActions.length > 0 && (
                      <p className="text-label-sm text-sc-gray">
                        Guardians: {r.guardianActions.map((g) => `${g.name} (${g.action === "insert" ? "new" : "existing"})`).join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-label-sm text-sc-gray-300">row {r.rowIndex}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onReset} className="flex items-center gap-2 rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-gray hover:border-sc-navy hover:text-sc-navy">
              <ArrowLeft className="size-4" /> Start Over
            </button>
            <button onClick={onImport} disabled={isPending || dryResult.toInsert === 0}
              className="flex items-center gap-2 ml-auto rounded-xl bg-sc-teal px-6 py-2.5 text-white text-label-md font-semibold disabled:opacity-50">
              {isPending ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
              {isPending ? "Importing…" : `Import ${dryResult.toInsert} Students`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Done ───────────────────────────────────────── */}
      {step === "done" && importResult && (
        <div className="space-y-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sc-teal/10 mx-auto">
            <CheckCircle className="size-10 text-sc-teal" />
          </div>
          <div>
            <h2 className="font-serif text-heading-2 text-sc-navy">Import Complete</h2>
            <p className="text-body-sm text-sc-gray mt-1">{skipped > 0 && `${skipped} duplicate${skipped !== 1 ? "s" : ""} skipped.`}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-left">
            <StatCard label="Students Inserted" value={importResult.students} color="teal" />
            <StatCard label="Families Created" value={importResult.families} color="navy" />
            <StatCard label="Guardians Added" value={importResult.guardians} color="navy" />
            <StatCard label="Medical Records" value={importResult.medical} color="teal" />
            <StatCard label="Notes Imported" value={importResult.notes} color="gray" />
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={onReset}
              className="rounded-xl border border-sc-gray-200 px-5 py-2.5 text-label-md text-sc-gray hover:border-sc-navy hover:text-sc-navy">
              Import Another File
            </button>
            <a href="/dashboard/students"
              className="rounded-xl bg-sc-navy px-5 py-2.5 text-white text-label-md font-medium">
              View Students →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field mapping panel ──────────────────────────────────────────────────────

function FieldMappingPanel() {
  const rows: { airtable: string; table: string; column: string; notes?: string }[] = [
    { airtable: "First Name",                table: "students",        column: "first_name",                notes: "Required" },
    { airtable: "Last Name",                 table: "students",        column: "last_name",                 notes: "Required" },
    { airtable: "Preferred Name / Nickname", table: "students",        column: "preferred_name"                           },
    { airtable: "Grade",                     table: "students",        column: "grade_level"                              },
    { airtable: "Enrollment Status",         table: "students",        column: "enrollment_status",          notes: "enrolled/applicant/waitlisted/…" },
    { airtable: "Enrollment Date",           table: "students",        column: "enrollment_date"                          },
    { airtable: "Expected Graduation",       table: "students",        column: "expected_graduation"                      },
    { airtable: "Track / Program",           table: "students",        column: "track"                                    },
    { airtable: "Date of Birth",             table: "students",        column: "date_of_birth"                            },
    { airtable: "Medical Notes",             table: "students",        column: "medical_notes"                            },
    { airtable: "Allergies",                 table: "students",        column: "allergies",                  notes: "Comma-separated list" },
    { airtable: "Authorized Pickup Notes",   table: "students",        column: "authorized_pickup_notes"                  },
    { airtable: "Scholarship Type",          table: "students",        column: "scholarship_info.type"                    },
    { airtable: "Scholarship Amount",        table: "students",        column: "scholarship_info.amount"                  },
    { airtable: "Scholarship Donor",         table: "students",        column: "scholarship_info.donor"                   },
    { airtable: "Family Name",               table: "families",        column: "family_name",                notes: "Auto-derived from last name if blank" },
    { airtable: "Split Household",           table: "families",        column: "is_split_household",         notes: "yes/no" },
    { airtable: "Address",                   table: "households",      column: "address_json.street1"                     },
    { airtable: "City",                      table: "households",      column: "address_json.city"                        },
    { airtable: "State",                     table: "households",      column: "address_json.state"                       },
    { airtable: "Zip",                       table: "households",      column: "address_json.zip"                         },
    { airtable: "Home Phone",                table: "households",      column: "phone"                                    },
    { airtable: "Home Email",                table: "households",      column: "email"                                    },
    { airtable: "Parent 1 Name",             table: "profiles",        column: "full_name"                                },
    { airtable: "Parent 1 Email",            table: "profiles",        column: "email"                                    },
    { airtable: "Parent 1 Phone",            table: "profiles",        column: "phone"                                    },
    { airtable: "Parent 1 Relationship",     table: "guardianships",   column: "relationship_type"                        },
    { airtable: "Parent 1 Custody",          table: "guardianships",   column: "custody_type"                             },
    { airtable: "Parent 1 Legal Guardian",   table: "guardianships",   column: "is_legal_guardian",          notes: "yes/no" },
    { airtable: "Parent 1 Primary Contact",  table: "guardianships",   column: "is_primary_contact",         notes: "yes/no" },
    { airtable: "Parent 1 Emergency",        table: "guardianships",   column: "is_emergency_contact",       notes: "yes/no" },
    { airtable: "Parent 1 Pickup",           table: "guardianships",   column: "can_pickup",                 notes: "yes/no" },
    { airtable: "Parent 2 Name",             table: "profiles",        column: "full_name"                                },
    { airtable: "Parent 2 Email",            table: "profiles",        column: "email"                                    },
    { airtable: "Parent 2 Phone",            table: "profiles",        column: "phone"                                    },
    { airtable: "Parent 2 Relationship",     table: "guardianships",   column: "relationship_type"                        },
    { airtable: "Parent 2 Custody",          table: "guardianships",   column: "custody_type"                             },
    { airtable: "Parent 2 Emergency",        table: "guardianships",   column: "is_emergency_contact",       notes: "yes/no" },
    { airtable: "Emergency Contact Name",    table: "profiles",        column: "full_name"                                },
    { airtable: "Emergency Contact Phone",   table: "profiles",        column: "phone"                                    },
    { airtable: "Emergency Contact Relationship", table: "guardianships", column: "relationship_type"                    },
    { airtable: "Medical Conditions",        table: "student_medical", column: "medical_conditions",         notes: "Comma-separated" },
    { airtable: "Special Accommodations",    table: "student_medical", column: "special_accommodations",     notes: "Comma-separated" },
    { airtable: "Doctor",                    table: "student_medical", column: "primary_doctor_name"                      },
    { airtable: "Doctor Phone",              table: "student_medical", column: "primary_doctor_phone"                     },
    { airtable: "Insurance",                 table: "student_medical", column: "insurance_provider"                       },
    { airtable: "Policy Number",             table: "student_medical", column: "insurance_policy_number"                  },
    { airtable: "Notes",                     table: "staff_notes",     column: "body",                       notes: "Imported as 'General' category note" },
  ];

  const TABLE_COLORS: Record<string, string> = {
    students:        "bg-sc-teal-50  text-sc-teal  border-sc-teal-200",
    families:        "bg-sc-navy-50  text-sc-navy  border-sc-navy-200",
    households:      "bg-sc-gold-50  text-sc-gold-700 border-sc-gold-200",
    profiles:        "bg-sc-rose-50  text-sc-rose  border-sc-rose-200",
    guardianships:   "bg-sc-gray-50  text-sc-gray  border-sc-gray-200",
    student_medical: "bg-red-50      text-red-700   border-red-200",
    staff_notes:     "bg-sc-green/10 text-sc-green  border-sc-green/20",
  };

  function downloadTemplate() {
    const headers = rows.map((r) => r.airtable).join(",");
    const blob = new Blob([headers + "\n"], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "schoolco_import_template.csv";
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-heading-2 text-sc-navy">Airtable → SchoolCo Field Mapping</h2>
        <button onClick={downloadTemplate}
          className="flex items-center gap-2 rounded-xl border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:border-sc-teal hover:text-sc-teal">
          <Download className="size-4" /> Download Template CSV
        </button>
      </div>

      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-label-sm">
            <thead>
              <tr className="border-b border-sc-gray-100 bg-sc-gray-50">
                <th className="px-5 py-3 text-left font-semibold text-sc-gray">Airtable Field Name</th>
                <th className="px-5 py-3 text-left font-semibold text-sc-gray">Table</th>
                <th className="px-5 py-3 text-left font-semibold text-sc-gray">Column</th>
                <th className="px-5 py-3 text-left font-semibold text-sc-gray">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sc-gray-50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-sc-gray-50">
                  <td className="px-5 py-2.5 font-mono text-sc-navy">{r.airtable}</td>
                  <td className="px-5 py-2.5">
                    <span className={cn("rounded-full border px-2 py-0.5 font-mono", TABLE_COLORS[r.table] ?? "bg-sc-gray-50 text-sc-gray border-sc-gray-200")}>
                      {r.table}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 font-mono text-sc-gray">{r.column}</td>
                  <td className="px-5 py-2.5 text-sc-gray-400">{r.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alias note */}
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5">
        <div className="flex items-start gap-2">
          <BookOpen className="size-4 text-sc-teal shrink-0 mt-0.5" />
          <div className="text-label-sm text-sc-gray space-y-1">
            <p className="font-semibold text-sc-navy">Flexible header matching</p>
            <p>The importer recognizes common variations of each field name. For example, "First Name", "firstname", "Student First Name", and "First" all map to <code className="bg-sc-gray-50 px-1 rounded">first_name</code>. Column headers are case-insensitive.</p>
            <p>If a field in your export is not recognized, it will be ignored. Download the template CSV above to see the exact expected column names.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({ jobs, onRollback, isPending }: { jobs: ImportJob[]; onRollback: (id: string) => void; isPending: boolean }) {
  const STATUS_CFG: Record<string, { cls: string; label: string }> = {
    completed:    { cls: "bg-sc-teal-50 text-sc-teal border-sc-teal-200",    label: "Completed"   },
    failed:       { cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200",    label: "Failed"      },
    rolled_back:  { cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200",    label: "Rolled Back" },
    importing:    { cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200", label: "Importing…" },
    dry_run:      { cls: "bg-sc-navy-50 text-sc-navy border-sc-navy-200",    label: "Dry Run"     },
    pending:      { cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200",    label: "Pending"     },
    validating:   { cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200", label: "Validating" },
    ready:        { cls: "bg-sc-navy-50 text-sc-navy border-sc-navy-200",    label: "Ready"       },
  };

  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center">
        <p className="text-body-md text-sc-gray-400">No imports yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const cfg = STATUS_CFG[job.status] ?? STATUS_CFG.pending;
        const canRollback = job.status === "completed";
        return (
          <div key={job.id} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-label-md font-semibold text-sc-navy">{job.file_name ?? "Import"}</p>
                <p className="text-label-sm text-sc-gray">{new Date(job.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium", cfg.cls)}>{cfg.label}</span>
                {canRollback && (
                  <button onClick={() => onRollback(job.id)} disabled={isPending}
                    className="flex items-center gap-1 text-label-sm text-sc-rose font-medium hover:underline disabled:opacity-50">
                    <RotateCcw className="size-3.5" /> Rollback
                  </button>
                )}
              </div>
            </div>
            {job.status === "completed" && (
              <div className="flex flex-wrap gap-4 text-label-sm">
                <span className="text-sc-teal font-semibold">{job.inserted_students} students</span>
                <span className="text-sc-navy">{job.inserted_families} families</span>
                <span className="text-sc-navy">{job.inserted_guardians} guardians</span>
                <span className="text-sc-gray">{job.skipped_students} skipped</span>
              </div>
            )}
            {job.error_message && (
              <p className="text-label-sm text-sc-rose">{job.error_message}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const COLOR: Record<string, string> = {
    teal: "text-sc-teal", navy: "text-sc-navy", rose: "text-sc-rose", gold: "text-sc-gold-700", gray: "text-sc-gray",
  };
  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 text-center">
      <p className={cn("font-serif text-3xl font-bold", COLOR[color] ?? "text-sc-navy")}>{value}</p>
      <p className="text-label-sm text-sc-gray mt-1">{label}</p>
    </div>
  );
}

function ErrorList({ title, items, icon }: { title: string; items: ValidationError[]; icon: "error" | "warn" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 hover:bg-sc-gray-50">
        <div className="flex items-center gap-2">
          {icon === "error"
            ? <XCircle className="size-4 text-sc-rose" />
            : <AlertTriangle className="size-4 text-sc-gold-600" />}
          <span className="text-label-md font-semibold text-sc-navy">{title} ({items.length})</span>
        </div>
        {open ? <ChevronDown className="size-4 text-sc-gray" /> : <ChevronRight className="size-4 text-sc-gray" />}
      </button>
      {open && (
        <div className="divide-y divide-sc-gray-50 max-h-64 overflow-y-auto">
          {items.map((e, i) => (
            <div key={i} className="px-5 py-2.5 grid grid-cols-12 gap-3 text-label-sm">
              <span className="col-span-1 text-sc-gray-300">#{e.rowIndex}</span>
              <span className="col-span-2 font-mono text-sc-navy">{e.field}</span>
              <span className="col-span-4 font-mono text-sc-gray truncate">{e.value || "(empty)"}</span>
              <span className="col-span-5 text-sc-gray">{e.error}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewTable({ rows }: { rows: Record<string, string>[] }) {
  if (rows.length === 0) return null;
  const cols = Object.keys(rows[0]).slice(0, 8);
  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-sc-gray-100">
        <p className="text-label-md font-semibold text-sc-navy">Preview (first {rows.length} rows)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-label-sm">
          <thead>
            <tr className="bg-sc-gray-50 border-b border-sc-gray-100">
              {cols.map((c) => <th key={c} className="px-4 py-2 text-left font-semibold text-sc-gray truncate max-w-[120px]">{c}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-sc-gray-50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-sc-gray-50">
                {cols.map((c) => <td key={c} className="px-4 py-2 text-sc-gray truncate max-w-[120px]">{row[c] ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: "insert" | "skip_duplicate" | "error" }) {
  const CFG = {
    insert:          { cls: "bg-sc-teal-50 text-sc-teal border-sc-teal-200", label: "INSERT" },
    skip_duplicate:  { cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200", label: "SKIP"   },
    error:           { cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200", label: "ERROR"  },
  };
  const c = CFG[action];
  return <span className={cn("rounded-md border px-1.5 py-0.5 text-label-sm font-mono font-bold shrink-0 mt-0.5", c.cls)}>{c.label}</span>;
}
