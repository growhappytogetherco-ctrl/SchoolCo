"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { mapRows } from "@/lib/import/mapper";
import { validateMappedStudents } from "@/lib/import/validators";
import { parseCSV } from "@/lib/import/csvParser";
import type { MappedStudent, DryRunResult, DryRunRow, ImportJob } from "@/lib/import/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", message: string) {
  return { ts: new Date().toISOString(), level, message };
}

// ─── Create a new import job ──────────────────────────────────────────────────

export async function createImportJob(fileName: string, fileSizeBytes: number): Promise<
  { success: true; jobId: string } | { success: false; error: string }
> {
  const user   = await getUser();
  const orgId  = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .insert({ organization_id: orgId, created_by: user.id, file_name: fileName, file_size_bytes: fileSizeBytes, status: "pending" })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to create import job" };
  return { success: true, jobId: data.id as string };
}

// ─── Parse & validate CSV (client sends text content as form data) ────────────

export async function validateCSV(jobId: string, csvText: string): Promise<
  { success: true; validCount: number; errorCount: number; warnCount: number; errors: unknown[]; warnings: unknown[]; previewRows: unknown[] }
  | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  try {
    const { rows } = parseCSV(csvText);
    if (rows.length === 0) return { success: false, error: "CSV contains no data rows" };

    const mapped     = mapRows(rows);
    const validation = validateMappedStudents(mapped);

    const previewRows = rows.slice(0, 50);

    await supabase.from("import_jobs").update({
      status:            "validating",
      total_rows:        rows.length,
      valid_rows:        validation.validRows.length,
      error_rows:        validation.invalidRows.length,
      validation_errors: [...validation.errors, ...validation.warnings] as unknown as never,
      preview_rows:      previewRows as unknown as never,
      import_log: [log("info", `Parsed ${rows.length} rows. Valid: ${validation.validRows.length}, Errors: ${validation.invalidRows.length}, Warnings: ${validation.warnings.length}`)] as unknown as never,
    }).eq("id", jobId).eq("organization_id", orgId);

    return {
      success:     true,
      validCount:  validation.validRows.length,
      errorCount:  validation.errors.length,
      warnCount:   validation.warnings.length,
      errors:      validation.errors,
      warnings:    validation.warnings,
      previewRows,
    };
  } catch (e) {
    await supabase.from("import_jobs").update({ status: "failed", error_message: String(e) }).eq("id", jobId);
    return { success: false, error: String(e) };
  }
}

// ─── Dry run (checks DB for duplicates, previews what will happen) ────────────

