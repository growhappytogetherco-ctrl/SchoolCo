"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  createStaffConversation,
  type MessageCategory,
  type ConversationPriority,
} from "@/app/actions/messages";
import { CATEGORY_LABELS } from "@/components/messages/CategoryBadge";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.entries(CATEGORY_LABELS) as [MessageCategory, string][];
const MAX_BODY = 5000;

interface FamilyOption {
  id:       string;
  family_name: string;
  students: Array<{ id: string; name: string }>;
}

interface Props {
  onClose:          () => void;
  defaultFamilyId?: string;
  defaultStudentId?: string;
  orgId:            string;
}

export function StaffComposeModal({ onClose, defaultFamilyId, defaultStudentId, orgId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [families, setFamilies]       = useState<FamilyOption[]>([]);
  const [loadingFamilies, setLoading] = useState(true);
  const [familySearch, setFamilySearch] = useState("");
  const [familyId, setFamilyId]       = useState(defaultFamilyId ?? "");
  const [studentId, setStudentId]     = useState(defaultStudentId ?? "");
  const [category, setCategory]       = useState<MessageCategory>("general");
  const [priority, setPriority]       = useState<ConversationPriority>("normal");
  const [subject, setSubject]         = useState("");
  const [body, setBody]               = useState("");
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("families")
      .select("id, family_name, students(id, first_name, last_name, preferred_name)")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .is("archived_at", null)
      .order("family_name")
      .then(({ data }) => {
        setFamilies(
          (data ?? []).map(f => ({
            id:   f.id,
            family_name: f.family_name,
            students: (f.students ?? []).map((s: { id: string; first_name: string; last_name: string; preferred_name: string | null }) => ({
              id:   s.id,
              name: `${s.preferred_name ?? s.first_name} ${s.last_name}`,
            })),
          }))
        );
        setLoading(false);
      });
  }, [orgId]);

  const filteredFamilies = families.filter(f =>
    !familySearch || f.family_name.toLowerCase().includes(familySearch.toLowerCase())
  );
  const selectedFamily = families.find(f => f.id === familyId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!familyId) { setError("Please select a family."); return; }
    if (!subject.trim()) { setError("Please enter a subject."); return; }
    if (!body.trim()) { setError("Please enter a message."); return; }

    startTransition(async () => {
      const res = await createStaffConversation({
        family_id:  familyId,
        student_id: studentId || null,
        subject:    subject.trim(),
        category,
        priority,
        body,
      });
      if (res.success) {
        router.push(`/dashboard/messages/${res.data.conversation_id}`);
        onClose();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-sc-navy/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100">
          <h2 className="font-serif text-heading-3 text-sc-navy">New Conversation</h2>
          <button onClick={onClose} className="text-sc-gray hover:text-sc-navy transition-colors p-1 rounded-lg hover:bg-sc-gray-100">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Family search */}
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Family</label>
            {!familyId ? (
              <>
                <input
                  type="text"
                  value={familySearch}
                  onChange={e => setFamilySearch(e.target.value)}
                  placeholder="Search by family name…"
                  className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 placeholder:text-sc-gray-400"
                />
                {loadingFamilies ? (
                  <p className="text-label-sm text-sc-gray px-1">Loading…</p>
                ) : filteredFamilies.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-sc-gray-200 bg-white divide-y divide-sc-gray-100">
                    {filteredFamilies.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => { setFamilyId(f.id); setStudentId(""); }}
                        className="w-full text-left px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-50 transition-colors"
                      >
                        {f.family_name}
                      </button>
                    ))}
                  </div>
                ) : familySearch ? (
                  <p className="text-label-sm text-sc-gray px-1">No families found.</p>
                ) : null}
              </>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-sc-teal/30 bg-sc-teal/5 px-3 py-2">
                <span className="text-label-sm font-medium text-sc-navy">{selectedFamily?.family_name}</span>
                <button type="button" onClick={() => { setFamilyId(""); setStudentId(""); setFamilySearch(""); }} className="text-[11px] text-sc-gray hover:text-sc-navy">Change</button>
              </div>
            )}
          </div>

          {/* Student */}
          {selectedFamily && selectedFamily.students.length > 0 && (
            <div className="space-y-1">
              <label className="text-label-sm font-semibold text-sc-navy">
                Regarding student <span className="font-normal text-sc-gray">(optional)</span>
              </label>
              <select
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              >
                <option value="">General family message</option>
                {selectedFamily.students.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Category + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-label-sm font-semibold text-sc-navy">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as MessageCategory)}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              >
                {CATEGORIES.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-semibold text-sc-navy">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as ConversationPriority)}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
              required
              placeholder="Subject…"
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 placeholder:text-sc-gray-400"
            />
          </div>

          {/* Body */}
          <div className="space-y-1">
            <label className="text-label-sm font-semibold text-sc-navy">Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={MAX_BODY}
              required
              rows={4}
              placeholder="Write your message to the family…"
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 placeholder:text-sc-gray-400 resize-none"
            />
            <p className={cn(
              "text-[11px] text-right",
              body.length > MAX_BODY - 200 ? "text-sc-rose-700" : "text-sc-gray-400"
            )}>
              {body.length}/{MAX_BODY}
            </p>
          </div>

          {error && (
            <p className="text-label-sm text-sc-rose-700 bg-sc-rose-50 border border-sc-rose-200 rounded-xl px-4 py-3">{error}</p>
          )}
        </form>

        <div className="px-5 py-4 border-t border-sc-gray-100 flex gap-3 justify-end bg-white">
          <button type="button" onClick={onClose} className="rounded-xl border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !familyId}
            onClick={handleSubmit}
            className="rounded-xl bg-sc-navy px-5 py-2 text-label-sm font-semibold text-white hover:bg-sc-navy/80 transition-colors disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send Message"}
          </button>
        </div>
      </div>
    </div>
  );
}
