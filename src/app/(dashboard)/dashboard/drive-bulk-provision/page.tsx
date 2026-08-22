"use client";

/**
 * One-time admin page: bulk-provision Google Drive folders for all 18 RLA students.
 * Remove this page after provisioning is confirmed complete.
 * URL: /dashboard/drive-bulk-provision
 */

import { useEffect, useState, useCallback } from "react";
import { createStudentDriveFolders } from "@/app/actions/drive";

interface StudentResult {
  id: string;
  displayId: string;
  name: string;
  status: "pending" | "skipped" | "ok" | "error";
  folderUrl?: string;
  error?: string;
}

export default function DriveBulkProvisionPage() {
  const [students, setStudents] = useState<StudentResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = (msg: string) => setLog((l) => [...l, msg]);

  const loadStudents = useCallback(async () => {
    const res = await fetch("/api/admin/students-drive-status");
    if (!res.ok) { appendLog("Failed to load students"); return; }
    const data = await res.json();
    setStudents(data.students);
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  async function runProvision() {
    setRunning(true);
    appendLog("Starting bulk Drive provisioning…");

    const pending = students.filter((s) => s.status === "pending" || s.status === "error");
    appendLog(`${pending.length} students need provisioning`);

    for (const student of pending) {
      appendLog(`→ Provisioning ${student.displayId} — ${student.name}…`);
      const result = await createStudentDriveFolders(student.id);
      if (result.success) {
        setStudents((prev) => prev.map((s) =>
          s.id === student.id ? { ...s, status: "ok", folderUrl: result.folderUrl } : s
        ));
        appendLog(`  ✓ ${student.displayId} — ${result.folderUrl}`);
      } else {
        setStudents((prev) => prev.map((s) =>
          s.id === student.id ? { ...s, status: "error", error: result.error } : s
        ));
        appendLog(`  ✘ ${student.displayId}: ${result.error}`);
      }
      // Small delay to avoid hitting Drive API rate limits
      await new Promise((r) => setTimeout(r, 800));
    }

    appendLog("Done.");
    setRunning(false);
    setDone(true);
  }

  const counts = {
    ok:      students.filter((s) => s.status === "ok").length,
    skipped: students.filter((s) => s.status === "skipped").length,
    pending: students.filter((s) => s.status === "pending").length,
    error:   students.filter((s) => s.status === "error").length,
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 text-sc-navy">Drive Bulk Provisioning</h1>
      <p className="text-sm text-sc-gray-400 mb-6">
        One-time admin utility. Provisions Google Drive folders for all students who don&apos;t
        have them yet. Remove this page after use.
      </p>

      {students.length === 0 ? (
        <p className="text-sc-gray-400">Loading students…</p>
      ) : (
        <>
          <div className="flex gap-4 text-sm mb-4">
            <span className="text-green-700">✓ {counts.ok + counts.skipped} already done</span>
            <span className="text-amber-700">⏳ {counts.pending} pending</span>
            {counts.error > 0 && <span className="text-red-700">✘ {counts.error} error</span>}
          </div>

          <div className="rounded-xl border border-sc-gray-100 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-sc-gray-100">
                <tr>
                  <th className="text-left p-2 pl-3">ID</th>
                  <th className="text-left p-2">Student</th>
                  <th className="text-left p-2">Drive</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-t border-sc-gray-100">
                    <td className="p-2 pl-3 font-mono text-xs text-sc-gray-400">{s.displayId}</td>
                    <td className="p-2">{s.name}</td>
                    <td className="p-2">
                      {s.status === "ok" || s.status === "skipped" ? (
                        <a href={s.folderUrl} target="_blank" rel="noreferrer"
                          className="text-sc-teal text-xs underline">
                          ✓ Open folder
                        </a>
                      ) : s.status === "error" ? (
                        <span className="text-red-600 text-xs">✘ {s.error?.slice(0, 60)}</span>
                      ) : (
                        <span className="text-sc-gray-400 text-xs">pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!done && (
            <button
              onClick={runProvision}
              disabled={running || counts.pending === 0}
              className="bg-sc-teal text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {running ? "Provisioning…" : `Provision ${counts.pending} students`}
            </button>
          )}

          {done && counts.error === 0 && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
              ✅ All students provisioned. Delete this page from the codebase.
            </div>
          )}
        </>
      )}

      {log.length > 0 && (
        <pre className="mt-6 bg-sc-navy text-green-300 rounded-xl p-4 text-xs overflow-x-auto whitespace-pre-wrap">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}
