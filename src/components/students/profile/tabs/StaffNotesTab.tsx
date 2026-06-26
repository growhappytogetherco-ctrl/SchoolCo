"use client";

import { useEffect, useState, useTransition } from "react";
import { Pin, Plus, Trash2, Edit2, Search, Filter, X, Loader2 } from "lucide-react";
import { getStaffNotes, createStaffNote, deleteStaffNote, toggleNotePin } from "@/app/actions/staffNotes";
import type { StaffNote, NoteCategory, NotePriority } from "@/app/actions/staffNotes";
import { cn } from "@/lib/utils";

interface Props { studentId: string; currentUserId: string }

const PRIORITY_CFG: Record<NotePriority, { cls: string; label: string }> = {
  low:    { cls: "bg-sc-gray-50  text-sc-gray   border-sc-gray-200",  label: "Low"    },
  normal: { cls: "bg-sc-teal-50  text-sc-teal   border-sc-teal-200",  label: "Normal" },
  high:   { cls: "bg-sc-gold-50  text-sc-gold-700 border-sc-gold-200", label: "High"   },
  urgent: { cls: "bg-sc-rose-50  text-sc-rose   border-sc-rose-200",  label: "Urgent" },
};

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  academic: "Academic", behavioral: "Behavioral", health: "Health",
  safety: "Safety", family: "Family", attendance: "Attendance", general: "General",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Add note dialog ────────────────────────────────────────────

function AddNoteDialog({
  studentId,
  onAdd,
  onClose,
}: {
  studentId: string;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    category: "general" as NoteCategory,
    priority: "normal" as NotePriority,
    title: "",
    body: "",
    is_pinned: false,
  });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.body.trim()) return setError("Note body is required.");
    setError(null);
    start(async () => {
      const result = await createStaffNote(studentId, form);
      if (result.success) { onAdd(); onClose(); }
      else setError(result.error ?? "Failed to save note.");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-sc-navy/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-heading-2 text-sc-navy">Add Staff Note</h3>
          <button onClick={onClose} className="text-sc-gray hover:text-sc-navy"><X className="size-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-label-sm text-sc-gray mb-1 block">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as NoteCategory }))}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
              >
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-label-sm text-sc-gray mb-1 block">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as NotePriority }))}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
              >
                {Object.entries(PRIORITY_CFG).map(([v, c]) => (
                  <option key={v} value={v}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-label-sm text-sc-gray mb-1 block">Title (optional)</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Brief subject…"
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
            />
          </div>

          <div>
            <label className="text-label-sm text-sc-gray mb-1 block">Note <span className="text-sc-rose">*</span></label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Write your note here…"
              rows={5}
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal resize-none"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-label-sm text-sc-gray">
            <input
              type="checkbox"
              checked={form.is_pinned}
              onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))}
              className="rounded"
            />
            Pin this note to the top
          </label>

          {error && <p className="text-label-sm text-sc-rose">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-sc-gray-200 py-2.5 text-label-md text-sc-gray font-medium hover:bg-sc-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 rounded-xl bg-sc-teal py-2.5 text-label-md text-white font-semibold hover:bg-sc-teal-600 disabled:opacity-60 flex items-center justify-center gap-2">
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────

export function StaffNotesTab({ studentId, currentUserId }: Props) {
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<NotePriority | "all">("all");
  const [filterCategory, setFilterCategory] = useState<NoteCategory | "all">("all");
  const [, startTransition] = useTransition();

  const reload = () => {
    setLoading(true);
    getStaffNotes(studentId).then((d) => { setNotes(d); setLoading(false); });
  };

  useEffect(() => { reload(); }, [studentId]);

  function handleDelete(noteId: string) {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    startTransition(async () => {
      await deleteStaffNote(noteId, studentId);
      reload();
    });
  }

  function handlePin(note: StaffNote) {
    startTransition(async () => {
      await toggleNotePin(note.id, studentId, !note.is_pinned);
      reload();
    });
  }

  const filtered = notes.filter((n) => {
    const q = search.toLowerCase();
    const matchSearch = !q || n.body.toLowerCase().includes(q) || (n.title ?? "").toLowerCase().includes(q);
    const matchPriority = filterPriority === "all" || n.priority === filterPriority;
    const matchCategory = filterCategory === "all" || n.category === filterCategory;
    return matchSearch && matchPriority && matchCategory;
  });

  return (
    <div className="space-y-5 max-w-3xl">
      {showAdd && (
        <AddNoteDialog studentId={studentId} onAdd={reload} onClose={() => setShowAdd(false)} />
      )}

      {/* Header + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-white text-label-md font-semibold hover:bg-sc-teal-600"
        >
          <Plus className="size-4" /> Add Note
        </button>

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
          <input
            type="search" placeholder="Search notes…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white pl-9 pr-4 py-2 text-label-md text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>

        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as NotePriority | "all")}
          className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-gray">
          <option value="all">All priorities</option>
          {Object.entries(PRIORITY_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>

        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as NoteCategory | "all")}
          className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-gray">
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Private label */}
      <div className="rounded-xl border border-sc-gold-200 bg-sc-gold-50 px-4 py-2.5">
        <p className="text-label-sm text-sc-gold-700 font-medium">
          🔒 Staff notes are private and never visible to parents or students.
        </p>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => (
            <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-8 text-center">
          <p className="text-body-md text-sc-gray-400">
            {notes.length === 0 ? "No notes yet. Add the first one above." : "No notes match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((note) => {
            const pCfg = PRIORITY_CFG[note.priority];
            const isAuthor = note.author_id === currentUserId;
            return (
              <div key={note.id} className={cn(
                "rounded-2xl border bg-white shadow-card p-5 space-y-3",
                note.is_pinned ? "border-sc-teal-200" : "border-sc-gray-100"
              )}>
                {/* Note header */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {note.is_pinned && <Pin className="size-3.5 text-sc-teal shrink-0" />}
                      <span className={cn("rounded-full border px-2 py-0.5 text-label-sm font-medium", pCfg.cls)}>
                        {pCfg.label}
                      </span>
                      <span className="text-label-sm text-sc-gray rounded-full border border-sc-gray-200 bg-sc-gray-50 px-2 py-0.5">
                        {CATEGORY_LABELS[note.category]}
                      </span>
                    </div>
                    {note.title && (
                      <p className="text-label-md font-semibold text-sc-navy">{note.title}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handlePin(note)}
                      title={note.is_pinned ? "Unpin" : "Pin"}
                      className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                        note.is_pinned ? "text-sc-teal bg-sc-teal-50" : "text-sc-gray hover:bg-sc-gray-100"
                      )}
                    >
                      <Pin className="size-3.5" />
                    </button>
                    {isAuthor && (
                      <button onClick={() => handleDelete(note.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-rose-50 hover:text-sc-rose transition-colors">
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Body */}
                <p className="text-body-sm text-sc-navy whitespace-pre-wrap">{note.body}</p>

                {/* Footer */}
                <div className="flex items-center gap-2 text-label-sm text-sc-gray-400 border-t border-sc-gray-100 pt-2.5">
                  <span>{note.author_name}</span>
                  <span>·</span>
                  <span>{fmtDate(note.created_at)}</span>
                  {note.updated_at !== note.created_at && <span>· edited</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
