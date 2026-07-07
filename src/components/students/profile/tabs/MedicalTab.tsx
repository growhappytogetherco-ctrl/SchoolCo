"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ShieldAlert, AlertTriangle, Pill, User, Phone, CreditCard,
  Plus, Pencil, Archive, RotateCcw, ChevronDown, ChevronUp,
  FileText, Lock,
} from "lucide-react";
import {
  getAllergies, getConditions, getMedications, getMedicalRecord,
  createAllergy, updateAllergy, archiveAllergy, restoreAllergy,
  createCondition, updateCondition, archiveCondition, restoreCondition,
  createMedication, updateMedication, archiveMedication, restoreMedication,
  upsertMedicalRecord,
} from "@/app/actions/medicalActions";
import type {
  StudentAllergy, StudentCondition, StudentMedication, MedicalRecord,
  AllergySeverity,
} from "@/app/actions/medicalActions";
import type { StudentProfileData } from "../types";
import { cn } from "@/lib/utils";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
  data: StudentProfileData;
  isAdmin?: boolean;
  role?: string;
}

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEVERITY_LABELS: Record<AllergySeverity, string> = {
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
  life_threatening: "Life-Threatening",
};

function SeverityBadge({ severity }: { severity: AllergySeverity }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label-sm font-semibold";
  const map: Record<AllergySeverity, string> = {
    mild: "bg-sc-gray-100 text-sc-gray",
    moderate: "bg-sc-gold-50 text-sc-gold-700 border border-sc-gold-200",
    severe: "bg-sc-rose-50 text-sc-rose border border-sc-rose-200",
    life_threatening: "bg-sc-rose text-white",
  };
  return (
    <span className={cn(base, map[severity])}>
      {severity === "life_threatening" && <ShieldAlert className="size-3" />}
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title, icon, children, empty, emptyText, action,
}: {
  title: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  empty: boolean;
  emptyText: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
          {icon} {title}
        </h2>
        {action}
      </div>
      {empty ? (
        <p className="text-body-sm text-sc-gray-400">{emptyText}</p>
      ) : children}
    </div>
  );
}

// ── Inline form helpers ───────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-label-sm font-medium text-sc-navy">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal";
const selectCls = inputCls;
const textareaCls = cn(inputCls, "resize-none");

// ── Main component ────────────────────────────────────────────────────────────

