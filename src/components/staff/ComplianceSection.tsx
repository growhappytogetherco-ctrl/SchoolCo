"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ShieldCheck, ShieldAlert, ShieldX, Clock, Plus, CheckCircle,
  Archive, RotateCcw, Edit2, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import {
  getComplianceRecords,
  createComplianceRecord,
  updateComplianceRecord,
  verifyComplianceRecord,
  archiveComplianceRecord,
  restoreComplianceRecord,
  type ComplianceRecord,
  type StaffComplianceSummary,
} from "@/app/actions/staffComplianceActions";
import {
  REQUIREMENT_TYPES,
  REQUIREMENT_LABELS,
  VERIFICATION_STATUSES,
  STATUS_BADGE_CFG,
  DEFAULT_REQUIREMENTS,
  calcDisplayStatus,
  type RequirementType,
  type VerificationStatus,
} from "@/lib/compliance-constants";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  const cfg = STATUS_BADGE_CFG[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

function computeSummary(records: ComplianceRecord[], staffType: string): StaffComplianceSummary {
  const required = (DEFAULT_REQUIREMENTS[staffType] ?? DEFAULT_REQUIREMENTS.staff) as RequirementType[];
  const byType   = new Map(records.filter((r) => !r.archived_at).map((r) => [r.requirement_type, r]));
  let current = 0, expiring_soon = 0, expired = 0, missing = 0, pending = 0;
  for (const rt of required) {
    const rec = byType.get(rt);
    if (!rec) { missing++; continue; }
    const ds = rec.display_status;
    if (ds === "current") current++;
    else if (ds === "expiring_soon") expiring_soon++;
    else if (ds === "expired") expired++;
    else if (ds === "pending") pending++;
    else if (ds === "not_started") missing++;
  }
  let overall_status: StaffComplianceSummary["overall_status"] = "compliant";
  if (expired > 0) overall_status = "action_required";
  else if (expiring_soon > 0) overall_status = "expiring_soon";
  else if (missing > 0) overall_status = "missing";
  const total = records.filter((r) => !r.archived_at).length;
  return { total, current, expiring_soon, expired, missing, pending, overall_status };
}

// ── Record Form ────────────────────────────────────────────────────────────

const BLANK_FORM = {
  requirement_type:        "background_screening" as RequirementType,
  custom_requirement_name: "",
  verification_status:     "not_started" as VerificationStatus,
  completion_date:         "",
  expiration_date:         "",
  credential_number:       "",
  provider_name:           "",
  notes:                   "",
  document_url:            "",
  reminder_enabled:        false,
};

function RecordForm({
  staffMemberId,
  initial,
  onClose,
  onSaved,
}: {
  staffMemberId: string;
  initial?: ComplianceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);
  const [form, setForm]              = useState({
    ...BLANK_FORM,
    ...(initial ? {
      requirement_type:        initial.requirement_type,
      custom_requirement_name: initial.custom_requirement_name ?? "",
      verification_status:     initial.verification_status,
      completion_date:         initial.completion_date ?? "",
      expiration_date:         initial.expiration_date ?? "",
      credential_number:       initial.credential_number ?? "",
      provider_name:           initial.provider_name ?? "",
      notes:                   initial.notes ?? "",
      document_url:            initial.document_url ?? "",
      reminder_enabled:        initial.reminder_enabled ?? false,
    } : {}),
  });

  const inputCls = "w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white";

  function set(k: string, v: string | boolean) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const payload = {
        requirement_type:        form.requirement_type,
        custom_requirement_name: form.custom_requirement_name || null,
        verification_status:     form.verification_status,
        completion_date:         form.completion_date || null,
        expiration_date:         form.expiration_date || null,
        credential_number:       form.credential_number || null,
        provider_name:           form.provider_name || null,
        notes:                   form.notes || null,
        document_url:            form.document_url || null,
        reminder_enabled:        form.reminder_enabled,
      };

      const res = initial
        ? await updateComplianceRecord(initial.id, staffMemberId, payload)
        : await createComplianceRecord(staffMemberId, payload);

      if (!res.success) { setError(res.error ?? "Save failed"); return; }
      onSaved();
      onClose();
    });
  }

  return (
    <div className="rounded-2xl border border-sc-teal-200 bg-sc-teal-50/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">
          {initial ? "Edit Compliance Record" : "Add Compliance Record"}
        </p>
        <button onClick={onClose} className="text-sc-gray hover:text-sc-navy text-lg leading-none">✕</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-label-sm font-medium text-sc-navy">Requirement Type *</label>
          <select value={form.requirement_type} onChange={(e) => set("requirement_type", e.target.value)} className={inputCls}>
            {REQUIREMENT_TYPES.map((rt) => (
              <option key={rt} value={rt}>{REQUIREMENT_LABELS[rt]}</option>
            ))}
          </select>
        </div>

        {form.requirement_type === "other" && (
          <div className="space-y-1.5">
            <label className="text-label-sm font-medium text-sc-navy">Custom Name</label>
            <input value={form.custom_requirement_name} onChange={(e) => set("custom_requirement_name", e.target.value)}
              placeholder="Describe the requirement…" className={inputCls} />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-label-sm font-medium text-sc-navy">Verification Status *</label>
          <select value={form.verification_status} onChange={(e) => set("verification_status", e.target.value)} className={inputCls}>
            {(["not_started","pending","current","waived","not_required"] as VerificationStatus[]).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-label-sm font-medium text-sc-navy">Completion Date</label>
          <input type="date" value={form.completion_date} onChange={(e) => set("completion_date", e.target.value)}
            className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <label className="text-label-sm font-medium text-sc-navy">Expiration Date</label>
          <input type="date" value={form.expiration_date} onChange={(e) => set("expiration_date", e.target.value)}
            className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <label className="text-label-sm font-medium text-sc-navy">Credential / Certificate #</label>
          <input value={form.credential_number} onChange={(e) => set("credential_number", e.target.value)}
            placeholder="Optional" className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <label className="text-label-sm font-medium text-sc-navy">Provider / Issuer</label>
          <input value={form.provider_name} onChange={(e) => set("provider_name", e.target.value)}
            placeholder="Organization name" className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <label className="text-label-sm font-medium text-sc-navy">Document URL</label>
          <input type="url" value={form.document_url} onChange={(e) => set("document_url", e.target.value)}
            placeholder="https://…" className={inputCls} />
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-label-sm font-medium text-sc-navy">Notes</label>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
            rows={2} placeholder="Internal notes…" className={inputCls} />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-label-sm text-sc-navy">
          <input type="checkbox" checked={form.reminder_enabled}
            onChange={(e) => set("reminder_enabled", e.target.checked)} className="rounded" />
          Enable expiration reminder
        </label>
      </div>

      {error && (
        <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onClose}
          className="flex-1 rounded-xl border border-sc-gray-200 px-4 py-2 text-label-md text-sc-gray hover:bg-sc-gray-50">
          Cancel
        </button>
        <button onClick={handleSave} disabled={isPending}
          className="flex-1 rounded-xl bg-sc-teal px-4 py-2 text-white text-label-md font-medium hover:bg-sc-teal/90 disabled:opacity-60">
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Record Card ────────────────────────────────────────────────────────────

function RecordCard({
  record,
  staffMemberId,
  isAdmin,
  onReload,
}: {
  record: ComplianceRecord;
  staffMemberId: string;
  isAdmin: boolean;
  onReload: () => void;
}) {
  const [isEditing, setIsEditing]    = useState(false);
  const [isPending, startTransition] = useTransition();

  const ds         = record.display_status;
  const isExpired  = ds === "expired";
  const isExpiring = ds === "expiring_soon";
  const label      = record.requirement_type === "other"
    ? (record.custom_requirement_name || "Other")
    : REQUIREMENT_LABELS[record.requirement_type];

  function handleVerify() {
    startTransition(async () => {
      await verifyComplianceRecord(record.id, staffMemberId);
      onReload();
    });
  }

  function handleArchive() {
    startTransition(async () => {
      await archiveComplianceRecord(record.id, staffMemberId);
      onReload();
    });
  }

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-2",
      isExpired  ? "border-sc-rose-200 bg-sc-rose-50"
      : isExpiring ? "border-sc-gold-200 bg-sc-gold-50/60"
      : "border-sc-gray-100 bg-white"
    )}>
      {isEditing ? (
        <RecordForm
          staffMemberId={staffMemberId}
          initial={record}
          onClose={() => setIsEditing(false)}
          onSaved={onReload}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-label-sm font-semibold text-sc-navy">{label}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <StatusBadge status={ds} />
                {record.provider_name && (
                  <span className="text-[11px] text-sc-gray">{record.provider_name}</span>
                )}
                {record.credential_number && (
                  <span className="text-[11px] text-sc-gray-400">#{record.credential_number}</span>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setIsEditing(true)} disabled={isPending}
                  title="Edit" className="p-1.5 rounded-lg text-sc-gray hover:text-sc-navy hover:bg-sc-cream">
                  <Edit2 className="size-3.5" />
                </button>
                <button onClick={handleVerify} disabled={isPending}
                  title="Mark as Current" className="p-1.5 rounded-lg text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50">
                  <CheckCircle className="size-3.5" />
                </button>
                <button onClick={handleArchive} disabled={isPending}
                  title="Archive" className="p-1.5 rounded-lg text-sc-gray hover:text-sc-rose hover:bg-sc-rose-50">
                  <Archive className="size-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-sc-gray">
            {record.completion_date && (
              <span>Completed: {fmtDate(record.completion_date)}</span>
            )}
            {record.expiration_date && (
              <span className={cn(isExpired || isExpiring ? "font-medium" : "",
                isExpired ? "text-sc-rose-600" : isExpiring ? "text-sc-gold-700" : "")}>
                {isExpired ? "Expired:" : isExpiring ? "Expiring:" : "Expires:"} {fmtDate(record.expiration_date)}
              </span>
            )}
            {record.verified_at && record.verified_by_name && (
              <span className="col-span-2">
                Verified by {record.verified_by_name} on {fmtDate(record.verified_at)}
              </span>
            )}
          </div>

          {record.notes && (
            <p className="text-[11px] text-sc-gray italic">{record.notes}</p>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function ComplianceSection({
  staffMemberId,
  staffType,
  isAdmin,
}: {
  staffMemberId: string;
  staffType: string;
  isAdmin: boolean;
}) {
  const [records, setRecords]            = useState<ComplianceRecord[]>([]);
  const [loading, setLoading]            = useState(true);
  const [showAddForm, setShowAddForm]    = useState(false);
  const [showArchived, setShowArchived]  = useState(false);
  const [archivedRecords, setArchivedRecords] = useState<ComplianceRecord[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [, startTransition]              = useTransition();

  function loadRecords() {
    setLoading(true);
    getComplianceRecords(staffMemberId).then((data) => {
      setRecords(data);
      setLoading(false);
    });
  }

  function loadArchived() {
    setLoadingArchived(true);
    getComplianceRecords(staffMemberId, { includeArchived: true }).then((all) => {
      setArchivedRecords(all.filter((r) => r.archived_at !== null));
      setLoadingArchived(false);
    });
  }

  useEffect(() => { loadRecords(); }, [staffMemberId]);

  function handleRestore(id: string) {
    startTransition(async () => {
      await restoreComplianceRecord(id, staffMemberId);
      loadRecords();
      if (showArchived) loadArchived();
    });
  }

  const required  = (DEFAULT_REQUIREMENTS[staffType] ?? DEFAULT_REQUIREMENTS.staff) as RequirementType[];
  const active    = records.filter((r) => !r.archived_at);
  const byType    = new Map(active.map((r) => [r.requirement_type, r]));
  const summary   = computeSummary(records, staffType);

  // Build display list: required items first (with or without records), then extra items
  const requiredItems: Array<{ rt: RequirementType; record: ComplianceRecord | null }> =
    required.map((rt) => ({ rt, record: byType.get(rt) ?? null }));
  const extraRecords  = active.filter((r) => !required.includes(r.requirement_type));

  const OVERALL_CFG: Record<StaffComplianceSummary["overall_status"], { cls: string; label: string }> = {
    compliant:      { cls: "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700",  label: "Compliant" },
    expiring_soon:  { cls: "bg-sc-gold-50 border-sc-gold-200 text-sc-gold-700",  label: "Expiring Soon" },
    action_required:{ cls: "bg-sc-rose-50 border-sc-rose-200 text-sc-rose-700",  label: "Action Required" },
    missing:        { cls: "bg-sc-gray-50 border-sc-gray-200 text-sc-gray-600",  label: "Items Missing" },
  };
  const ovCfg = OVERALL_CFG[summary.overall_status];

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className={cn("rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2", ovCfg.cls)}>
        <span className="text-label-sm font-semibold">{ovCfg.label}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {summary.current       > 0 && <span className="text-sc-teal-700">{summary.current} Current</span>}
          {summary.expiring_soon > 0 && <span className="text-sc-gold-700">{summary.expiring_soon} Expiring</span>}
          {summary.expired       > 0 && <span className="text-sc-rose-700">{summary.expired} Expired</span>}
          {summary.missing       > 0 && <span className="text-sc-gray-600">{summary.missing} Missing</span>}
          {summary.pending       > 0 && <span className="text-sc-gold-600">{summary.pending} Pending</span>}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2 animate-pulse">
          {[1,2,3].map((i) => <div key={i} className="h-16 rounded-xl bg-sc-gray-50" />)}
        </div>
      )}

      {/* Required Items */}
      {!loading && (
        <div className="space-y-2">
          {requiredItems.map(({ rt, record }) => {
            if (record) {
              return (
                <RecordCard
                  key={record.id}
                  record={record}
                  staffMemberId={staffMemberId}
                  isAdmin={isAdmin}
                  onReload={loadRecords}
                />
              );
            }
            // Required item with no record — show placeholder
            return (
              <div key={rt}
                className="rounded-xl border border-dashed border-sc-gray-200 p-4 flex items-center gap-3">
                <ShieldX className="size-4 text-sc-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-label-sm font-semibold text-sc-navy">{REQUIREMENT_LABELS[rt]}</p>
                  <p className="text-[11px] text-sc-gray-400">Required — no record yet</p>
                </div>
                <StatusBadge status="not_started" />
              </div>
            );
          })}

          {/* Extra (non-required) records */}
          {extraRecords.map((record) => (
            <RecordCard
              key={record.id}
              record={record}
              staffMemberId={staffMemberId}
              isAdmin={isAdmin}
              onReload={loadRecords}
            />
          ))}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <RecordForm
          staffMemberId={staffMemberId}
          onClose={() => setShowAddForm(false)}
          onSaved={loadRecords}
        />
      )}

      {/* Add Button */}
      {isAdmin && !showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-sc-teal-300 px-4 py-2.5 text-label-sm text-sc-teal hover:bg-sc-teal-50 transition-colors w-full justify-center">
          <Plus className="size-4" /> Add Compliance Record
        </button>
      )}

      {/* Archived Section */}
      <div>
        <button
          onClick={() => {
            setShowArchived((v) => !v);
            if (!showArchived && archivedRecords.length === 0) loadArchived();
          }}
          className="flex items-center gap-2 text-label-sm text-sc-gray hover:text-sc-navy transition-colors">
          {showArchived ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          Archived records
        </button>

        {showArchived && (
          <div className="mt-3 space-y-2">
            {loadingArchived && (
              <div className="h-10 rounded-xl bg-sc-gray-50 animate-pulse" />
            )}
            {!loadingArchived && archivedRecords.length === 0 && (
              <p className="text-label-sm text-sc-gray-400 pl-2">No archived records</p>
            )}
            {archivedRecords.map((rec) => (
              <div key={rec.id}
                className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 p-3 flex items-center gap-3 opacity-70">
                <ShieldX className="size-4 text-sc-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-label-sm text-sc-gray">
                    {rec.requirement_type === "other"
                      ? (rec.custom_requirement_name || "Other")
                      : REQUIREMENT_LABELS[rec.requirement_type]}
                  </p>
                  <p className="text-[11px] text-sc-gray-400">
                    Archived · {fmtDate(rec.archived_at)}
                  </p>
                </div>
                {isAdmin && (
                  <button onClick={() => handleRestore(rec.id)}
                    className="p-1.5 rounded-lg text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50"
                    title="Restore">
                    <RotateCcw className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
