"use client";

import { useState, useTransition, useMemo } from "react";
import { UserMinus, UserPlus, Search } from "lucide-react";
import type { CourseStudent, StudentForSetup, StaffOption } from "@/app/actions/courses";
import {
  removeStudentFromCourse,
  addStudentToCourse,
  getStudentsForCourseSetup,
  updateCourseSection,
} from "@/app/actions/courses";

interface Props {
  sectionId: string;
  subject: string;
  courseName: string;
  teacherId: string | null;
  teacherName: string | null;
  roster: CourseStudent[];
  staff: StaffOption[];
}

export function CourseRoster({
  sectionId,
  subject,
  courseName,
  teacherId: initialTeacherId,
  teacherName: initialTeacherName,
  roster: initialRoster,
  staff,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [roster, setRoster] = useState(initialRoster);
  const [teacherId, setTeacherId] = useState<string | null>(initialTeacherId);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Add student panel
  const [showAdd, setShowAdd] = useState(false);
  const [addStudents, setAddStudents] = useState<StudentForSetup[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [loadingAdd, setLoadingAdd] = useState(false);

  async function openAddPanel() {
    setShowAdd(true);
    setLoadingAdd(true);
    const result = await getStudentsForCourseSetup(subject);
    setLoadingAdd(false);
    if (result.success) {
      // Filter out students already in the roster
      const inRoster = new Set(roster.map(r => r.student_id));
      setAddStudents(result.data.filter(s => !inRoster.has(s.student_id)));
    }
  }

  function handleRemove(enrollmentId: string, studentName: string) {
    if (!confirm(`Remove ${studentName} from this course? Their curriculum enrollment will remain — they'll just no longer be linked to this class.`)) return;
    startTransition(async () => {
      const result = await removeStudentFromCourse(enrollmentId, sectionId);
      if (result.success) {
        setRoster(prev => prev.filter(r => r.enrollment_id !== enrollmentId));
        flash("Student removed from course.");
      } else {
        setError(result.error ?? "Failed to remove student.");
      }
    });
  }

  function handleAdd(student: StudentForSetup) {
    startTransition(async () => {
      const result = await addStudentToCourse({
        sectionId,
        studentId: student.student_id,
        enrollmentId: student.enrollment_id,
        subject,
        courseName,
      });
      if (result.success) {
        setRoster(prev => [...prev, {
          enrollment_id: student.enrollment_id ?? "",
          student_id: student.student_id,
          student_name: student.student_name,
          grade_level: student.grade_level,
          curriculum_name: student.curriculum_name,
        }].sort((a, b) => a.student_name.localeCompare(b.student_name)));
        setAddStudents(prev => prev.filter(s => s.student_id !== student.student_id));
        flash("Student added to course.");
      } else {
        setError(result.error ?? "Failed to add student.");
      }
    });
  }

  function handleTeacherChange(newTeacherId: string | null) {
    const teacherName = staff.find(s => s.id === newTeacherId)?.name ?? null;
    setTeacherId(newTeacherId);
    startTransition(async () => {
      await updateCourseSection(sectionId, { teacherId: newTeacherId, teacherName });
      flash("Teacher updated.");
    });
  }

  function flash(msg: string) {
    setError("");
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  }

  const filteredAdd = useMemo(() => {
    if (!addSearch) return addStudents;
    return addStudents.filter(s => s.student_name.toLowerCase().includes(addSearch.toLowerCase()));
  }, [addStudents, addSearch]);

  return (
    <div className="space-y-6">

      {error && (
        <div className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-sc-rose-700 text-label-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-sc-teal/10 border border-sc-teal/20 px-4 py-3 text-sc-teal text-label-sm">
          {success}
        </div>
      )}

      {/* Teacher assignment */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <h2 className="font-medium text-sc-navy mb-4">Teacher</h2>
        <select
          value={teacherId ?? ""}
          onChange={e => handleTeacherChange(e.target.value || null)}
          disabled={isPending}
          className="w-full sm:max-w-xs rounded-lg border border-sc-gray-200 px-3 py-2.5 text-body-md text-sc-navy bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal disabled:opacity-60"
        >
          <option value="">No teacher assigned</option>
          {staff.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Roster */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-medium text-sc-navy">Students</h2>
            <p className="text-label-sm text-sc-gray mt-0.5">{roster.length} enrolled</p>
          </div>
          <button
            onClick={openAddPanel}
            className="inline-flex items-center gap-2 rounded-lg border border-sc-teal text-sc-teal px-3 py-2 text-label-sm font-medium hover:bg-sc-teal/5 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Add Student
          </button>
        </div>

        {roster.length === 0 ? (
          <div className="py-8 text-center text-sc-gray text-label-sm border border-dashed border-sc-gray-200 rounded-xl">
            No students in this course yet. Click &ldquo;Add Student&rdquo; to get started.
          </div>
        ) : (
          <div className="divide-y divide-sc-gray-100 border border-sc-gray-100 rounded-xl overflow-hidden">
            {roster.map(student => (
              <div key={student.enrollment_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-body-md text-sc-navy truncate">{student.student_name}</p>
                  {student.curriculum_name && (
                    <p className="text-label-sm text-sc-gray truncate">{student.curriculum_name}</p>
                  )}
                </div>
                {student.grade_level && (
                  <span className="text-label-sm text-sc-gray-400 shrink-0">{student.grade_level}</span>
                )}
                <button
                  onClick={() => handleRemove(student.enrollment_id, student.student_name)}
                  disabled={isPending}
                  className="p-1.5 rounded-lg text-sc-gray-400 hover:text-sc-rose-700 hover:bg-sc-rose-50 transition-colors disabled:opacity-50"
                  title="Remove from course"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add student panel */}
      {showAdd && (
        <div className="rounded-2xl bg-white border border-sc-teal/20 shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-sc-navy">Add a Student</h3>
            <button onClick={() => { setShowAdd(false); setAddSearch(""); }} className="text-label-sm text-sc-gray hover:text-sc-navy">
              Close
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sc-gray-400" />
            <input
              type="text"
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              placeholder="Search students…"
              className="w-full rounded-lg border border-sc-gray-200 pl-9 pr-3 py-2 text-body-md placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
            />
          </div>

          {loadingAdd ? (
            <p className="text-center text-label-sm text-sc-gray py-4">Loading…</p>
          ) : filteredAdd.length === 0 ? (
            <p className="text-center text-label-sm text-sc-gray py-4">
              {addStudents.length === 0 ? "All students are already in this course." : "No students match."}
            </p>
          ) : (
            <div className="divide-y divide-sc-gray-100 border border-sc-gray-100 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              {filteredAdd.map(s => (
                <div key={s.student_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-body-md text-sc-navy truncate">{s.student_name}</p>
                    {s.already_in_another_section && (
                      <p className="text-label-sm text-sc-gold-700">Currently in another {subject} class</p>
                    )}
                    {s.curriculum_name && !s.already_in_another_section && (
                      <p className="text-label-sm text-sc-gray truncate">{s.curriculum_name}</p>
                    )}
                  </div>
                  {s.grade_level && (
                    <span className="text-label-sm text-sc-gray-400 shrink-0">{s.grade_level}</span>
                  )}
                  <button
                    onClick={() => handleAdd(s)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-sc-teal px-3 py-1.5 text-white text-label-sm font-medium hover:bg-sc-teal-700 disabled:opacity-50 transition-colors shrink-0"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