export function MedicalTab({ studentId, data, isAdmin = false, role = "staff" }: Props) {
  const isVolunteer = role === "volunteer" || role === "parent";
  const canEdit = isAdmin || (!isVolunteer && !["parent", "student_future"].includes(role));

  const [allergies, setAllergies] = useState<StudentAllergy[]>([]);
  const [conditions, setConditions] = useState<StudentCondition[]>([]);
  const [medications, setMedications] = useState<StudentMedication[]>([]);
  const [medRecord, setMedRecord] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const [a, c, m, r] = await Promise.all([
      getAllergies(studentId),
      getConditions(studentId),
      getMedications(studentId),
      getMedicalRecord(studentId),
    ]);
    setAllergies(a);
    setConditions(c);
    setMedications(m);
    setMedRecord(r);
    setLoading(false);
  }

  useEffect(() => { reload(); }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <MedicalSkeleton />;

  // Critical alerts for banner
  const lifeThreateningAllergies = allergies.filter((a) => a.severity === "life_threatening");
  const severeAllergies = allergies.filter((a) => a.severity === "severe");
  const emergencyMeds = medications.filter((m) => m.is_emergency);
  const emergencyConditions = conditions.filter((c) => c.emergency_action_needed);
  const hasCritical = lifeThreateningAllergies.length > 0 || emergencyMeds.length > 0 || emergencyConditions.length > 0 || severeAllergies.length > 0;

  // Volunteer view
  if (isVolunteer) {
    return (
      <div className="space-y-5 max-w-3xl">
        {hasCritical && (
          <CriticalBanner
            lifeThreateningAllergies={lifeThreateningAllergies}
            severeAllergies={severeAllergies}
            emergencyMeds={emergencyMeds}
            emergencyConditions={emergencyConditions}
          />
        )}
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-6 flex flex-col items-center gap-3 text-center">
          <Lock className="size-8 text-sc-gray-300" />
          <p className="text-body-md text-sc-gray font-medium">
            Full medical details are visible to authorized staff only.
          </p>
          {!hasCritical && (
            <p className="text-body-sm text-sc-gray-400">No critical safety alerts on file.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* 1. Critical Safety Banner */}
      {hasCritical && (
        <CriticalBanner
          lifeThreateningAllergies={lifeThreateningAllergies}
          severeAllergies={severeAllergies}
          emergencyMeds={emergencyMeds}
          emergencyConditions={emergencyConditions}
        />
      )}

      {/* 2. Allergies */}
      <AllergiesSection
        studentId={studentId}
        allergies={allergies}
        canEdit={canEdit}
        onRefresh={reload}
      />

      {/* 3. Medical Conditions */}
      <ConditionsSection
        studentId={studentId}
        conditions={conditions}
        canEdit={canEdit}
        onRefresh={reload}
      />

      {/* 4. Medications */}
      <MedicationsSection
        studentId={studentId}
        medications={medications}
        canEdit={canEdit}
        onRefresh={reload}
      />

      {/* 5. Doctor & Insurance */}
      <DoctorInsuranceSection
        studentId={studentId}
        record={medRecord}
        canEdit={canEdit}
        onRefresh={reload}
      />

      {/* 6. Medical Notes */}
      <MedicalNotesSection
        studentId={studentId}
        record={medRecord}
        canEdit={canEdit}
        onRefresh={reload}
      />

      {/* 7. Documents placeholder */}
      <DocumentsPlaceholder />
    </div>
  );
}

// ── Critical Banner ───────────────────────────────────────────────────────────

function CriticalBanner({
  lifeThreateningAllergies, severeAllergies, emergencyMeds, emergencyConditions,
}: {
  lifeThreateningAllergies: StudentAllergy[];
  severeAllergies: StudentAllergy[];
  emergencyMeds: StudentMedication[];
  emergencyConditions: StudentCondition[];
}) {
  return (
    <div className="rounded-2xl border-2 border-sc-rose bg-sc-rose-50 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-5 text-sc-rose shrink-0" />
        <h2 className="font-serif text-heading-3 text-sc-rose font-bold">Critical Safety Alerts</h2>
      </div>
      <ul className="space-y-1.5">
        {lifeThreateningAllergies.map((a) => (
          <li key={a.id} className="flex items-start gap-2 text-label-sm text-sc-rose-800 font-semibold">
            <ShieldAlert className="size-3.5 shrink-0 mt-0.5 text-sc-rose" />
            LIFE-THREATENING ALLERGY: {a.allergy_name}
            {a.emergency_medication_required && " — Emergency medication required"}
          </li>
        ))}
        {severeAllergies.map((a) => (
          <li key={a.id} className="flex items-start gap-2 text-label-sm text-sc-rose-700">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            SEVERE ALLERGY: {a.allergy_name}
          </li>
        ))}
        {emergencyMeds.map((m) => (
          <li key={m.id} className="flex items-start gap-2 text-label-sm text-sc-rose-700">
            <Pill className="size-3.5 shrink-0 mt-0.5" />
            EMERGENCY MEDICATION: {m.medication_name}
            {m.storage_location && ` — stored at ${m.storage_location}`}
          </li>
        ))}
        {emergencyConditions.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-label-sm text-sc-rose-700">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            EMERGENCY CONDITION: {c.condition_name}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Allergies Section ─────────────────────────────────────────────────────────

function AllergiesSection({
  studentId, allergies, canEdit, onRefresh,
}: {
  studentId: string;
  allergies: StudentAllergy[];
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    allergy_name: "", reaction: "", severity: "mild" as AllergySeverity,
    emergency_medication_required: false, notes: "",
  });

  function startEdit(a: StudentAllergy) {
    setEditId(a.id);
    setForm({
      allergy_name: a.allergy_name,
      reaction: a.reaction ?? "",
      severity: a.severity,
      emergency_medication_required: a.emergency_medication_required,
      notes: a.notes ?? "",
    });
    setShowForm(false);
  }

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setForm({ allergy_name: "", reaction: "", severity: "mild", emergency_medication_required: false, notes: "" });
  }

  function submit() {
    startTransition(async () => {
      if (editId) {
        await updateAllergy(editId, studentId, {
          allergy_name: form.allergy_name,
          reaction: form.reaction || undefined,
          severity: form.severity,
          emergency_medication_required: form.emergency_medication_required,
          notes: form.notes || undefined,
        });
      } else {
        await createAllergy(studentId, {
          allergy_name: form.allergy_name,
          reaction: form.reaction || undefined,
          severity: form.severity,
          emergency_medication_required: form.emergency_medication_required,
          notes: form.notes || undefined,
        });
      }
      resetForm();
      onRefresh();
    });
  }

  const formOpen = showForm || editId !== null;

  return (
    <Section
      title="Allergies"
      icon={<AlertTriangle className="size-4 text-sc-gold" />}
      empty={allergies.length === 0 && !formOpen}
      emptyText="No allergies on file."
      action={canEdit && !formOpen ? (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium">
          <Plus className="size-3.5" /> Add
        </button>
      ) : undefined}
    >
      <div className="divide-y divide-sc-gray-100">
        {allergies.map((a) => (
          <div key={a.id}>
            <div className="py-3 first:pt-0 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-label-md font-semibold text-sc-navy">{a.allergy_name}</p>
                  <SeverityBadge severity={a.severity} />
                  {a.emergency_medication_required && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sc-rose-50 border border-sc-rose-200 px-2 py-0.5 text-label-sm text-sc-rose font-medium">
                      <Pill className="size-3" /> Epi required
                    </span>
                  )}
                </div>
                {a.reaction && <p className="text-body-sm text-sc-gray">Reaction: {a.reaction}</p>}
                {a.notes && <p className="text-body-sm text-sc-gray-400">{a.notes}</p>}
              </div>
              {canEdit && editId !== a.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(a)} className="p-1.5 rounded-lg hover:bg-sc-gray-50 text-sc-gray hover:text-sc-navy">
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => startTransition(async () => { await archiveAllergy(a.id, studentId); onRefresh(); })}
                    className="p-1.5 rounded-lg hover:bg-sc-rose-50 text-sc-gray hover:text-sc-rose"
                  >
                    <Archive className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
            {editId === a.id && (
              <AllergyForm
                form={form}
                setForm={setForm}
                onSubmit={submit}
                onCancel={resetForm}
                isPending={isPending}
                label="Save Changes"
              />
            )}
          </div>
        ))}
      </div>
      {showForm && (
        <AllergyForm
          form={form}
          setForm={setForm}
          onSubmit={submit}
          onCancel={resetForm}
          isPending={isPending}
          label="Add Allergy"
        />
      )}
    </Section>
  );
}

function AllergyForm({
  form, setForm, onSubmit, onCancel, isPending, label,
}: {
  form: { allergy_name: string; reaction: string; severity: AllergySeverity; emergency_medication_required: boolean; notes: string };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  label: string;
}) {
  return (
    <div className="mt-3 rounded-xl border border-sc-teal-100 bg-sc-teal-50/30 p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label="Allergy Name *">
          <input className={inputCls} value={form.allergy_name} onChange={(e) => setForm({ ...form, allergy_name: e.target.value })} placeholder="e.g. Bee stings, Peanuts" />
        </FormField>
        <FormField label="Severity *">
          <select className={selectCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as AllergySeverity })}>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
            <option value="life_threatening">Life-Threatening</option>
          </select>
        </FormField>
        <FormField label="Reaction">
          <input className={inputCls} value={form.reaction} onChange={(e) => setForm({ ...form, reaction: e.target.value })} placeholder="Describe typical reaction" />
        </FormField>
        <FormField label="Notes">
          <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes" />
        </FormField>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" className="rounded" checked={form.emergency_medication_required} onChange={(e) => setForm({ ...form, emergency_medication_required: e.target.checked })} />
        <span className="text-label-sm text-sc-navy">Emergency medication required (e.g. EpiPen)</span>
      </label>
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={isPending || !form.allergy_name} className="rounded-lg bg-sc-teal text-white px-4 py-2 text-label-sm font-medium disabled:opacity-50">
          {isPending ? "Saving…" : label}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:text-sc-navy">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Conditions Section ────────────────────────────────────────────────────────

function ConditionsSection({
  studentId, conditions, canEdit, onRefresh,
}: {
  studentId: string;
  conditions: StudentCondition[];
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    condition_name: "", description: "", emergency_action_needed: false,
    action_instructions: "", notes: "",
  });

  function startEdit(c: StudentCondition) {
    setEditId(c.id);
    setForm({
      condition_name: c.condition_name,
      description: c.description ?? "",
      emergency_action_needed: c.emergency_action_needed,
      action_instructions: c.action_instructions ?? "",
      notes: c.notes ?? "",
    });
    setShowForm(false);
  }

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setForm({ condition_name: "", description: "", emergency_action_needed: false, action_instructions: "", notes: "" });
  }

  function submit() {
    startTransition(async () => {
      if (editId) {
        await updateCondition(editId, studentId, {
          condition_name: form.condition_name,
          description: form.description || undefined,
          emergency_action_needed: form.emergency_action_needed,
          action_instructions: form.action_instructions || undefined,
          notes: form.notes || undefined,
        });
      } else {
        await createCondition(studentId, {
          condition_name: form.condition_name,
          description: form.description || undefined,
          emergency_action_needed: form.emergency_action_needed,
          action_instructions: form.action_instructions || undefined,
          notes: form.notes || undefined,
        });
      }
      resetForm();
      onRefresh();
    });
  }

  const formOpen = showForm || editId !== null;

  return (
    <Section
      title="Medical Conditions"
      icon={<AlertTriangle className="size-4 text-sc-gray" />}
      empty={conditions.length === 0 && !formOpen}
      emptyText="No conditions on file."
      action={canEdit && !formOpen ? (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium">
          <Plus className="size-3.5" /> Add
        </button>
      ) : undefined}
    >
      <div className="divide-y divide-sc-gray-100">
        {conditions.map((c) => (
          <div key={c.id}>
            <div className="py-3 first:pt-0 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-label-md font-semibold text-sc-navy">{c.condition_name}</p>
                  {c.emergency_action_needed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sc-rose-50 border border-sc-rose-200 px-2 py-0.5 text-label-sm text-sc-rose font-semibold">
                      <ShieldAlert className="size-3" /> Emergency action needed
                    </span>
                  )}
                </div>
                {c.description && <p className="text-body-sm text-sc-gray">{c.description}</p>}
                {c.action_instructions && (
                  <p className="text-body-sm text-sc-navy bg-sc-rose-50 rounded-lg px-3 py-2 border border-sc-rose-100">
                    Action: {c.action_instructions}
                  </p>
                )}
                {c.notes && <p className="text-body-sm text-sc-gray-400">{c.notes}</p>}
              </div>
              {canEdit && editId !== c.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(c)} className="p-1.5 rounded-lg hover:bg-sc-gray-50 text-sc-gray hover:text-sc-navy">
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => startTransition(async () => { await archiveCondition(c.id, studentId); onRefresh(); })}
                    className="p-1.5 rounded-lg hover:bg-sc-rose-50 text-sc-gray hover:text-sc-rose"
                  >
                    <Archive className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
            {editId === c.id && (
              <ConditionForm form={form} setForm={setForm} onSubmit={submit} onCancel={resetForm} isPending={isPending} label="Save Changes" />
            )}
          </div>
        ))}
      </div>
      {showForm && (
        <ConditionForm form={form} setForm={setForm} onSubmit={submit} onCancel={resetForm} isPending={isPending} label="Add Condition" />
      )}
    </Section>
  );
}

