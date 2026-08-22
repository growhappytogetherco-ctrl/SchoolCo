"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertOctagon, CheckCircle, Clock, Plus, Pencil, Trash2, X, AlertTriangle } from "lucide-react";
import { getStudentIncidentsData } from "@/app/actions/profileData";
import { createIncident, updateIncident, deleteIncident, type IncidentPayload } from "@/app/actions/studentActions";
import { cn } from "@/lib/utils";

interface Props {
  studentId:   string;
  studentName: string;
  isAdmin?:    boolean;
}

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
}

const TYPE_CFG: Record<string, { cls: string }> = {
  behavioral: { cls: "bg-sc-gold-50  text-sc-gold-700  border-sc-gold-200"  },
  medical:    { cls: "bg-sc-rose-50  text-sc-rose-700  border-sc-rose-200"  },
  safety:     { cls: "bg-sc-rose     text-white         border-sc-rose-700"  },
  property:   { cls: "bg-sc-navy-50  text-sc-navy       border-sc-navy-200"  },
  other:      { cls: "bg-sc-gray-50  text-sc-gray       border-sc-gray-200"  },
};

const SEVERITY_CFG: Record<string, string> = {
  low:      "bg-sc-gray-50  text-sc-gray     border-sc-gray-200",
  medium:   "bg-sc-gold-50  text-sc-gold-700 border-sc-gold-200",
  high:     "bg-sc-rose-50  text-sc-rose-700 border-sc-rose-200",
  critical: "bg-sc-rose     text-white        border-sc-rose-700",
};

