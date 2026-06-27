"use client";

import { useState } from "react";
import { Download, ChevronDown, ChevronUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const COLUMN_MAP = [
  { csv: "Full Name",              field: "full_name",               required: true,  notes: "First and last name together, or split into First Name / Last Name columns" },
  { csv: "Email",                  field: "email",                   required: true,  notes: "Used to match existing accounts" },
  { csv: "Phone",                  field: "phone",                   required: false, notes: "Any format accepted" },
  { csv: "Display Title",          field: "display_title",           required: false, notes: "e.g. 'Founder / Principal' — separate from role" },
  { csv: "Role",                   field: "primary_role",            required: true,  notes: "volunteer | teacher | staff | registrar | admin | full_admin" },
  { csv: "Staff Type",             field: "staff_type",              required: false, notes: "staff | volunteer | contractor  (defaults to 'staff')" },
  { csv: "Start Date",             field: "start_date",              required: false, notes: "YYYY-MM-DD or MM/DD/YYYY" },
  { csv: "Background Check Status",field: "background_check_status", required: false, notes: "not_submitted | pending | cleared | expired | flagged" },
  { csv: "Background Check Date",  field: "background_check_date",   required: false, notes: "Date screening was completed" },
  { csv: "Background Check Expires",field:"background_check_expires",required: false, notes: "Date screening expires" },
  { csv: "Training Status",        field: "training_status",         required: false, notes: "not_started | in_progress | completed | expired" },
  { csv: "Training Completed",     field: "training_completed_at",   required: false, notes: "Date training was completed" },
  { csv: "Training Expires",       field: "training_expires_at",     required: false, notes: "Date training expires" },
  { csv: "CPR Status",             field: "cpr_status",              required: false, notes: "not_applicable | current | expired" },
  { csv: "CPR Expires",            field: "cpr_expires_at",          required: false, notes: "Date CPR cert expires" },
  { csv: "Bio",                    field: "bio",                     required: false, notes: "Short bio visible to staff" },
  { csv: "Emergency Contact Name", field: "emergency_contact_name",  required: false, notes: "" },
  { csv: "Emergency Contact Phone",field: "emergency_contact_phone", required: false, notes: "" },
  { csv: "Emergency Contact Rel",  field: "emergency_contact_rel",   required: false, notes: "e.g. Spouse, Parent" },
  { csv: "Notes",                  field: "compliance_notes",        required: false, notes: "Admin-only internal notes" },
];

const SAMPLE_CSV = `Full Name,Email,Phone,Display Title,Role,Staff Type,Start Date,Background Check Status
Jane Smith,jane@school.org,(555) 001-0001,Founder / Principal,full_admin,staff,2022-08-01,cleared
Marcus Lee,marcus@school.org,(555) 001-0002,Lead Teacher,teacher,staff,2023-01-15,cleared
Sarah Vo,sarah@school.org,(555) 001-0003,,teacher,staff,2023-08-01,pending
Chris Park,chris@school.org,(555) 001-0004,,volunteer,volunteer,2024-01-10,cleared`;

export function StaffImportGuide() {
  const [open, setOpen] = useState(false);

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "staff_import_template.csv";
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-sc-cream/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="size-4 text-sc-teal" />
          <span className="font-serif text-heading-3 text-sc-navy">Airtable / CSV Import Preparation</span>
          <span className="text-label-sm text-sc-gray-400 ml-1">— mapping guide for staff data</span>
        </div>
        {open ? <ChevronUp className="size-4 text-sc-gray-400" /> : <ChevronDown className="size-4 text-sc-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-sc-gray-100 p-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <p className="text-body-sm text-sc-gray max-w-xl">
              Use the column map below to prepare your Airtable export or CSV for staff import.
              Required columns are marked. All date fields accept YYYY-MM-DD or MM/DD/YYYY.
              Import will be available in the Import Center once ready.
            </p>
            <button
              onClick={downloadSample}
              className="flex items-center gap-1.5 shrink-0 rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-cream transition-colors"
            >
              <Download className="size-4" /> Sample CSV
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-sc-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sc-gray-100 bg-sc-cream">
                  <th className="text-left py-2.5 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">CSV Column</th>
                  <th className="text-left py-2.5 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Maps To</th>
                  <th className="text-left py-2.5 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Required</th>
                  <th className="text-left py-2.5 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-gray-50">
                {COLUMN_MAP.map((row) => (
                  <tr key={row.field} className="hover:bg-sc-cream/40">
                    <td className="py-2 px-4 text-label-sm font-medium text-sc-navy">{row.csv}</td>
                    <td className="py-2 px-4 font-mono text-[11px] text-sc-teal-700 bg-sc-teal-50/30">{row.field}</td>
                    <td className="py-2 px-4">
                      {row.required
                        ? <span className="text-[11px] font-semibold text-sc-rose uppercase">Required</span>
                        : <span className="text-[11px] text-sc-gray-400">Optional</span>}
                    </td>
                    <td className="py-2 px-4 text-label-sm text-sc-gray-500">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-sc-gold-200 bg-sc-gold-50 px-4 py-3">
            <p className="text-label-sm font-semibold text-sc-gold-700">Before you import</p>
            <ul className="mt-1 space-y-1 text-label-sm text-sc-gold-700/80">
              <li>• Staff must have an active Supabase account (invited via email) before their profile data can be linked</li>
              <li>• Export Airtable as CSV, then use the column names above (exact match or close — the importer fuzzy-matches common variants)</li>
              <li>• Compliance status values must match the exact codes listed in the Notes column</li>
              <li>• Rows with existing emails will update the profile rather than create a duplicate</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
