"use client";

// TEMPORARY ADMIN PAGE — DELETE AFTER CLEANUP IS COMPLETE
// Purpose: Trash fake/test student Drive folders before running migration 00040.
// Do NOT link this page from navigation.

import { useState, useEffect } from "react";
import { getCleanupInventory, runDriveCleanup } from "@/app/actions/cleanupTestData";
import type { CleanupInventory, DriveCleanupResult } from "@/app/actions/cleanupTestData";

export default function CleanupTestDataPage() {
  const [inventory, setInventory] = useState<CleanupInventory | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [driveResults, setDriveResults] = useState<DriveCleanupResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getCleanupInventory().then((r) => {
      if (r.success) setInventory(r.data);
      else setInventoryError(r.error);
    });
  }, []);

  async function handleDriveCleanup() {
    setRunning(true);
    const r = await runDriveCleanup();
    setRunning(false);
    if (r.success) {
      setDriveResults(r.results);
      setDone(true);
    } else {
      setInventoryError(`Drive cleanup failed: ${r.error}`);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <h1 className="text-heading-1 text-sc-navy mb-1">Test Data Cleanup</h1>
        <p className="text-body-md text-sc-gray-400 mb-4">
          TEMPORARY PAGE — Delete after use. Trashes Drive folders for the 5 fake/test students.
          Run this BEFORE applying migration 00040.
        </p>

        {inventoryError && (
          <div className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 p-4 text-sc-rose-700 text-label-sm">
            {inventoryError}
          </div>
        )}

        {!inventory && !inventoryError && (
          <p className="text-label-sm text-sc-gray-400">Loading inventory…</p>
        )}

        {inventory && (
          <div className="space-y-4">
            <div>
              <h2 className="text-label-md font-semibold text-sc-navy mb-2">Fake Students Found in DB</h2>
              <table className="w-full text-label-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-sc-gray-100">
                    <th className="pb-2 pr-4 text-sc-gray-400">Name</th>
                    <th className="pb-2 pr-4 text-sc-gray-400">Display ID</th>
                    <th className="pb-2 pr-4 text-sc-gray-400">Drive Root Folder</th>
                    <th className="pb-2 text-sc-gray-400">Subfolder Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.students.length === 0 && (
                    <tr><td colSpan={4} className="py-3 text-sc-gray-400 italic">No fake students found in DB</td></tr>
                  )}
                  {inventory.students.map((s) => (
                    <tr key={s.id} className="border-b border-sc-gray-100">
                      <td className="py-2 pr-4 font-medium">{s.full_name}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{s.display_id}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {s.google_drive_folder_id
                          ? <span className="text-sc-teal">{s.google_drive_folder_id.slice(0, 20)}…</span>
                          : <span className="text-sc-gray-400">none</span>}
                      </td>
                      <td className="py-2">{s.drive_folder_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h2 className="text-label-md font-semibold text-sc-navy mb-2">Display ID Counters</h2>
              <div className="flex gap-6 text-label-sm">
                <div><span className="text-sc-gray-400">S (students):</span> <strong>{inventory.driveCounters.s_prefix ?? "—"}</strong></div>
                <div><span className="text-sc-gray-400">F (families):</span> <strong>{inventory.driveCounters.f_prefix ?? "—"}</strong></div>
                <div><span className="text-sc-gray-400">H (households):</span> <strong>{inventory.driveCounters.h_prefix ?? "—"}</strong></div>
              </div>
              <p className="text-xs text-sc-gray-400 mt-1">
                All will be reset to 0 by migration 00040. First real student will receive RLA-S0001.
              </p>
            </div>

            {!done && (
              <div className="pt-2">
                <button
                  onClick={handleDriveCleanup}
                  disabled={running || inventory.students.length === 0}
                  className="rounded-lg bg-sc-rose px-5 py-2.5 text-white text-label-md font-semibold disabled:opacity-50"
                >
                  {running ? "Trashing Drive folders…" : "Trash Drive Folders for Fake Students"}
                </button>
                {inventory.students.length === 0 && (
                  <p className="mt-2 text-label-sm text-sc-gray-400">
                    No fake students in DB — Drive cleanup skipped. Proceed to apply migration 00040.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {driveResults && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
          <h2 className="text-label-md font-semibold text-sc-navy mb-3">Drive Cleanup Results</h2>
          <table className="w-full text-label-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-sc-gray-100">
                <th className="pb-2 pr-4 text-sc-gray-400">Student</th>
                <th className="pb-2 pr-4 text-sc-gray-400">Folder ID</th>
                <th className="pb-2 text-sc-gray-400">Result</th>
              </tr>
            </thead>
            <tbody>
              {driveResults.map((r) => (
                <tr key={r.studentId} className="border-b border-sc-gray-100">
                  <td className="py-2 pr-4 font-medium">{r.name} <span className="text-sc-gray-400 font-normal">({r.displayId})</span></td>
                  <td className="py-2 pr-4 font-mono text-xs text-sc-gray-400">
                    {r.folderId ? r.folderId.slice(0, 20) + "…" : "—"}
                  </td>
                  <td className="py-2">
                    {r.result === "trashed" && <span className="text-sc-teal font-semibold">✓ Trashed</span>}
                    {r.result === "no_folder" && <span className="text-sc-gray-400">No Drive folder</span>}
                    {r.result === "error" && <span className="text-sc-rose-700">✗ {r.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 rounded-lg bg-sc-gold-50 border border-sc-gold-300 p-4">
            <p className="text-label-sm text-sc-gold-800 font-semibold">Drive cleanup complete.</p>
            <p className="text-label-sm text-sc-gold-700 mt-1">
              Next step: run <code className="font-mono text-xs bg-sc-gold-50 px-1">npx supabase db push --linked</code> to apply
              migration 00040 and clean up the database records + reset counters.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
