"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Plus, Pin, Pencil, Trash2, Loader2, AlertCircle, Calendar } from "lucide-react";
import {
  getSupportFlags, createFlag, updateFlag, deleteFlag, togglePin,
  type SupportFlag, type FlagCategory, type FlagPriority, type FlagColor,
} from "@/app/actions/supportFlags";
import { cn } from "@/lib/utils";

const CATEGORY_CFG: Record<FlagCategory, { label: string; emoji: string }> = {
  learning:      { label: "Learning",      emoji: "📚" },
  behavioral:    { label: "Behavioral",    emoji: "🧠" },
  medical:       { label: "Medical",       emoji: "💊" },
  environmental: { label: "Environment",   emoji: "🌿" },
  safety:        { label: "Safety",        emoji: "⚠️"  },
  social:        { label: "Social",        emoji: "👥" },
  family:        { label: "Family",        emoji: "🏠" },
  communication: { label: "Communication", emoji: "💬" },
  other:         { label: "Other",         emoji: "📌" },
};

const PRIORITY_BADGE: Record<FlagPriority, string> = {
  low:      "bg-sc-gray-100  text-sc-gray",
  normal:   "bg-sc-teal-50   text-sc-teal",
  high:     "bg-sc-gold-100  text-sc-gold-700",
  critical: "bg-sc-rose-50   text-sc-rose",
};

const COLOR_SWATCH: Record<FlagColor, string> = {
  gray:   "bg-sc-gray-400",
  red:    "bg-sc-rose",
  yellow: "bg-sc-gold-400",
  blue:   "bg-sc-teal",
  green:  "bg-sc-green",
  purple: "bg-purple-500",
  orange: "bg-orange-400",
};

const COLOR_BORDER: Record<FlagColor, string> = {
  gray:   "border-l-sc-gray-300",
  red:    "border-l-sc-rose",
  yellow: "border-l-sc-gold-400",
  blue:   "border-l-sc-teal",
  green:  "border-l-sc-green",
  purple: "border-l-purple-500",
  orange: "border-l-orange-400",
};

interface FormState {
  title: string;
  description: string;
  category: FlagCategory;
  priority: FlagPriority;
  color: FlagColor;
  is_pinned: boolean;
  show_on_snapshot: boolean;
  expires_at: string;
}

const BLANK: FormState = {
  title: "", description: "", category: "other", priority: "normal",
  color: "gray", is_pinned: false, show_on_snapshot: false, expires_at: "",
};