function ConditionForm({
  form, setForm, onSubmit, onCancel, isPending, label,
}: {
  form: { condition_name: string; description: string; emergency_action_needed: boolean; action_instructions: string; notes: string };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  label: string;
}) {
  return (
    <div className="mt-3 rounded-xl border border-sc-teal-100 bg-sc-teal-50/30 p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label="Condition Name *">
          <input className={inputCls} value={form.condition_name} onChange={(e) => setForm({ ...form, condition_name: e.target.value })} placeholder="e.g. Asthma, Diabetes" />
        </FormField>
        <FormField label="Description">
          <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" />
        </FormField>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" className="rounded" checked={form.emergency_action_needed} onChange={(e) => setForm({ ...form, emergency_action_needed: e.target.checked })} />
        <span className="text-label-sm text-sc-navy">Emergency action required</span>
      </label>
      {form.emergency_action_needed && (
        <FormField label="Action Instructions">
          <textarea className={textareaCls} rows={2} value={form.action_instructions} onChange={(e) => setForm({ ...form, action_instructions: e.target.value })} placeholder="What staff should do in an emergency" />
        </FormField>
      )}
      <FormField label="Notes">
        <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes" />
      </FormField>
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={isPending || !form.condition_name} className="rounded-lg bg-sc-teal text-white px-4 py-2 text-label-sm font-medium disabled:opacity-50">
          {isPending ? "Saving…" : label}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:text-sc-navy">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Medications Section ───────────────────────────────────────────────────────

function MedicationsSection({
  studentId, medications, canEdit, onRefresh,
}: {
  studentId: string;
  medications: StudentMedication[];
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    medication_name: "", dosage: "", frequency: "", schedule: "",
    instructions: "", storage_location: "", stored_on_campus: false,
    is_emergency: false, notes: "", prescribed_by: "",
    authorization_on_file: false, requires_daily_log: false,
  });

  function startEdit(m: StudentMedication) {
    setEditId(m.id);
    setForm({
      medication_name: m.medication_name,
      dosage: m.dosage ?? "",
      frequency: m.frequency ?? "",
      schedule: m.schedule ?? "",
      instructions: m.instructions ?? "",
      storage_location: m.storage_location ?? "",
      stored_on_campus: m.stored_on_campus,
      is_emergency: m.is_emergency,
      notes: m.notes ?? "",
      prescribed_by: m.prescribed_by ?? "",
      authorization_on_file: m.authorization_on_file,
      requires_daily_log: m.requires_daily_log,
    });
    setShowForm(false);
  }

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setForm({ medication_name: "", dosage: "", frequency: "", schedule: "", instructions: "", storage_location: "", stored_on_campus: false, is_emergency: false, notes: "", prescribed_by: "", authorization_on_file: false, requires_daily_log: false });
  }

  function submit() {
    startTransition(async () => {
      if (editId) {
        await updateMedication(editId, studentId, { ...form });
      } else {
        await createMedication(studentId, { ...form });
      }
      resetForm();
      onRefresh();
    });
  }

  const formOpen = showForm || editId !== null;
  const emergency = medications.filter((m) => m.is_emergency);
  const regular = medications.filter((m) => !m.is_emergency);

  return (
    <Section
      title="Medications"
      icon={<Pill className="size-4 text-sc-teal" />}
      empty={medications.length === 0 && !formOpen}
      emptyText="No medications on file."
      action={canEdit && !formOpen ? (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium">
          <Plus className="size-3.5" /> Add
        </button>
      ) : undefined}
    >
      {/* Emergency first */}
      {emergency.length > 0 && (
        <div className="space-y-2">
          <p className="text-label-sm font-semibold text-sc-rose uppercase tracking-wide">Emergency Medications</p>
          <div className="divide-y divide-sc-rose-100 rounded-xl border border-sc-rose-200 overflow-hidden">
            {emergency.map((m) => (
              <MedRow key={m.id} med={m} canEdit={canEdit} editId={editId} onEdit={startEdit} onArchive={() => startTransition(async () => { await archiveMedication(m.id, studentId); onRefresh(); })} form={form} setForm={setForm} onSubmit={submit} onCancel={resetForm} isPending={isPending} />
            ))}
          </div>
        </div>
      )}
      {regular.length > 0 && (
        <div className="divide-y divide-sc-gray-100">
          {regular.map((m) => (
            <MedRow key={m.id} med={m} canEdit={canEdit} editId={editId} onEdit={startEdit} onArchive={() => startTransition(async () => { await archiveMedication(m.id, studentId); onRefresh(); })} form={form} setForm={setForm} onSubmit={submit} onCancel={resetForm} isPending={isPending} />
          ))}
        </div>
      )}
      {showForm && (
        <MedForm form={form} setForm={setForm} onSubmit={submit} onCancel={resetForm} isPending={isPending} label="Add Medication" />
      )}
    </Section>
  );
}

