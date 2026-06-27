"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  UserCheck, LogOut, QrCode, StickyNote, AlertOctagon,
  Upload, Printer, Loader2, X, Check, AlertTriangle, Phone,
  ShieldCheck, ShieldOff, ShieldAlert, Eye, User,
} from "lucide-react";
import { checkInStudent } from "@/app/actions/attendance";
import {
  checkOutStudent, addStaffNote, createIncident, addWorkSample,
  type CheckOutPayload, type StaffNotePayload,
  type IncidentPayload, type WorkSamplePayload,
} from "@/app/actions/studentActions";
import { getPickupPersons, type PickupPerson } from "@/app/actions/pickupPersons";
import type { TodayAttendance } from "./types";
import { cn } from "@/lib/utils";

// ── Inline Modal ───────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100 sticky top-0 bg-white">
          <h2 className="font-serif text-heading-3 text-sc-navy">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100"><X className="size-4 text-sc-gray" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Action Button ──────────────────────────────────────────────────────────

function ActionButton({
  label, icon, onClick, href, disabled, loading, variant = "default",
}: {
  label: string; icon: React.ReactNode; onClick?: () => void; href?: string;
  disabled?: boolean; loading?: boolean; variant?: "default" | "teal" | "rose" | "navy";
}) {
  const base = "flex flex-col items-center gap-1.5 rounded-xl px-3 py-2.5 text-label-sm font-medium transition-all min-w-[72px] shrink-0";
  const styles = {
    default: "bg-sc-gray-50 text-sc-gray hover:bg-sc-gray-100 border border-sc-gray-200",
    teal:    "bg-sc-teal-50 text-sc-teal hover:bg-sc-teal hover:text-white border border-sc-teal-200",
    rose:    "bg-sc-rose-50 text-sc-rose-700 hover:bg-sc-rose hover:text-white border border-sc-rose-200",
    navy:    "bg-sc-navy-50 text-sc-navy hover:bg-sc-navy hover:text-white border border-sc-navy-200",
  };
  const cls = cn(base, styles[variant], (disabled || loading) && "opacity-40 pointer-events-none");
  const content = (
    <>
      <span className="size-5 flex items-center justify-center">
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      </span>
      <span className="text-center leading-tight">{label}</span>
    </>
  );
  if (href) return <Link href={href} className={cls}>{content}</Link>;
  return <button onClick={onClick} disabled={disabled || loading} className={cls}>{content}</button>;
}

// ── Pickup Person Card ─────────────────────────────────────────────────────

type PickupStatus = "authorized" | "emergency" | "supervised" | "not_authorized";

function pickupStatus(p: PickupPerson): PickupStatus {
  if (!p.is_authorized) return "not_authorized";
  if (p.requires_supervision) return "supervised";
  if (p.is_emergency_only) return "emergency";
  return "authorized";
}