const STATUS_CFG: Record<string, { icon: React.ElementType; cls: string }> = {
  open:         { icon: AlertOctagon, cls: "text-sc-rose"  },
  under_review: { icon: Clock,        cls: "text-sc-gold"  },
  resolved:     { icon: CheckCircle,  cls: "text-sc-teal"  },
  closed:       { icon: CheckCircle,  cls: "text-sc-gray"  },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Shared inline modal ───────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100 sticky top-0 bg-white">
          <h2 className="font-serif text-heading-3 text-sc-navy">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100">
            <X className="size-4 text-sc-gray" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Incident form (shared by create + edit) ───────────────────────────────

interface IncidentFormState {
  title:           string;
  description:     string;
  incident_type:   string;
  severity:        string;
  location:        string;
  occurred_at:     string;
  parent_notified: boolean;
  status:          string;
  resolution_notes: string;
}

function IncidentForm({
  value, onChange, showStatus,
}: {
  value: IncidentFormState;
  onChange: (v: IncidentFormState) => void;
  showStatus: boolean;
}) {
  const set = (k: keyof IncidentFormState, v: string | boolean) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-label-sm font-semibold text-sc-navy">Title *</label>
        <input value={value.title} onChange={(e) => set("title", e.target.value)}
          placeholder="Brief description"
          className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-label-sm font-semibold text-sc-navy">Type</label>
          <select value={value.incident_type} onChange={(e) => set("incident_type", e.target.value)}
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
          <select value={value.severity} onChange={(e) => set("severity", e.target.value)}
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-label-sm font-semibold text-sc-navy">Location</label>
          <input value={value.location} onChange={(e) => set("location", e.target.value)}
            placeholder="Where?"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="space-y-1">
          <label className="text-label-sm font-semibold text-sc-navy">Date / Time</label>
          <input type="datetime-local" value={value.occurred_at} onChange={(e) => set("occurred_at", e.target.value)}
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
      </div>
      {showStatus && (
        <div className="space-y-1">
          <label className="text-label-sm font-semibold text-sc-navy">Status</label>
          <select value={value.status} onChange={(e) => set("status", e.target.value)}
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="open">Open</option>
            <option value="under_review">Under Review</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-label-sm font-semibold text-sc-navy">Description</label>
        <textarea rows={4} value={value.description} onChange={(e) => set("description", e.target.value)}
          placeholder="What happened?"
          className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
      </div>
      {showStatus && (
        <div className="space-y-1.5">
          <label className="text-label-sm font-semibold text-sc-navy">Resolution Notes</label>
          <textarea rows={3} value={value.resolution_notes} onChange={(e) => set("resolution_notes", e.target.value)}
            placeholder="How was this resolved?"
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2.5 text-label-md resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
      )}
      <label className="flex items-center gap-2 text-label-sm cursor-pointer">
        <input type="checkbox" checked={value.parent_notified}
          onChange={(e) => set("parent_notified", e.target.checked)} className="rounded" />
        Parent / Guardian Notified
      </label>
    </div>
  );
}

// ── Create modal ─────────────────────────────────────────────────────────

function CreateModal({ studentId, studentName, onClose, onDone }: {
  studentId: string; studentName: string; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState<IncidentFormState>({
    title: "", description: "", incident_type: "behavioral", severity: "medium",
    location: "", occurred_at: new Date().toISOString().slice(0, 16),
    parent_notified: false, status: "open", resolution_notes: "",
  });
  const [error, setError]     = useState<string | null>(null);
  const [saving, startSave]   = useTransition();

  function save() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    startSave(async () => {
      const payload: IncidentPayload = {
        title: form.title, description: form.description,
        incident_type: form.incident_type, severity: form.severity,
        location: form.location, occurred_at: form.occurred_at,
        parent_notified: form.parent_notified,
      };
      const r = await createIncident(studentId, payload);
      if (!r.success) { setError(r.error); return; }
      onDone();
    });
  }

  return (
    <Modal title={`Add Incident — ${studentName}`} onClose={onClose}>
      <div className="space-y-4">
        <IncidentForm value={form} onChange={setForm} showStatus={false} />
        {error && (
          <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
        )}
        <div className="flex gap-3 pt-1">
          <button onClick={save} disabled={saving}
            className="flex-1 rounded-xl bg-sc-rose py-2.5 text-white text-label-md font-medium disabled:opacity-60">
            {saving ? "Saving…" : "Submit Incident"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit/Detail modal ────────────────────────────────────────────────────

function EditModal({ incident, studentName, isAdmin, onClose, onDone }: {
  incident: Incident; studentName: string; isAdmin: boolean;
  onClose: () => void; onDone: () => void;
}) {
  const [mode, setMode]       = useState<"view" | "edit" | "confirmDelete">("view");
  const [form, setForm]       = useState<IncidentFormState>({
    title:            incident.title,
    description:      incident.description ?? "",
    incident_type:    incident.incident_type,
    severity:         incident.severity ?? "medium",
    location:         incident.location ?? "",
    occurred_at:      incident.occurred_at.slice(0, 16),
    parent_notified:  incident.parent_notified,
    status:           incident.status,
    resolution_notes: incident.resolution_notes ?? "",
  });
  const [error, setError]     = useState<string | null>(null);
  const [saving, startSave]   = useTransition();
  const [deleting, startDel]  = useTransition();

  function save() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    startSave(async () => {
      const r = await updateIncident(incident.id, {
        title:            form.title,
        description:      form.description || null,
        incident_type:    form.incident_type,
        severity:         form.severity || null,
        location:         form.location || null,
        occurred_at:      form.occurred_at,
        parent_notified:  form.parent_notified,
        status:           form.status,
        resolution_notes: form.resolution_notes || null,
      });
      if (!r.success) { setError(r.error); return; }
      onDone();
    });
  }

  function del() {
    startDel(async () => {
      const r = await deleteIncident(incident.id);
      if (!r.success) { setError(r.error); return; }
      onDone();
    });
  }

  const type = TYPE_CFG[incident.incident_type] ?? TYPE_CFG.other;
  const StatusIcon = STATUS_CFG[incident.status]?.icon ?? AlertOctagon;
  const statusCls  = STATUS_CFG[incident.status]?.cls  ?? "text-sc-gray";

  if (mode === "confirmDelete") {
    return (
      <Modal title="Delete Incident" onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-lg border border-sc-rose-200 bg-sc-rose-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 text-sc-rose shrink-0 mt-0.5" />
              <div>
                <p className="text-label-sm font-semibold text-sc-rose-700">Permanently delete this incident?</p>
                <p className="text-label-sm text-sc-rose-700 mt-0.5">"{incident.title}" · {fmtDate(incident.occurred_at)}</p>
              </div>
            </div>
          </div>
          <p className="text-label-sm text-sc-gray">This action cannot be undone. Use this only for erroneous or test records.</p>
          {error && (
            <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
          )}
          <div className="flex gap-3">
            <button onClick={() => setMode("view")} className="flex-1 rounded-xl border border-sc-gray-200 py-2.5 text-sc-gray">Cancel</button>
            <button onClick={del} disabled={deleting}
              className="flex-1 rounded-xl bg-sc-rose py-2.5 text-white text-label-md font-medium disabled:opacity-60">
              {deleting ? "Deleting…" : "Delete Incident"}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (mode === "edit") {
    return (
      <Modal title="Edit Incident" onClose={onClose}>
        <div className="space-y-4">
          <IncidentForm value={form} onChange={setForm} showStatus={true} />
          {error && (
            <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={() => setMode("view")} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray">Back</button>
            <button onClick={save} disabled={saving}
              className="flex-1 rounded-xl bg-sc-teal py-2.5 text-white text-label-md font-medium disabled:opacity-60">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // View mode
  return (
    <Modal title="Incident Detail" onClose={onClose}>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium capitalize", type.cls)}>
              {incident.incident_type}
            </span>
            {incident.severity && (
              <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium", SEVERITY_CFG[incident.severity] ?? "")}>
                {incident.severity}
              </span>
            )}
            <span className={cn("flex items-center gap-1 text-label-sm font-medium capitalize", statusCls)}>
              <StatusIcon className="size-3.5" />
              {incident.status.replace("_", " ")}
            </span>
          </div>
          <h3 className="font-serif text-heading-3 text-sc-navy">{incident.title}</h3>
          <p className="text-label-sm text-sc-gray mt-1">{fmtDate(incident.occurred_at)}</p>
          {incident.location && <p className="text-label-sm text-sc-gray">📍 {incident.location}</p>}
        </div>

        {incident.description && (
          <div className="rounded-xl bg-sc-gray-50 px-4 py-3">
            <p className="text-body-sm text-sc-navy whitespace-pre-wrap">{incident.description}</p>
          </div>
        )}

        {incident.parent_notified && (
          <div className="flex items-center gap-1.5 text-label-sm text-sc-teal">
            <CheckCircle className="size-3.5" /> Parent / Guardian Notified
          </div>
        )}

        {incident.resolution_notes && (
          <div className="rounded-lg bg-sc-teal-50 border border-sc-teal-200 px-3 py-2">
            <p className="text-label-sm font-semibold text-sc-teal-700">Resolution</p>
            <p className="text-label-sm text-sc-navy mt-0.5">{incident.resolution_notes}</p>
          </div>
        )}

        {isAdmin && (
          <div className="flex gap-2 pt-2 border-t border-sc-gray-100">
            <button onClick={() => setMode("edit")}
              className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy hover:border-sc-teal hover:text-sc-teal transition-colors">
              <Pencil className="size-3.5" /> Edit
            </button>
            <button onClick={() => setMode("confirmDelete")}
              className="flex items-center gap-1.5 rounded-xl border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700 hover:bg-sc-rose-50 transition-colors">
              <Trash2 className="size-3.5" /> Delete
            </button>
            <button onClick={onClose} className="ml-auto rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-gray">
              Close
            </button>
          </div>
        )}
        {!isAdmin && (
          <div className="flex justify-end pt-2 border-t border-sc-gray-100">
            <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-gray">Close</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────

export function IncidentsTab({ studentId, studentName, isAdmin = false }: Props) {
  const [data,       setData]       = useState<Incident[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected,   setSelected]   = useState<Incident | null>(null);

  function load() {
    setLoading(true);
    getStudentIncidentsData(studentId).then((d) => {
      setData((d?.incidents ?? []) as unknown as Incident[]);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map((i) => (
          <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  const incidents = data;
  const open = incidents.filter((i) => i.status === "open" || i.status === "under_review").length;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          {open > 0 && (
            <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-4 py-2.5">
              <p className="text-label-sm text-sc-rose-700 font-semibold">
                {open} open {open === 1 ? "incident" : "incidents"} requiring attention
              </p>
            </div>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-xl bg-sc-rose px-4 py-2 text-white text-label-md font-medium hover:bg-sc-rose/90 transition-colors shrink-0"
          >
            <Plus className="size-4" /> Add Incident
          </button>
        )}
      </div>

      {incidents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center space-y-3">
          <p className="text-body-md text-sc-gray-400">No incidents recorded for this student.</p>
          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-4 py-2 text-label-sm text-sc-rose-700 hover:bg-sc-rose hover:text-white transition-colors"
            >
              <Plus className="size-3.5" /> Add Incident
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((inc) => {
            const type = TYPE_CFG[inc.incident_type] ?? TYPE_CFG.other;
            const StatusIcon = STATUS_CFG[inc.status]?.icon ?? AlertOctagon;
            const statusCls = STATUS_CFG[inc.status]?.cls ?? "text-sc-gray";

            return (
              <div
                key={inc.id}
                className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3 cursor-pointer hover:border-sc-teal transition-colors"
                onClick={() => setSelected(inc)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 mb-1.5">
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium capitalize", type.cls)}>
                        {inc.incident_type}
                      </span>
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium", SEVERITY_CFG[inc.severity ?? ""] ?? "")}>
                        {inc.severity}
                      </span>
                    </div>
                    <h3 className="text-label-md font-semibold text-sc-navy">{inc.title}</h3>
                    <p className="text-label-sm text-sc-gray">{fmtDate(inc.occurred_at)}</p>
                  </div>
                  <div className={cn("flex items-center gap-1 text-label-sm font-medium shrink-0", statusCls)}>
                    <StatusIcon className="size-4" />
                    <span className="capitalize">{inc.status.replace("_", " ")}</span>
                  </div>
                </div>

                {inc.description && (
                  <p className="text-body-sm text-sc-navy whitespace-pre-wrap line-clamp-2">{inc.description}</p>
                )}

                {inc.resolution_notes && (
                  <div className="rounded-lg bg-sc-teal-50 border border-sc-teal-200 px-3 py-2">
                    <p className="text-label-sm font-semibold text-sc-teal-700">Resolution</p>
                    <p className="text-label-sm text-sc-navy mt-0.5 line-clamp-2">{inc.resolution_notes}</p>
                  </div>
                )}

                {inc.parent_notified && (
                  <div className="flex items-center gap-1.5 text-label-sm text-sc-teal">
                    <CheckCircle className="size-3.5" /> Parent notified
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateModal
          studentId={studentId}
          studentName={studentName}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); load(); }}
        />
      )}

      {selected && (
        <EditModal
          incident={selected}
          studentName={studentName}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onDone={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}
