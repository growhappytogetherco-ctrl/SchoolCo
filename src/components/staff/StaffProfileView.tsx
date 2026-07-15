"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft, Mail, Phone, Shield, ShieldCheck, ShieldAlert, ShieldX,
  Clock, Calendar, AlertTriangle, Edit2, UserX, UserCheck,
  BookOpen, Heart, Briefcase, User,
} from "lucide-react";
import {
  updateStaffMember, setStaffStatus,
  type StaffRosterRow, type BgStatus, type TrainingStatus, type CprStatus,
} from "@/app/actions/staffActions";
import { ROLE_LABELS, ADMIN_ROLES, type UserRole } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ComplianceSection } from "./ComplianceSection";

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
};

const BG_CFG: Record<BgStatus, { label: string; icon: React.ElementType; cls: string; alert: boolean }> = {
  not_submitted: { label: "Not Submitted", icon: ShieldX,    cls: "text-sc-gray-400",  alert: false },
  pending:       { label: "Pending",        icon: Clock,      cls: "text-sc-gold-600",  alert: false },
  cleared:       { label: "Cleared",        icon: ShieldCheck,cls: "text-sc-green-600", alert: false },
  expired:       { label: "Expired",        icon: ShieldAlert,cls: "text-sc-rose-600",  alert: true  },
  flagged:       { label: "Flagged",        icon: ShieldAlert,cls: "text-sc-rose-700",  alert: true  },
};

const TRAIN_CFG: Record<TrainingStatus, { label: string; cls: string; alert: boolean }> = {
  not_started:  { label: "Not Started",  cls: "text-sc-gray-400",  alert: false },
  in_progress:  { label: "In Progress",  cls: "text-sc-gold-600",  alert: false },
  completed:    { label: "Completed",    cls: "text-sc-green-600", alert: false },
  expired:      { label: "Expired",      cls: "text-sc-rose-600",  alert: true  },
};

const CPR_CFG: Record<CprStatus, { label: string; cls: string; alert: boolean }> = {
  not_applicable: { label: "N/A",     cls: "text-sc-gray-400",  alert: false },
  current:        { label: "Current", cls: "text-sc-green-600", alert: false },
  expired:        { label: "Expired", cls: "text-sc-rose-600",  alert: true  },
};

const inputCls = "w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white";
const dateCls  = "rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-label-sm font-medium text-sc-navy">{label}</label>
      {children}
    </div>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function isExpiringSoon(d: string | null) {
  if (!d) return false;
  const diff = (new Date(d).getTime() - Date.now()) / 86400000;
  return diff >= 0 && diff <= 60;
}

function isExpired(d: string | null) {
  return !!d && new Date(d) < new Date();
}

// ── Compliance Row ────────────────────────────────────────────────────────

function ComplianceRow({ icon: Icon, label, status, statusCls, date, expires, alert }: {
  icon: React.ElementType; label: string; status: string; statusCls: string;
  date?: string | null; expires?: string | null; alert: boolean;
}) {
  const expiring = isExpiringSoon(expires ?? null);
  const expired  = isExpired(expires ?? null);
  return (
    <div className={cn("flex items-start gap-3 rounded-xl p-3 border",
      alert || expired ? "border-sc-rose-200 bg-sc-rose-50"
        : expiring ? "border-sc-gold-200 bg-sc-gold-50"
        : "border-sc-gray-100 bg-white")}>
      <Icon className={cn("size-5 mt-0.5 shrink-0", statusCls)} />
      <div className="flex-1 min-w-0">
        <p className="text-label-sm font-semibold text-sc-navy">{label}</p>
        <p className={cn("text-label-sm font-medium", statusCls)}>{status}</p>
        {date    && <p className="text-label-sm text-sc-gray mt-0.5">Date: {fmtDate(date)}</p>}
        {expires && <p className={cn("text-label-sm mt-0.5", expired || alert ? "text-sc-rose-600 font-medium" : expiring ? "text-sc-gold-600 font-medium" : "text-sc-gray")}>
          {expired ? "Expired" : expiring ? "Expiring soon" : "Expires"}: {fmtDate(expires)}
        </p>}
      </div>
      {(alert || expired || expiring) && <AlertTriangle className={cn("size-4 mt-0.5 shrink-0", expired || alert ? "text-sc-rose" : "text-sc-gold")} />}
    </div>
  );
}