export async function dryRunImport(jobId: string, csvText: string): Promise<
  { success: true; result: DryRunResult } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  try {
    const { rows } = parseCSV(csvText);
    const mapped   = mapRows(rows);
    const { validRows } = validateMappedStudents(mapped);

    // Fetch existing student names for duplicate detection
    const { data: existingStudents } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId);

    const existingStudentNames = new Set(
      (existingStudents ?? []).map((s) => `${(s.first_name as string).toLowerCase()} ${(s.last_name as string).toLowerCase()}`)
    );

    // Fetch existing family names
    const { data: existingFamilies } = await supabase
      .from("families")
      .select("id, family_name")
      .eq("organization_id", orgId);

    const existingFamilyNames = new Map(
      (existingFamilies ?? []).map((f) => [(f.family_name as string).toLowerCase(), f.id as string])
    );

    // Fetch existing profiles (guardians) by email + name
    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email");

    const existingProfileEmails = new Set(
      (existingProfiles ?? []).map((p) => (p.email as string | null)?.toLowerCase() ?? "")
    );
    const existingProfileNames = new Set(
      (existingProfiles ?? []).map((p) => (p.full_name as string).toLowerCase())
    );

    const dryRows: DryRunRow[] = [];
    const familiesFound: string[] = [];
    const profilesFound: string[] = [];
    let toInsert = 0, toSkip = 0, withErrors = 0;

    for (const s of validRows) {
      const normName = `${s.first_name.toLowerCase()} ${s.last_name.toLowerCase()}`;
      const isDuplicate = existingStudentNames.has(normName);

      if (isDuplicate) {
        toSkip++;
        dryRows.push({
          rowIndex: s._rowIndex,
          studentName: `${s.first_name} ${s.last_name}`,
          action: "skip_duplicate",
          reason: "Student with this name already exists in the database",
          familyAction: "skip",
          guardianActions: [],
        });
        continue;
      }

      toInsert++;
      const familyNorm = s.family?.family_name.toLowerCase() ?? "";
      const familyAction = existingFamilyNames.has(familyNorm) ? "link_existing" : "insert";
      if (familyAction === "link_existing" && !familiesFound.includes(s.family?.family_name ?? "")) {
        familiesFound.push(s.family?.family_name ?? "");
      }

      const guardianActions = (s.guardians ?? []).map((g) => {
        const emailMatch = g.email && existingProfileEmails.has(g.email.toLowerCase());
        const nameMatch  = existingProfileNames.has(g.full_name.toLowerCase());
        const exists     = emailMatch || nameMatch;
        if (exists && !profilesFound.includes(g.full_name)) profilesFound.push(g.full_name);
        return { name: g.full_name, action: exists ? "link_existing" as const : "insert" as const };
      });

      dryRows.push({
        rowIndex: s._rowIndex,
        studentName: `${s.first_name} ${s.last_name}`,
        action: "insert",
        familyAction,
        guardianActions,
      });
    }

    // All mapped-invalid rows count as errors
    const invalidCount = mapped.length - validRows.length;
    withErrors += invalidCount;

    const result: DryRunResult = {
      totalRows: rows.length,
      toInsert,
      toSkip,
      withErrors,
      rows: dryRows,
      existingFamilies: familiesFound,
      existingProfiles: profilesFound,
    };

    await supabase.from("import_jobs").update({
      status: "dry_run",
      import_log: [log("info", `Dry run complete. To insert: ${toInsert}, To skip: ${toSkip}, Errors: ${withErrors}`)] as unknown as never,
    }).eq("id", jobId).eq("organization_id", orgId);

    return { success: true, result };
  } catch (e) {
    await supabase.from("import_jobs").update({ status: "failed", error_message: String(e) }).eq("id", jobId);
    return { success: false, error: String(e) };
  }
}

// ─── Execute import ───────────────────────────────────────────────────────────