function MedRow({
  med, canEdit, editId, onEdit, onArchive, form, setForm, onSubmit, onCancel, isPending,
}: {
  med: StudentMedication;
  canEdit: boolean;
  editId: string | null;
  onEdit: (m: StudentMedication) => void;
  onArchive: () => void;
  form: Parameters<typeof MedForm>[0]["form"];
  setForm: Parameters<typeof MedForm>[0]["setForm"];
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className={cn("py-3 first:pt-0", med.is_emergency && "px-3 bg-sc-rose-50/50")}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className={cn("text-label-md font-semibold", med.is_emergency ? "text-sc-rose" : "text-sc-navy")}>
            {med.medication_name}
          </p>
          {med.dosage && <p className="text-body-sm text-sc-gray">Dose: {med.dosage}</p>}
          {med.frequency && <p className="text-body-sm text-sc-gray">Frequency: {med.frequency}</p>}
          {med.instructions && <p className="text-body-sm text-sc-navy">{med.instructions}</p>}
          {med.storage_location && <p className="text-body-sm text-sc-gray-400">Stored: {med.storage_location}</p>}
          {med.stored_on_campus && <p className="text-label-sm text-sc-teal">Stored on campus</p>}
        </div>
        {canEdit && editId !== med.id && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onEdit(med)} className="p-1.5 rounded-lg hover:bg-sc-gray-50 text-sc-gray hover:text-sc-navy"><Pencil className="size-3.5" /></button>
            <button onClick={onArchive} className="p-1.5 rounded-lg hover:bg-sc-rose-50 text-sc-gray hover:text-sc-rose"><Archive className="size-3.5" /></button>
          </div>
        )}
      </div>
      {editId === med.id && (
        <MedForm form={form} setForm={setForm} onSubmit={onSubmit} onCancel={onCancel} isPending={isPending} label="Save Changes" />
      )}
    </div>
  );
}

