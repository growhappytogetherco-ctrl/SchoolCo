"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { mapRows } from "@/lib/import/mapper";
import { validateMappedStudents } from "@/lib/import/validators";
import { parseCSV } from "@/lib/import/csvParser";
import type { MappedStudent, DryRunResult, DryRunRow, ImportJob, ImportClassification } from "@/lib/import/types";
import { isDriveConfigured, ensureOrgDriveStructure, createStudentFolderTree, detectSharedDriveId, getFolderDriveId } from "@/lib/drive/driveClient";
import { getSubfolder, getOrgFolderName } from "@/lib/drive/types";

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

    // Fetch existing students with DOB for multi-layer duplicate detection
    const { data: existingStudents } = await supabase
      .from("students")
      .select("id, first_name, last_name, date_of_birth")
      .eq("organization_id", orgId);

    // name+DOB → confirmed existing; name-only → possible duplicate
    const existingByNameDob = new Map<string, string>(); // "first last|dob" → id
    const existingByName    = new Map<string, string>(); // "first last" → id
    for (const s of existingStudents ?? []) {
      const normName = `${(s.first_name as string).toLowerCase()} ${(s.last_name as string).toLowerCase()}`;
      existingByName.set(normName, s.id as string);
      if (s.date_of_birth) existingByNameDob.set(`${normName}|${s.date_of_birth}`, s.id as string);
    }

    // Fetch previously-imported source record IDs for this org
    const { data: importSources } = await supabase
      .from("student_import_sources")
      .select("source_record_id, student_id")
      .eq("organization_id", orgId)
      .eq("source_system", "airtable_csv");
    const importedSourceIds = new Map<string, string>(
      (importSources ?? []).map((r) => [r.source_record_id as string, r.student_id as string])
    );

    // Fetch existing families — IDs for the picker, names for conflict warnings
    const { data: existingFamilies } = await supabase
      .from("families")
      .select("id, family_name")
      .eq("organization_id", orgId);

    const existingFamilyNameSet = new Set(
      (existingFamilies ?? []).map((f) => (f.family_name as string).toLowerCase())
    );

    // Fetch existing profiles (guardians) by email ONLY
    // Name-alone is not a reliable identity — only email confirms who a guardian is
    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email");

    const existingProfileEmails = new Set(
      (existingProfiles ?? [])
        .map((p) => (p.email as string | null)?.toLowerCase() ?? "")
        .filter(Boolean)
    );

    const dryRows: DryRunRow[] = [];
    const familiesFound: string[] = [];
    const profilesFound: string[] = [];
    let toInsert = 0, toSkip = 0, withErrors = 0;

    for (const s of validRows) {
      const normName = `${s.first_name.toLowerCase()} ${s.last_name.toLowerCase()}`;

      // Layer 1: source record ID already imported
      if (s._source_record_id && importedSourceIds.has(s._source_record_id)) {
        toSkip++;
        dryRows.push({
          rowIndex: s._rowIndex, studentName: `${s.first_name} ${s.last_name}`,
          classification: "already_exists",
          action: "skip_duplicate",
          reason: "Previously imported (source record ID matched)",
          date_of_birth: s.date_of_birth, source_record_id: s._source_record_id,
          familyAction: "skip", guardianActions: [],
        });
        continue;
      }

      // Layer 2: name + DOB exact match
      const dobKey = s.date_of_birth ? `${normName}|${s.date_of_birth}` : null;
      if (dobKey && existingByNameDob.has(dobKey)) {
        toSkip++;
        dryRows.push({
          rowIndex: s._rowIndex, studentName: `${s.first_name} ${s.last_name}`,
          classification: "already_exists",
          action: "skip_duplicate",
          reason: "Student with same name and date of birth already exists",
          date_of_birth: s.date_of_birth, source_record_id: s._source_record_id,
          familyAction: "skip", guardianActions: [],
        });
        continue;
      }

      // Layer 3: name-only match — flag as possible duplicate
      let classification: ImportClassification = "new";
      let reason: string | undefined;
      if (existingByName.has(normName)) {
        classification = "possible_duplicate";
        reason = s.date_of_birth
          ? "Student with same name found but date of birth differs — review before importing"
          : "Student with same name found — no date of birth to confirm identity";
        // possible_duplicate still counts as "to review", not auto-skip
        // We mark action as "insert" so it can be selected, but classification signals review needed
      }

      toInsert++;
      // Family: always create a new family for imported students.
      // If a same-name family exists, flag it for the admin's awareness — do NOT auto-link.
      // The admin can manually merge families after import if appropriate.
      const familyNorm = s.family?.family_name.toLowerCase() ?? "";
      const familyNameConflict = existingFamilyNameSet.has(familyNorm);
      if (familyNameConflict && !familiesFound.includes(s.family?.family_name ?? "")) {
        familiesFound.push(s.family?.family_name ?? "");
      }

      // Guardian: match by verified email only — name alone is not sufficient identity proof
      const guardianActions = (s.guardians ?? []).map((g) => {
        const emailMatch = !!(g.email && existingProfileEmails.has(g.email.toLowerCase()));
        if (emailMatch && !profilesFound.includes(g.full_name)) profilesFound.push(g.full_name);
        return { name: g.full_name, action: emailMatch ? "link_existing" as const : "insert" as const };
      });

      dryRows.push({
        rowIndex: s._rowIndex, studentName: `${s.first_name} ${s.last_name}`,
        classification,
        action: "insert",
        reason: familyNameConflict
          ? `${reason ? reason + "; " : ""}A family named "${s.family?.family_name}" already exists — a separate family record will be created. Review after import.`
          : reason,
        date_of_birth: s.date_of_birth, source_record_id: s._source_record_id,
        familyAction: "insert",
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
      availableFamiliesList: (existingFamilies ?? []).map((f) => ({
        id: f.id as string,
        family_name: f.family_name as string,
      })),
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

export async function executeImport(
  jobId: string,
  csvText: string,
  selectedRowIndices?: number[],
  familyChoices?: Record<number, string>,  // rowIndex → "new" | existing family UUID
): Promise<
  {
    success: true;
    inserted: { students: number; families: number; guardians: number; medical: number; notes: number };
    skipped: number;
    driveFailures: Array<{ studentId: string; name: string; error: string }>;
  }
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
    const driveFailures: Array<{ studentId: string; name: string; error: string }> = [];

    let skippedStudents = 0, skippedFamilies = 0, skippedGuardians = 0;

    // ── Drive: provision org folder structure once before any student rows ───
    let studentsFolderIdForImport: string | null = null;
    let sharedDriveIdForImport: string | null = null;
    if (isDriveConfigured()) {
      // Detect Shared Drive so we can restrict student folder searches to the active drive
      sharedDriveIdForImport = await detectSharedDriveId();

      const { data: existingOrgRows } = await supabase
        .from("org_drive_folders")
        .select("folder_key, google_drive_folder_id")
        .eq("organization_id", orgId);

      let existingOrgMap: Record<string, string> = {};
      for (const row of existingOrgRows ?? []) {
        existingOrgMap[row.folder_key as string] = row.google_drive_folder_id as string;
      }

      // Validate cached map against current Drive destination.
      // If Shared Drive is configured and the sample cached folder belongs to a different
      // drive (e.g. old My Drive), discard the cache so provisioning runs in the new drive.
      if (sharedDriveIdForImport && Object.keys(existingOrgMap).length > 0) {
        const [, sampleId] = Object.entries(existingOrgMap)[0];
        const sampleDriveId = await getFolderDriveId(sampleId);
        if (sampleDriveId !== sharedDriveIdForImport) {
          importLog.push(log("warn", `org_drive_folders cache is stale (driveId=${sampleDriveId ?? "My Drive"}) — re-provisioning in Shared Drive`));
          existingOrgMap = {};
        }
      }

      const orgResult = await ensureOrgDriveStructure(orgId, existingOrgMap);
      if (!orgResult.success) {
        await supabase.from("import_jobs").update({ status: "failed", error_message: `Drive setup failed: ${orgResult.error}` }).eq("id", jobId);
        return { success: false, error: `Google Drive provisioning failed: ${orgResult.error}. Please verify your Drive credentials and root folder access before importing.` };
      }

      // Upsert all provisioning results (overwrites any stale My Drive rows)
      await supabase.from("org_drive_folders").upsert(
        Object.entries(orgResult.data).map(([key, folderId]) => ({
          organization_id:         orgId,
          folder_key:              key,
          folder_name:             getOrgFolderName(key),
          google_drive_folder_id:  folderId,
          google_drive_folder_url: `https://drive.google.com/drive/folders/${folderId}`,
          provisioned_by:          user.id,
          provisioned_at:          new Date().toISOString(),
        })) as never,
        { onConflict: "organization_id,folder_key" }
      );

      studentsFolderIdForImport = orgResult.data["students"] ?? null;
      importLog.push(log("info", "Google Drive org structure verified/provisioned"));
    }

    // Per-row selection: if provided, only process rows in the set
    const selectedSet = selectedRowIndices ? new Set(selectedRowIndices) : null;

    // Cache existing data to avoid repeated lookups
    const { data: existingStudents } = await supabase.from("students").select("id, first_name, last_name, date_of_birth").eq("organization_id", orgId);
    const existingStudentByNameDob = new Map<string, string>();
    const existingStudentMap = new Map<string, string>();
    for (const s of existingStudents ?? []) {
      const normName = `${(s.first_name as string).toLowerCase()} ${(s.last_name as string).toLowerCase()}`;
      existingStudentMap.set(normName, s.id as string);
      if (s.date_of_birth) existingStudentByNameDob.set(`${normName}|${s.date_of_birth}`, s.id as string);
    }

    // Fetch already-imported source record IDs
    const { data: existingSourceMaps } = await supabase
      .from("student_import_sources")
      .select("source_record_id")
      .eq("organization_id", orgId)
      .eq("source_system", "airtable_csv");
    const importedSourceIds = new Set((existingSourceMaps ?? []).map((r) => r.source_record_id as string));

    // Profiles matched by email only — name alone cannot confirm guardian identity
    const { data: existingProfiles } = await supabase.from("profiles").select("id, full_name, email");
    const existingProfileEmailMap = new Map(
      (existingProfiles ?? [])
        .filter((p) => p.email)
        .map((p) => [(p.email as string).toLowerCase(), p.id as string])
    );

    for (const s of validRows) {
      // ── Skip rows not selected by the administrator ──────────────────
      if (selectedSet && !selectedSet.has(s._rowIndex)) {
        skippedStudents++;
        continue;
      }

      const normName = `${s.first_name.toLowerCase()} ${s.last_name.toLowerCase()}`;

      // ── Skip if source record ID already imported ────────────────────
      if (s._source_record_id && importedSourceIds.has(s._source_record_id)) {
        skippedStudents++;
        importLog.push(log("info", `Row ${s._rowIndex}: Skipped (source record ID already imported) "${s.first_name} ${s.last_name}"`));
        continue;
      }

      // ── Skip confirmed duplicates (name + DOB) ───────────────────────
      const dobKey = s.date_of_birth ? `${normName}|${s.date_of_birth}` : null;
      if (dobKey && existingStudentByNameDob.has(dobKey)) {
        skippedStudents++;
        importLog.push(log("info", `Row ${s._rowIndex}: Skipped duplicate (name+DOB match) "${s.first_name} ${s.last_name}"`));
        continue;
      }

      // ── Skip name-only duplicates (no DOB to confirm) ────────────────
      if (!s.date_of_birth && existingStudentMap.has(normName)) {
        skippedStudents++;
        importLog.push(log("warn", `Row ${s._rowIndex}: Skipped possible duplicate (name match, no DOB) "${s.first_name} ${s.last_name}"`));
        continue;
      }

      // Declared outside try so catch can clean up orphan family on any failure
      let createdFamilyId: string | null = null;
      try {
        // ── 1. Family ──────────────────────────────────────────────────
        // Use the admin's per-row family choice if provided, otherwise create a new family.
        let familyId: string;

        const chosenFamilyId = familyChoices?.[s._rowIndex];
        if (chosenFamilyId && chosenFamilyId !== "new") {
          // Admin selected an existing family
          familyId = chosenFamilyId;
          skippedFamilies++;
          importLog.push(log("info", `Row ${s._rowIndex}: Linking to existing family (${chosenFamilyId})`));
        } else if (s.family) {
          const { data: fam, error: famErr } = await supabase
            .from("families")
            .insert({ organization_id: orgId, family_name: s.family.family_name, is_split_household: s.family.is_split_household, created_by: user.id })
            .select("id")
            .single();

          if (famErr || !fam) throw new Error(`Family insert failed: ${famErr?.message}`);
          familyId = fam.id as string;
          createdFamilyId = familyId;
          insertedFamilyIds.push(familyId);

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
          if (familyId) {
            createdFamilyId = familyId;
            insertedFamilyIds.push(familyId);
          }
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

        if (stuErr || !stu) {
          // Clean up any family we created for this student before handling the error
          if (createdFamilyId) {
            await supabase.from("families").delete().eq("id", createdFamilyId);
            const idx = insertedFamilyIds.indexOf(createdFamilyId);
            if (idx >= 0) insertedFamilyIds.splice(idx, 1);
          }

          if (stuErr?.code === "23505") {
            // Verify identity: confirm the conflicting row is actually this student, not a
            // different student with the same name (possible after migration 00087 is applied).
            const { data: conflict } = await supabase
              .from("students")
              .select("id, date_of_birth")
              .eq("organization_id", orgId)
              .ilike("first_name", s.first_name)
              .ilike("last_name", s.last_name)
              .maybeSingle();

            const conflictDob = conflict?.date_of_birth as string | null | undefined;
            if (conflict && s.date_of_birth && conflictDob && s.date_of_birth !== conflictDob) {
              // Different DOB — this is a different student blocked by the old constraint.
              // This should not happen after migration 00087.
              importLog.push(log("error", `Row ${s._rowIndex}: Blocked by unique constraint — "${s.first_name} ${s.last_name}" DOB in CSV (${s.date_of_birth}) differs from DB (${conflictDob}). Ensure migration 00087 has been applied.`));
            } else {
              skippedStudents++;
              importLog.push(log("warn", `Row ${s._rowIndex}: Skipped — "${s.first_name} ${s.last_name}" already exists in database`));
            }
            continue;
          }
          throw new Error(`Student insert failed: ${stuErr?.message}`);
        }
        const studentId = stu.id as string;
        insertedStudentIds.push(studentId);
        existingStudentMap.set(normName, studentId);
        if (s.date_of_birth) existingStudentByNameDob.set(`${normName}|${s.date_of_birth}`, studentId);
        importLog.push(log("info", `Row ${s._rowIndex}: Inserted student "${s.first_name} ${s.last_name}" (${studentId})`));

        // ── 2a. Source mapping ─────────────────────────────────────────
        if (s._source_record_id) {
          await supabase.from("student_import_sources").upsert({
            organization_id:  orgId,
            student_id:       studentId,
            import_job_id:    jobId,
            source_system:    "airtable_csv",
            source_record_id: s._source_record_id,
            imported_by:      user.id,
          } as never, { onConflict: "organization_id,source_system,source_record_id" });
          importedSourceIds.add(s._source_record_id);
        }

        // ── 2b. Drive folder ───────────────────────────────────────────
        if (isDriveConfigured() && studentsFolderIdForImport) {
          const displayId   = (stu as unknown as Record<string,unknown>).student_display_id as string | null;
          // student_display_id is set by a DB trigger; re-fetch it
          const { data: stuRow } = await supabase.from("students").select("student_display_id").eq("id", studentId).single();
          const studentDisplayId = (stuRow?.student_display_id as string | null) ?? studentId;
          const studentFullName  = `${s.first_name} ${s.last_name}`;

          const driveResult = await createStudentFolderTree(
            studentDisplayId, studentFullName, orgId,
            studentsFolderIdForImport,
            sharedDriveIdForImport ?? undefined,
          );

          if (driveResult.success) {
            const folderName = `${studentDisplayId} — ${studentFullName}`;
            await supabase.from("students").update({
              google_drive_folder_id:  driveResult.data.rootFolder.folderId,
              google_drive_folder_url: driveResult.data.rootFolder.folderUrl,
              drive_folder_status:     "active",
              drive_folder_created_at: new Date().toISOString(),
              drive_folder_name:       folderName,
              drive_provisioned_by:    user.id,
              drive_error_message:     null,
            } as never).eq("id", studentId);

            const sfToInsert = driveResult.data.subfolders.map((sf) => {
              const def = getSubfolder(sf.key)!;
              return {
                organization_id:         orgId,
                student_id:              studentId,
                folder_key:              sf.key,
                folder_name:             def.name,
                sort_order:              def.sortOrder,
                google_drive_folder_id:  sf.folderId,
                google_drive_folder_url: sf.folderUrl,
                is_internal_only:        def.isInternalOnly,
                parent_can_view:         def.parentCanView,
                yearbook_eligible:       def.yearbookEligible,
                synced_at:               new Date().toISOString(),
              };
            });
            await supabase.from("student_drive_folders").upsert(sfToInsert as never, { onConflict: "student_id,folder_key" });
            importLog.push(log("info", `Row ${s._rowIndex}: Drive folder created → ${driveResult.data.rootFolder.folderUrl}`));
          } else {
            importLog.push(log("warn", `Row ${s._rowIndex}: Drive folder creation failed for "${s.first_name} ${s.last_name}": ${driveResult.error}`));
            await supabase.from("students").update({ drive_folder_status: "error", drive_error_message: driveResult.error } as never).eq("id", studentId);
            driveFailures.push({ studentId, name: `${s.first_name} ${s.last_name}`, error: driveResult.error });
          }
        }

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
        // Clean up any family created for this row so it doesn't linger as an orphan
        if (createdFamilyId) {
          await supabase.from("families").delete().eq("id", createdFamilyId);
          const idx = insertedFamilyIds.indexOf(createdFamilyId);
          if (idx >= 0) insertedFamilyIds.splice(idx, 1);
        }
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
      skipped:       skippedStudents,
      driveFailures,
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
