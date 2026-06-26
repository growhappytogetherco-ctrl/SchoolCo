"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const GRADE_LEVELS = [
  "Pre-K", "Kindergarten", "1st Grade", "2nd Grade", "3rd Grade",
  "4th Grade", "5th Grade", "6th Grade", "7th Grade", "8th Grade",
  "9th Grade", "10th Grade", "11th Grade", "12th Grade",
];

const Schema = z.object({
  first_name:     z.string().min(1, "First name is required").max(100),
  last_name:      z.string().min(1, "Last name is required").max(100),
  preferred_name: z.string().max(100).optional().nullable(),
  grade_level:    z.string().optional().nullable(),
  track:          z.string().max(100).optional().nullable(),
  date_of_birth:  z.string().optional().nullable(),
});

export type StudentStepData = z.infer<typeof Schema>;

export function StudentStep({
  onNext,
  onBack,
}: {
  onNext: (data: StudentStepData) => void;
  onBack: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<StudentStepData>({
    resolver: zodResolver(Schema),
  });

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-teal-50">
          <GraduationCap className="size-5 text-sc-teal" />
        </div>
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy">Student Information</h2>
          <p className="text-label-sm text-sc-gray">Step 2 of 4</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onNext)} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">First Name *</Label>
            <Input id="first_name" placeholder="Amara" {...register("first_name")} />
            {errors.first_name && <p className="text-label-sm text-sc-rose">{errors.first_name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name">Last Name *</Label>
            <Input id="last_name" placeholder="Thompson" {...register("last_name")} />
            {errors.last_name && <p className="text-label-sm text-sc-rose">{errors.last_name.message}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preferred_name">Preferred Name / Nickname</Label>
          <Input id="preferred_name" placeholder="What does the student like to go by?" {...register("preferred_name")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="grade_level">Grade Level</Label>
            <Select id="grade_level" placeholder="Select grade…" {...register("grade_level")}>
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="track">Track / Program</Label>
            <Select id="track" placeholder="Select track…" {...register("track")}>
              <option value="classical">Classical</option>
              <option value="entrepreneurship">Entrepreneurship</option>
              <option value="leadership">Leadership</option>
              <option value="stem">STEM</option>
              <option value="arts">Arts</option>
              <option value="general">General</option>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="date_of_birth">Date of Birth</Label>
          <Input id="date_of_birth" type="date" {...register("date_of_birth")} />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
          <Button type="submit" className="flex-1">Next: Guardian →</Button>
        </div>
      </form>
    </div>
  );
}
