"use client";

import { useState, useTransition } from "react";
import { Brain, Pencil, Save, X, ChevronDown, ChevronUp } from "lucide-react";
import {
  upsertLearningProfile, getLearningProfile,
  type LearningProfile, type LearningStyle, type LearningProfilePayload,
} from "@/app/actions/successPlanActions";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  initial:   LearningProfile | null;
}

const STYLES: { id: LearningStyle; label: string; emoji: string; description: string }[] = [
  { id: "visual",          label: "Visual",          emoji: "👁️",  description: "Learns through images, charts, and spatial understanding" },
  { id: "auditory",        label: "Auditory",        emoji: "🎧",  description: "Learns through listening and speaking" },
  { id: "reading_writing", label: "Reading/Writing", emoji: "📝",  description: "Learns through reading and taking notes" },
  { id: "hands_on",        label: "Hands-On",        emoji: "🙌",  description: "Learns by doing and experiencing" },
  { id: "independent",     label: "Independent",     emoji: "🎯",  description: "Prefers working alone at their own pace" },
  { id: "collaborative",   label: "Collaborative",   emoji: "🤝",  description: "Thrives in group settings and discussions" },
];

const TEXT_FIELDS: { key: keyof Pick<LearningProfilePayload,
  "strengths"|"interests"|"motivators"|"challenges"|"successful_strategies"|"teacher_tips">;
  label: string; placeholder: string }[] = [
  { key: "strengths",             label: "Strengths",              placeholder: "What does this student do well?" },
  { key: "interests",             label: "Interests & Passions",   placeholder: "What topics or activities light them up?" },
  { key: "motivators",            label: "Motivators",             placeholder: "What encourages or drives this student?" },
  { key: "challenges",            label: "Challenges",             placeholder: "What areas does this student find difficult?" },
  { key: "successful_strategies", label: "Successful Strategies",  placeholder: "What has worked well in the past?" },
  { key: "teacher_tips",          label: "Teacher Tips",           placeholder: "Insider tips for anyone working with this student" },
];

export function LearningProfileSection({ studentId, initial }: Props) {
  const [profile, setProfile]       = useState<LearningProfile | null>(initial);
  const [editing, setEditing]       = useState(false);
  const [collapsed, setCollapsed]   = useState(false);
  const [styles, setStyles]         = useState<LearningStyle[]>(initial?.learning_styles ?? []);
  const [textDraft, setTextDraft]   = useState<Record<string, string>>({});
  const [error, setError]           = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit() {
    setStyles(profile?.learning_styles ?? []);
    const d: Record<string, string> = {};
    TEXT_FIELDS.forEach((f) => { d[f.key] = profile?.[f.key] ?? ""; });
    setTextDraft(d);
    setEditing(true);
    setError(null);
  }

  function toggleStyle(s: LearningStyle) {
    setStyles((arr) =>
      arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]
    );
  }

  function save() {
    startTransition(async () => {
      const payload: LearningProfilePayload = {
        learning_styles:       styles,
        strengths:             textDraft.strengths || null,
        interests:             textDraft.interests || null,
        motivators:            textDraft.motivators || null,
        challenges:            textDraft.challenges || null,
        successful_strategies: textDraft.successful_strategies || null,
        teacher_tips:          textDraft.teacher_tips || null,
      };
      const r = await upsertLearningProfile(studentId, payload);
      if (!r.success) { setError(r.error); return; }
      const fresh = await getLearningProfile(studentId);
      setProfile(fresh);
      setEditing(false);
    });
  }

  const isEmpty = !profile || (
    profile.learning_styles.length === 0 &&
    TEXT_FIELDS.every((f) => !profile[f.key])
  );

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-sc-gray-100 bg-sc-navy/5">
        <button onClick={() => setCollapsed((v) => !v)} className="flex items-center gap-2.5">
          <Brain className="size-4 text-sc-navy shrink-0" />
          <div>
            <h3 className="font-serif text-heading-3 text-sc-navy">Learning Profile</h3>
            {profile?.learning_styles?.length ? (
              <p className="text-label-sm text-sc-gray mt-0.5">
                {profile.learning_styles.map((s) => STYLES.find((x) => x.id === s)?.emoji ?? "").join(" ")}
                {" "}{profile.learning_styles.map((s) => STYLES.find((x) => x.id === s)?.label ?? s).join(" · ")}
              </p>
            ) : (
              <p className="text-label-sm text-sc-gray mt-0.5">Learning styles not yet set</p>
            )}
          </div>
          {collapsed ? <ChevronDown className="size-4 text-sc-gray ml-2" /> : <ChevronUp className="size-4 text-sc-gray ml-2" />}
        </button>
        {!editing ? (
          <button onClick={startEdit}
            className="flex items-center gap-1.5 rounded-lg bg-sc-navy px-3 py-1.5 text-label-sm text-white hover:bg-sc-navy-700 transition-colors">
            <Pencil className="size-3.5" /> {isEmpty ? "Add" : "Edit"}
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)}
              className="flex items-center gap-1 rounded-lg border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-gray hover:bg-sc-gray-50">
              <X className="size-3.5" /> Cancel
            </button>
            <button onClick={save} disabled={isPending}
              className="flex items-center gap-1 rounded-lg bg-sc-navy px-3 py-1.5 text-label-sm text-white hover:bg-sc-navy-700 disabled:opacity-60">
              <Save className="size-3.5" /> {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="p-5 space-y-5">
          {error && (
            <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
          )}

          {isEmpty && !editing ? (
            <div className="text-center py-8 text-sc-gray">
              <Brain className="size-8 mx-auto mb-2 text-sc-gray-300" />
              <p className="text-body-md font-medium text-sc-navy">No Learning Profile yet</p>
              <p className="text-label-sm mt-1">Document how this student learns best.</p>
            </div>
          ) : (
            <>
              {/* Learning styles */}
              <div>
                <p className="text-label-sm font-semibold text-sc-navy mb-2">Learning Styles</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {STYLES.map((s) => {
                    const selected = editing ? styles.includes(s.id) : profile?.learning_styles?.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={editing ? () => toggleStyle(s.id) : undefined}
                        disabled={!editing}
                        className={cn(
                          "flex items-start gap-2 rounded-xl border p-2.5 text-left transition-all",
                          selected
                            ? "border-sc-teal bg-sc-teal-50 text-sc-teal-700"
                            : "border-sc-gray-200 text-sc-gray bg-white",
                          editing && !selected && "hover:border-sc-teal-300 hover:bg-sc-teal-50/50 cursor-pointer",
                          !editing && "cursor-default",
                          !selected && !editing && "opacity-40"
                        )}
                      >
                        <span className="text-lg shrink-0">{s.emoji}</span>
                        <div>
                          <p className="text-label-sm font-semibold">{s.label}</p>
                          {(selected || editing) && (
                            <p className="text-label-sm opacity-75 mt-0.5">{s.description}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TEXT_FIELDS.map((f) => (
                  <div key={f.key}>
                    <p className="text-label-sm font-semibold text-sc-navy mb-1">{f.label}</p>
                    {editing ? (
                      <textarea
                        value={textDraft[f.key] ?? ""}
                        onChange={(e) => setTextDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        rows={3}
                        className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none"
                      />
                    ) : (
                      <p className={cn("text-body-md", profile?.[f.key] ? "text-sc-navy" : "text-sc-gray italic")}>
                        {profile?.[f.key] ?? "Not yet recorded"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
