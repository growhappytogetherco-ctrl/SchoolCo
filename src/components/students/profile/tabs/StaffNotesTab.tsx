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
  is_safety_alert: boolean;
  safety_severity: "critical" | "high";
  safety_instruction: string;
  safety_roles_all: boolean;
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
    is_safety_alert: false,
    safety_severity: "high",
    safety_instruction: "",
    safety_roles_all: false,
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
  isAdmin?: boolean;
}

function NoteForm({ form, onChange, onSave, onCancel, saving, error, staffMembers, isEdit, isAdmin }: NoteFormProps) {
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

      {/* Safety classification — admin only */}
      {isAdmin && (
        <div className={cn(
          "rounded-xl border p-4 space-y-3",
          form.is_safety_alert ? "border-sc-rose-300 bg-sc-rose-50" : "border-sc-gray-200 bg-white"
        )}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_safety_alert}
              onChange={(e) => set("is_safety_alert", e.target.checked)}
              className="rounded border-sc-gray-300 text-sc-rose"
            />
            <span className="text-label-sm font-semibold text-sc-rose-700">Mark as Safety Alert</span>
            <span className="text-label-sm text-sc-gray font-normal">(shows in student alert banner)</span>
          </label>

          {form.is_safety_alert && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-label-sm font-medium text-sc-navy mb-1">Safety Instruction <span className="text-sc-rose">*</span></label>
                <input
                  type="text"
                  value={form.safety_instruction}
                  onChange={(e) => set("safety_instruction", e.target.value)}
                  placeholder="Short operational instruction for staff…"
                  className="w-full rounded-xl border border-sc-rose-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-rose/30"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-label-sm font-medium text-sc-navy mb-1">Safety Severity</label>
                  <select
                    value={form.safety_severity}
                    onChange={(e) => set("safety_severity", e.target.value as "critical" | "high")}
                    className="w-full rounded-xl border border-sc-rose-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-rose/30"
                  >
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-label-sm font-medium text-sc-navy mb-1">Visible To</label>
                  <select
                    value={form.safety_roles_all ? "all" : "staff_admin"}
                    onChange={(e) => set("safety_roles_all", e.target.value === "all")}
                    className="w-full rounded-xl border border-sc-rose-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-rose/30"
                  >
                    <option value="staff_admin">Admin &amp; Staff only</option>
                    <option value="all">All staff including volunteers</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
  defaultExpanded,
  onPin,
  onEdit,
  onArchive,
  onRestore,
  onStatusChange,
}: {
  note: StaffNote;
  currentUserId: string;
  isAdmin: boolean;
  defaultExpanded?: boolean;
  onPin: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onStatusChange: (s: NoteStatus) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const archived  = !!note.archived_at;
  const pCfg      = PRIORITY_CFG[note.priority];
  const sCfg      = STATUS_CFG[note.status];
  const isAuthor  = note.author_id === currentUserId;
  const canEdit   = isAuthor || isAdmin;
  const today     = new Date().toISOString().split("T")[0];
  const isOverdue = note.due_date && note.due_date < today && note.status !== "completed";

  return (
    <div
      id={`note-${note.id}`}
      className={cn(
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
            {note.is_safety_alert && (
              <span className="rounded-full bg-sc-rose px-2 py-0.5 text-label-sm font-bold text-white flex items-center gap-1">
                <AlertTriangle className="size-3" /> Safety Alert
              </span>
            )}
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
  initialNoteId?: string | null;
}

export function StaffNotesTab({ studentId, currentUserId, role = "staff", initialNoteId = null }: Props) {
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
  const [filterOverdue, setFilterOverdue] = useState(false);

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

  // Auto-scroll to initialNoteId after notes load
  useEffect(() => {
    if (!initialNoteId || loading) return;
    const el = document.getElementById(`note-${initialNoteId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialNoteId, loading]);

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
      is_safety_alert:    note.is_safety_alert,
      safety_severity:    note.safety_severity ?? "high",
      safety_instruction: note.safety_instruction ?? "",
      safety_roles_all:   !note.safety_roles, // null means all staff
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
      is_safety_alert:    isAdmin ? form.is_safety_alert : false,
      safety_severity:    isAdmin && form.is_safety_alert ? form.safety_severity : null,
      safety_instruction: isAdmin && form.is_safety_alert ? form.safety_instruction || null : null,
      safety_roles:       isAdmin && form.is_safety_alert && !form.safety_roles_all
        ? ["admin", "full_admin", "platform_admin", "registrar", "staff", "teacher"]
        : null,
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

  // Client-side filtering + sort
  const todayStr = new Date().toISOString().split("T")[0];
  const priority_rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

  const filtered = notes.filter((n) => {
    if (filterCategory && n.category !== filterCategory) return false;
    if (filterPriority && n.priority !== filterPriority) return false;
    if (filterStatus && n.status !== filterStatus) return false;
    if (filterAssigned && n.assigned_to !== filterAssigned) return false;
    if (filterOverdue) {
      if (!n.due_date || n.due_date >= todayStr || n.status === "completed") return false;
    }
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
  }).sort((a, b) => {
    // Pinned notes first (server already sorts, but re-apply after filter)
    if (a.is_pinned && !b.is_pinned) return -1;
    if (b.is_pinned && !a.is_pinned) return 1;
    // Completed always last
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (b.status === "completed" && a.status !== "completed") return -1;
    const aOverdue = !!(a.due_date && a.due_date < todayStr && a.status !== "completed");
    const bOverdue = !!(b.due_date && b.due_date < todayStr && b.status !== "completed");
    const aPri = priority_rank[a.priority] ?? 3;
    const bPri = priority_rank[b.priority] ?? 3;
    const aScore = aPri * 2 + (aOverdue ? 0 : 1);
    const bScore = bPri * 2 + (bOverdue ? 0 : 1);
    if (aScore !== bScore) return aScore - bScore;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const hasActiveFilters = filterCategory || filterPriority || filterStatus || filterAssigned || filterOverdue;
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

      {/* ── Open Staff Follow-ups review section ────────────────── */}
      {openFollowUps > 0 && (() => {
        const today = new Date().toISOString().split("T")[0];
        const followUps = notes.filter((n) => !n.archived_at && n.follow_up_required && n.status !== "completed");
        const urgentCount  = followUps.filter((n) => n.priority === "urgent").length;
        const highCount    = followUps.filter((n) => n.priority === "high").length;
        const normalCount  = followUps.filter((n) => !["urgent","high"].includes(n.priority)).length;
        const overdueCount = followUps.filter((n) => n.due_date && n.due_date < today).length;
        return (
          <div className="rounded-2xl border border-sc-rose-200 bg-sc-rose-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-sc-rose-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-sc-rose-600 shrink-0" />
                <span className="text-label-sm font-semibold text-sc-rose-800">
                  {openFollowUps} Open Staff Follow-up{openFollowUps > 1 ? "s" : ""}
                  {overdueCount > 0 && <span className="ml-1.5 text-sc-rose font-bold">· {overdueCount} overdue</span>}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {overdueCount > 0 && (
                  <button
                    onClick={() => { setFilterOverdue((v) => !v); setFilterPri(""); setFilterStatus(""); }}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-label-sm font-semibold transition-colors",
                      filterOverdue
                        ? "bg-sc-rose text-white border-sc-rose"
                        : "bg-sc-rose-100 border-sc-rose-300 text-sc-rose hover:bg-sc-rose-200"
                    )}
                  >
                    {overdueCount} Overdue
                  </button>
                )}
                {urgentCount > 0 && (
                  <button
                    onClick={() => { setFilterPri("urgent"); setFilterStatus(""); setFilterOverdue(false); }}
                    className="rounded-full bg-sc-rose-100 border border-sc-rose-300 px-2.5 py-0.5 text-label-sm text-sc-rose font-semibold hover:bg-sc-rose-200 transition-colors"
                  >
                    {urgentCount} Urgent
                  </button>
                )}
                {highCount > 0 && (
                  <button
                    onClick={() => { setFilterPri("high"); setFilterStatus(""); setFilterOverdue(false); }}
                    className="rounded-full bg-sc-gold-50 border border-sc-gold-300 px-2.5 py-0.5 text-label-sm text-sc-gold-700 font-semibold hover:bg-sc-gold-100 transition-colors"
                  >
                    {highCount} High
                  </button>
                )}
                {normalCount > 0 && (
                  <button
                    onClick={() => { setFilterPri("normal"); setFilterStatus(""); setFilterOverdue(false); }}
                    className="rounded-full bg-sc-teal-50 border border-sc-teal-200 px-2.5 py-0.5 text-label-sm text-sc-teal-700 font-semibold hover:bg-sc-teal-100 transition-colors"
                  >
                    {normalCount} Normal
                  </button>
                )}
                <button
                  onClick={() => { setFilterPri(""); setFilterStatus("open"); setFilterOverdue(false); }}
                  className="text-label-sm text-sc-rose-600 font-medium hover:underline ml-1"
                >
                  View all
                </button>
              </div>
            </div>
            <div className="divide-y divide-sc-rose-100">
              {followUps.slice(0, 3).map((n) => (
                <div key={n.id} className="px-4 py-2.5 flex items-start gap-3">
                  <span className={cn(
                    "mt-0.5 shrink-0 h-2 w-2 rounded-full",
                    n.priority === "urgent" ? "bg-sc-rose" : n.priority === "high" ? "bg-sc-gold-500" : "bg-sc-teal"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-label-sm font-medium text-sc-navy truncate">{n.title ?? n.body.slice(0, 60)}</p>
                    {n.assigned_to_name && (
                      <p className="text-label-sm text-sc-gray">→ {n.assigned_to_name}{n.due_date ? ` · due ${fmtDate(n.due_date)}` : ""}</p>
                    )}
                  </div>
                  <span className={cn("shrink-0 text-label-sm px-2 py-0.5 rounded-full border font-medium", STATUS_CFG[n.status].cls)}>
                    {STATUS_CFG[n.status].label}
                  </span>
                </div>
              ))}
              {followUps.length > 3 && (
                <div className="px-4 py-2 text-label-sm text-sc-gray-500 text-center">
                  +{followUps.length - 3} more — use filters above
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
          isAdmin={isAdmin}
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
              onClick={() => { setFilterCat(""); setFilterPri(""); setFilterStatus(""); setFilterAsgn(""); setFilterOverdue(false); }}
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
                  isAdmin={isAdmin}
                />
              </div>
            ) : (
              <NoteCard
                key={note.id}
                note={note}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                defaultExpanded={note.id === initialNoteId}
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
