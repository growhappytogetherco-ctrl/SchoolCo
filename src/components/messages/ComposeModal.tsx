"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, AlertTriangle } from "lucide-react";
import {
  createParentConversation,
  getMyFamiliesForCompose,
  type MessageCategory,
} from "@/app/actions/messages";
import { CATEGORY_LABELS } from "@/components/messages/CategoryBadge";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.entries(CATEGORY_LABELS) as [MessageCategory, string][];
const MAX_BODY = 5000;

interface Props {
  onClose: () => void;
  defaultFamilyId?: string;
  defaultStudentId?: string;
}

export function ComposeModal({ onClose, defaultFamilyId, defaultStudentId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [families, setFamilies] = useState<Awaited<ReturnType<typeof getMyFamiliesForCompose>> extends { success: true; data: infer D } ? D : never>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId]   = useState(defaultFamilyId ?? "");
  const [studentId, setStudentId] = useState(defaultStudentId ?? "");
  const [category, setCategory]   = useState<MessageCategory>("general");
  const [subject, setSubject]     = useState("");
  const [body, setBody]           = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  useEffect(() => {
    getMyFamiliesForCompose().then(res => {
      if (res.success) {
        setFamilies(res.data);
        if (!defaultFamilyId && res.data.length === 1) {
          setFamilyId(res.data[0].family_id);
        }
      }
      setLoading(false);
    });
  }, [defaultFamilyId]);

  const selectedFamily = families.find(f => f.family_id === familyId);
  const isMedical = category === "medical";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!familyId) { setError("Please select a family."); return; }
    if (!subject.trim()) { setError("Please enter a subject."); return; }
    if (!body.trim()) { setError("Please enter a message."); return; }

    startTransition(async () => {
      const res = await createParentConversation({
        family_id:  familyId,
        student_id: studentId || null,
        subject:    subject.trim(),
        category,
        body,
      });
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push(`/portal/messages/${res.data.conversation_id}`);
        }, 600);
      } else {
        setError(res.error ?? "Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-sc-navy/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100">
          <h2 className="font-serif text-heading-3 text-sc-navy">New Message</h2>
          <button
            onClick={onClose}
            className="text-sc-gray hover:text-sc-navy transition-colors p-1 rounded-lg hover:bg-sc-gray-100"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-label-sm text-sc-gray">Loading…</div>
          ) : families.length === 0 ? (
            <p className="text-label-sm text-sc-rose-700">No families found. Please contact the school if this is incorrect.</p>
          ) : (
            <>
              {/* Family */}
              {families.length > 1 && (
                <div className="space-y-1">
                  <label className="text-label-sm font-semibold text-sc-navy">Regarding family</label>
                  <select
                    value={familyId}
                    onChange={e => { setFamilyId(e.target.value); setStudentId(""); }}
                    required
                    className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                  >
                    <option value="">Select a family…</option>
                    {families.map(f => (
                      <option key={f.family_id} value={f.family_id}>{f.family_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Student (optional) */}
              {selectedFamily && selectedFamily.students.length > 0 && (
                <div className="space-y-1">
                  <label className="text-label-sm font-semibold text-sc-navy">
                    Regarding child <span className="font-normal text-sc-gray">(optional)</span>
                  </label>
                  <select
                    value={studentId}
                    onChange={e => setStudentId(e.target.value)}
                    className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                  >
                    <option value="">General family question</option>
                    {selectedFamily.students.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Category */}
              <div className="space-y-1">
                <label className="text-label-sm font-semibold text-sc-navy">Topic</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as MessageCategory)}
                  required
                  className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                >
                  {CATEGORIES.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Medical warning */}
              {isMedical && (
                <div className="flex items-start gap-2 rounded-xl border border-sc-gold-300 bg-sc-gold-50 px-4 py-3">
                  <AlertTriangle className="size-4 text-sc-gold-600 shrink-0 mt-0.5" />
                  <p className="text-label-sm text-sc-gold-800">
                    <strong>SchoolCo messaging is not monitored continuously.</strong> For an emergency, call 911. For urgent same-day concerns, contact the school directly.
                  </p>
                </div>
              )}

              {/* Subject */}
              <div className="space-y-1">
                <label className="text-label-sm font-semibold text-sc-navy">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  maxLength={200}
                  required
                  placeholder="Brief subject…"
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
                  rows={5}
                  placeholder="Write your message…"
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

              {success && (
                <p className="text-label-sm text-sc-teal bg-sc-teal/10 border border-sc-teal/20 rounded-xl px-4 py-3">Message sent!</p>
              )}
            </>
          )}
        </form>

        <div className="px-5 py-4 border-t border-sc-gray-100 flex gap-3 justify-end bg-white">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            form="compose-form"
            type="submit"
            disabled={isPending || success || loading}
            onClick={handleSubmit}
            className="rounded-xl bg-sc-teal px-5 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700 transition-colors disabled:opacity-50"
          >
            {isPending ? "Sending…" : success ? "Sent!" : "Send Message"}
          </button>
        </div>
      </div>
    </div>
  );
}