function MedForm({
  form, setForm, onSubmit, onCancel, isPending, label,
}: {
  form: { medication_name: string; dosage: string; frequency: string; schedule: string; instructions: string; storage_location: string; stored_on_campus: boolean; is_emergency: boolean; notes: string; prescribed_by: string; authorization_on_file: boolean; requires_daily_log: boolean };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  label: string;
}) {
  return (
    <div className="mt-3 rounded-xl border border-sc-teal-100 bg-sc-teal-50/30 p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label="Medication Name *">
          <input className={inputCls} value={form.medication_name} onChange={(e) => setForm({ ...form, medication_name: e.target.value })} placeholder="e.g. EpiPen, Albuterol" />
        </FormField>
        <FormField label="Dosage">
          <input className={inputCls} value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} placeholder="e.g. 0.3mg" />
        </FormField>
        <FormField label="Frequency">
          <input className={inputCls} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="e.g. As needed, Twice daily" />
        </FormField>
        <FormField label="Schedule">
          <input className={inputCls} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="e.g. 8am and noon" />
        </FormField>
        <FormField label="Storage Location">
          <input className={inputCls} value={form.storage_location} onChange={(e) => setForm({ ...form, storage_location: e.target.value })} placeholder="e.g. Nurse's office, Backpack" />
        </FormField>
        <FormField label="Prescribed By">
          <input className={inputCls} value={form.prescribed_by} onChange={(e) => setForm({ ...form, prescribed_by: e.target.value })} placeholder="Doctor's name" />
        </FormField>
      </div>
      <FormField label="Instructions">
        <textarea className={textareaCls} rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Administration instructions" />
      </FormField>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.is_emergency} onChange={(e) => setForm({ ...form, is_emergency: e.target.checked })} />
          <span className="text-label-sm text-sc-navy">Emergency medication</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.stored_on_campus} onChange={(e) => setForm({ ...form, stored_on_campus: e.target.checked })} />
          <span className="text-label-sm text-sc-navy">Stored on campus</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.authorization_on_file} onChange={(e) => setForm({ ...form, authorization_on_file: e.target.checked })} />
          <span className="text-label-sm text-sc-navy">Authorization on file</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.requires_daily_log} onChange={(e) => setForm({ ...form, requires_daily_log: e.target.checked })} />
          <span className="text-label-sm text-sc-navy">Requires daily log</span>
        </label>
      </div>
      <FormField label="Notes">
        <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes" />
      </FormField>
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={isPending || !form.medication_name} className="rounded-lg bg-sc-teal text-white px-4 py-2 text-label-sm font-medium disabled:opacity-50">
          {isPending ? "Saving…" : label}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:text-sc-navy">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Doctor & Insurance Section ────────────────────────────────────────────────

