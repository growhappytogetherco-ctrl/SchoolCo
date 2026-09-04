"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, Search, Users } from "lucide-react";
import type { StaffOption, StudentForSetup } from "@/app/actions/courses";
import { createCourseSection, getStudentsForCourseSetup } from "@/app/actions/courses";

const SUBJECTS = [
  { value: "bible",            label: "Bible" },
  { value: "ela",              label: "ELA (English Language Arts)" },
  { value: "entrepreneurship", label: "Entrepreneurship" },
  { value: "geography",        label: "Geography" },
  { value: "history",          label: "History" },
  { value: "leadership",       label: "Leadership" },
  { value: "math",             label: "Math" },
  { value: "pe",               label: "PE (Physical Education)" },
  { value: "science",          label: "Science" },
  { value: "other",            label: "Other" },
];

interface Props {
  staff: StaffOption[];
  schoolYearId: string;
  schoolYearLabel: string;
}

export function CreateCourseForm({ staff, schoolYearId, schoolYearLabel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Step 1 fields
  const [subject, setSubject] = useState("");
  const [courseName, setCourseName]     = useState("");
  const [teacherId, setTeacherId]       = useState<string | null>(null);

  // Step 2 — student selection
  const [step, setStep] = useState<1 | 2>(1);
  const [students, setStudents] = useState<StudentForSetup[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");

  const [error, setError] = useState("");

  const teacherName = staff.find(s => s.id === teacherId)?.name ?? null;

  async function goToStep2() {
    if (!subject || !courseName.trim()) {
      setError("Subject and course name are required.");
      return;
    }
    setError("");
    setLoadingStudents(true);
    const result = await getStudentsForCourseSetup(subject);
    setLoadingStudents(false);
    if (result.success) {
      setStudents(result.data);
      // Pre-select students already enrolled in this subject
      const preselect = new Set<string>();
      for (const s of result.data) {
        if (s.enrollment_id && !s.already_in_another_section) {
          preselect.add(s.student_id);
        }
      }
      setSelectedIds(preselect);
    }
    setStep(2);
  }

  const grades = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      if (s.grade_level) set.add(s.grade_level);
    }
    return Array.from(set).sort();
  }, [students]);

  const filtered = useMemo(() => {
    return students.filter(s => {
      if (gradeFilter && s.grade_level !== gradeFilter) return false;
      if (search && !s.student_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [students, search, gradeFilter]);

  function toggleStudent(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map(s => s.student_id)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  function handleSubmit() {
    setError("");
    startTransition(async () => {
      // Collect enrollment ids for selected students
      const enrollmentIds: string[] = [];
      for (const s of students) {
        if (selectedIds.has(s.student_id) && s.enrollment_id && !s.already_in_another_section) {
          enrollmentIds.push(s.enrollment_id);
        }
      }
      // Students without enrollment ids will need addStudentToCourse called separately
      // For simplicity in this flow, we link available enrollments now.
      // Students selected without existing enrollment will be handled by addStudentToCourse post-creation.
      const noEnrollment = students.filter(
        s => selectedIds.has(s.student_id) && !s.enrollment_id
      );

      const result = await createCourseSection({
        subject,
        courseName,
        teacherId,
        teacherName,
        schoolYearId,
        enrollmentIds,
      });

      if (!result.success) {
        setError(result.error ?? "Failed to create course.");
        return;
      }

      const sectionId = result.data.sectionId;

      // For students without existing enrollment, create minimal enrollments
      if (noEnrollment.length > 0) {
        const { addStudentToCourse } = await import("@/app/actions/courses");
        await Promise.all(
          noEnrollment.map(s =>
            addStudentToCourse({
              sectionId,
              studentId: s.student_id,
              enrollmentId: null,
              subject,
              courseName,
            })
          )
        );
      }

      router.push(`/dashboard/courses/${sectionId}`);
    });
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selectedIds.has(s.student_id));

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 max-w-2xl">

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {([1, 2] as const).map(n => (
          <div key={n} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-label-sm font-semibold transition-colors ${
              step > n ? "bg-sc-teal text-white" :
              step === n ? "bg-sc-navy text-white" :
              "bg-sc-gray-100 text-sc-gray"
            }`}>
              {step > n ? <Check className="h-4 w-4" /> : n}
            </div>
            <span className={`text-label-sm ${step === n ? "text-sc-navy font-medium" : "text-sc-gray"}`}>
              {n === 1 ? "Course Details" : "Add Students"}
            </span>
            {n < 2 && <ChevronRight className="h-4 w-4 text-sc-gray-400" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-sc-rose-700 text-label-sm">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <label className="block text-label-sm font-medium text-sc-navy mb-1.5">Subject *</label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-body-md text-sc-navy bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
            >
              <option value="">Select a subject…</option>
              {SUBJECTS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-label-sm font-medium text-sc-navy mb-1.5">Course Name *</label>
            <input
              type="text"
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
              placeholder="e.g. Algebra I, World History, Bible Study"
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-body-md text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
            />
          </div>

          <div>
            <label className="block text-label-sm font-medium text-sc-navy mb-1.5">Teacher</label>
            <select
              value={teacherId ?? ""}
              onChange={e => setTeacherId(e.target.value || null)}
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-body-md text-sc-navy bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
            >
              <option value="">No teacher assigned</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <p className="text-label-sm text-sc-gray-400">
            School year: <span className="text-sc-navy">{schoolYearLabel}</span>
          </p>

          <div className="flex justify-end pt-2">
            <button
              onClick={goToStep2}
              disabled={loadingStudents}
              className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-5 py-2.5 text-white text-label-md font-medium hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
            >
              {loadingStudents ? "Loading…" : "Next: Add Students"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-medium text-sc-navy">Add Students</h3>
              <p className="text-label-sm text-sc-gray mt-0.5">
                {selectedIds.size} selected · {students.length} total students
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-label-sm text-sc-teal hover:underline">
                Select all shown
              </button>
              <span className="text-sc-gray-400">·</span>
              <button onClick={clearAll} className="text-label-sm text-sc-gray hover:underline">
                Clear
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sc-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search students…"
                className="w-full rounded-lg border border-sc-gray-200 pl-9 pr-3 py-2 text-body-md text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
              />
            </div>
            {grades.length > 0 && (
              <select
                value={gradeFilter}
                onChange={e => setGradeFilter(e.target.value)}
                className="rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md text-sc-navy bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
              >
                <option value="">All grades</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
          </div>

          {/* Student list */}
          <div className="border border-sc-gray-100 rounded-xl overflow-hidden divide-y divide-sc-gray-100 max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sc-gray text-label-sm">
                <Users className="h-6 w-6 mx-auto mb-2 text-sc-gray-400" />
                No students found
              </div>
            ) : (
              filtered.map(s => {
                const isSelected = selectedIds.has(s.student_id);
                const disabled = s.already_in_another_section && !isSelected;
                return (
                  <label
                    key={s.student_id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      disabled ? "opacity-50 cursor-not-allowed" :
                      isSelected ? "bg-sc-teal/5" : "hover:bg-sc-gray-100/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => !disabled && toggleStudent(s.student_id)}
                      className="h-4 w-4 rounded border-sc-gray-200 text-sc-teal accent-sc-teal"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-body-md text-sc-navy truncate">{s.student_name}</p>
                      {s.curriculum_name && (
                        <p className="text-label-sm text-sc-gray truncate">{s.curriculum_name}</p>
                      )}
                    </div>
                    {s.grade_level && (
                      <span className="text-label-sm text-sc-gray-400 shrink-0">{s.grade_level}</span>
                    )}
                    {s.already_in_another_section && (
                      <span className="text-label-sm text-sc-gold-700 shrink-0">In another class</span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-lg border border-sc-gray-200 px-4 py-2.5 text-sc-navy text-label-md hover:bg-sc-gray-100 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-5 py-2.5 text-white text-label-md font-medium hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Creating…" : `Create Course${selectedIds.size > 0 ? ` with ${selectedIds.size} Student${selectedIds.size !== 1 ? "s" : ""}` : ""}`}
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
