"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, AlertTriangle, Loader2, FolderOpen, RefreshCw } from "lucide-react";
import { createStudentDriveFolders, getRosterDriveStatus } from "@/app/actions/drive";

interface StudentResult {
  id: string;
  displayId: string;
  name: string;
  driveStatus: string;
  hasRootFolder: boolean;
  subfoldersCount: number;
  uiStatus?: "provisioning" | "ok" | "error";
  uiError?: string;
}

export default function DriveRosterPage() {
  const [students, setStudents] = useState<StudentResult[]>([]);
  const [summary, setSummary] = useState<{ total: number; connected: number; setupRequired: number; partial: number; error: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = (msg: string) => setLog((l) => [...l, msg]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const res = await getRosterDriveStatus();
    if (res.success) {
      setStudents(res.students);
      setSummary(res.summary);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function repairStudent(studentId: string) {
    setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, uiStatus: "provisioning" } : s));
    const result = await createStudentDriveFolders(studentId);
    if (result.success) {
      appendLog(`✓ Provisioned ${students.find((s) => s.id === studentId)?.displayId}`);
      setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, uiStatus: "ok", driveStatus: "active", hasRootFolder: true } : s));
    } else {
      appendLog(`✘ Error for ${students.find((s) => s.id === studentId)?.displayId}: ${result.error}`);
      setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, uiStatus: "error", uiError: result.error } : s));
    }
  }

  async function repairAll() {
    setRunning(true);
    appendLog("Starting Drive reconciliation…");
    const needsRepair = students.filter((s) => !["active", "manually_linked"].includes(s.driveStatus) || s.driveStatus === "error");
    appendLog(`${needsRepair.length} students need provisioning`);
    for (const student of needsRepair) {
      appendLog(`→ Provisioning ${student.displayId} — ${student.name}…`);
      await repairStudent(student.id);
      await new Promise((r) => setTimeout(r, 800));
    }
    appendLog("Done.");
    setRunning(false);
    await loadStatus();
  }

  const needsRepair = students.filter((s) => !["active", "manually_linked"].includes(s.driveStatus));

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-sc-navy">Student Drive Health</h1>
          <p className="text-label-sm text-sc-gray mt-0.5">
            View and repair Google Drive provisioning for all students. Safe to run repeatedly — no duplicate folders are created.
          </p>
        </div>
        <button onClick={loadStatus} disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Connected",      value: summary.connected,     color: "text-sc-teal-700" },
            { label: "Setup Required", value: summary.setupRequired, color: "text-sc-rose" },
            { label: "Partial",        value: summary.partial,       color: "text-sc-gold-700" },
            { label: "Error",          value: summary.error,         color: "text-sc-rose" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-sc-gray-100 bg-white p-3 text-center shadow-card">
              <p className={`text-2xl font-semibold ${color}`}>{value}</p>
              <p className="text-label-sm text-sc-gray mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sc-gray text-label-sm py-6">
          <Loader2 className="size-4 animate-spin" /> Loading student Drive status…
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
            <table className="w-full text-label-sm">
              <thead className="border-b border-sc-gray-100 bg-sc-gray-50/50">
                <tr>
                  <th className="text-left p-3 pl-4 font-medium text-sc-gray">ID</th>
                  <th className="text-left p-3 font-medium text-sc-gray">Student</th>
                  <th className="text-left p-3 font-medium text-sc-gray">Drive</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-gray-100">
                {students.map((s) => {
                  const isReady = s.driveStatus === "active" || s.driveStatus === "manually_linked";
                  const isProvisioning = s.uiStatus === "provisioning";
                  return (
                    <tr key={s.id}>
                      <td className="p-3 pl-4 font-mono text-xs text-sc-gray">{s.displayId}</td>
                      <td className="p-3 text-sc-navy">{s.name}</td>
                      <td className="p-3">
                        {isReady ? (
                          <span className="flex items-center gap-1.5 text-sc-teal-700">
                            <CheckCircle className="size-3.5" />
                            Connected {s.subfoldersCount > 0 && `(${s.subfoldersCount} folders)`}
                          </span>
                        ) : s.driveStatus === "error" || s.uiStatus === "error" ? (
                          <span className="flex items-center gap-1.5 text-sc-rose">
                            <AlertTriangle className="size-3.5" />
                            Error {s.uiError && `— ${s.uiError.slice(0, 50)}`}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-sc-gold-700">
                            <FolderOpen className="size-3.5" />
                            Setup Required
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {(!isReady || s.driveStatus === "error") && (
                          <button
                            onClick={() => repairStudent(s.id)}
                            disabled={isProvisioning || running}
                            className="rounded-lg border border-sc-teal/30 px-3 py-1.5 text-xs text-sc-teal font-medium hover:bg-sc-teal/5 disabled:opacity-50"
                          >
                            {isProvisioning ? <Loader2 className="size-3 animate-spin inline" /> : "Repair Setup"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {needsRepair.length > 0 && (
            <button
              onClick={repairAll}
              disabled={running}
              className="flex items-center gap-2 rounded-xl bg-sc-teal px-5 py-2.5 text-label-sm text-white font-medium hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
              {running ? "Repairing…" : `Repair ${needsRepair.length} student${needsRepair.length !== 1 ? "s" : ""}`}
            </button>
          )}

          {needsRepair.length === 0 && (
            <div className="rounded-xl border border-sc-teal/20 bg-sc-teal/5 p-4 text-label-sm text-sc-teal-700">
              ✓ All students are fully provisioned.
            </div>
          )}
        </>
      )}

      {log.length > 0 && (
        <pre className="mt-4 rounded-xl bg-sc-navy text-green-300 p-4 text-xs overflow-x-auto whitespace-pre-wrap">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}