export function SupportTab({ studentId }: { studentId: string }) {
  const [flags, setFlags]         = useState<SupportFlag[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<SupportFlag | null>(null);
  const [form, setForm]           = useState<FormState>(BLANK);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<FlagCategory | "all">("all");
  const [search, setSearch]       = useState("");

  useEffect(() => {
    getSupportFlags(studentId).then((data) => { setFlags(data); setLoading(false); });
  }, [studentId]);

  function openNew() {
    setEditing(null);
    setForm(BLANK);
    setShowForm(true);
    setError(null);
  }

  function openEdit(flag: SupportFlag) {
    setEditing(flag);
    setForm({
      title:            flag.title,
      description:      flag.description ?? "",
      category:         flag.category,
      priority:         flag.priority,
      color:            flag.color,
      is_pinned:        flag.is_pinned,
      show_on_snapshot: flag.show_on_snapshot,
      expires_at:       flag.expires_at ?? "",
    });
    setShowForm(true);
    setError(null);
  }

  async function handleSave() {
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);

    const payload = { ...form, description: form.description || null, expires_at: form.expires_at || null };

    const res = editing
      ? await updateFlag(editing.id, studentId, payload)
      : await createFlag(studentId, payload);

    if (!res.success) { setError(res.error); setSaving(false); return; }
    const updated = await getSupportFlags(studentId);
    setFlags(updated);
    setShowForm(false);
    setSaving(false);
  }

  async function handleDelete(flagId: string) {
    const res = await deleteFlag(flagId, studentId);
    if (res.success) setFlags((prev) => prev.filter((f) => f.id !== flagId));
  }

  async function handleTogglePin(flag: SupportFlag) {
    const res = await togglePin(flag.id, studentId, !flag.is_pinned);
    if (res.success) setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, is_pinned: !f.is_pinned } : f));
  }

  const now = new Date().toISOString().split("T")[0];
  const filtered = flags
    .filter((f) => catFilter === "all" || f.category === catFilter)
    .filter((f) => !search || f.title.toLowerCase().includes(search.toLowerCase()) || f.description?.toLowerCase().includes(search.toLowerCase()))
    .filter((f) => !f.expires_at || f.expires_at >= now); // hide expired by default

  const pinned   = filtered.filter((f) => f.is_pinned);
  const unpinned = filtered.filter((f) => !f.is_pinned);

  if (loading) return (
    <div className="space-y-3">
      {[1,2,3].map((i) => <div key={i} className="h-20 rounded-2xl border border-sc-gray-100 bg-white animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-heading-sm text-sc-navy font-semibold flex items-center gap-2">
            <ShieldAlert className="size-5 text-sc-rose" />
            Staff Support Notes
          </h3>
          <p className="text-label-sm text-sc-gray mt-0.5">Staff-only standing instructions — never visible to parents</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-sc-navy px-4 py-2 text-label-sm text-white font-medium hover:bg-sc-navy-800 transition-colors">
          <Plus className="size-4" /> Add Flag
        </button>
      </div>

      {/* Search + filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search flags…"
          className="flex-1 min-w-40 rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none"
        />
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setCatFilter("all")}
            className={cn("rounded-full border px-3 py-1 text-label-sm font-medium", catFilter === "all" ? "bg-sc-navy text-white border-sc-navy" : "border-sc-gray-200 text-sc-gray")}>
            All
          </button>
          {(Object.entries(CATEGORY_CFG) as [FlagCategory, { label: string; emoji: string }][]).map(([id, cfg]) => {
            if (!flags.some((f) => f.category === id)) return null;
            return (
              <button key={id} onClick={() => setCatFilter(id === catFilter ? "all" : id)}
                className={cn("rounded-full border px-3 py-1 text-label-sm font-medium", catFilter === id ? "bg-sc-navy text-white border-sc-navy" : "border-sc-gray-200 text-sc-gray hover:border-sc-navy")}>
                {cfg.emoji} {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="rounded-2xl border border-sc-rose-200 bg-sc-rose-50 p-5 space-y-4">
          <h4 className="text-label-md font-semibold text-sc-navy">{editing ? "Edit Support Flag" : "New Support Flag"}</h4>

          <div className="space-y-3">
            <div>
              <label className="text-label-sm font-medium text-sc-gray mb-1 block">Title *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Do not leave unattended"
                className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none" />
            </div>
            <div>
              <label className="text-label-sm font-medium text-sc-gray mb-1 block">Details</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2} placeholder="Additional context…"
                className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-sm font-medium text-sc-gray mb-1 block">Category</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as FlagCategory }))}
                  className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:border-sc-teal focus:outline-none">
                  {Object.entries(CATEGORY_CFG).map(([id, cfg]) => (
                    <option key={id} value={id}>{cfg.emoji} {cfg.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-label-sm font-medium text-sc-gray mb-1 block">Priority</label>
                <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as FlagPriority }))}
                  className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:border-sc-teal focus:outline-none">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-label-sm font-medium text-sc-gray mb-2 block">Color</label>
              <div className="flex gap-2">
                {(Object.entries(COLOR_SWATCH) as [FlagColor, string][]).map(([color, cls]) => (
                  <button key={color} onClick={() => setForm((f) => ({ ...f, color }))}
                    className={cn("h-7 w-7 rounded-full border-2 transition-all", cls, form.color === color ? "border-sc-navy scale-110" : "border-white")}>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-sm font-medium text-sc-gray mb-1 block">Expires (optional)</label>
                <input type="date" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                  className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:border-sc-teal focus:outline-none" />
              </div>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))}
                  className="rounded border-sc-gray-300 text-sc-teal" />
                <span className="text-label-sm text-sc-navy font-medium">Pin to top</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.show_on_snapshot} onChange={(e) => setForm((f) => ({ ...f, show_on_snapshot: e.target.checked }))}
                  className="rounded border-sc-gray-300 text-sc-teal" />
                <span className="text-label-sm text-sc-navy font-medium">Show on profile snapshot</span>
              </label>
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-label-sm text-sc-rose">
              <AlertCircle className="size-4" /> {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-sc-navy px-5 py-2 text-label-sm text-white font-medium disabled:opacity-50">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Flag"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-label-sm text-sc-gray hover:text-sc-navy px-3 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Flag list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center space-y-3">
          <ShieldAlert className="size-10 text-sc-gray-300 mx-auto" />
          <p className="text-body-md text-sc-gray-400">
            {flags.length === 0
              ? "No support flags yet. Add notes about learning needs, behavior triggers, or safety instructions."
              : "No flags match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pinned.length > 0 && (
            <div className="space-y-2">
              <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wider flex items-center gap-1.5">
                <Pin className="size-3.5" /> Pinned
              </p>
              {pinned.map((flag) => <FlagCard key={flag.id} flag={flag} onEdit={openEdit} onDelete={handleDelete} onTogglePin={handleTogglePin} />)}
            </div>
          )}
          {unpinned.length > 0 && (
            <div className="space-y-2">
              {pinned.length > 0 && <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wider">Other Flags</p>}
              {unpinned.map((flag) => <FlagCard key={flag.id} flag={flag} onEdit={openEdit} onDelete={handleDelete} onTogglePin={handleTogglePin} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FlagCard({
  flag, onEdit, onDelete, onTogglePin
}: {
  flag: SupportFlag;
  onEdit: (f: SupportFlag) => void;
  onDelete: (id: string) => void;
  onTogglePin: (f: SupportFlag) => void;
}) {
  const catCfg  = CATEGORY_CFG[flag.category];
  const priCls  = PRIORITY_BADGE[flag.priority];
  const border  = COLOR_BORDER[flag.color];
  const isExpiring = flag.expires_at &&
    new Date(flag.expires_at) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return (
    <div className={cn("rounded-2xl border-l-4 border border-sc-gray-100 bg-white shadow-card p-4", border)}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0 mt-0.5">{catCfg.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-label-md font-semibold text-sc-navy">{flag.title}</p>
            {flag.show_on_snapshot && (
              <span className="rounded-full bg-sc-gold-100 px-2 py-0.5 text-label-sm text-sc-gold-700 font-medium">On Snapshot</span>
            )}
          </div>
          {flag.description && <p className="text-label-sm text-sc-gray mt-0.5">{flag.description}</p>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
            <span className={cn("rounded-full px-2 py-0.5 text-label-sm font-medium", priCls)}>{flag.priority}</span>
            <span className="text-label-sm text-sc-gray">{catCfg.label}</span>
            {flag.expires_at && (
              <span className={cn("flex items-center gap-0.5 text-label-sm", isExpiring ? "text-sc-gold-600 font-medium" : "text-sc-gray")}>
                <Calendar className="size-3" />
                Expires {new Date(flag.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {isExpiring && " ⚠"}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onTogglePin(flag)}
            className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              flag.is_pinned ? "text-sc-teal bg-sc-teal-50" : "text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal"
            )}>
            <Pin className="size-3.5" />
          </button>
          <button onClick={() => onEdit(flag)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal transition-colors">
            <Pencil className="size-3.5" />
          </button>
          <button onClick={() => onDelete(flag.id)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-rose-50 hover:text-sc-rose transition-colors">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