export async function executeImport(jobId: string, csvText: string): Promise<
  { success: true; inserted: { students: number; families: number; guardians: number; medical: number; notes: number }; skipped: number }
  | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  try {
    await supabase.from("import_jobs").update({ status: "importing" }).eq("id", jobId).eq("organization_id", orgId);

    const { rows } = parseCSV(csvText);
    const mapped   = mapRows(rows);
    const { validRows } = validateMappedStudents(mapped);

    const insertedStudentIds:    string[] = [];
    const insertedFamilyIds:     string[] = [];
    const insertedHouseholdIds:  string[] = [];
    const insertedGuardianIds:   string[] = [];
    const insertedMedicalIds:    string[] = [];
    const insertedNoteIds:       string[] = [];
    const importLog: ReturnType<typeof log>[] = [];

    let skippedStudents = 0, skippedFamilies = 0, skippedGuardians = 0;

    // Cache existing data to avoid repeated lookups
    const { data: existingStudents } = await supabase.from("students").select("id, first_name, last_name").eq("organization_id", orgId);
    const existingStudentMap = new Map(
      (existingStudents ?? []).map((s) => [`${(s.first_name as string).toLowerCase()} ${(s.last_name as string).toLowerCase()}`, s.id as string])
    );

    const { data: existingFamilies } = await supabase.from("families").select("id, family_name").eq("organization_id", orgId);
    const existingFamilyMap = new Map(
      (existingFamilies ?? []).map((f) => [(f.family_name as string).toLowerCase(), f.id as string])
    );

    const { data: existingProfiles } = await supabase.from("profiles").select("id, full_name, email");
    const existingProfileEmailMap = new Map(
      (existingProfiles ?? [])
        .filter((p) => p.email)
        .map((p) => [(p.email as string).toLowerCase(), p.id as string])
    );

    for (const s of validRows) {
      const normName = `${s.first_name.toLowerCase()} ${s.last_name.toLowerCase()}`;

      // ── Skip duplicate students ──────────────────────────────────────
      if (existingStudentMap.has(normName)) {
        skippedStudents++;
        importLog.push(log("info", `Row ${s._rowIndex}: Skipped duplicate student "${s.first_name} ${s.last_name}"`));
        continue;
      }

      try {
        // ── 1. Family ──────────────────────────────────────────────────
        let familyId: string;
        const famNorm = s.family?.family_name.toLowerCase() ?? "";
        const existingFamilyId = existingFamilyMap.get(famNorm);

        if (existingFamilyId) {
          familyId = existingFamilyId;
          skippedFamilies++;
        } else if (s.family) {
          const { data: fam, error: famErr } = await supabase
            .from("families")
            .insert({ organization_id: orgId, family_name: s.family.family_name, is_split_household: s.family.is_split_household, created_by: user.id })
            .select("id")
            .single();

          if (famErr || !fam) throw new Error(`Family insert failed: ${famErr?.message}`);
          familyId = fam.id as string;
          insertedFamilyIds.push(familyId);
          existingFamilyMap.set(famNorm, familyId);

          // ── Household ──────────────────────────────────────────────
          if (s.family.household) {
            const hh = s.family.household;
            const addrJson = hh.address_street ? {
              street1: hh.address_street, city: hh.address_city, state: hh.address_state, zip: hh.address_zip,
            } : null;
            const { data: hhData } = await supabase
              .from("households")
              .insert({ organization_id: orgId, family_id: familyId, household_label: hh.household_label, sort_order: hh.sort_order, address_json: addrJson as never, phone: hh.phone, email: hh.email, created_by: user.id })
              .select("id").single();
            if (hhData) insertedHouseholdIds.push(hhData.id as string);
          }
        } else {
          // Fallback: create minimal family
          const { data: fam } = await supabase
            .from("families")
            .insert({ organization_id: orgId, family_name: `${s.last_name} Family`, is_split_household: false, created_by: user.id })
            .select("id").single();
          familyId = (fam?.id ?? "") as string;
          if (familyId) insertedFamilyIds.push(familyId);
        }

        // ── 2. Student ─────────────────────────────────────────────────
        const { data: stu, error: stuErr } = await supabase
          .from("students")
          .insert({
            organization_id:        orgId,
            family_id:              familyId,
            first_name:             s.first_name,
            last_name:              s.last_name,
            preferred_name:         s.preferred_name,
            grade_level:            s.grade_level,
            enrollment_status:      s.enrollment_status,
            enrollment_date:        s.enrollment_date,
            expected_graduation:    s.expected_graduation,
            track:                  s.track,
            date_of_birth:          s.date_of_birth,
            medical_notes:          s.medical_notes,
            allergies:              s.allergies as never,
            scholarship_info:       s.scholarship_info as never,
            authorized_pickup_notes: s.authorized_pickup_notes,
            created_by:             user.id,
          } as never)
          .select("id")
          .single();

        if (stuErr || !stu) throw new Error(`Student insert failed: ${stuErr?.message}`);
        const studentId = stu.id as string;
        insertedStudentIds.push(studentId);
        existingStudentMap.set(normName, studentId);
        importLog.push(log("info", `Row ${s._rowIndex}: Inserted student "${s.first_name} ${s.last_name}" (${studentId})`));

        // ── 3. Guardians ───────────────────────────────────────────────
        for (const g of s.guardians ?? []) {
          try {
            // Find or create profile
            let profileId: string | undefined;
            if (g.email) {
              profileId = existingProfileEmailMap.get(g.email.toLowerCase());
            }

            if (!profileId) {
              // Create a minimal profile (no auth account — staff-only record)
              const { data: prof } = await supabase
                .from("profiles")
                .insert({ full_name: g.full_name, email: g.email, phone: g.phone } as never)
                .select("id").single();
              if (prof) {
                profileId = prof.id as string;
                insertedGuardianIds.push(profileId);
                if (g.email) existingProfileEmailMap.set(g.email.toLowerCase(), profileId);
              }
            } else {
              skippedGuardians++;
            }

            if (profileId) {
              await supabase.from("guardianships").insert({
                organization_id:        orgId,
                profile_id:             profileId,
                student_id:             studentId,
                relationship_type:      g.relationship_type as never,
                custody_type:           g.custody_type as never,
                is_legal_guardian:      g.is_legal_guardian,
                is_primary_contact:     g.is_primary_contact,
                is_emergency_contact:   g.is_emergency_contact,
                emergency_contact_order: g.emergency_contact_order,
                can_pickup:             g.can_pickup,
                pickup_restrictions:    g.pickup_restrictions,
                created_by:             user.id,
              } as never);
            }
          } catch (gErr) {
            importLog.push(log("warn", `Row ${s._rowIndex}: Guardian "${g.full_name}" skipped — ${gErr}`));
          }
        }

        // ── 4. Medical ─────────────────────────────────────────────────
        if (s.medical) {
          const { data: med } = await supabase
            .from("student_medical")
            .insert({
              organization_id:       orgId,
              student_id:            studentId,
              medical_conditions:    s.medical.medical_conditions as never,
              special_accommodations: s.medical.special_accommodations as never,
              notes:                 s.medical.notes,
              primary_doctor_name:   s.medical.primary_doctor_name,
              primary_doctor_phone:  s.medical.primary_doctor_phone,
              insurance_provider:    s.medical.insurance_provider,
              insurance_policy_number: s.medical.insurance_policy_number,
              updated_by:            user.id,
            } as never)
            .select("id").single();
          if (med) insertedMedicalIds.push(med.id as string);
        }

        // ── 5. Staff notes ─────────────────────────────────────────────
        for (const n of s.notes ?? []) {
          const { data: noteData } = await supabase
            .from("staff_notes")
            .insert({
              organization_id: orgId,
              student_id:      studentId,
              author_id:       user.id,
              category:        n.category,
              priority:        n.priority,
              title:           n.title,
              body:            n.body,
              is_pinned:       n.is_pinned,
            } as never)
            .select("id").single();
          if (noteData) insertedNoteIds.push(noteData.id as string);
        }

      } catch (rowErr) {
        importLog.push(log("error", `Row ${s._rowIndex}: Failed — ${rowErr}`));
      }
    }

    // ── Finalize job record ────────────────────────────────────────────────────
    await supabase.from("import_jobs").update({
      status:             "completed",
      completed_at:       new Date().toISOString(),
      inserted_students:  insertedStudentIds.length,
      inserted_families:  insertedFamilyIds.length,
      inserted_households: insertedHouseholdIds.length,
      inserted_guardians: insertedGuardianIds.length,
      inserted_medical:   insertedMedicalIds.length,
      inserted_notes:     insertedNoteIds.length,
      skipped_students:   skippedStudents,
      skipped_families:   skippedFamilies,
      skipped_guardians:  skippedGuardians,
      inserted_ids: {
        students:    insertedStudentIds,
        families:    insertedFamilyIds,
        households:  insertedHouseholdIds,
        guardians:   insertedGuardianIds,
        medical:     insertedMedicalIds,
        notes:       insertedNoteIds,
      } as never,
      import_log: importLog as unknown as never,
    }).eq("id", jobId).eq("organization_id", orgId);

    return {
      success: true,
      inserted: {
        students:  insertedStudentIds.length,
        families:  insertedFamilyIds.length,
        guardians: insertedGuardianIds.length,
        medical:   insertedMedicalIds.length,
        notes:     insertedNoteIds.length,
      },
      skipped: skippedStudents,
    };
  } catch (e) {
    await supabase.from("import_jobs").update({ status: "failed", error_message: String(e) }).eq("id", jobId);
    return { success: false, error: String(e) };
  }
}

