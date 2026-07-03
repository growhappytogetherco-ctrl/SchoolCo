"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Pin, Plus, Edit2, Archive, RotateCcw, Search,
  ChevronDown, ChevronUp, AlertTriangle, User, CalendarDays, X,
} from "lucide-react";
import {
  getStaffNotes, createStaffNote, updateStaffNote,
  archiveStaffNote, restoreStaffNote, toggleNotePin, getOrgStaffMembers,
  type StaffNote, type NoteCategory, type NotePriority, type NoteStatus, type StaffMember,
} from "@/app/actions/staffNotes";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  general:             "General",
  academic:            "Academic",
  behavior:            "Behavior",
  family_communication:"Family Communication",
  parent_follow_up:    "Parent Follow-up",
  teacher_follow_up:   "Teacher Follow-up",
  leadership:          "Leadership",
  entrepreneurship:    "Entrepreneurship",
  attendance:          "Attendance",
  medical:             "Medical",
  safety:              "Safety",
  administrative:      "Administrative",
  // legacy
  behavioral:          "Behavioral",
  health:              "Health",
  family:              "Family",
};

const CATEGORIES: NoteCategory[] = [
  "general","academic","behavior","family_communication",
  "parent_follow_up","teacher_follow_up","leadership","entrepreneurship",
  "attendance","medical","safety","administrative",
];

