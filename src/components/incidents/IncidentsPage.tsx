"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle, Plus, Search, X, ChevronRight,
  CheckCircle, Clock, AlertCircle,
} from "lucide-react";
import { createIncident, type IncidentPayload } from "@/app/actions/studentActions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface Incident {
  id:               string;
  title:            string;
  description:      string | null;
  incident_type:    string;
  severity:         string | null;
  status:           string;
  occurred_at:      string;
  location:         string | null;
  parent_notified:  boolean;
  resolution_notes: string | null;
  resolved_at:      string | null;
  student_id:       string | null;
  students:         { first_name: string; last_name: string; preferred_name: string | null; student_display_id: string | null } | null;
  reporter:         { full_name: string } | null;
}

const SEVERITY_CFG: Record<string, { cls: string; label: string }> = {
  low:      { cls: "bg-sc-gray-100 text-sc-gray border-sc-gray-200",           label: "Low"      },
  medium:   { cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",        label: "Medium"   },
  high:     { cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200",            label: "High"     },
  critical: { cls: "bg-sc-rose text-white border-sc-rose",                     label: "Critical" },
};
const STATUS_CFG: Record<string, { cls: string; Icon: React.ElementType }> = {
  open:         { cls: "text-sc-rose-700",  Icon: AlertCircle  },
  under_review: { cls: "text-sc-gold-700",  Icon: Clock        },
  resolved:     { cls: "text-sc-teal-700",  Icon: CheckCircle  },
  closed:       { cls: "text-sc-gray",      Icon: CheckCircle  },
};
const TYPE_LABELS: Record<string, string> = {
  behavioral: "Behavioral", medical: "Medical", safety: "Safety", property: "Property", other: "Other",
};

// ── Component ──────────────────────────────────────────────────────────────

export function IncidentsPage({ initialIncidents, orgId }: { initialIncidents: unknown[]; orgId: string }) {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents as Incident[]);
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState<"all" | "open" | "resolved">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selected,  setSelected]  = useState<Incident | null>(null);

  const filtered = incidents.filter((inc) => {
    const matchSearch = !search ||
      inc.title.toLowerCase().includes(search.toLowerCase()) ||
      (inc.students && `${inc.students.first_name} ${inc.students.last_name}`.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = filter === "all" || (filter === "open" ? inc.status === "open" || inc.status === "under_review" : inc.status === "resolved" || inc.status === "closed");
    const matchType   = typeFilter === "all" || inc.incident_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  function getStudentName(inc: Incident) {
    if (!inc.students) return "Unlinked";
    const s = inc.students;
    return s.preferred_name ? `${s.preferred_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`;
  }

  async function reloadIncidents() {
    const supabase = createClient();
    const { data } = await supabase
      .from("incidents")
      .select(`
        id, title, description, incident_type, severity, status,
        occurred_at, location, parent_notified, resolution_notes, resolved_at,
        student_id, reported_by,
        students:student_id ( first_name, last_name, preferred_name, student_display_id ),
        reporter:reported_by ( full_name )
      `)
      .eq("organization_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (data) setIncidents(data as unknown as Incident[]);
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-heading-1 text-sc-navy">Incident Reports</h1>
          <p className="text-body-sm text-sc-gray mt-0.5">{incidents.length} total · {incidents.filter((i) => i.status === "open").length} open</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-sc-rose px-4 py-2.5 text-white text-label-md font-medium hover:bg-sc-rose/90"
        >
          <Plus className="size-4" /> Add Incident
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or title…"
            className="rounded-xl border border-sc-gray-200 pl-9 pr-4 py-2 text-label-md text-sc-navy w-64 focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="flex gap-1 rounded-xl border border-sc-gray-100 bg-sc-cream/60 p-1">
          {(["all","open","resolved"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("rounded-lg px-3 py-1.5 text-label-sm font-medium capitalize transition-colors",
                filter === f ? "bg-white text-sc-navy shadow-sm" : "text-sc-gray hover:text-sc-navy")}>
              {f}
            </button>
          ))}
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
          <option value="all">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Incident list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-12 text-center">
          <AlertTriangle className="size-8 text-sc-gray-300 mx-auto mb-3" />
          <p className="text-body-md text-sc-gray-400">No incidents found.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sc-cream border-b border-sc-gray-100">
                <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase">Student</th>
                <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase hidden sm:table-cell">Title</th>
                <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase hidden md:table-cell">Type</th>
                <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase">Severity</th>
                <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase hidden lg:table-cell">Date</th>
                <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sc-gray-50">
              {filtered.map((inc) => {
                const sev = SEVERITY_CFG[inc.severity ?? "low"] ?? SEVERITY_CFG.low;
                const sta = STATUS_CFG[inc.status] ?? STATUS_CFG.open;
                const Icon = sta.Icon;
                return (
                  <tr key={inc.id} className="hover:bg-sc-cream/30 cursor-pointer transition-colors"
                    onClick={() => setSelected(inc)}>
                    <td className="py-3 px-4">
                      <p className="text-label-md font-semibold text-sc-navy">{getStudentName(inc)}</p>
                      {inc.students?.student_display_id && (
                        <p className="text-label-sm text-sc-gray font-mono">{inc.students.student_display_id}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <p className="text-label-md text-sc-navy truncate max-w-[200px]">{inc.title}</p>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-label-sm text-sc-gray capitalize">
                      {TYPE_LABELS[inc.incident_type] ?? inc.incident_type}
                    </td>
                    <td className="py-3 px-4">
                      {inc.severity && (
                        <span className={cn("rounded-full border px-2 py-0.5 text-label-sm font-medium", sev.cls)}>
                          {sev.label}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-label-sm text-sc-gray">
                      {new Date(inc.occurred_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn("flex items-center gap-1 text-label-sm font-medium capitalize", sta.cls)}>
                        <Icon className="size-3.5" />
                        {inc.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <ChevronRight className="size-4 text-sc-gray-300" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateIncidentModal
          orgId={orgId}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); reloadIncidents(); }}
        />
      )}

      {/* Detail panel */}
      {selected && (
        <IncidentDetailPanel
          incident={selected}
          studentName={getStudentName(selected)}
          orgId={orgId}
          onClose={() => setSelected(null)}
          onUpdate={() => { setSelected(null); reloadIncidents(); }}
        />
      )}
    </div>
  );
}

// ── Create Incident Modal ──────────────────────────────────────────────────

function CreateIncidentModal({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: () => void }) {
  const [students, setStudents]  = useState<{ id: string; name: string }[]>([]);
  const [loaded,   setLoaded]    = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [form, setForm]          = useState<IncidentPayload>({
    title: "", description: "", incident_type: "behavioral", severity: "medium",
    location: "", occurred_at: new Date().toISOString().slice(0, 16), parent_notified: false,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError]        = useState<string | null>(null);

  if (!loaded) {
    setLoaded(true);
    createClient()
      .from("students")
      .select("id, first_name, last_name, preferred_name")
      .eq("organization_id", orgId)
      .eq("enrollment_status", "enrolled")
      .is("archived_at", null)
      .order("last_name")
      .then(({ data }) => {
        if (data) setStudents(data.map((s) => ({
          id: s.id,
          name: s.preferred_name ? `${s.preferred_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`,
        })));
      });
  }

  const filteredStudents = students.filter((s) => s.name.toLowerCase().includes(studentSearch.toLowerCase()));

  function handleSave() {
    if (!form.title.trim()) { setError("Title required"); return; }
    startTransition(async () => {
      const res = await createIncident(studentId, form);
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100 sticky top-0 bg-white">
          <h2 className="font-serif text-heading-3 text-sc-navy">Add Incident Report</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100"><X className="size-4 text-sc-gray" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Student select */}
          <div className="space-y-1.5">
            <label className="text-label-sm font-semibold text-sc-navy">Student (optional)</label>
            <input value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setStudentId(null); }}
              placeholder="Search student…"
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
            {studentSearch && !studentId && filteredStudents.length > 0 && (
              <div className="rounded-xl border border-sc-gray-100 bg-white shadow-card max-h-40 overflow-y-auto">
                {filteredStudents.slice(0, 6).map((s) => (
                  <button key={s.id} onClick={() => { setStudentId(s.id); setStudentSearch(s.name); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-sc-cream text-label-md text-sc-navy border-b border-sc-gray-50 last:border-0">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {studentId && <p className="text-label-sm text-sc-teal font-medium">✓ Student selected</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-label-sm font-semibold text-sc-navy">Title *</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Brief incident description"
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-label-sm font-semibold text-sc-navy">Type</label>
              <select value={form.incident_type} onChange={(e) => setForm((f) => ({ ...f, incident_type: e.target.value }))}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal">
                <option value="behavioral">Behavioral</option><option value="medical">Medical</option>
                <option value="safety">Safety</option><option value="property">Property</option><option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-semibold text-sc-navy">Severity</label>
              <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal">
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-semibold text-sc-navy">Location</label>
              <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Where?"
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-semibold text-sc-navy">Date/Time</label>
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
            <input type="checkbox" checked={form.parent_notified} onChange={(e) => setForm((f) => ({ ...f, parent_notified: e.target.checked }))} className="rounded" />
            Parent/Guardian Notified
          </label>
          {error && <p className="text-label-sm text-sc-rose">{error}</p>}
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={isPending}
              className="flex-1 rounded-xl bg-sc-rose py-2.5 text-white text-label-md font-medium disabled:opacity-60">
              {isPending ? "Saving…" : "Submit Incident"}
            </button>
            <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Incident Detail Panel ──────────────────────────────────────────────────

function IncidentDetailPanel({ incident, studentName, orgId, onClose, onUpdate }: {
  incident: Incident; studentName: string; orgId: string;
  onClose: () => void; onUpdate: () => void;
}) {
  const [status, setStatus] = useState(incident.status);
  const [resNotes, setResNotes] = useState(incident.resolution_notes ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleUpdate() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("incidents")
        .update({
          status,
          resolution_notes: resNotes || null,
          resolved_at: status === "resolved" ? new Date().toISOString() : null,
        })
        .eq("id", incident.id)
        .eq("organization_id", orgId);
      setSaved(true);
      setTimeout(() => { setSaved(false); onUpdate(); }, 1000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100 sticky top-0 bg-white">
          <h2 className="font-serif text-heading-3 text-sc-navy">Incident Detail</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100"><X className="size-4 text-sc-gray" /></button>
        </div>
        <div className="p-5 space-y-5">
          {/* Header */}
          <div>
            <h3 className="text-heading-3 font-semibold text-sc-navy">{incident.title}</h3>
            <div className="flex flex-wrap gap-2 mt-2">
              {incident.severity && (
                <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium",
                  SEVERITY_CFG[incident.severity]?.cls ?? "bg-sc-gray-100 text-sc-gray border-sc-gray-200")}>
                  {SEVERITY_CFG[incident.severity]?.label ?? incident.severity}
                </span>
              )}
              <span className="rounded-full bg-sc-gray-100 border border-sc-gray-200 px-2.5 py-0.5 text-label-sm text-sc-gray capitalize">
                {TYPE_LABELS[incident.incident_type] ?? incident.incident_type}
              </span>
              {incident.parent_notified && (
                <span className="rounded-full bg-sc-teal-50 border border-sc-teal-200 px-2.5 py-0.5 text-label-sm text-sc-teal">
                  Parent Notified
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-label-sm">
            <div>
              <p className="text-sc-gray-400 font-medium">Student</p>
              {incident.student_id ? (
                <Link href={`/dashboard/students/${incident.student_id}`} className="text-sc-teal hover:underline font-semibold">
                  {studentName}
                </Link>
              ) : <p className="text-sc-gray">Unlinked</p>}
            </div>
            <div>
              <p className="text-sc-gray-400 font-medium">Date/Time</p>
              <p className="text-sc-navy">{new Date(incident.occurred_at).toLocaleString()}</p>
            </div>
            {incident.location && (
              <div>
                <p className="text-sc-gray-400 font-medium">Location</p>
                <p className="text-sc-navy">{incident.location}</p>
              </div>
            )}
            {incident.reporter && (
              <div>
                <p className="text-sc-gray-400 font-medium">Reported by</p>
                <p className="text-sc-navy">{incident.reporter.full_name}</p>
              </div>
            )}
          </div>

          {incident.description && (
            <div className="rounded-xl bg-sc-gray-50 p-4">
              <p className="text-label-sm font-semibold text-sc-navy mb-1">Description</p>
              <p className="text-body-sm text-sc-gray whitespace-pre-wrap">{incident.description}</p>
            </div>
          )}

          {/* Status update */}
          <div className="border-t border-sc-gray-100 pt-4 space-y-3">
            <p className="text-label-sm font-semibold text-sc-navy">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {["open","under_review","resolved","closed"].map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={cn("rounded-xl border px-3 py-1.5 text-label-sm font-medium capitalize transition-colors",
                    status === s ? "bg-sc-navy text-white border-sc-navy" : "border-sc-gray-200 text-sc-gray hover:border-sc-navy")}>
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-label-sm font-semibold text-sc-navy">Resolution Notes</label>
              <textarea rows={3} value={resNotes} onChange={(e) => setResNotes(e.target.value)}
                placeholder="Notes on how this was resolved…"
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
            </div>
            <div className="flex gap-3">
              <button onClick={handleUpdate} disabled={isPending}
                className="flex-1 rounded-xl bg-sc-teal py-2.5 text-white text-label-md font-medium disabled:opacity-60">
                {saved ? "Saved ✓" : isPending ? "Saving…" : "Update Incident"}
              </button>
              <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray">Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
