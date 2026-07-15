"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Search, Plus, UserX, UserCheck, ChevronRight,
  ShieldCheck, ShieldAlert, ShieldX, Clock, Filter, Users, Upload,
} from "lucide-react";
import {
  setStaffStatus, createStaffMember, importStaffRows,
  type StaffRosterRow, type BgStatus, type StaffPayload,
} from "@/app/actions/staffActions";
import {
  getComplianceCountsForDirectory,
  type StaffComplianceSummary,
} from "@/app/actions/staffComplianceActions";
import { ROLE_LABELS, ADMIN_ROLES, type UserRole } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────

const ASSIGNABLE_ROLES: UserRole[] = [
  "volunteer", "teacher", "staff", "registrar", "admin", "full_admin",
];

const ROLE_COLOR: Record<string, string> = {
  full_admin:    "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",
  admin:         "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",
  registrar:     "bg-sc-navy-50 text-sc-navy-700 border-sc-navy-200",
  teacher:       "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",
  staff:         "bg-sc-gray-100 text-sc-gray-700 border-sc-gray-200",
  volunteer:     "bg-sc-green-50 text-sc-green-700 border-sc-green-200",
  contractor:    "bg-amber-50 text-amber-700 border-amber-200",
};

const BG_STATUS_CONFIG: Record<BgStatus, { label: string; icon: React.ElementType; cls: string }> = {
  not_submitted: { label: "Not Submitted", icon: ShieldX,    cls: "text-sc-gray-400" },
  pending:       { label: "Pending",       icon: Clock,      cls: "text-sc-gold-600" },
  cleared:       { label: "Cleared",       icon: ShieldCheck,cls: "text-sc-green-600" },
  expired:       { label: "Expired",       icon: ShieldAlert,cls: "text-sc-rose-600" },
  flagged:       { label: "Flagged",       icon: ShieldAlert,cls: "text-sc-rose-700" },
};

const inputCls = "w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-label-sm font-medium text-sc-navy">{label}</label>
      {children}
    </div>
  );
}

// ── Add Staff Modal ───────────────────────────────────────────────────────

const BLANK: StaffPayload = {
  first_name: "", last_name: "", email: null, phone: null,
  display_title: null, bio: null, avatar_url: null,
  staff_type: "staff", primary_role: "staff", additional_roles: [], status: "active",
  start_date: null, end_date: null,
  background_check_status: "not_submitted", background_check_date: null, background_check_expires: null,
  training_status: "not_started", training_completed_at: null, training_expires_at: null,
  cpr_status: "not_applicable", cpr_expires_at: null,
  emergency_contact_name: null, emergency_contact_phone: null, emergency_contact_rel: null,
  compliance_notes: null,
};

