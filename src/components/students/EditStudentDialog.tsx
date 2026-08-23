"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateStudent } from "@/app/actions/studentActions";

const GRADE_LEVELS = ["K","1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","11th","12th"];
const ENROLLMENT_STATUSES = [
  { value: "applicant",  label: "Applicant"  },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "enrolled",   label: "Enrolled"   },
  { value: "withdrawn",  label: "Withdrawn"  },
  { value: "graduated",  label: "Graduated"  },
  { value: "expelled",   label: "Expelled"   },
] as const;

const Schema = z.object({
  first_name:        z.string().min(1, "Required").max(100),
  last_name:         z.string().min(1, "Required").max(100),
  preferred_name:    z.string().max(100).optional().nullable(),
  date_of_birth:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional().nullable(),
  grade_level:       z.string().max(20).optional().nullable(),
  enrollment_status: z.enum(["applicant","waitlisted","enrolled","withdrawn","graduated","expelled"]).optional(),
  enrollment_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional().nullable().or(z.literal("")),
  expected_graduation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional().nullable().or(z.literal("")),
  track:             z.string().max(100).optional().nullable(),
});

type FormData = z.infer<typeof Schema>;

interface Props {
  studentId:   string;
  displayId:   string | null;
  currentData: {
    first_name:          string;
    last_name:           string;
    preferred_name:      string | null;
    date_of_birth:       string | null;
    grade_level:         string | null;
    enrollment_status:   string;
    enrollment_date:     string | null;
    expected_graduation: string | null;
    track:               string | null;
  };
}

export function EditStudentDialog({ studentId, displayId, currentData }: Props) {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      first_name:          currentData.first_name,
      last_name:           currentData.last_name,
      preferred_name:      currentData.preferred_name ?? "",
      date_of_birth:       currentData.date_of_birth ?? "",
      grade_level:         currentData.grade_level ?? "",
      enrollment_status:   (currentData.enrollment_status as FormData["enrollment_status"]) ?? "enrolled",
      enrollment_date:     currentData.enrollment_date ?? "",
      expected_graduation: currentData.expected_graduation ?? "",
      track:               currentData.track ?? "",
    },
  });

  async function onSubmit(data: FormData) {
    setSaving(true);
    setError(null);
    const result = await updateStudent({
      id:                  studentId,
      first_name:          data.first_name,
      last_name:           data.last_name,
      preferred_name:      data.preferred_name || null,
      date_of_birth:       data.date_of_birth || null,
      grade_level:         data.grade_level || null,
      enrollment_status:   data.enrollment_status,
      enrollment_date:     data.enrollment_date || null,
      expected_graduation: data.expected_graduation || null,
      track:               data.track || null,
    });
    setSaving(false);
    if (!result.success) { setError(result.error); return; }
    setSaved(true);
    setTimeout(() => {
      setOpen(false);
      setSaved(false);
      router.refresh();
    }, 800);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); setSaved(false); }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-label-sm font-medium text-white hover:bg-white/20 transition-colors"
        title="Edit student record"
      >
        <Pencil className="size-3.5" />
        Edit Student
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sc-navy/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

            <div className="flex items-center gap-3 px-6 py-5 border-b border-sc-gray-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-navy-50">
                <User className="size-5 text-sc-navy" />
              </div>
              <div>
                <h2 className="font-serif text-heading-2 text-sc-navy">Edit Student Record</h2>
                {displayId && <p className="text-label-sm text-sc-gray font-mono">{displayId} — read-only ID</p>}
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto p-6 space-y-5 flex-1">

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="first_name">Legal First Name *</Label>
                  <Input id="first_name" {...register("first_name")} />
                  {errors.first_name && <p className="text-label-sm text-sc-rose">{errors.first_name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last_name">Legal Last Name *</Label>
                  <Input id="last_name" {...register("last_name")} />
                  {errors.last_name && <p className="text-label-sm text-sc-rose">{errors.last_name.message}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="preferred_name">Preferred / Goes By</Label>
                <Input id="preferred_name" placeholder="Leave blank if same as legal name" {...register("preferred_name")} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="date_of_birth">Date of Birth</Label>
                  <Input id="date_of_birth" type="date" {...register("date_of_birth")} />
                  {errors.date_of_birth && <p className="text-label-sm text-sc-rose">{errors.date_of_birth.message}</p>}
                  <p className="text-label-sm text-sc-gray-400">Age is calculated automatically.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grade_level">Grade Level</Label>
                  <select
                    id="grade_level"
                    {...register("grade_level")}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">— Select —</option>
                    {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="enrollment_status">Enrollment Status</Label>
                  <select
                    id="enrollment_status"
                    {...register("enrollment_status")}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {ENROLLMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="track">Track</Label>
                  <Input id="track" placeholder="e.g. STEM, Arts…" {...register("track")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="enrollment_date">Enrollment Date</Label>
                  <Input id="enrollment_date" type="date" {...register("enrollment_date")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expected_graduation">Expected Graduation</Label>
                  <Input id="expected_graduation" type="date" {...register("expected_graduation")} />
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-2.5 text-label-sm text-sc-rose-700">{error}</p>
              )}

              {saved && (
                <p className="rounded-lg bg-sc-teal-50 border border-sc-teal-200 px-4 py-2.5 text-label-sm text-sc-teal-700 font-medium">
                  Saved successfully.
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving || saved}>
                  {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