// ── Edit Form ─────────────────────────────────────────────────────────────

function EditForm({ member, onClose, onSaved }: {
  member:   StaffRosterRow;
  onClose:  () => void;
  onSaved:  (updated: Partial<StaffRosterRow>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name:               member.first_name,
    last_name:                member.last_name,
    email:                    member.email ?? "",
    phone:                    member.phone ?? "",
    display_title:            member.display_title ?? "",
    bio:                      member.bio ?? "",
    staff_type:               member.staff_type,
    primary_role:             member.primary_role,
    additional_roles:         member.additional_roles,
    status:                   member.status,
    start_date:               member.start_date ?? "",
    end_date:                 member.end_date ?? "",
    background_check_status:  member.background_check_status,
    background_check_date:    member.background_check_date ?? "",
    background_check_expires: member.background_check_expires ?? "",
    training_status:          member.training_status,
    training_completed_at:    member.training_completed_at ?? "",
    training_expires_at:      member.training_expires_at ?? "",
    cpr_status:               member.cpr_status,
    cpr_expires_at:           member.cpr_expires_at ?? "",
    emergency_contact_name:   member.emergency_contact_name ?? "",
    emergency_contact_phone:  member.emergency_contact_phone ?? "",
    emergency_contact_rel:    member.emergency_contact_rel ?? "",
    compliance_notes:         member.compliance_notes ?? "",
  });

  function set(k: string, v: string | string[]) { setForm((p) => ({ ...p, [k]: v })); }

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
      const res = await updateStaffMember(member.id, {
        first_name:               form.first_name,
        last_name:                form.last_name,
        email:                    form.email || null,
        phone:                    form.phone || null,
        display_title:            form.display_title || null,
        bio:                      form.bio || null,
        staff_type:               form.staff_type,
        primary_role:             form.primary_role,
        additional_roles:         form.additional_roles,
        status:                   form.status,
        start_date:               form.start_date || null,
        end_date:                 form.end_date || null,
        background_check_status:  form.background_check_status as BgStatus,
        background_check_date:    form.background_check_date || null,
        background_check_expires: form.background_check_expires || null,
        training_status:          form.training_status as TrainingStatus,
        training_completed_at:    form.training_completed_at || null,
        training_expires_at:      form.training_expires_at || null,
        cpr_status:               form.cpr_status as CprStatus,
        cpr_expires_at:           form.cpr_expires_at || null,
        emergency_contact_name:   form.emergency_contact_name || null,
        emergency_contact_phone:  form.emergency_contact_phone || null,
        emergency_contact_rel:    form.emergency_contact_rel || null,
        compliance_notes:         form.compliance_notes || null,
      });
      if (!res.success) { setError(res.error); return; }
      onSaved({
        first_name:    form.first_name,
        last_name:     form.last_name,
        full_name:     `${form.first_name} ${form.last_name}`.trim(),
        email:         form.email || null,
        phone:         form.phone || null,
        display_title: form.display_title || null,
        primary_role:  form.primary_role,
        additional_roles: form.additional_roles,
        status:        form.status,
        staff_type:    form.staff_type,
        background_check_status:  form.background_check_status as BgStatus,
        background_check_expires: form.background_check_expires || null,
        training_status:          form.training_status as TrainingStatus,
        training_expires_at:      form.training_expires_at || null,
        cpr_status:               form.cpr_status as CprStatus,
        cpr_expires_at:           form.cpr_expires_at || null,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100 sticky top-0 bg-white">
          <h2 className="font-serif text-heading-3 text-sc-navy">Edit Staff Profile</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100 text-sc-gray text-lg leading-none">✕</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-6">

          <section>
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">Basic Information</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="First Name *"><input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className={inputCls} /></Field>
              <Field label="Last Name *"><input value={form.last_name}  onChange={(e) => set("last_name",  e.target.value)} className={inputCls} /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} /></Field>
              <Field label="Phone"><input type="tel"   value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} /></Field>
              <Field label="Display Title" className="sm:col-span-2">
                <input value={form.display_title} onChange={(e) => set("display_title", e.target.value)} placeholder="e.g. Founder / Principal" className={inputCls} />
              </Field>
              <Field label="Bio" className="sm:col-span-2">
                <textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={2} className={inputCls} />
              </Field>
            </div>
          </section>

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
              <p className="text-label-sm font-medium text-sc-navy mb-2">Additional Display Roles</p>
              <div className="flex flex-wrap gap-3">
                {ASSIGNABLE_ROLES.filter((r) => r !== form.primary_role).map((r) => (
                  <label key={r} className="flex items-center gap-1.5 cursor-pointer text-label-sm text-sc-navy">
                    <input type="checkbox" checked={form.additional_roles.includes(r)} onChange={() => toggleRole(r)} className="rounded" />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <Field label="Start Date"><input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={dateCls} /></Field>
              <Field label="End Date"><input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className={dateCls} /></Field>
            </div>
          </section>

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
              <Field label="Check Date"><input type="date" value={form.background_check_date} onChange={(e) => set("background_check_date", e.target.value)} className={dateCls} /></Field>
              <Field label="Expires"><input type="date" value={form.background_check_expires} onChange={(e) => set("background_check_expires", e.target.value)} className={dateCls} /></Field>
            </div>
          </section>

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
              <Field label="Completed"><input type="date" value={form.training_completed_at} onChange={(e) => set("training_completed_at", e.target.value)} className={dateCls} /></Field>
              <Field label="Training Expires"><input type="date" value={form.training_expires_at} onChange={(e) => set("training_expires_at", e.target.value)} className={dateCls} /></Field>
              <Field label="CPR / First Aid">
                <select value={form.cpr_status} onChange={(e) => set("cpr_status", e.target.value)} className={inputCls}>
                  <option value="not_applicable">N/A</option>
                  <option value="current">Current</option>
                  <option value="expired">Expired</option>
                </select>
              </Field>
              <Field label="CPR Expires"><input type="date" value={form.cpr_expires_at} onChange={(e) => set("cpr_expires_at", e.target.value)} className={dateCls} /></Field>
            </div>
          </section>

          <section>
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">Emergency Contact</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Name"><input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} placeholder="Contact name" className={inputCls} /></Field>
              <Field label="Phone"><input type="tel" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} className={inputCls} /></Field>
              <Field label="Relationship"><input value={form.emergency_contact_rel} onChange={(e) => set("emergency_contact_rel", e.target.value)} placeholder="Spouse, parent…" className={inputCls} /></Field>
            </div>
          </section>

          <section>
            <p className="text-label-sm font-semibold text-sc-rose uppercase tracking-wide mb-1">Admin Notes (Internal Only)</p>
            <textarea value={form.compliance_notes} onChange={(e) => set("compliance_notes", e.target.value)}
              rows={3} placeholder="Internal notes, restrictions, or observations…" className={inputCls} />
          </section>

          {error && <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-2 text-label-sm text-sc-rose-700">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-sc-gray-100">
          <button onClick={onClose} className="flex-1 rounded-xl border border-sc-gray-200 px-4 py-2 text-label-md text-sc-gray hover:bg-sc-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={isPending}
            className="flex-1 rounded-xl bg-sc-teal px-4 py-2 text-white text-label-md font-medium hover:bg-sc-teal/90 disabled:opacity-60">
            {isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

export function StaffProfileView({ member: init, currentRole }: {
  member:      StaffRosterRow;
  currentRole: string;
}) {
  const [member, setMember]          = useState<StaffRosterRow>(init);
  const [showEdit, setShowEdit]      = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast]            = useState<{ msg: string; ok: boolean } | null>(null);

  const canManage = ADMIN_ROLES.includes(currentRole as UserRole);

  function flash(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); }

  function handleStatusToggle() {
    const newStatus = member.status === "active" ? "inactive" : "active";
    startTransition(async () => {
      const res = await setStaffStatus(member.id, newStatus);
      if (!res.success) { flash(res.error, false); return; }
      setMember((m) => ({ ...m, status: newStatus }));
      flash(newStatus === "active" ? "Member reactivated" : "Member deactivated");
    });
  }

  const bgCfg  = BG_CFG[member.background_check_status];
  const BgIcon = bgCfg.icon;
  const allRoles = [member.primary_role, ...member.additional_roles].filter(Boolean);
  const initials = `${member.first_name[0] ?? ""}${member.last_name[0] ?? ""}`.toUpperCase();

  const alerts: string[] = [];
  if (bgCfg.alert || isExpired(member.background_check_expires))     alerts.push("Background check expired or flagged");
  if (isExpiringSoon(member.background_check_expires))                alerts.push("Background check expiring within 60 days");
  if (TRAIN_CFG[member.training_status].alert || isExpired(member.training_expires_at)) alerts.push("Training expired");
  if (isExpiringSoon(member.training_expires_at))                     alerts.push("Training expiring within 60 days");
  if (member.cpr_status === "expired")                                alerts.push("CPR / First Aid expired");
  if (isExpiringSoon(member.cpr_expires_at))                          alerts.push("CPR / First Aid expiring within 60 days");

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/dashboard/staff" className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors">
        <ArrowLeft className="size-4" /> Back to Staff Directory
      </Link>

      {toast && (
        <div className={cn("rounded-xl px-4 py-3 text-label-sm border",
          toast.ok ? "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700" : "bg-sc-rose-50 border-sc-rose-200 text-sc-rose-700")}>
          {toast.msg}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-sc-rose mt-0.5 shrink-0" />
            <div>
              <p className="text-label-sm font-semibold text-sc-rose-700">Compliance Alerts</p>
              <ul className="mt-1 space-y-0.5">
                {alerts.map((a) => <li key={a} className="text-label-sm text-sc-rose-600">• {a}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {member.avatar_url
              ? <img src={member.avatar_url} alt="" className="size-16 rounded-2xl object-cover" />
              : <div className="size-16 rounded-2xl bg-sc-navy flex items-center justify-center text-white text-heading-2 font-bold">{initials}</div>
            }
            <div>
              <h1 className="font-serif text-heading-1 text-sc-navy">{member.full_name}</h1>
              {member.display_title && <p className="text-body-md text-sc-gray mt-0.5">{member.display_title}</p>}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {allRoles.map((r) => (
                  <span key={r} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                    ROLE_COLOR[r] ?? "bg-sc-gray-100 text-sc-gray-700 border-sc-gray-200")}>
                    {ROLE_LABELS[r as UserRole] ?? r}
                  </span>
                ))}
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize",
                  member.staff_type === "volunteer" ? "bg-sc-green-50 text-sc-green-700 border-sc-green-200"
                  : member.staff_type === "contractor" ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200")}>{member.staff_type}</span>
                {member.status !== "active" && (
                  <span className="rounded-full bg-sc-rose-50 border border-sc-rose-200 text-sc-rose-700 px-2.5 py-0.5 text-[11px] font-medium capitalize">{member.status}</span>
                )}
              </div>
            </div>
          </div>

          {canManage && (
            <div className="flex gap-2">
              <button onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-cream transition-colors">
                <Edit2 className="size-4" /> Edit
              </button>
              <button onClick={handleStatusToggle} disabled={isPending}
                className={cn("flex items-center gap-1.5 rounded-xl px-3 py-2 text-label-sm transition-colors disabled:opacity-60",
                  member.status === "active"
                    ? "border border-sc-rose-200 text-sc-rose-700 hover:bg-sc-rose-50"
                    : "border border-sc-teal-200 text-sc-teal-700 hover:bg-sc-teal-50")}>
                {member.status === "active"
                  ? <><UserX className="size-4" /> Deactivate</>
                  : <><UserCheck className="size-4" /> Reactivate</>}
              </button>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-sc-gray-100">
          {member.email && (
            <div className="flex items-center gap-2 text-label-sm text-sc-gray">
              <Mail className="size-4 text-sc-gray-400 shrink-0" />
              <a href={`mailto:${member.email}`} className="hover:text-sc-teal truncate">{member.email}</a>
            </div>
          )}
          {member.phone && (
            <div className="flex items-center gap-2 text-label-sm text-sc-gray">
              <Phone className="size-4 text-sc-gray-400 shrink-0" />
              <a href={`tel:${member.phone}`} className="hover:text-sc-teal">{member.phone}</a>
            </div>
          )}
          {member.start_date && (
            <div className="flex items-center gap-2 text-label-sm text-sc-gray">
              <Calendar className="size-4 text-sc-gray-400 shrink-0" />
              <span>Started {fmtDate(member.start_date)}</span>
            </div>
          )}
        </div>
        {member.bio && <p className="mt-4 pt-4 border-t border-sc-gray-100 text-body-sm text-sc-gray">{member.bio}</p>}
      </div>

      {/* Compliance — legacy flat fields */}
      <div>
        <h2 className="font-serif text-heading-3 text-sc-navy mb-3 flex items-center gap-2">
          <Shield className="size-5 text-sc-gray-400" /> Compliance Status (Legacy)
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <ComplianceRow icon={BgIcon} label="Background Screening"
            status={bgCfg.label} statusCls={bgCfg.cls} alert={bgCfg.alert}
            date={member.background_check_date} expires={member.background_check_expires} />
          <ComplianceRow icon={BookOpen} label="Training"
            status={TRAIN_CFG[member.training_status].label} statusCls={TRAIN_CFG[member.training_status].cls}
            alert={TRAIN_CFG[member.training_status].alert}
            date={member.training_completed_at} expires={member.training_expires_at} />
          <ComplianceRow icon={Heart} label="CPR / First Aid"
            status={CPR_CFG[member.cpr_status].label} statusCls={CPR_CFG[member.cpr_status].cls}
            alert={CPR_CFG[member.cpr_status].alert} expires={member.cpr_expires_at} />
        </div>
      </div>

      {/* Compliance — normalized records */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5">
        <h2 className="font-serif text-heading-3 text-sc-navy mb-4 flex items-center gap-2">
          <Shield className="size-5 text-sc-gray-400" /> Compliance Records
        </h2>
        <ComplianceSection
          staffMemberId={member.id}
          staffType={member.staff_type}
          isAdmin={canManage}
        />
      </div>

      {/* Emergency contact */}
      {(member.emergency_contact_name || member.emergency_contact_phone) && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5">
          <h2 className="font-serif text-heading-3 text-sc-navy mb-3 flex items-center gap-2">
            <User className="size-5 text-sc-gray-400" /> Emergency Contact
          </h2>
          <div className="flex flex-wrap gap-4 text-label-sm text-sc-gray">
            {member.emergency_contact_name  && <span className="font-semibold text-sc-navy">{member.emergency_contact_name}</span>}
            {member.emergency_contact_rel   && <span className="text-sc-gray-400">{member.emergency_contact_rel}</span>}
            {member.emergency_contact_phone && (
              <a href={`tel:${member.emergency_contact_phone}`} className="flex items-center gap-1 hover:text-sc-teal">
                <Phone className="size-3.5" /> {member.emergency_contact_phone}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5">
        <h2 className="font-serif text-heading-3 text-sc-navy mb-2 flex items-center gap-2">
          <Briefcase className="size-5 text-sc-gray-400" /> Documents & Files
        </h2>
        <p className="text-body-sm text-sc-gray-400">
          Background screening paperwork, training certificates, ID copies, and compliance documents will be linked from Google Drive. Coming soon.
        </p>
      </div>

      {/* Compliance notes */}
      {canManage && member.compliance_notes && (
        <div className="rounded-2xl border border-sc-rose-200 bg-sc-rose-50 p-5">
          <p className="text-label-sm font-semibold text-sc-rose uppercase tracking-wide mb-2">Admin Notes (Internal Only)</p>
          <p className="text-body-sm text-sc-gray whitespace-pre-wrap">{member.compliance_notes}</p>
        </div>
      )}

      {showEdit && (
        <EditForm member={member} onClose={() => setShowEdit(false)}
          onSaved={(updated) => setMember((m) => ({ ...m, ...updated }))} />
      )}
    </div>
  );
}