const PRIORITY_CFG: Record<NotePriority, { cls: string; label: string; border: string }> = {
  low:    { cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200",         label: "Low",    border: "border-l-sc-gray-300" },
  normal: { cls: "bg-sc-teal-50 text-sc-teal border-sc-teal-200",         label: "Normal", border: "border-l-sc-teal-300" },
  high:   { cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",     label: "High",   border: "border-l-sc-gold-400" },
  urgent: { cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200",         label: "Urgent", border: "border-l-sc-rose" },
};

const STATUS_CFG: Record<NoteStatus, { cls: string; label: string }> = {
  open:        { cls: "bg-sc-gray-100 text-sc-gray border-sc-gray-200",     label: "Open"        },
  in_progress: { cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200", label: "In Progress"  },
  waiting:     { cls: "bg-sc-navy/5 text-sc-navy border-sc-navy/10",        label: "Waiting"      },
  completed:   { cls: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200", label: "Completed"    },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Note Form ─────────────────────────────────────────────────────────────────

interface NoteFormPayload {
  category: NoteCategory;
  priority: NotePriority;
  title: string;
  body: string;
  is_pinned: boolean;
  follow_up_required: boolean;
  assigned_to: string;
  due_date: string;
  status: NoteStatus;
  tags: string;
}

function blankForm(): NoteFormPayload {
  return {
    category: "general",
    priority: "normal",
    title: "",
    body: "",
    is_pinned: false,
    follow_up_required: false,
    assigned_to: "",
    due_date: "",
    status: "open",
    tags: "",
  };
}

interface NoteFormProps {
  form: NoteFormPayload;
  onChange: (f: NoteFormPayload) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  staffMembers: StaffMember[];
  isEdit?: boolean;
}

function NoteForm({ form, onChange, onSave, onCancel, saving, error, staffMembers, isEdit }: NoteFormProps) {
  function set<K extends keyof NoteFormPayload>(key: K, val: NoteFormPayload[K]) {
    onChange({ ...form, [key]: val });
  }

  return (
    <div className="rounded-2xl border border-sc-navy/10 bg-sc-gray-50 p-5 space-y-4">
      <p className="font-serif text-heading-3 text-sc-navy">{isEdit ? "Edit Note" : "New Note"}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Category</label>
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value as NoteCategory)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Priority</label>
          <select
            value={form.priority}
            onChange={(e) => set("priority", e.target.value as NotePriority)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          >
            {(Object.entries(PRIORITY_CFG) as [NotePriority, (typeof PRIORITY_CFG)[NotePriority]][]).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">Title <span className="font-normal text-sc-gray">(optional)</span></label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Brief subject line…"
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
        />
      </div>

      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">Note *</label>
        <textarea
          value={form.body}
          onChange={(e) => set("body", e.target.value)}
          rows={5}
          placeholder="Write your note here…"
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none"
        />
      </div>

      {/* Follow-up section */}
      <div className="rounded-xl border border-sc-gray-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.follow_up_required}
              onChange={(e) => set("follow_up_required", e.target.checked)}
              className="rounded border-sc-gray-300 text-sc-teal"
            />
            <span className="text-label-sm font-medium text-sc-navy">Follow-up required</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_pinned}
              onChange={(e) => set("is_pinned", e.target.checked)}
              className="rounded border-sc-gray-300 text-sc-teal"
            />
            <span className="text-label-sm font-medium text-sc-navy">Pin to top</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-label-sm font-medium text-sc-navy mb-1">Assign To</label>
            <select
              value={form.assigned_to}
              onChange={(e) => set("assigned_to", e.target.value)}
              className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            >
              <option value="">— Not assigned —</option>
              {staffMembers.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-label-sm font-medium text-sc-navy mb-1">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => set("due_date", e.target.value)}
              className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Status</label>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value as NoteStatus)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          >
            {(Object.entries(STATUS_CFG) as [NoteStatus, (typeof STATUS_CFG)[NoteStatus]][]).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">Tags <span className="font-normal text-sc-gray">(comma-separated, optional)</span></label>
        <input
          type="text"
          value={form.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="e.g. reading, parent-call, urgent-followup"
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
        />
      </div>

      {error && <p className="text-label-sm text-sc-rose-700 font-medium">{error}</p>}

      <div className="flex justify-end gap-3 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-sc-gray-200 bg-white px-4 py-2 text-label-sm font-medium text-sc-navy hover:bg-sc-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.body.trim()}
          className="rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Note"}
        </button>
      </div>
    </div>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  currentUserId,
  isAdmin,
  onPin,
  onEdit,
  onArchive,
  onRestore,
  onStatusChange,
}: {
  note: StaffNote;
  currentUserId: string;
  isAdmin: boolean;
  onPin: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onStatusChange: (s: NoteStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const archived  = !!note.archived_at;
  const pCfg      = PRIORITY_CFG[note.priority];
  const sCfg      = STATUS_CFG[note.status];
  const isAuthor  = note.author_id === currentUserId;
  const canEdit   = isAuthor || isAdmin;
  const today     = new Date().toISOString().split("T")[0];
  const isOverdue = note.due_date && note.due_date < today && note.status !== "completed";

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-card overflow-hidden border-l-4",
      archived ? "opacity-60 border-sc-gray-200 border-l-sc-gray-200" : pCfg.border
    )}>
      {/* Header row */}
      <button
        className="w-full flex items-start justify-between px-4 py-3.5 text-left gap-3"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            {note.is_pinned && <Pin className="size-3.5 text-sc-teal shrink-0" />}
            <span className={cn("rounded-full border px-2 py-0.5 text-label-sm font-medium", pCfg.cls)}>
              {pCfg.label}
            </span>
            <span className="rounded-full bg-sc-gray-50 border border-sc-gray-200 px-2 py-0.5 text-label-sm text-sc-gray">
              {CATEGORY_LABELS[note.category] ?? note.category}
            </span>
            <span className={cn("rounded-full border px-2 py-0.5 text-label-sm font-medium", sCfg.cls)}>
              {sCfg.label}
            </span>
            {note.follow_up_required && note.status !== "completed" && (
              <span className="rounded-full bg-sc-gold-50 text-sc-gold-700 border border-sc-gold-200 px-2 py-0.5 text-label-sm">
                Follow-up
              </span>
            )}
            {isOverdue && (
              <span className="rounded-full bg-sc-rose-100 text-sc-rose-700 border border-sc-rose-200 px-2 py-0.5 text-label-sm font-medium flex items-center gap-1">
                <AlertTriangle className="size-3" /> Overdue
              </span>
            )}
          </div>

          {/* Title */}
          {note.title && (
            <p className="text-label-sm font-semibold text-sc-navy">{note.title}</p>
          )}

          {/* Preview */}
          {!expanded && (
            <p className="text-label-sm text-sc-gray line-clamp-2">{note.body}</p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap gap-3 text-label-sm text-sc-gray">
            <span className="flex items-center gap-1">
              <User className="size-3.5" /> {note.author_name}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {fmtDate(note.created_at)}
            </span>
            {note.assigned_to_name && (
              <span className="flex items-center gap-1 text-sc-teal-700 font-medium">
                → {note.assigned_to_name}
              </span>
            )}
            {note.due_date && (
              <span className={cn("flex items-center gap-1", isOverdue ? "text-sc-rose-700 font-medium" : "")}>
                Due {fmtDate(note.due_date)}
              </span>
            )}
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {canEdit && !archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onPin(); }}
              title={note.is_pinned ? "Unpin" : "Pin"}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                note.is_pinned ? "text-sc-teal bg-sc-teal-50" : "text-sc-gray hover:bg-sc-gray-100"
              )}
            >
              <Pin className="size-3.5" />
            </button>
          )}
          {canEdit && !archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-gray hover:text-sc-teal hover:bg-sc-teal/10 transition-colors"
              title="Edit"
            >
              <Edit2 className="size-3.5" />
            </button>
          )}
          {isAdmin && !archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-gray hover:text-sc-rose hover:bg-sc-rose/10 transition-colors"
              title="Archive"
            >
              <Archive className="size-3.5" />
            </button>
          )}
          {isAdmin && archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore(); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-gray hover:text-sc-teal hover:bg-sc-teal/10 transition-colors"
              title="Restore"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
          {expanded
            ? <ChevronUp className="size-4 text-sc-gray shrink-0" />
            : <ChevronDown className="size-4 text-sc-gray shrink-0" />
          }
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-sc-gray-100 pt-3 space-y-3">
          <p className="text-label-sm text-sc-navy whitespace-pre-wrap">{note.body}</p>

          {note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-sc-navy/5 text-sc-navy px-2 py-0.5 text-label-sm font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Quick status change */}
          {canEdit && !archived && (
            <div className="flex items-center gap-2 pt-1 border-t border-sc-gray-100">
              <span className="text-label-sm text-sc-gray">Status:</span>
              {(["open", "in_progress", "waiting", "completed"] as NoteStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onStatusChange(s)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-label-sm font-medium transition-all",
                    note.status === s
                      ? STATUS_CFG[s].cls
                      : "bg-white border-sc-gray-200 text-sc-gray hover:bg-sc-gray-50"
                  )}
                >
                  {STATUS_CFG[s].label}
                </button>
              ))}
            </div>
          )}

          {note.updated_at !== note.created_at && (
            <p className="text-label-sm text-sc-gray-400">Edited {fmtDate(note.updated_at)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
  currentUserId: string;
  role?: string;
}

export function StaffNotesTab({ studentId, currentUserId, role = "staff" }: Props) {
  const isAdmin = ["admin", "full_admin", "platform_admin", "registrar"].includes(role);

  const [notes, setNotes]           = useState<StaffNote[]>([]);
  const [staffMembers, setStaff]    = useState<StaffMember[]>([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState<string | false>(false);

  const [showForm, setShowForm]     = useState(false);
  const [editingNote, setEditing]   = useState<StaffNote | null>(null);
  const [form, setForm]             = useState<NoteFormPayload>(blankForm());
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);

  // Filters
  const [search, setSearch]               = useState("");
  const [filterCategory, setFilterCat]   = useState("");
  const [filterPriority, setFilterPri]   = useState("");
  const [filterStatus, setFilterStatus]  = useState("");
  const [filterAssigned, setFilterAsgn]  = useState("");
  const [showArchived, setShowArchived]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [n, s] = await Promise.all([
        getStaffNotes(studentId, { includeArchived: showArchived }),
        getOrgStaffMembers(),
      ]);
      setNotes(n);
      setStaff(s);
    } catch {
      setFetchError("Failed to load notes.");
    } finally {
      setLoading(false);
    }
  }, [studentId, showArchived]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setForm(blankForm());
    setSaveError(null);
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(note: StaffNote) {
    setForm({
      category:           note.category,
      priority:           note.priority,
      title:              note.title ?? "",
      body:               note.body,
      is_pinned:          note.is_pinned,
      follow_up_required: note.follow_up_required,
      assigned_to:        note.assigned_to ?? "",
      due_date:           note.due_date ?? "",
      status:             note.status,
      tags:               note.tags.join(", "),
    });
    setSaveError(null);
    setEditing(note);
    setShowForm(false);
  }

  function cancelForm() {
    setShowForm(false);
    setEditing(null);
    setSaveError(null);
  }

  function tagsFromString(s: string): string[] {
    return s.split(",").map((t) => t.trim()).filter(Boolean);
  }

  async function handleSave() {
    if (!form.body.trim()) { setSaveError("Note body is required."); return; }
    setSaving(true);
    setSaveError(null);

    const payload = {
      category:           form.category,
      priority:           form.priority,
      title:              form.title || undefined,
      body:               form.body,
      is_pinned:          form.is_pinned,
      follow_up_required: form.follow_up_required,
      assigned_to:        form.assigned_to || null,
      due_date:           form.due_date || null,
      status:             form.status,
      tags:               tagsFromString(form.tags),
    };

    let result: { success: boolean; error?: string };
    if (editingNote) {
      result = await updateStaffNote(editingNote.id, studentId, payload);
    } else {
      result = await createStaffNote(studentId, payload);
    }

    if (!result.success) {
      setSaveError(result.error ?? "Failed to save note.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handlePin(note: StaffNote) {
    await toggleNotePin(note.id, studentId, !note.is_pinned);
    load();
  }

  async function handleArchive(note: StaffNote) {
    await archiveStaffNote(note.id, studentId);
    load();
  }

  async function handleRestore(note: StaffNote) {
    await restoreStaffNote(note.id, studentId);
    load();
  }

  async function handleStatusChange(note: StaffNote, status: NoteStatus) {
    await updateStaffNote(note.id, studentId, { status });
    load();
  }

  // Client-side filtering
  const filtered = notes.filter((n) => {
    if (filterCategory && n.category !== filterCategory) return false;
    if (filterPriority && n.priority !== filterPriority) return false;
    if (filterStatus && n.status !== filterStatus) return false;
    if (filterAssigned && n.assigned_to !== filterAssigned) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        n.body.toLowerCase().includes(q) ||
        (n.title ?? "").toLowerCase().includes(q) ||
        n.author_name.toLowerCase().includes(q) ||
        (n.assigned_to_name ?? "").toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const hasActiveFilters = filterCategory || filterPriority || filterStatus || filterAssigned;
  const urgentOrHighCount = notes.filter((n) => !n.archived_at && ["high","urgent"].includes(n.priority) && n.status !== "completed").length;
  const openFollowUps     = notes.filter((n) => !n.archived_at && n.follow_up_required && n.status !== "completed").length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-sc-teal border-t-transparent animate-spin" />
        <p className="text-label-sm text-sc-gray">Loading notes…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-2xl border border-sc-rose-200 bg-sc-rose-50 p-6 text-center">
        <p className="text-sc-rose-700 font-medium">{fetchError}</p>
        <button onClick={load} className="mt-3 text-label-sm text-sc-teal font-medium hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy">Staff Notes</h2>
          <p className="text-label-sm text-sc-gray mt-0.5">
            Internal communication and follow-up — never visible to parents.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700"
        >
          <Plus className="size-4" /> Add Note
        </button>
      </div>

      {/* ── Alert strip ─────────────────────────────────────────── */}
      {(urgentOrHighCount > 0 || openFollowUps > 0) && (
        <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-4 py-3 flex flex-wrap gap-4">
          {urgentOrHighCount > 0 && (
            <span className="flex items-center gap-1.5 text-label-sm text-sc-rose-700 font-medium">
              <AlertTriangle className="size-4" />
              {urgentOrHighCount} high/urgent open note{urgentOrHighCount > 1 ? "s" : ""}
            </span>
          )}
          {openFollowUps > 0 && (
            <span className="text-label-sm text-sc-gold-700 font-medium">
              {openFollowUps} open follow-up{openFollowUps > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* ── Add Form ────────────────────────────────────────────── */}
      {showForm && (
        <NoteForm
          form={form}
          onChange={setForm}
          onSave={handleSave}
          onCancel={cancelForm}
          saving={saving}
          error={saveError}
          staffMembers={staffMembers}
        />
      )}

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes, tags, staff…"
              className="w-full rounded-xl border border-sc-gray-200 bg-white pl-9 pr-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            />
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCat(e.target.value)}
            className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPri(e.target.value)}
            className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30">
            <option value="">All priorities</option>
            {(Object.entries(PRIORITY_CFG) as [NotePriority, (typeof PRIORITY_CFG)[NotePriority]][]).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30">
            <option value="">All statuses</option>
            {(Object.entries(STATUS_CFG) as [NoteStatus, (typeof STATUS_CFG)[NoteStatus]][]).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {staffMembers.length > 0 && (
            <select value={filterAssigned} onChange={(e) => setFilterAsgn(e.target.value)}
              className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30">
              <option value="">All assignees</option>
              {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          )}
          {isAdmin && (
            <label className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-sc-gray-300 text-sc-teal"
              />
              Show archived
            </label>
          )}
          {hasActiveFilters && (
            <button
              onClick={() => { setFilterCat(""); setFilterPri(""); setFilterStatus(""); setFilterAsgn(""); }}
              className="flex items-center gap-1 text-label-sm text-sc-teal font-medium hover:text-sc-teal-700"
            >
              <X className="size-3.5" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Notes list ──────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center">
          {notes.length === 0 ? (
            <>
              <p className="font-serif text-heading-3 text-sc-navy mb-1">No notes yet</p>
              <p className="text-label-sm text-sc-gray mb-4">Use notes to document observations, assign follow-ups, and communicate with staff.</p>
              <button onClick={openAdd} className="rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700">
                Add First Note
              </button>
            </>
          ) : (
            <p className="text-label-sm text-sc-gray">No notes match your filters.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-label-sm text-sc-gray">
            {filtered.length} note{filtered.length !== 1 ? "s" : ""}
            {filtered.length < notes.length ? ` (filtered from ${notes.length})` : ""}
          </p>
          {filtered.map((note) =>
            editingNote?.id === note.id ? (
              <div key={note.id}>
                <NoteForm
                  form={form}
                  onChange={setForm}
                  onSave={handleSave}
                  onCancel={cancelForm}
                  saving={saving}
                  error={saveError}
                  staffMembers={staffMembers}
                  isEdit
                />
              </div>
            ) : (
              <NoteCard
                key={note.id}
                note={note}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onPin={() => handlePin(note)}
                onEdit={() => openEdit(note)}
                onArchive={() => handleArchive(note)}
                onRestore={() => handleRestore(note)}
                onStatusChange={(s) => handleStatusChange(note, s)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
