"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Plus, ShieldCheck, ShieldOff, ShieldAlert, Trash2, Pencil, X, Check, Phone,
} from "lucide-react";
import {
  getPickupPersons,
  createPickupPerson,
  updatePickupPerson,
  deletePickupPerson,
  type PickupPerson,
  type CreatePickupPersonPayload,
} from "@/app/actions/pickupPersons";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  role: string;
  isAdmin: boolean;
}

type AuthStatus = "authorized" | "emergency" | "supervised" | "not_authorized";

function getStatus(p: PickupPerson): AuthStatus {
  if (!p.is_authorized) return "not_authorized";
  if (p.requires_supervision) return "supervised";
  if (p.is_emergency_only) return "emergency";
  return "authorized";
}

const STATUS_CFG: Record<AuthStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  authorized:     { label: "Authorized",      cls: "bg-sc-teal-50 text-sc-teal border-sc-teal-200",        Icon: ShieldCheck  },
  emergency:      { label: "Emergency Only",  cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",    Icon: ShieldAlert  },
  supervised:     { label: "Supervised Only", cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",    Icon: ShieldAlert  },
  not_authorized: { label: "NOT AUTHORIZED",  cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200",        Icon: ShieldOff    },
};

const BLANK: CreatePickupPersonPayload = {
  full_name: "", relationship: "other", phone: "", email: "",
  is_authorized: true, is_emergency_only: false, requires_supervision: false,
  restriction_notes: "", admin_only_notes: "",
};

export function PickupPersonsPanel({ studentId, role: _role, isAdmin }: Props) {
  const [persons, setPersons] = useState<PickupPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreatePickupPersonPayload>(BLANK);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    getPickupPersons(studentId).then((data) => {
      setPersons(data);
      setLoading(false);
    });
  }, [studentId]);

  function openCreate() {
    setEditingId(null);
    setForm(BLANK);
    setShowForm(true);
  }

  function openEdit(p: PickupPerson) {
    setForm({
      full_name:            p.full_name,
      relationship:         p.relationship,
      phone:                p.phone ?? "",
      email:                p.email ?? "",
      is_authorized:        p.is_authorized,
      is_emergency_only:    p.is_emergency_only,
      requires_supervision: p.requires_supervision,
      restriction_notes:    p.restriction_notes ?? "",
      admin_only_notes:     p.admin_only_notes ?? "",
    });
    setEditingId(p.id);
    setShowForm(true);
  }

  function handleSubmit() {
    startTransition(async () => {
      const payload = { ...form };
      if (!payload.full_name.trim()) { setError("Name is required"); return; }
      let res;
      if (editingId) {
        res = await updatePickupPerson(editingId, studentId, payload);
      } else {
        res = await createPickupPerson(studentId, payload);
      }
      if (!res.success) { setError(res.error); return; }
      // Refresh list
      const data = await getPickupPersons(studentId);
      setPersons(data);
      setShowForm(false);
      setError(null);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deletePickupPerson(id, studentId);
      if (!res.success) { setError(res.error); return; }
      setPersons((prev) => prev.filter((p) => p.id !== id));
      setConfirmDelete(null);
    });
  }

  if (loading) return (
    <div className="space-y-3">
      {[1, 2].map((i) => <div key={i} className="h-16 bg-sc-gray-50 rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-label-md font-semibold text-sc-navy flex items-center gap-2">
          <ShieldCheck className="size-4 text-sc-teal" />
          Authorized Pickup Persons
        </h3>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-xl bg-sc-navy px-3 py-1.5 text-white text-label-sm font-medium hover:bg-sc-navy/90 transition-colors"
        >
          <Plus className="size-3.5" /> Add Person
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-2 text-label-sm text-sc-rose flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X className="size-3.5" /></button>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="rounded-2xl border border-sc-navy-200 bg-sc-navy-50 p-4 space-y-3">
          <h4 className="text-label-md font-semibold text-sc-navy">
            {editingId ? "Edit Pickup Person" : "Add Pickup Person"}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy">Full Name *</label>
              <input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy">Relationship</label>
              <input
                value={form.relationship}
                onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
                placeholder="e.g. Aunt, Neighbor"
              />
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy">Phone</label>
              <input
                value={form.phone ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
                placeholder="(555) 000-0000"
              />
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy">Email</label>
              <input
                value={form.email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
                placeholder="email@example.com"
              />
            </div>
          </div>

          {/* Auth checkboxes */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-label-sm text-sc-navy cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_authorized ?? true}
                onChange={(e) => setForm((f) => ({ ...f, is_authorized: e.target.checked }))}
                className="rounded"
              />
              Authorized to Pick Up
            </label>
            <label className="flex items-center gap-2 text-label-sm text-sc-navy cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_emergency_only ?? false}
                onChange={(e) => setForm((f) => ({ ...f, is_emergency_only: e.target.checked }))}
                className="rounded"
              />
              Emergency Contact Only
            </label>
            <label className="flex items-center gap-2 text-label-sm text-sc-navy cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_supervision ?? false}
                onChange={(e) => setForm((f) => ({ ...f, requires_supervision: e.target.checked }))}
                className="rounded"
              />
              Requires Supervision
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-label-sm font-medium text-sc-navy">Restriction Notes (staff-visible)</label>
            <textarea
              rows={2}
              value={form.restriction_notes ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, restriction_notes: e.target.value }))}
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal"
              placeholder="Any notes for staff during pickup…"
            />
          </div>

          {isAdmin && (
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-rose">Admin-Only Notes (confidential)</label>
              <textarea
                rows={2}
                value={form.admin_only_notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, admin_only_notes: e.target.value }))}
                className="w-full rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-3 py-2 text-label-md text-sc-navy resize-none focus:outline-none focus:ring-2 focus:ring-sc-rose"
                placeholder="Custody or safety notes for admin only…"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-xl bg-sc-teal px-4 py-2 text-white text-label-sm font-medium disabled:opacity-60 hover:bg-sc-teal/90"
            >
              <Check className="size-3.5" /> {isPending ? "Saving…" : (editingId ? "Save Changes" : "Add Person")}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null); }}
              className="rounded-xl border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Persons list */}
      {persons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-6 text-center">
          <p className="text-label-sm text-sc-gray-400">No authorized pickup persons added yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {persons.map((p) => {
            const status = getStatus(p);
            const cfg = STATUS_CFG[status];
            const Icon = cfg.Icon;
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-xl border bg-white p-4 flex items-start gap-3",
                  status === "not_authorized" ? "border-sc-rose-200 bg-sc-rose-50/30" : "border-sc-gray-100"
                )}
              >
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", cfg.cls)}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-label-md font-semibold text-sc-navy">{p.full_name}</p>
                    <span className={cn("rounded-full border px-2 py-0.5 text-label-sm font-medium", cfg.cls)}>
                      {cfg.label}
                    </span>
                    <span className="text-label-sm text-sc-gray capitalize">{p.relationship}</span>
                  </div>
                  {p.phone && (
                    <p className="text-label-sm text-sc-gray mt-0.5 flex items-center gap-1">
                      <Phone className="size-3" /> {p.phone}
                    </p>
                  )}
                  {p.restriction_notes && (
                    <p className="text-label-sm text-sc-gold-700 mt-1 bg-sc-gold-50 rounded-lg px-2 py-1">
                      {p.restriction_notes}
                    </p>
                  )}
                  {isAdmin && p.admin_only_notes && (
                    <p className="text-label-sm text-sc-rose mt-1 bg-sc-rose-50 rounded-lg px-2 py-1 border border-sc-rose-200">
                      <span className="font-semibold">Admin: </span>{p.admin_only_notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(p)}
                    className="p-1.5 rounded-lg text-sc-gray hover:text-sc-navy hover:bg-sc-gray-100 transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  {isAdmin && (
                    confirmDelete === p.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={isPending}
                          className="p-1.5 rounded-lg text-sc-rose hover:bg-sc-rose-50 transition-colors"
                          aria-label="Confirm delete"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="p-1.5 rounded-lg text-sc-gray hover:bg-sc-gray-100 transition-colors"
                          aria-label="Cancel delete"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(p.id)}
                        className="p-1.5 rounded-lg text-sc-gray hover:text-sc-rose hover:bg-sc-rose-50 transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