const STATUS_META: Record<PickupStatus, { label: string; icon: React.ElementType; cardCls: string; badgeCls: string }> = {
  authorized:     { label: "Authorized",      icon: ShieldCheck,  cardCls: "", badgeCls: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200" },
  emergency:      { label: "Emergency Only",  icon: ShieldAlert,  cardCls: "border-sc-gold-200 bg-sc-gold-50/40", badgeCls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200" },
  supervised:     { label: "Supervised Only", icon: Eye,          cardCls: "border-sc-gold-200 bg-sc-gold-50/40", badgeCls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200" },
  not_authorized: { label: "NOT AUTHORIZED",  icon: ShieldOff,    cardCls: "border-sc-rose-200 bg-sc-rose-50/60", badgeCls: "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200" },
};

// ── Full Checkout Modal ────────────────────────────────────────────────────

function CheckoutModal({
  studentId, studentName, gradeLevel, checkInAt, isAdmin, onClose, onDone,
}: {
  studentId:  string;
  studentName: string;
  gradeLevel:  string | null;
  checkInAt:   string | null;
  isAdmin:     boolean;
  onClose: () => void;
  onDone:  () => void;
}) {
  const [persons, setPersons]       = useState<PickupPerson[]>([]);
  const [loaded, setLoaded]         = useState(false);

  // Selection state
  const [selectedId, setSelectedId]           = useState<string | null>(null);
  const [manualName, setManualName]           = useState("");
  const [manualRel, setManualRel]             = useState("");
  const [manualPhone, setManualPhone]         = useState("");
  const [checkoutNotes, setCheckoutNotes]     = useState("");
  const [supervisedNote, setSupervisedNote]   = useState("");
  const [overrideReason, setOverrideReason]   = useState("");
  const [showManual, setShowManual]           = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  // Load pickup persons once
  if (!loaded) {
    setLoaded(true);
    getPickupPersons(studentId).then(setPersons);
  }

  const selectedPerson = persons.find((p) => p.id === selectedId) ?? null;
  const selStatus = selectedPerson ? pickupStatus(selectedPerson) : null;

  const isBlocked  = selStatus === "not_authorized" && !isAdmin;
  const needsSupNote = selStatus === "supervised" && !supervisedNote.trim();
  const needsOverride = selStatus === "not_authorized" && isAdmin && !overrideReason.trim();

  function fmtTime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function handleSelect(p: PickupPerson) {
    setSelectedId(p.id);
    setShowManual(false);
    setManualName(p.full_name);
    setManualRel(p.relationship ?? "");
    setManualPhone(p.phone ?? "");
  }

  function handleCheckout() {
    const name = showManual ? manualName.trim() : (selectedPerson?.full_name ?? manualName.trim());
    if (!name) { setError("Enter or select who is picking up."); return; }
    if (isBlocked) { setError("This person is NOT AUTHORIZED. Only admins can override."); return; }
    if (needsSupNote) { setError("Supervised-only pickup requires a confirmation note."); return; }
    if (needsOverride) { setError("An override reason is required."); return; }

    startTransition(async () => {
      const payload: CheckOutPayload = {
        released_to:              name,
        released_to_id:           showManual ? null : selectedId,
        released_to_relationship: showManual ? manualRel || null : (selectedPerson?.relationship ?? null),
        released_to_phone:        showManual ? manualPhone || null : (selectedPerson?.phone ?? null),
        notes:                    [checkoutNotes, supervisedNote].filter(Boolean).join(" | "),
        override_used:            selStatus === "not_authorized" && isAdmin,
        override_reason:          selStatus === "not_authorized" && isAdmin ? overrideReason : null,
      };
      const res = await checkOutStudent(studentId, payload);
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  const authorized   = persons.filter((p) => pickupStatus(p) === "authorized");
  const emergency    = persons.filter((p) => pickupStatus(p) === "emergency");
  const supervised   = persons.filter((p) => pickupStatus(p) === "supervised");
  const notAuth      = persons.filter((p) => pickupStatus(p) === "not_authorized");

  return (
    <Modal title={`Check Out — ${studentName}`} onClose={onClose}>
      <div className="space-y-5">

        {/* Student info */}
        <div className="rounded-xl bg-sc-navy/5 border border-sc-navy-100 px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-label-sm text-sc-navy">
            <User className="size-4 text-sc-gray-400" />
            <span className="font-semibold">{studentName}</span>
            {gradeLevel && <span className="text-sc-gray">· {gradeLevel}</span>}
          </div>
          {checkInAt && (
            <div className="flex items-center gap-1.5 text-label-sm text-sc-teal-700">
              <Check className="size-3.5" />
              Checked in at {fmtTime(checkInAt)}
            </div>
          )}
        </div>

        {/* Authorized pickup list */}
        {authorized.length > 0 && (
          <section>
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-2">Authorized Pickup</p>
            <div className="space-y-2">
              {authorized.map((p) => (
                <button key={p.id} onClick={() => handleSelect(p)}
                  className={cn("w-full text-left rounded-xl border px-4 py-3 transition-colors",
                    selectedId === p.id && !showManual
                      ? "border-sc-teal bg-sc-teal-50"
                      : "border-sc-gray-100 hover:border-sc-teal hover:bg-sc-teal-50/30")}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-label-md font-semibold text-sc-navy">{p.full_name}</p>
                      <p className="text-label-sm text-sc-gray capitalize flex items-center gap-2">
                        {p.relationship}
                        {p.phone && <><Phone className="size-3 ml-0.5" />{p.phone}</>}
                      </p>
                    </div>
                    {selectedId === p.id && !showManual && <Check className="size-4 text-sc-teal shrink-0" />}
                  </div>
                  {isAdmin && p.admin_only_notes && (
                    <p className="mt-1.5 text-label-sm text-sc-rose-700 bg-sc-rose-50 rounded-lg px-2 py-1">
                      🔒 Admin: {p.admin_only_notes}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Emergency-only list */}
        {emergency.length > 0 && (
          <section>
            <p className="text-label-sm font-semibold text-sc-gold-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ShieldAlert className="size-3.5" /> Emergency Contacts (pickup in emergency only)
            </p>
            <div className="space-y-2">
              {emergency.map((p) => {
                const meta = STATUS_META.emergency;
                return (
                  <button key={p.id} onClick={() => handleSelect(p)}
                    className={cn("w-full text-left rounded-xl border px-4 py-3 transition-colors",
                      meta.cardCls,
                      selectedId === p.id && !showManual ? "ring-2 ring-sc-gold" : "hover:ring-1 hover:ring-sc-gold-300")}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-label-md font-semibold text-sc-navy">{p.full_name}</p>
                        <p className="text-label-sm text-sc-gray capitalize flex items-center gap-2">
                          {p.relationship}
                          {p.phone && <><Phone className="size-3 ml-0.5" />{p.phone}</>}
                        </p>
                        <span className={cn("inline-block mt-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", meta.badgeCls)}>
                          {meta.label}
                        </span>
                      </div>
                      {selectedId === p.id && !showManual && <Check className="size-4 text-sc-gold shrink-0" />}
                    </div>
                    {p.restriction_notes && (
                      <p className="mt-1.5 text-label-sm text-sc-gold-700 bg-sc-gold-50 rounded-lg px-2 py-1">
                        {p.restriction_notes}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Supervised-only list */}
        {supervised.length > 0 && (
          <section>
            <p className="text-label-sm font-semibold text-sc-gold-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Eye className="size-3.5" /> Supervised Only
            </p>
            <div className="space-y-2">
              {supervised.map((p) => {
                const meta = STATUS_META.supervised;
                return (
                  <button key={p.id} onClick={() => handleSelect(p)}
                    className={cn("w-full text-left rounded-xl border px-4 py-3 transition-colors",
                      meta.cardCls,
                      selectedId === p.id && !showManual ? "ring-2 ring-sc-gold" : "hover:ring-1 hover:ring-sc-gold-300")}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-label-md font-semibold text-sc-navy">{p.full_name}</p>
                        <p className="text-label-sm text-sc-gray capitalize flex items-center gap-2">
                          {p.relationship}
                          {p.phone && <><Phone className="size-3 ml-0.5" />{p.phone}</>}
                        </p>
                        <span className={cn("inline-block mt-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", meta.badgeCls)}>
                          {meta.label}
                        </span>
                      </div>
                      {selectedId === p.id && !showManual && <Check className="size-4 text-sc-gold shrink-0" />}
                    </div>
                    {p.restriction_notes && (
                      <p className="mt-1.5 text-label-sm text-sc-gold-700 bg-sc-gold-50 rounded-lg px-2 py-1">
                        {p.restriction_notes}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* NOT AUTHORIZED list */}
        {notAuth.length > 0 && (
          <section>
            <p className="text-label-sm font-semibold text-sc-rose-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ShieldOff className="size-3.5" /> Not Authorized
            </p>
            <div className="space-y-2">
              {notAuth.map((p) => (
                <div key={p.id} className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-sc-rose shrink-0" />
                    <div className="flex-1">
                      <p className="text-label-md font-semibold text-sc-navy">{p.full_name}</p>
                      <p className="text-label-sm text-sc-rose-700 font-semibold">DO NOT RELEASE TO THIS PERSON</p>
                      {p.restriction_notes && (
                        <p className="text-label-sm text-sc-rose-600 mt-0.5">{p.restriction_notes}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <button onClick={() => { setSelectedId(p.id); setShowManual(false); setManualName(p.full_name); setManualRel(p.relationship ?? ""); setManualPhone(p.phone ?? ""); }}
                        className={cn("shrink-0 px-2 py-1 rounded-lg text-label-sm border transition-colors",
                          selectedId === p.id && !showManual
                            ? "border-sc-rose-400 bg-sc-rose-100 text-sc-rose-800 font-semibold"
                            : "border-sc-rose-200 text-sc-rose-700 hover:bg-sc-rose-100")}>
                        {selectedId === p.id && !showManual ? "Selected (Override)" : "Admin Override"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Supervised-only confirmation note */}
        {selStatus === "supervised" && (
          <div className="rounded-xl border border-sc-gold-200 bg-sc-gold-50 px-4 py-3 space-y-2">
            <p className="text-label-sm font-semibold text-sc-gold-700 flex items-center gap-1.5">
              <Eye className="size-3.5" /> Supervised Only — Confirmation Required
            </p>
            <p className="text-label-sm text-sc-gold-700">This person must be supervised. Confirm supervision arrangement.</p>
            <textarea rows={2} value={supervisedNote} onChange={(e) => setSupervisedNote(e.target.value)}
              placeholder="Who is supervising? Where? (required)"
              className="w-full rounded-lg border border-sc-gold-300 bg-white px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-gold" />
          </div>
        )}

        {/* Admin override reason */}
        {selStatus === "not_authorized" && isAdmin && (
          <div className="rounded-xl border border-sc-rose-300 bg-sc-rose-50 px-4 py-3 space-y-2">
            <p className="text-label-sm font-semibold text-sc-rose-700 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" /> Admin Override — Override Reason Required
            </p>
            <p className="text-label-sm text-sc-rose-600">You are overriding a NOT AUTHORIZED restriction. This will be logged.</p>
            <textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Reason for override (required)"
              className="w-full rounded-lg border border-sc-rose-300 bg-white px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-rose" />
          </div>
        )}

        {/* Block message for non-admins trying to release to NOT AUTHORIZED */}
        {selStatus === "not_authorized" && !isAdmin && (
          <div className="rounded-xl border border-sc-rose-400 bg-sc-rose-100 px-4 py-3">
            <p className="text-label-sm font-semibold text-sc-rose-800 flex items-center gap-2">
              <AlertTriangle className="size-4" /> Checkout blocked. Contact an admin to override.
            </p>
          </div>
        )}

        {/* Manual entry */}
        <div>
          <button onClick={() => { setShowManual((v) => !v); setSelectedId(null); }}
            className="text-label-sm text-sc-teal hover:underline">
            {showManual ? "← Back to pickup list" : "+ Enter pickup name manually"}
          </button>
          {showManual && (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <label className="text-label-sm font-semibold text-sc-navy">Name *</label>
                <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Full name"
                  className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-label-sm font-semibold text-sc-navy">Relationship</label>
                  <input value={manualRel} onChange={(e) => setManualRel(e.target.value)} placeholder="Parent, uncle…"
                    className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-label-sm font-semibold text-sc-navy">Phone</label>
                  <input type="tel" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="(555) 000-0000"
                    className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Checkout notes */}
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Checkout Notes (optional)</label>
          <textarea rows={2} value={checkoutNotes} onChange={(e) => setCheckoutNotes(e.target.value)}
            placeholder="Any notes for this checkout…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {error && (
          <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
        )}

        <div className="flex gap-3">
          <button onClick={handleCheckout} disabled={isPending || isBlocked || needsSupNote || needsOverride}
            className="flex-1 rounded-xl bg-sc-navy py-2.5 text-white text-label-md font-medium disabled:opacity-50">
            {isPending ? "Checking out…" : "Confirm Checkout"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Note Modal ─────────────────────────────────────────────────────────────

function NoteModal({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<StaffNotePayload>({
    title: "", body: "", category: "", priority: "normal", is_pinned: false, follow_up: false, staff_only: true,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title="Add Staff Note" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Title *</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Note title"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Details</label>
          <textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Note details…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Category</label>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal">
              <option value="">General</option>
              <option value="academic">Academic</option>
              <option value="behavioral">Behavioral</option>
              <option value="health">Health</option>
              <option value="family">Family</option>
              <option value="attendance">Attendance</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Priority</label>
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          {[["is_pinned","Pin to Profile"],["follow_up","Follow-up Needed"],["staff_only","Staff Only"]].map(([k,l]) => (
            <label key={k} className="flex items-center gap-2 text-label-sm cursor-pointer">
              <input type="checkbox" checked={form[k as keyof StaffNotePayload] as boolean}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} className="rounded" />
              {l}
            </label>
          ))}
        </div>
        {error && <p className="text-label-sm text-sc-rose">{error}</p>}
        <div className="flex gap-3">
          <button disabled={isPending} onClick={() => {
            if (!form.title.trim()) { setError("Title required"); return; }
            startTransition(async () => {
              const res = await addStaffNote(studentId, form);
              if (!res.success) { setError(res.error); return; }
              onDone();
            });
          }} className="flex-1 rounded-xl bg-sc-teal py-2.5 text-white text-label-md font-medium disabled:opacity-60">
            {isPending ? "Saving…" : "Save Note"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Incident Modal ─────────────────────────────────────────────────────────

function IncidentModal({ studentId, studentName, onClose, onDone }: {
  studentId: string; studentName: string; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState<IncidentPayload>({
    title: "", description: "", incident_type: "behavioral", severity: "medium",
    location: "", occurred_at: new Date().toISOString().slice(0, 16), parent_notified: false,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={`Incident — ${studentName}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Title *</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Brief description"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Type</label>
            <select value={form.incident_type} onChange={(e) => setForm((f) => ({ ...f, incident_type: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal">
              <option value="behavioral">Behavioral</option>
              <option value="medical">Medical</option>
              <option value="safety">Safety</option>
              <option value="property">Property</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Severity</label>
            <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Location</label>
            <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Where?"
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">When</label>
            <input type="datetime-local" value={form.occurred_at} onChange={(e) => setForm((f) => ({ ...f, occurred_at: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Description</label>
          <textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What happened?"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <label className="flex items-center gap-2 text-label-sm cursor-pointer">
          <input type="checkbox" checked={form.parent_notified}
            onChange={(e) => setForm((f) => ({ ...f, parent_notified: e.target.checked }))} className="rounded" />
          Parent/Guardian Notified
        </label>
        {error && <p className="text-label-sm text-sc-rose">{error}</p>}
        <div className="flex gap-3">
          <button disabled={isPending} onClick={() => {
            if (!form.title.trim()) { setError("Title required"); return; }
            startTransition(async () => {
              const res = await createIncident(studentId, form);
              if (!res.success) { setError(res.error); return; }
              onDone();
            });
          }} className="flex-1 rounded-xl bg-sc-rose py-2.5 text-white text-label-md font-medium disabled:opacity-60">
            {isPending ? "Saving…" : "Submit Incident"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Work Sample Modal ──────────────────────────────────────────────────────

function WorkSampleModal({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<WorkSamplePayload>({
    title: "", subject: "", description: "", sample_date: new Date().toISOString().split("T")[0],
    external_url: "", parent_visible: true, yearbook_eligible: false, teacher_comments: "", quality_rating: null,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title="Add Work Sample" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Title *</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Work sample title"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Subject</label>
            <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Math, ELA…"
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Date</label>
            <input type="date" value={form.sample_date} onChange={(e) => setForm((f) => ({ ...f, sample_date: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What was the task?"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Link</label>
          <input type="url" value={form.external_url} onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))}
            placeholder="https://drive.google.com/…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Teacher Comments</label>
          <textarea rows={2} value={form.teacher_comments} onChange={(e) => setForm((f) => ({ ...f, teacher_comments: e.target.value }))}
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="space-y-1">
          <label className="text-label-sm font-semibold text-sc-navy">Quality Rating</label>
          <div className="flex gap-2 flex-wrap">
            {[1,2,3,4,5].map((n) => (
              <button key={n} onClick={() => setForm((f) => ({ ...f, quality_rating: n }))}
                className={cn("w-9 h-9 rounded-lg border text-label-md font-bold",
                  form.quality_rating === n ? "bg-sc-gold text-white border-sc-gold" : "border-sc-gray-200 text-sc-gray hover:border-sc-gold")}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-label-sm cursor-pointer">
            <input type="checkbox" checked={form.parent_visible}
              onChange={(e) => setForm((f) => ({ ...f, parent_visible: e.target.checked }))} className="rounded" />
            Parent Visible
          </label>
          <label className="flex items-center gap-2 text-label-sm cursor-pointer">
            <input type="checkbox" checked={form.yearbook_eligible}
              onChange={(e) => setForm((f) => ({ ...f, yearbook_eligible: e.target.checked }))} className="rounded" />
            Yearbook Eligible
          </label>
        </div>
        {error && <p className="text-label-sm text-sc-rose">{error}</p>}
        <div className="flex gap-3">
          <button disabled={isPending} onClick={() => {
            if (!form.title.trim()) { setError("Title required"); return; }
            startTransition(async () => {
              const res = await addWorkSample(studentId, form);
              if (!res.success) { setError(res.error); return; }
              onDone();
            });
          }} className="flex-1 rounded-xl bg-sc-teal py-2.5 text-white text-label-md font-medium disabled:opacity-60">
            {isPending ? "Saving…" : "Add Work Sample"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  studentId:         string;
  studentName?:      string;
  gradeLevel?:       string | null;
  todayAttendance:   TodayAttendance | null;
  attendanceQrToken: string | null;
  role?:             string;
  isAdmin?:          boolean;
}

type ActiveModal = "checkout" | "note" | "incident" | "worksample" | null;

export function StudentQuickActions({
  studentId,
  studentName = "Student",
  gradeLevel = null,
  todayAttendance,
  attendanceQrToken: _qr,
  role = "staff",
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback]   = useState<string | null>(null);
  const [modal, setModal]         = useState<ActiveModal>(null);

  const isCheckedIn  = !!todayAttendance?.check_in_at;
  const isCheckedOut = !!todayAttendance?.check_out_at;
  const isVolunteer  = role === "volunteer";
  const isParent     = role === "parent";

  function handleCheckIn() {
    startTransition(async () => {
      const res = await checkInStudent(studentId, "manual");
      if (res.success) {
        setFeedback("Checked in ✓");
        router.refresh(); // update header attendance chip
      } else {
        setFeedback(res.alreadyCheckedIn ? "Already checked in" : (res.error ?? "Error"));
      }
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  function handleModalDone() {
    setModal(null);
    setFeedback("Saved ✓");
    router.refresh(); // update header attendance chip after checkout / other actions
    setTimeout(() => setFeedback(null), 2500);
  }

  if (isParent) return null;

  return (
    <>
      <div className="space-y-2">
        {feedback && (
          <p className="text-label-sm text-sc-teal-700 font-medium bg-sc-teal-50 border border-sc-teal-200 rounded-lg px-3 py-1.5 inline-block">
            {feedback}
          </p>
        )}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {/* Check in / check out */}
          {!isCheckedIn && !isCheckedOut ? (
            <ActionButton label="Check In" icon={<UserCheck className="size-4" />}
              onClick={handleCheckIn} loading={pending} variant="teal" />
          ) : isCheckedIn && !isCheckedOut ? (
            <ActionButton label="Check Out" icon={<LogOut className="size-4" />}
              onClick={() => setModal("checkout")} variant="navy" />
          ) : (
            <ActionButton label="Checked Out" icon={<LogOut className="size-4" />}
              disabled variant="navy" />
          )}

          <ActionButton label="Scan Badge" icon={<QrCode className="size-4" />}
            href="/dashboard/attendance/scan" />

          {/* Volunteers can't add notes or incidents */}
          {!isVolunteer && (
            <ActionButton label="Add Note" icon={<StickyNote className="size-4" />}
              onClick={() => setModal("note")} />
          )}

          {!isVolunteer && (
            <ActionButton label="Incident" icon={<AlertOctagon className="size-4" />}
              onClick={() => setModal("incident")} variant="rose" />
          )}

          {!isVolunteer && (
            <ActionButton label="Work Sample" icon={<Upload className="size-4" />}
              onClick={() => setModal("worksample")} />
          )}

          <ActionButton label="Print Badge" icon={<Printer className="size-4" />}
            href={`/dashboard/students/${studentId}/badge`} />
        </div>
      </div>

      {modal === "checkout" && (
        <CheckoutModal
          studentId={studentId}
          studentName={studentName}
          gradeLevel={gradeLevel}
          checkInAt={todayAttendance?.check_in_at ?? null}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onDone={handleModalDone}
        />
      )}
      {modal === "note"       && <NoteModal       studentId={studentId} onClose={() => setModal(null)} onDone={handleModalDone} />}
      {modal === "incident"   && <IncidentModal   studentId={studentId} studentName={studentName} onClose={() => setModal(null)} onDone={handleModalDone} />}
      {modal === "worksample" && <WorkSampleModal studentId={studentId} onClose={() => setModal(null)} onDone={handleModalDone} />}
    </>
  );
}