function DoctorInsuranceSection({
  studentId, record, canEdit, onRefresh,
}: {
  studentId: string;
  record: MedicalRecord | null;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    primary_doctor_name: record?.primary_doctor_name ?? "",
    primary_doctor_phone: record?.primary_doctor_phone ?? "",
    primary_doctor_fax: record?.primary_doctor_fax ?? "",
    preferred_hospital: record?.preferred_hospital ?? "",
    insurance_provider: record?.insurance_provider ?? "",
    insurance_policy_number: record?.insurance_policy_number ?? "",
    insurance_group_number: record?.insurance_group_number ?? "",
    insurance_phone: record?.insurance_phone ?? "",
  });

  useEffect(() => {
    setForm({
      primary_doctor_name: record?.primary_doctor_name ?? "",
      primary_doctor_phone: record?.primary_doctor_phone ?? "",
      primary_doctor_fax: record?.primary_doctor_fax ?? "",
      preferred_hospital: record?.preferred_hospital ?? "",
      insurance_provider: record?.insurance_provider ?? "",
      insurance_policy_number: record?.insurance_policy_number ?? "",
      insurance_group_number: record?.insurance_group_number ?? "",
      insurance_phone: record?.insurance_phone ?? "",
    });
  }, [record]);

  function submit() {
    startTransition(async () => {
      await upsertMedicalRecord(studentId, form);
      setEditing(false);
      onRefresh();
    });
  }

  const hasDoctor = !!record?.primary_doctor_name;
  const hasInsurance = !!record?.insurance_provider;

  return (
    <div className="grid sm:grid-cols-2 gap-5">
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
            <User className="size-4 text-sc-teal" /> Primary Doctor
          </h2>
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium">
              <Pencil className="size-3.5" /> Edit
            </button>
          )}
        </div>
        {!editing ? (
          hasDoctor ? (
            <div className="space-y-1">
              <p className="text-label-md font-semibold text-sc-navy">{record!.primary_doctor_name}</p>
              {record!.primary_doctor_phone && (
                <a href={`tel:${record!.primary_doctor_phone}`} className="flex items-center gap-1 text-label-sm text-sc-teal">
                  <Phone className="size-3" /> {record!.primary_doctor_phone}
                </a>
              )}
              {record!.primary_doctor_fax && (
                <p className="text-label-sm text-sc-gray">Fax: {record!.primary_doctor_fax}</p>
              )}
              {record!.preferred_hospital && (
                <p className="text-label-sm text-sc-gray">Hospital: {record!.preferred_hospital}</p>
              )}
            </div>
          ) : (
            <p className="text-body-sm text-sc-gray-400">Not on file.</p>
          )
        ) : (
          <div className="space-y-2">
            <FormField label="Doctor Name">
              <input className={inputCls} value={form.primary_doctor_name} onChange={(e) => setForm({ ...form, primary_doctor_name: e.target.value })} />
            </FormField>
            <FormField label="Phone">
              <input className={inputCls} value={form.primary_doctor_phone} onChange={(e) => setForm({ ...form, primary_doctor_phone: e.target.value })} />
            </FormField>
            <FormField label="Fax">
              <input className={inputCls} value={form.primary_doctor_fax} onChange={(e) => setForm({ ...form, primary_doctor_fax: e.target.value })} />
            </FormField>
            <FormField label="Preferred Hospital">
              <input className={inputCls} value={form.preferred_hospital} onChange={(e) => setForm({ ...form, preferred_hospital: e.target.value })} />
            </FormField>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
            <CreditCard className="size-4 text-sc-teal" /> Insurance
          </h2>
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium">
              <Pencil className="size-3.5" /> Edit
            </button>
          )}
        </div>
        {!editing ? (
          hasInsurance ? (
            <div className="space-y-1 text-label-sm text-sc-navy">
              <p className="font-semibold">{record!.insurance_provider}</p>
              {record!.insurance_policy_number && <p className="text-sc-gray">Policy #: {record!.insurance_policy_number}</p>}
              {record!.insurance_group_number && <p className="text-sc-gray">Group #: {record!.insurance_group_number}</p>}
              {record!.insurance_phone && (
                <a href={`tel:${record!.insurance_phone}`} className="flex items-center gap-1 text-sc-teal">
                  <Phone className="size-3" /> {record!.insurance_phone}
                </a>
              )}
            </div>
          ) : (
            <p className="text-body-sm text-sc-gray-400">Not on file.</p>
          )
        ) : (
          <div className="space-y-2">
            <FormField label="Provider">
              <input className={inputCls} value={form.insurance_provider} onChange={(e) => setForm({ ...form, insurance_provider: e.target.value })} />
            </FormField>
            <FormField label="Policy #">
              <input className={inputCls} value={form.insurance_policy_number} onChange={(e) => setForm({ ...form, insurance_policy_number: e.target.value })} />
            </FormField>
            <FormField label="Group #">
              <input className={inputCls} value={form.insurance_group_number} onChange={(e) => setForm({ ...form, insurance_group_number: e.target.value })} />
            </FormField>
            <FormField label="Phone">
              <input className={inputCls} value={form.insurance_phone} onChange={(e) => setForm({ ...form, insurance_phone: e.target.value })} />
            </FormField>
          </div>
        )}
      </div>

      {editing && (
        <div className="sm:col-span-2 flex gap-2">
          <button onClick={submit} disabled={isPending} className="rounded-lg bg-sc-teal text-white px-4 py-2 text-label-sm font-medium disabled:opacity-50">
            {isPending ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:text-sc-navy">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Medical Notes Section ─────────────────────────────────────────────────────

function MedicalNotesSection({
  studentId, record, canEdit, onRefresh,
}: {
  studentId: string;
  record: MedicalRecord | null;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [isPending, startTransition] = useTransition();

  useEffect(() => { setNotes(record?.notes ?? ""); }, [record]);

  function submit() {
    startTransition(async () => {
      await upsertMedicalRecord(studentId, { notes });
      setEditing(false);
      onRefresh();
    });
  }

  return (
    <Section
      title="Medical Notes"
      icon={<FileText className="size-4 text-sc-gray" />}
      empty={!record?.notes && !editing}
      emptyText="No medical notes on file."
      action={canEdit && !editing ? (
        <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium">
          <Pencil className="size-3.5" /> Edit
        </button>
      ) : undefined}
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            className={cn(textareaCls, "min-h-24")}
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add medical notes here…"
          />
          <div className="flex gap-2">
            <button onClick={submit} disabled={isPending} className="rounded-lg bg-sc-teal text-white px-4 py-2 text-label-sm font-medium disabled:opacity-50">
              {isPending ? "Saving…" : "Save Notes"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:text-sc-navy">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-body-md text-sc-navy whitespace-pre-wrap">{record?.notes}</p>
      )}
    </Section>
  );
}

// ── Documents Placeholder ─────────────────────────────────────────────────────

const DOC_TYPES = [
  "Medical forms",
  "Allergy action plans",
  "Medication authorization",
  "Emergency action plan",
];

function DocumentsPlaceholder() {
  return (
    <Section
      title="Documents"
      icon={<FileText className="size-4 text-sc-gray" />}
      empty={false}
      emptyText=""
    >
      <div className="divide-y divide-sc-gray-100">
        {DOC_TYPES.map((doc) => (
          <div key={doc} className="py-2.5 flex items-center justify-between">
            <p className="text-body-sm text-sc-navy">{doc}</p>
            <span className="text-label-sm text-sc-gray-400 italic">Not uploaded</span>
          </div>
        ))}
      </div>
      <p className="text-label-sm text-sc-gray-400 pt-1">Document uploads coming soon.</p>
    </Section>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function MedicalSkeleton() {
  return (
    <div className="space-y-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
          <div className="h-5 w-40 rounded-lg bg-sc-gray-100 animate-pulse" />
          <div className="h-4 w-full rounded-lg bg-sc-gray-100 animate-pulse" />
          <div className="h-4 w-2/3 rounded-lg bg-sc-gray-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
