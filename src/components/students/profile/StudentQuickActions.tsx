"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  UserCheck, LogOut, QrCode, StickyNote, AlertOctagon,
  Upload, Printer, Loader2, X, Check, AlertTriangle, Phone,
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
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100 sticky top-0 bg-white">
          <h2 className="font-serif text-heading-3 text-sc-navy">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100"><X className="size-4 text-sc-gray" /></button>
        </div>
        <div className="p-5">{children}</div>
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

// ── Checkout Modal ─────────────────────────────────────────────────────────

function CheckoutModal({ studentId, studentName, onClose, onDone }: {
  studentId: string; studentName: string; onClose: () => void; onDone: () => void;
}) {
  const [persons, setPersons]       = useState<PickupPerson[]>([]);
  const [loaded,  setLoaded]        = useState(false);
  const [releasedTo, setReleasedTo] = useState("");
  const [releasedToId, setReleasedToId] = useState<string | null>(null);
  const [notes, setNotes]           = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError]           = useState<string | null>(null);

  if (!loaded) {
    setLoaded(true);
    getPickupPersons(studentId).then(setPersons);
  }

  const authorized = persons.filter((p) => p.is_authorized && !p.requires_supervision && !p.is_emergency_only);
  const restricted = persons.filter((p) => !p.is_authorized || p.requires_supervision);

  function handleCheckout() {
    if (!releasedTo.trim()) { setError("Enter or select who is picking up."); return; }
    startTransition(async () => {
      const payload: CheckOutPayload = { released_to: releasedTo, released_to_id: releasedToId, notes };
      const res = await checkOutStudent(studentId, payload);
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <Modal title={`Check Out — ${studentName}`} onClose={onClose}>
      <div className="space-y-4">
        {authorized.length > 0 && (
          <div className="space-y-2">
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">Authorized Pickup</p>
            {authorized.map((p) => (
              <button key={p.id} onClick={() => { setReleasedTo(p.full_name); setReleasedToId(p.id); }}
                className={cn("w-full text-left rounded-xl border px-4 py-3 transition-colors",
                  releasedToId === p.id ? "border-sc-teal bg-sc-teal-50" : "border-sc-gray-100 hover:border-sc-teal hover:bg-sc-teal-50/40")}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-label-md font-semibold text-sc-navy">{p.full_name}</p>
                    <p className="text-label-sm text-sc-gray capitalize flex items-center gap-1">
                      {p.relationship}{p.phone && <><Phone className="size-3 ml-1" />{p.phone}</>}
                    </p>
                  </div>
                  {releasedToId === p.id && <Check className="size-4 text-sc-teal" />}
                </div>
              </button>
            ))}
          </div>
        )}
        {restricted.length > 0 && (
          <div className="space-y-2">
            <p className="text-label-sm font-semibold text-sc-rose uppercase tracking-wide">Restricted</p>
            {restricted.map((p) => (
              <div key={p.id} className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-4 py-3 flex items-center gap-2">
                <AlertTriangle className="size-4 text-sc-rose shrink-0" />
                <div>
                  <p className="text-label-md font-semibold text-sc-navy">{p.full_name}</p>
                  <p className="text-label-sm text-sc-rose font-medium">
                    {!p.is_authorized ? "NOT AUTHORIZED" : "SUPERVISED ONLY"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Released to *</label>
          <input value={releasedTo} onChange={(e) => { setReleasedTo(e.target.value); setReleasedToId(null); }}
            placeholder="Person picking up student"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional checkout notes…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        {error && <p className="text-label-sm text-sc-rose">{error}</p>}
        <div className="flex gap-3">
          <button onClick={handleCheckout} disabled={isPending}
            className="flex-1 rounded-xl bg-sc-navy py-2.5 text-white text-label-md font-medium disabled:opacity-60">
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
  todayAttendance:   TodayAttendance | null;
  attendanceQrToken: string | null;
}

type ActiveModal = "checkout" | "note" | "incident" | "worksample" | null;

export function StudentQuickActions({ studentId, studentName = "Student", todayAttendance, attendanceQrToken: _qr }: Props) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modal, setModal] = useState<ActiveModal>(null);

  const isCheckedIn  = !!todayAttendance?.check_in_at;
  const isCheckedOut = !!todayAttendance?.check_out_at;

  function handleCheckIn() {
    startTransition(async () => {
      const res = await checkInStudent(studentId, "manual");
      if (res.success) {
        setFeedback("Checked in ✓");
      } else {
        setFeedback(res.alreadyCheckedIn ? "Already checked in" : (res.error ?? "Error"));
      }
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  function handleModalDone() {
    setModal(null);
    setFeedback("Saved ✓");
    setTimeout(() => setFeedback(null), 2500);
  }

  return (
    <>
      <div className="space-y-2">
        {feedback && (
          <p className="text-label-sm text-sc-teal-700 font-medium bg-sc-teal-50 border border-sc-teal-200 rounded-lg px-3 py-1.5 inline-block">
            {feedback}
          </p>
        )}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
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

          <ActionButton label="Add Note" icon={<StickyNote className="size-4" />}
            onClick={() => setModal("note")} />

          <ActionButton label="Incident" icon={<AlertOctagon className="size-4" />}
            onClick={() => setModal("incident")} variant="rose" />

          <ActionButton label="Work Sample" icon={<Upload className="size-4" />}
            onClick={() => setModal("worksample")} />

          <ActionButton label="Print Badge" icon={<Printer className="size-4" />}
            href={`/dashboard/students/${studentId}/badge`} />
        </div>
      </div>

      {modal === "checkout"   && <CheckoutModal   studentId={studentId} studentName={studentName} onClose={() => setModal(null)} onDone={handleModalDone} />}
      {modal === "note"       && <NoteModal       studentId={studentId} onClose={() => setModal(null)} onDone={handleModalDone} />}
      {modal === "incident"   && <IncidentModal   studentId={studentId} studentName={studentName} onClose={() => setModal(null)} onDone={handleModalDone} />}
      {modal === "worksample" && <WorkSampleModal studentId={studentId} onClose={() => setModal(null)} onDone={handleModalDone} />}
    </>
  );
}