// ─── Rollback ─────────────────────────────────────────────────────────────────

export async function rollbackImport(jobId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const { data: job } = await supabase
    .from("import_jobs")
    .select("inserted_ids, status")
    .eq("id", jobId)
    .eq("organization_id", orgId)
    .single();

  if (!job) return { success: false, error: "Import job not found" };
  if (job.status as string === "rolled_back") return { success: false, error: "Already rolled back" };

  const ids = (job.inserted_ids as Record<string, string[]>) ?? {};

  try {
    // Delete in reverse dependency order
    if (ids.notes?.length)      await supabase.from("staff_notes").delete().in("id", ids.notes);
    if (ids.medical?.length)    await supabase.from("student_medical").delete().in("id", ids.medical);
    if (ids.guardians?.length)  await supabase.from("profiles").delete().in("id", ids.guardians);
    if (ids.students?.length)   await supabase.from("students").delete().in("id", ids.students);
    if (ids.households?.length) await supabase.from("households").delete().in("id", ids.households);
    if (ids.families?.length)   await supabase.from("families").delete().in("id", ids.families);

    await supabase.from("import_jobs").update({ status: "rolled_back" }).eq("id", jobId);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── List import jobs ─────────────────────────────────────────────────────────

export async function listImportJobs(): Promise<ImportJob[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []) as unknown as ImportJob[];
}

// ─── Get single job ───────────────────────────────────────────────────────────

export async function getImportJob(jobId: string): Promise<ImportJob | null> {
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("organization_id", orgId)
    .single();

  return data as unknown as ImportJob | null;
}
