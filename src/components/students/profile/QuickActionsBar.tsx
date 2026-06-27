"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  UserCheck, LogOut, StickyNote, AlertTriangle,
  FileText, QrCode, Printer, X, Check,
} from "lucide-react";
import {
  checkInStudent, checkOutStudent, addStaffNote, createIncident, addWorkSample,
  type CheckOutPayload, type StaffNotePayload, type IncidentPayload, type WorkSamplePayload,
} from "@/app/actions/studentActions";
import { getPickupPersons, type PickupPerson } from "@/app/actions/pickupPersons";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  studentName: string;
  checkedIn: boolean;
  checkedOut: boolean;
  onRefresh?: () => void;
}

type Modal = "checkout" | "note" | "incident" | "worksample" | null;

// ── Tiny inline modal shell ────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100">
          <h2 className="font-serif text-heading-3 text-sc-navy">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100 transition-colors">
            <X className="size-4 text-sc-gray" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Checkout Modal ─────────────────────────────────────────────────────────

function CheckoutModal({ studentId, studentName, onClose, onDone }: {
  studentId: string; studentName: string; onClose: () => void; onDone: () => void;
}) {
  const [pickupPersons, setPickupPersons] = useState<PickupPerson[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [releasedTo, setReleasedTo] = useState("");
  const [releasedToId, setReleasedToId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Load pickup persons once
  if (!loaded) {
    setLoaded(true);
    getPickupPersons(studentId).then(setPickupPersons);
  }

  function selectPerson(p: PickupPerson) {
    setReleasedTo(p.full_name);
    setReleasedToId(p.id);
  }

  function handleCheckout() {
    if (!releasedTo.trim()) { setError("Please enter or select who is picking up."); return; }
    startTransition(async () => {
      const payload: CheckOutPayload = { released_to: releasedTo, released_to_id: releasedToId, notes };
      const res = await checkOutStudent(studentId, payload);
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  const authorized   = pickupPersons.filter((p) => p.is_authorized && !p.requires_supervision);
  const restricted   = pickupPersons.filter((p) => !p.is_authorized || p.requires_supervision);

  return (
    <Modal title={`Check Out — ${studentName}`} onClose={onClose}>
      <div className="space-y-4">
        {/* Authorized pickup list */}
        {authorized.length > 0 && (
          <div className="space-y-2">
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">Authorized Pickup</p>
            {authorized.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPerson(p)}
                className={cn(
                  "w-full text-left rounded-xl border px-4 py-3 transition-colors",
                  releasedToId === p.id
                    ? "border-sc-teal bg-sc-teal-50"
                    : "border-sc-gray-100 hover:border-sc-teal hover:bg-sc-teal-50/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-label-md font-semibold text-sc-navy">{p.full_name}</p>
                    <p className="text-label-sm text-sc-gray capitalize">{p.relationship}{p.phone ? ` · ${p.phone}` : ""}</p>
                  </div>
                  {releasedToId === p.id && <Check className="size-4 text-sc-teal" />}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Restricted persons */}
        {restricted.length > 0 && (
          <div className="space-y-2">
            <p className="text-label-sm font-semibold text-sc-rose uppercase tracking-wide">Restrictions</p>
            {restricted.map((p) => (
              <div key={p.id} className="rounded-xl border border-sc-rose-300 bg-sc-rose-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-sc-rose shrink-0" />
                  <div>
                    <p className="text-label-md font-semibold text-sc-navy">{p.full_name}</p>
                    <p className="text-label-sm text-sc-rose font-medium">
                      {!p.is_authorized ? "NOT AUTHORIZED for pickup" : "SUPERVISED ONLY"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Manual entry */}
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">
            Released to *{pickupPersons.length > 0 ? " (or type a name)" : ""}
          </label>
          <input
            value={releasedTo}
            onChange={(e) => { setReleasedTo(e.target.value); setReleasedToId(null); }}
            placeholder="Person picking up student"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Checkout Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
        </div>

        {error && (
          <p className="text-label-sm text-sc-rose bg-sc-rose-50 border border-sc-rose-200 rounded-xl px-4 py-2">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleCheckout}
            disabled={isPending}
            className="flex-1 rounded-xl bg-sc-navy px-4 py-2.5 text-white text-label-md font-medium disabled:opacity-60 hover:bg-sc-navy/90"
          >
            {isPending ? "Checking out…" : "Confirm Checkout"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray hover:bg-sc-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Add Note Modal ─────────────────────────────────────────────────────────

function NoteModal({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<StaffNotePayload>({
    title: "", body: "", category: "", priority: "normal",
    is_pinned: false, follow_up: false, staff_only: true,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    startTransition(async () => {
      const res = await addStaffNote(studentId, form);
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <Modal title="Add Staff Note" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Title *</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Note title"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Details</label>
          <textarea
            rows={4}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Note details…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
            >
              <option value="">General</option>
              <option value="academic">Academic</option>
              <option value="behavioral">Behavioral</option>
              <option value="health">Health</option>
              <option value="family">Family</option>
              <option value="attendance">Attendance</option>
              <option value="progress">Progress</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Priority</label>
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          {[
            { key: "is_pinned",  label: "Pin to Profile" },
            { key: "follow_up",  label: "Follow-up Needed" },
            { key: "staff_only", label: "Staff Only (not shared)" },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-label-sm text-sc-navy cursor-pointer">
              <input
                type="checkbox"
                checked={form[key as keyof StaffNotePayload] as boolean}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                className="rounded"
              />
              {label}
            </label>
          ))}
        </div>
        {error && <p className="text-label-sm text-sc-rose">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 rounded-xl bg-sc-teal px-4 py-2.5 text-white text-label-md font-medium disabled:opacity-60 hover:bg-sc-teal/90"
          >
            {isPending ? "Saving…" : "Save Note"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray hover:bg-sc-gray-50">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Incident Modal ─────────────────────────────────────────────────────────

function IncidentModal({ studentId, studentName, onClose, onDone }: {
  studentId: string; studentName: string; onClose: () => void; onDone: () => void;
}) {
  const now = new Date().toISOString().slice(0, 16);
  const [form, setForm] = useState<IncidentPayload>({
    title: "", description: "", incident_type: "behavioral",
    severity: "medium", location: "", occurred_at: now, parent_notified: false,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    startTransition(async () => {
      const res = await createIncident(studentId, form);
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <Modal title={`Add Incident — ${studentName}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Title *</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Brief incident description"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Type</label>
            <select value={form.incident_type} onChange={(e) => setForm((f) => ({ ...f, incident_type: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
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
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Location</label>
            <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Classroom, gym…"
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Date/Time</label>
            <input type="datetime-local" value={form.occurred_at}
              onChange={(e) => setForm((f) => ({ ...f, occurred_at: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Description</label>
          <textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Detailed description of the incident…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <label className="flex items-center gap-2 text-label-sm text-sc-navy cursor-pointer">
          <input type="checkbox" checked={form.parent_notified}
            onChange={(e) => setForm((f) => ({ ...f, parent_notified: e.target.checked }))} className="rounded" />
          Parent/Guardian Notified
        </label>
        {error && <p className="text-label-sm text-sc-rose">{error}</p>}
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={isPending}
            className="flex-1 rounded-xl bg-sc-rose px-4 py-2.5 text-white text-label-md font-medium disabled:opacity-60 hover:bg-sc-rose/90">
            {isPending ? "Saving…" : "Submit Incident"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray hover:bg-sc-gray-50">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Work Sample Modal ──────────────────────────────────────────────────────

function WorkSampleModal({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<WorkSamplePayload>({
    title: "", subject: "", description: "", sample_date: new Date().toISOString().split("T")[0],
    external_url: "", parent_visible: true, yearbook_eligible: false,
    teacher_comments: "", quality_rating: null,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    startTransition(async () => {
      const res = await addWorkSample(studentId, form);
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <Modal title="Add Work Sample" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Title *</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Work sample title"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Subject</label>
            <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Math, ELA…"
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Date</label>
            <input type="date" value={form.sample_date} onChange={(e) => setForm((f) => ({ ...f, sample_date: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What was the assignment or activity?"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Link (Google Drive, etc.)</label>
          <input type="url" value={form.external_url} onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))}
            placeholder="https://drive.google.com/…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Teacher Comments</label>
          <textarea rows={2} value={form.teacher_comments} onChange={(e) => setForm((f) => ({ ...f, teacher_comments: e.target.value }))}
            placeholder="Teacher feedback…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="space-y-1">
          <label className="text-label-sm font-semibold text-sc-navy">Quality Rating (1–5)</label>
          <div className="flex gap-2">
            {[1,2,3,4,5].map((n) => (
              <button key={n} onClick={() => setForm((f) => ({ ...f, quality_rating: n }))}
                className={cn("w-9 h-9 rounded-lg border text-label-md font-bold transition-colors",
                  form.quality_rating === n ? "bg-sc-gold text-white border-sc-gold" : "border-sc-gray-200 text-sc-gray hover:border-sc-gold")}>
                {n}
              </button>
            ))}
            <button onClick={() => setForm((f) => ({ ...f, quality_rating: null }))}
              className="px-3 rounded-lg border border-sc-gray-200 text-label-sm text-sc-gray hover:border-sc-gray-300">
              Clear
            </button>
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-label-sm text-sc-navy cursor-pointer">
            <input type="checkbox" checked={form.parent_visible}
              onChange={(e) => setForm((f) => ({ ...f, parent_visible: e.target.checked }))} className="rounded" />
            Parent Visible
          </label>
          <label className="flex items-center gap-2 text-label-sm text-sc-navy cursor-pointer">
            <input type="checkbox" checked={form.yearbook_eligible}
              onChange={(e) => setForm((f) => ({ ...f, yearbook_eligible: e.target.checked }))} className="rounded" />
            Yearbook Eligible
          </label>
        </div>
        {error && <p className="text-label-sm text-sc-rose">{error}</p>}
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={isPending}
            className="flex-1 rounded-xl bg-sc-teal px-4 py-2.5 text-white text-label-md font-medium disabled:opacity-60 hover:bg-sc-teal/90">
            {isPending ? "Saving…" : "Add Work Sample"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray hover:bg-sc-gray-50">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Quick Actions Bar ─────────────────────────────────────────────────

export function QuickActionsBar({ studentId, studentName, checkedIn, checkedOut, onRefresh }: Props) {
  const [modal, setModal]   = useState<Modal>(null);
  const [isPending, startTransition] = useTransition();
  const [checkinMsg, setCheckinMsg] = useState<string | null>(null);

  function handleCheckin() {
    startTransition(async () => {
      const res = await checkInStudent(studentId);
      if (!res.success) {
        setCheckinMsg(res.error);
      } else if (res.already) {
        setCheckinMsg("Already checked in today");
      } else {
        setCheckinMsg("Checked in ✓");
        onRefresh?.();
      }
      setTimeout(() => setCheckinMsg(null), 3000);
    });
  }

  function handleDone() {
    setModal(null);
    onRefresh?.();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-sc-gray-100 bg-sc-cream/40">
        {/* Check In */}
        {!checkedIn && !checkedOut && (
          <button
            onClick={handleCheckin}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-xl bg-sc-teal px-3 py-1.5 text-white text-label-sm font-medium disabled:opacity-60 hover:bg-sc-teal/90 transition-colors"
          >
            <UserCheck className="size-3.5" />
            {isPending ? "Checking in…" : "Check In"}
          </button>
        )}

        {/* Check Out */}
        {checkedIn && !checkedOut && (
          <button
            onClick={() => setModal("checkout")}
            className="flex items-center gap-1.5 rounded-xl bg-sc-navy px-3 py-1.5 text-white text-label-sm font-medium hover:bg-sc-navy/90 transition-colors"
          >
            <LogOut className="size-3.5" /> Check Out
          </button>
        )}

        {/* Already checked out */}
        {checkedOut && (
          <span className="flex items-center gap-1.5 rounded-xl bg-sc-gray-100 px-3 py-1.5 text-label-sm text-sc-gray">
            <LogOut className="size-3.5" /> Checked Out
          </span>
        )}

        <button
          onClick={() => setModal("note")}
          className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-gray font-medium hover:border-sc-teal hover:text-sc-teal transition-colors"
        >
          <StickyNote className="size-3.5" /> Add Note
        </button>

        <button
          onClick={() => setModal("incident")}
          className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-gray font-medium hover:border-sc-rose hover:text-sc-rose transition-colors"
        >
          <AlertTriangle className="size-3.5" /> Incident
        </button>

        <button
          onClick={() => setModal("worksample")}
          className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-gray font-medium hover:border-sc-teal hover:text-sc-teal transition-colors"
        >
          <FileText className="size-3.5" /> Work Sample
        </button>

        <Link
          href={`/dashboard/attendance/scan`}
          className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-gray font-medium hover:border-sc-teal hover:text-sc-teal transition-colors"
        >
          <QrCode className="size-3.5" /> Scan Badge
        </Link>

        <Link
          href={`/dashboard/students/${studentId}/badge`}
          className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-gray font-medium hover:border-sc-navy hover:text-sc-navy transition-colors"
        >
          <Printer className="size-3.5" /> Print Badge
        </Link>

        {checkinMsg && (
          <span className="flex items-center gap-1.5 rounded-xl bg-sc-teal-50 border border-sc-teal-200 px-3 py-1.5 text-label-sm text-sc-teal-700">
            {checkinMsg}
          </span>
        )}
      </div>

      {/* Modals */}
      {modal === "checkout"   && <CheckoutModal   studentId={studentId} studentName={studentName} onClose={() => setModal(null)} onDone={handleDone} />}
      {modal === "note"       && <NoteModal       studentId={studentId} onClose={() => setModal(null)} onDone={handleDone} />}
      {modal === "incident"   && <IncidentModal   studentId={studentId} studentName={studentName} onClose={() => setModal(null)} onDone={handleDone} />}
      {modal === "worksample" && <WorkSampleModal studentId={studentId} onClose={() => setModal(null)} onDone={handleDone} />}
    </>
  );
}
