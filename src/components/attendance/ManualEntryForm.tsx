"use client";

import { useState, useEffect, useTransition } from "react";
import { Save, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface StudentOption {
  id: string;
  display_name: string;
  student_display_id: string | null;
}

interface ManualEntryFormProps {
  onSaved?: () => void;
}

const STATUS_OPTIONS = [
  { value: "present",  label: "Present" },
  { value: "absent",   label: "Absent" },
  { value: "late",     label: "Late Arrival" },
  { value: "early_pickup", label: "Early Pickup" },
];

export function ManualEntryForm({ onSaved }: ManualEntryFormProps) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [search,   setSearch]   = useState("");
  const [studentId, setStudentId] = useState("");
  const [date,     setDate]     = useState(new Date().toISOString().split("T")[0]);
  const [status,   setStatus]   = useState("present");
  const [checkIn,  setCheckIn]  = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [notes,    setNotes]    = useState("");
  const [isLate,   setIsLate]   = useState(false);
  const [isEarlyPickup, setIsEarlyPickup] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("sc_active_org");
    if (!orgId) return;
    const supabase = createClient();
    supabase
      .from("students")
      .select("id, first_name, last_name, preferred_name, student_display_id")
      .eq("organization_id", orgId)
      .eq("enrollment_status", "enrolled")
      .is("archived_at", null)
      .order("last_name")
      .then(({ data }) => {
        if (!data) return;
        setStudents(data.map((s) => ({
          id: s.id,
          display_name: `${s.last_name}, ${s.first_name}${s.preferred_name ? ` (${s.preferred_name})` : ""}`,
          student_display_id: s.student_display_id,
        })));
      });
  }, []);

  const filtered = students.filter((s) =>
    s.display_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.student_display_id ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function handleSave() {
    if (!studentId) { setMessage({ text: "Please select a student.", ok: false }); return; }
    const orgId = localStorage.getItem("sc_active_org");
    if (!orgId) { setMessage({ text: "No active organization.", ok: false }); return; }

    startTransition(async () => {
      const supabase = createClient();
      // Build timestamps from date + time
      const checkInAt  = checkIn  ? `${date}T${checkIn}:00` : null;
      const checkOutAt = checkOut ? `${date}T${checkOut}:00` : null;

      // Upsert attendance record for this student+date
      const { error } = await supabase
        .from("attendance_records")
        .upsert({
          organization_id: orgId,
          student_id:      studentId,
          date,
          status:          status === "late" ? "present" : status,
          check_in_at:     checkInAt,
          check_out_at:    checkOutAt,
          is_late:         isLate || status === "late",
          is_early_pickup: isEarlyPickup || status === "early_pickup",
          notes:           notes || null,
        } as never, {
          onConflict: "student_id,date",
        });

      if (error) {
        setMessage({ text: `Error: ${error.message}`, ok: false });
      } else {
        setMessage({ text: "Attendance record saved.", ok: true });
        onSaved?.();
        // Reset form
        setStudentId(""); setSearch(""); setCheckIn(""); setCheckOut("");
        setNotes(""); setIsLate(false); setIsEarlyPickup(false); setStatus("present");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-6 max-w-2xl">
      <h2 className="font-serif text-heading-3 text-sc-navy mb-5">Manual Attendance Entry</h2>

      <div className="space-y-4">
        {/* Student search */}
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Student *</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setStudentId(""); }}
              placeholder="Search by name or ID…"
              className="w-full rounded-xl border border-sc-gray-200 pl-9 pr-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
            />
          </div>
          {search && !studentId && filtered.length > 0 && (
            <div className="rounded-xl border border-sc-gray-100 bg-white shadow-card max-h-48 overflow-y-auto">
              {filtered.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setStudentId(s.id); setSearch(s.display_name); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-sc-cream text-label-md text-sc-navy border-b border-sc-gray-50 last:border-0"
                >
                  {s.display_name}
                  {s.student_display_id && (
                    <span className="ml-2 text-sc-gray text-label-sm font-mono">{s.student_display_id}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {studentId && (
            <p className="text-label-sm text-sc-teal font-medium">✓ Student selected</p>
          )}
        </div>

        {/* Date */}
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Date *</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Status *</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={cn(
                  "rounded-xl border px-4 py-2 text-label-sm font-medium transition-colors",
                  status === opt.value
                    ? "bg-sc-navy text-white border-sc-navy"
                    : "border-sc-gray-200 text-sc-gray hover:border-sc-navy hover:text-sc-navy"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-label-sm font-semibold text-sc-navy">Check-In Time</label>
            <input
              type="time"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-label-sm font-semibold text-sc-navy">Check-Out Time</label>
            <input
              type="time"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
            />
          </div>
        </div>

        {/* Modifiers */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-label-sm text-sc-navy cursor-pointer">
            <input
              type="checkbox"
              checked={isLate}
              onChange={(e) => setIsLate(e.target.checked)}
              className="rounded"
            />
            Mark as Late Arrival
          </label>
          <label className="flex items-center gap-2 text-label-sm text-sc-navy cursor-pointer">
            <input
              type="checkbox"
              checked={isEarlyPickup}
              onChange={(e) => setIsEarlyPickup(e.target.checked)}
              className="rounded"
            />
            Mark as Early Pickup
          </label>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional attendance notes…"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md text-sc-navy resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
        </div>

        {/* Feedback */}
        {message && (
          <div className={cn(
            "rounded-xl border px-4 py-3 text-label-sm",
            message.ok
              ? "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700"
              : "bg-sc-rose-50 border-sc-rose-200 text-sc-rose"
          )}>
            {message.text}
          </div>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isPending || !studentId}
          className="flex items-center gap-2 rounded-xl bg-sc-teal px-6 py-2.5 text-white text-label-md font-medium disabled:opacity-50 hover:bg-sc-teal/90 transition-colors"
        >
          <Save className="size-4" />
          {isPending ? "Saving…" : "Save Entry"}
        </button>
      </div>
    </div>
  );
}