function AddStaffModal({ onClose, onAdded }: { onClose: () => void; onAdded: (m: StaffRosterRow) => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  function set(k: keyof typeof form, v: string | string[] | null) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function toggleRole(r: string) {
    setForm((p) => ({
      ...p,
      additional_roles: p.additional_roles.includes(r)
        ? p.additional_roles.filter((x) => x !== r)
        : [...p.additional_roles, r],
    }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await createStaffMember(form);
      if (!res.success) { setError(res.error); return; }
      // Build a minimal row to show immediately
      const newRow: StaffRosterRow = {
        ...form,
        id:              res.id,
        organization_id: "",
        full_name:       `${form.first_name} ${form.last_name}`.trim(),
        profile_id:      null,
        created_at:      new Date().toISOString(),
      };
      onAdded(newRow);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100">
          <h2 className="font-serif text-heading-3 text-sc-navy">Add Staff Member</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100 text-sc-gray text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Basic */}
          <section>
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">Basic Information</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="First Name *">
                <input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className={inputCls} placeholder="Jane" />
              </Field>
              <Field label="Last Name *">
                <input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className={inputCls} placeholder="Smith" />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value || null)} className={inputCls} placeholder="jane@school.org" />
              </Field>
              <Field label="Phone">
                <input type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} className={inputCls} placeholder="(555) 000-0000" />
              </Field>
              <Field label="Display Title" className="sm:col-span-2">
                <input value={form.display_title ?? ""} onChange={(e) => set("display_title", e.target.value || null)} className={inputCls} placeholder="e.g. Founder / Principal" />
              </Field>
              <Field label="Bio" className="sm:col-span-2">
                <textarea value={form.bio ?? ""} onChange={(e) => set("bio", e.target.value || null)} rows={2} className={inputCls} placeholder="Short bio…" />
              </Field>
            </div>
          </section>

          {/* Role & classification */}
          <section>
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">Role & Classification</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Primary Role">
                <select value={form.primary_role} onChange={(e) => set("primary_role", e.target.value)} className={inputCls}>
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </Field>
              <Field label="Classification">
                <select value={form.staff_type} onChange={(e) => set("staff_type", e.target.value)} className={inputCls}>
                  <option value="staff">Staff</option>
                  <option value="volunteer">Volunteer</option>
                  <option value="contractor">Contractor</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </Field>
            </div>
            <div className="mt-3">
              <p className="text-label-sm font-medium text-sc-navy mb-2">Additional Roles (display)</p>
              <div className="flex flex-wrap gap-3">
                {ASSIGNABLE_ROLES.filter((r) => r !== form.primary_role).map((r) => (
                  <label key={r} className="flex items-center gap-1.5 cursor-pointer text-label-sm text-sc-navy">
                    <input type="checkbox" checked={form.additional_roles.includes(r)} onChange={() => toggleRole(r)} className="rounded" />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <Field label="Start Date">
                <input type="date" value={form.start_date ?? ""} onChange={(e) => set("start_date", e.target.value || null)}
                  className="rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white" />
              </Field>
            </div>
          </section>

          {/* Background check */}
          <section>
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">Background Screening</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Status">
                <select value={form.background_check_status} onChange={(e) => set("background_check_status", e.target.value)} className={inputCls}>
                  <option value="not_submitted">Not Submitted</option>
                  <option value="pending">Pending</option>
                  <option value="cleared">Cleared</option>
                  <option value="expired">Expired</option>
                  <option value="flagged">Flagged</option>
                </select>
              </Field>
              <Field label="Check Date">
                <input type="date" value={form.background_check_date ?? ""} onChange={(e) => set("background_check_date", e.target.value || null)}
                  className="rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white" />
              </Field>
              <Field label="Expires">
                <input type="date" value={form.background_check_expires ?? ""} onChange={(e) => set("background_check_expires", e.target.value || null)}
                  className="rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white" />
              </Field>
            </div>
          </section>

          {/* Training */}
          <section>
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">Training & CPR</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Training Status">
                <select value={form.training_status} onChange={(e) => set("training_status", e.target.value)} className={inputCls}>
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="expired">Expired</option>
                </select>
              </Field>
              <Field label="Completed">
                <input type="date" value={form.training_completed_at ?? ""} onChange={(e) => set("training_completed_at", e.target.value || null)}
                  className="rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white" />
              </Field>
              <Field label="Training Expires">
                <input type="date" value={form.training_expires_at ?? ""} onChange={(e) => set("training_expires_at", e.target.value || null)}
                  className="rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white" />
              </Field>
              <Field label="CPR / First Aid">
                <select value={form.cpr_status} onChange={(e) => set("cpr_status", e.target.value)} className={inputCls}>
                  <option value="not_applicable">N/A</option>
                  <option value="current">Current</option>
                  <option value="expired">Expired</option>
                </select>
              </Field>
              <Field label="CPR Expires">
                <input type="date" value={form.cpr_expires_at ?? ""} onChange={(e) => set("cpr_expires_at", e.target.value || null)}
                  className="rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white" />
              </Field>
            </div>
          </section>

          {/* Emergency contact */}
          <section>
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">Emergency Contact (Optional)</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Name">
                <input value={form.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value || null)} className={inputCls} placeholder="Contact name" />
              </Field>
              <Field label="Phone">
                <input type="tel" value={form.emergency_contact_phone ?? ""} onChange={(e) => set("emergency_contact_phone", e.target.value || null)} className={inputCls} placeholder="(555) 000-0000" />
              </Field>
              <Field label="Relationship">
                <input value={form.emergency_contact_rel ?? ""} onChange={(e) => set("emergency_contact_rel", e.target.value || null)} className={inputCls} placeholder="Spouse, parent…" />
              </Field>
            </div>
          </section>

          {/* Compliance notes */}
          <section>
            <p className="text-label-sm font-semibold text-sc-rose uppercase tracking-wide mb-1">Admin Notes (Internal Only)</p>
            <textarea value={form.compliance_notes ?? ""} onChange={(e) => set("compliance_notes", e.target.value || null)}
              rows={2} placeholder="Internal notes, restrictions, or observations…" className={inputCls} />
          </section>

          {error && <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-2 text-label-sm text-sc-rose-700">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-sc-gray-100">
          <button onClick={onClose} className="flex-1 rounded-xl border border-sc-gray-200 px-4 py-2 text-label-md text-sc-gray hover:bg-sc-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={isPending}
            className="flex-1 rounded-xl bg-sc-teal px-4 py-2 text-white text-label-md font-medium hover:bg-sc-teal/90 disabled:opacity-60">
            {isPending ? "Saving…" : "Add Staff Member"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSV Import Modal ──────────────────────────────────────────────────────

function CSVImportModal({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSVSimple(text);
      setPreview(rows.slice(0, 5));
      setError(rows.length === 0 ? "No rows found in CSV" : null);
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (preview.length === 0) return;
    // Re-read from the input
    const input = document.getElementById("csv-file-input") as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSVSimple(text);
      const mapped = rows.map(mapCSVRow);
      startTransition(async () => {
        const res = await importStaffRows(mapped);
        setResult(res);
        if (res.inserted > 0) onDone(res.inserted);
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100">
          <h2 className="font-serif text-heading-3 text-sc-navy">Import Staff from CSV</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100 text-sc-gray text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {!result ? (
            <>
              <p className="text-body-sm text-sc-gray">
                Upload a CSV file. Required columns: <strong>First Name</strong> (or Full Name) and <strong>Last Name</strong>. All other columns are optional. See the Import Guide below the directory for the full column map.
              </p>
              <input id="csv-file-input" type="file" accept=".csv" onChange={handleFile}
                className="block w-full text-label-sm text-sc-gray file:mr-3 file:rounded-lg file:border-0 file:bg-sc-teal file:text-white file:px-3 file:py-1.5 file:text-label-sm file:cursor-pointer" />
              {error && <p className="text-label-sm text-sc-rose">{error}</p>}
              {preview.length > 0 && (
                <div>
                  <p className="text-label-sm font-semibold text-sc-navy mb-2">Preview (first {preview.length} rows)</p>
                  <div className="overflow-x-auto rounded-xl border border-sc-gray-100">
                    <table className="text-[11px] w-full">
                      <thead><tr className="bg-sc-cream border-b border-sc-gray-100">
                        {Object.keys(preview[0]).slice(0, 6).map((k) => (
                          <th key={k} className="text-left py-1.5 px-2 font-semibold text-sc-gray uppercase tracking-wide">{k}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-sc-gray-50">
                        {preview.map((r, i) => (
                          <tr key={i}>{Object.values(r).slice(0, 6).map((v, j) => (
                            <td key={j} className="py-1.5 px-2 text-sc-navy truncate max-w-[100px]">{v as string}</td>
                          ))}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 rounded-xl border border-sc-gray-200 px-4 py-2 text-label-md text-sc-gray hover:bg-sc-gray-50">Cancel</button>
                <button onClick={handleImport} disabled={preview.length === 0 || isPending}
                  className="flex-1 rounded-xl bg-sc-navy px-4 py-2 text-white text-label-md font-medium hover:bg-sc-navy/90 disabled:opacity-50">
                  {isPending ? "Importing…" : `Import ${preview.length > 0 ? "CSV" : ""}`}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-sc-teal-50 border border-sc-teal-200 px-4 py-3">
                <p className="text-label-sm font-semibold text-sc-teal-700">Import Complete</p>
                <p className="text-label-sm text-sc-teal-600 mt-0.5">{result.inserted} added · {result.skipped} skipped (duplicates)</p>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3">
                  <p className="text-label-sm font-semibold text-sc-rose-700 mb-1">Errors ({result.errors.length})</p>
                  <ul className="space-y-0.5">{result.errors.slice(0, 8).map((e, i) => (
                    <li key={i} className="text-label-sm text-sc-rose-600">• {e}</li>
                  ))}</ul>
                </div>
              )}
              <button onClick={onClose} className="w-full rounded-xl bg-sc-navy px-4 py-2 text-white text-label-md font-medium">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CSV Helpers ───────────────────────────────────────────────────────────

function parseCSVSimple(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  }).filter((r) => Object.values(r).some((v) => v));
}

const FIELD_MAP: Record<string, keyof ReturnType<typeof mapCSVRow>> = {
  "first name":                "first_name",
  "firstname":                 "first_name",
  "last name":                 "last_name",
  "lastname":                  "last_name",
  "email":                     "email",
  "phone":                     "phone",
  "display title":             "display_title",
  "title":                     "display_title",
  "role":                      "primary_role",
  "primary role":              "primary_role",
  "staff type":                "staff_type",
  "type":                      "staff_type",
  "start date":                "start_date",
  "background check status":   "background_check_status",
  "bg status":                 "background_check_status",
  "background check date":     "background_check_date",
  "background check expires":  "background_check_expires",
  "training status":           "training_status",
  "training completed":        "training_completed_at",
  "training expires":          "training_expires_at",
  "cpr status":                "cpr_status",
  "cpr expires":               "cpr_expires_at",
  "bio":                       "bio",
  "notes":                     "compliance_notes",
};

type MappedStaffRow = {
  first_name: string; last_name: string; email?: string; phone?: string;
  display_title?: string; primary_role?: string; staff_type?: string; start_date?: string;
  background_check_status?: string; background_check_date?: string; background_check_expires?: string;
  training_status?: string; training_completed_at?: string; training_expires_at?: string;
  cpr_status?: string; cpr_expires_at?: string; bio?: string; compliance_notes?: string;
};

function mapCSVRow(raw: Record<string, string>): MappedStaffRow {
  const out: Partial<MappedStaffRow> = {};
  for (const [key, value] of Object.entries(raw)) {
    const norm = key.toLowerCase().trim();
    // Handle "Full Name" → split into first/last
    if (norm === "full name" || norm === "name") {
      const parts = value.trim().split(" ");
      out.first_name = parts[0] ?? "";
      out.last_name  = parts.slice(1).join(" ") || (parts[0] ?? "");
      continue;
    }
    const mapped = FIELD_MAP[norm];
    if (mapped && value.trim()) (out as Record<string, string>)[mapped] = value.trim();
  }
  return out as MappedStaffRow;
}

// ── Staff Row ─────────────────────────────────────────────────────────────

function ComplianceBadge({ summary }: { summary?: StaffComplianceSummary }) {
  if (!summary) return null;
  const { overall_status, expired, expiring_soon } = summary;
  if (overall_status === "compliant")
    return <span className="rounded-full bg-sc-teal-50 text-sc-teal-700 border border-sc-teal-200 px-2 py-0.5 text-[10px] font-medium">Compliant</span>;
  if (overall_status === "action_required")
    return <span className="rounded-full bg-sc-rose-50 text-sc-rose-700 border border-sc-rose-200 px-2 py-0.5 text-[10px] font-medium">{expired} Expired</span>;
  if (overall_status === "expiring_soon")
    return <span className="rounded-full bg-sc-gold-50 text-sc-gold-700 border border-sc-gold-200 px-2 py-0.5 text-[10px] font-medium">{expiring_soon} Expiring</span>;
  if (overall_status === "missing")
    return <span className="rounded-full bg-sc-gray-100 text-sc-gray-600 border border-sc-gray-200 px-2 py-0.5 text-[10px] font-medium">Missing Items</span>;
  return null;
}

function StaffRow({ member, canManage, complianceSummary, onStatusChange }: {
  member: StaffRosterRow;
  canManage: boolean;
  complianceSummary?: StaffComplianceSummary;
  onStatusChange: (id: string, s: "active" | "inactive" | "suspended") => void;
}) {
  const bgCfg  = BG_STATUS_CONFIG[member.background_check_status];
  const BgIcon = bgCfg.icon;
  const initials = `${member.first_name[0] ?? ""}${member.last_name[0] ?? ""}`.toUpperCase();
  const allRoles = [member.primary_role, ...member.additional_roles].filter(Boolean);
  const isInactive = member.status !== "active";

  return (
    <div className={cn("flex items-center gap-4 px-4 py-3.5 hover:bg-sc-cream/60 transition-colors", isInactive && "opacity-55")}>
      <Link href={`/dashboard/staff/${member.id}`} className="shrink-0">
        {member.avatar_url
          ? <img src={member.avatar_url} alt="" className="size-10 rounded-full object-cover" />
          : <div className="size-10 rounded-full bg-sc-navy flex items-center justify-center text-white text-label-sm font-bold">{initials}</div>
        }
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={`/dashboard/staff/${member.id}`} className="flex flex-wrap items-baseline gap-2 hover:text-sc-teal transition-colors">
          <span className="text-label-md font-semibold text-sc-navy">{member.full_name}</span>
          {member.display_title && <span className="text-label-sm text-sc-gray">— {member.display_title}</span>}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {allRoles.slice(0, 3).map((r) => (
            <span key={r} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium",
              ROLE_COLOR[r] ?? "bg-sc-gray-100 text-sc-gray-700 border-sc-gray-200")}>
              {ROLE_LABELS[r as UserRole] ?? r}
            </span>
          ))}
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
            member.staff_type === "volunteer" ? "bg-sc-green-50 text-sc-green-700 border-sc-green-200"
            : member.staff_type === "contractor" ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200")}>
            {member.staff_type}
          </span>
          {isInactive && (
            <span className="rounded-full bg-sc-rose-50 border border-sc-rose-200 text-sc-rose-700 px-2 py-0.5 text-[11px] font-medium capitalize">
              {member.status}
            </span>
          )}
        </div>
      </div>

      <div className="hidden sm:block text-right min-w-[160px]">
        <p className="text-label-sm text-sc-gray truncate">{member.email ?? <span className="text-sc-gray-400 italic">no email</span>}</p>
        {member.phone && <p className="text-label-sm text-sc-gray-400">{member.phone}</p>}
      </div>

      <div className="hidden md:flex items-center gap-1.5 min-w-[120px]">
        <BgIcon className={cn("size-4 shrink-0", bgCfg.cls)} />
        <span className={cn("text-label-sm", bgCfg.cls)}>{bgCfg.label}</span>
      </div>

      <div className="hidden lg:flex items-center min-w-[110px]">
        <ComplianceBadge summary={complianceSummary} />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {canManage && (
          member.status === "active" ? (
            <button onClick={() => onStatusChange(member.id, "inactive")} title="Deactivate"
              className="p-1.5 rounded-lg text-sc-gray hover:text-sc-rose hover:bg-sc-rose-50 transition-colors">
              <UserX className="size-4" />
            </button>
          ) : (
            <button onClick={() => onStatusChange(member.id, "active")} title="Reactivate"
              className="p-1.5 rounded-lg text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors">
              <UserCheck className="size-4" />
            </button>
          )
        )}
        <Link href={`/dashboard/staff/${member.id}`}
          className="p-1.5 rounded-lg text-sc-gray hover:text-sc-navy hover:bg-sc-cream transition-colors">
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function StaffDirectory({ initialMembers, currentRole }: {
  initialMembers: StaffRosterRow[];
  currentRole:    string;
}) {
  const [members, setMembers]         = useState<StaffRosterRow[]>(initialMembers);
  const [isPending, startTransition]  = useTransition();
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [search, setSearch]           = useState("");
  const [filterRole, setFilterRole]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterBg, setFilterBg]       = useState("all");
  const [filterCompliance, setFilterCompliance] = useState<"" | "compliant" | "expiring_soon" | "expired" | "missing">("");
  const [complianceCounts, setComplianceCounts] = useState<Map<string, StaffComplianceSummary>>(new Map());

  const canManage = ADMIN_ROLES.includes(currentRole as UserRole);

  useEffect(() => {
    if (!canManage) return;
    getComplianceCountsForDirectory().then((rows) => {
      const m = new Map(rows.map((r) => [r.staff_id, r.summary]));
      setComplianceCounts(m);
    });
  }, [canManage]);

  function flash(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  function handleStatusChange(id: string, status: "active" | "inactive" | "suspended") {
    startTransition(async () => {
      const res = await setStaffStatus(id, status);
      if (!res.success) { flash(res.error, false); return; }
      setMembers((prev) => prev.map((m) => m.id === id ? { ...m, status } : m));
      flash(status === "active" ? "Member reactivated" : "Member deactivated");
    });
  }

  const filtered = useMemo(() => members.filter((m) => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterRole   !== "all" && m.primary_role !== filterRole) return false;
    if (filterBg     !== "all" && m.background_check_status !== filterBg) return false;
    if (filterCompliance) {
      const cs = complianceCounts.get(m.id);
      if (!cs) {
        if (filterCompliance !== "missing") return false;
      } else {
        const map: Record<string, string> = {
          compliant: "compliant",
          expiring_soon: "expiring_soon",
          expired: "action_required",
          missing: "missing",
        };
        if (cs.overall_status !== map[filterCompliance]) return false;
      }
    }
    if (search) {
      const q = search.toLowerCase();
      if (!m.full_name.toLowerCase().includes(q) &&
          !(m.email ?? "").toLowerCase().includes(q) &&
          !(m.display_title ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [members, search, filterRole, filterStatus, filterBg, filterCompliance, complianceCounts]);

  return (
    <div className="space-y-5">
      {toast && (
        <div className={cn("rounded-xl px-4 py-3 text-label-sm border",
          toast.ok ? "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700"
                   : "bg-sc-rose-50 border-sc-rose-200 text-sc-rose-700")}>
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-sc-gray-200 text-label-md text-sc-navy bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="size-4 text-sc-gray-400 shrink-0" />
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
            className="rounded-lg border border-sc-gray-200 px-2.5 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All Roles</option>
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-sc-gray-200 px-2.5 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={filterBg} onChange={(e) => setFilterBg(e.target.value)}
            className="rounded-lg border border-sc-gray-200 px-2.5 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All BG Status</option>
            <option value="cleared">BG Cleared</option>
            <option value="pending">BG Pending</option>
            <option value="expired">BG Expired</option>
            <option value="not_submitted">Not Submitted</option>
            <option value="flagged">Flagged</option>
          </select>
          {canManage && (
            <select value={filterCompliance} onChange={(e) => setFilterCompliance(e.target.value as typeof filterCompliance)}
              className="rounded-lg border border-sc-gray-200 px-2.5 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
              <option value="">All Compliance</option>
              <option value="compliant">Compliant</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Has Expired</option>
              <option value="missing">Missing Items</option>
            </select>
          )}
        </div>

        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-md text-sc-navy hover:bg-sc-cream transition-colors">
              <Upload className="size-4" /> Import CSV
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 rounded-xl bg-sc-navy px-4 py-2 text-white text-label-md font-medium hover:bg-sc-navy/90 transition-colors">
              <Plus className="size-4" /> Add Staff
            </button>
          </div>
        )}
      </div>

      <p className="text-label-sm text-sc-gray">{filtered.length} of {members.length} staff member{members.length !== 1 ? "s" : ""}</p>

      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
        <div className="hidden md:grid px-4 py-2.5 bg-sc-cream border-b border-sc-gray-100 text-label-sm font-semibold text-sc-gray uppercase tracking-wide"
          style={{ gridTemplateColumns: "2.5rem 1fr 180px 140px 56px" }}>
          <div /><div>Name / Roles</div><div className="text-right">Contact</div><div>BG Status</div><div />
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="size-10 text-sc-gray-300 mx-auto mb-3" />
            <p className="text-body-md text-sc-gray-400">
              {members.length === 0
                ? <span>No staff yet. <button onClick={() => setShowAdd(true)} className="text-sc-teal hover:underline">Add your first staff member.</button></span>
                : "No results for these filters."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-sc-gray-50">
            {filtered.map((m) => (
              <StaffRow key={m.id} member={m} canManage={canManage}
                complianceSummary={complianceCounts.get(m.id)}
                onStatusChange={handleStatusChange} />
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddStaffModal
          onClose={() => setShowAdd(false)}
          onAdded={(m) => { setMembers((prev) => [...prev, m]); setShowAdd(false); flash(`${m.full_name} added`); }}
        />
      )}
      {showImport && (
        <CSVImportModal
          onClose={() => setShowImport(false)}
          onDone={(n) => { setShowImport(false); flash(`${n} staff members imported`); window.location.reload(); }}
        />
      )}
    </div>
  );
}
