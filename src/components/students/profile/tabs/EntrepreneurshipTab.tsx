"use client";

import { useEffect, useState } from "react";
import { Briefcase, DollarSign, Calendar, ExternalLink, TrendingUp } from "lucide-react";
import { getStudentEntrepreneurshipData } from "@/app/actions/profileData";
import { cn } from "@/lib/utils";

interface Props { studentId: string }

type EntData = Awaited<ReturnType<typeof getStudentEntrepreneurshipData>>;

const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  planning:   { cls: "bg-sc-gray-50  text-sc-gray   border-sc-gray-200",  label: "Planning"   },
  active:     { cls: "bg-sc-teal-50  text-sc-teal   border-sc-teal-200",  label: "Active"     },
  pitching:   { cls: "bg-sc-gold-50  text-sc-gold-700 border-sc-gold-200", label: "Pitching"   },
  completed:  { cls: "bg-sc-navy-50  text-sc-navy   border-sc-navy-200",  label: "Completed"  },
  paused:     { cls: "bg-sc-rose-50  text-sc-rose   border-sc-rose-200",  label: "Paused"     },
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRevenue(val: number | string | null) {
  if (!val) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val));
}

export function EntrepreneurshipTab({ studentId }: Props) {
  const [data, setData] = useState<EntData>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentEntrepreneurshipData(studentId).then((d) => { setData(d); setLoading(false); });
  }, [studentId]);

  if (loading) return (
    <div className="space-y-4">
      {[1,2].map((i) => <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card h-40 animate-pulse" />)}
    </div>
  );

  const projects = data?.projects ?? [];
  const active   = projects.filter((p) => p.status === "active" || p.status === "pitching");
  const totalRev = projects.reduce((sum, p) => sum + Number(p.revenue_earned ?? 0), 0);

  return (
    <div className="space-y-6">

      {/* Stats */}
      {projects.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 text-center">
            <p className="font-serif text-heading-1 font-bold text-sc-teal">{projects.length}</p>
            <p className="text-label-sm text-sc-gray mt-1">Total Projects</p>
          </div>
          <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 text-center">
            <p className="font-serif text-heading-1 font-bold text-sc-navy">{active.length}</p>
            <p className="text-label-sm text-sc-gray mt-1">Active</p>
          </div>
          {totalRev > 0 && (
            <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 text-center">
              <p className="font-serif text-heading-1 font-bold text-sc-green">{fmtRevenue(totalRev)}</p>
              <p className="text-label-sm text-sc-gray mt-1">Revenue Earned</p>
            </div>
          )}
        </div>
      )}

      {/* Projects */}
      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center space-y-3">
          <Briefcase className="size-10 text-sc-gray-300 mx-auto" />
          <p className="text-body-md text-sc-gray-400">No entrepreneurship projects yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => {
            const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.planning;
            const revenue = fmtRevenue(p.revenue_earned);
            const pitchDate = fmtDate(p.pitch_date);
            return (
              <div key={p.id} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sc-gold-50 border border-sc-gold-200">
                    <Briefcase className="size-5 text-sc-gold-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-label-lg font-bold text-sc-navy">{p.project_name}</h3>
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium", cfg.cls)}>
                        {cfg.label}
                      </span>
                    </div>
                    {p.tagline && <p className="text-label-sm text-sc-gray mt-0.5 italic">{p.tagline}</p>}
                    {p.business_type && <p className="text-label-sm text-sc-gray">{p.business_type}</p>}
                  </div>
                </div>

                {/* Description */}
                {p.description && (
                  <p className="text-body-sm text-sc-navy">{p.description}</p>
                )}

                {/* Stats row */}
                <div className="flex flex-wrap gap-4 text-label-sm">
                  {fmtDate(p.started_at) && (
                    <span className="flex items-center gap-1 text-sc-gray">
                      <Calendar className="size-3.5" /> Started {fmtDate(p.started_at)}
                    </span>
                  )}
                  {pitchDate && (
                    <span className="flex items-center gap-1 text-sc-gold-700 font-medium">
                      <TrendingUp className="size-3.5" /> Pitch: {pitchDate}
                    </span>
                  )}
                  {revenue && (
                    <span className="flex items-center gap-1 text-sc-green font-semibold">
                      <DollarSign className="size-3.5" /> {revenue}
                    </span>
                  )}
                  {p.pitch_score && (
                    <span className="flex items-center gap-1 text-sc-navy font-medium">
                      Score: {p.pitch_score}/100
                    </span>
                  )}
                </div>

                {/* Mentor */}
                {p.mentor_name && (
                  <div className="rounded-lg bg-sc-navy-50 border border-sc-navy-200 px-3 py-2">
                    <p className="text-label-sm font-semibold text-sc-navy">Mentor: {p.mentor_name}</p>
                    {p.mentor_notes && (
                      <p className="text-label-sm text-sc-gray mt-0.5">{p.mentor_notes}</p>
                    )}
                  </div>
                )}

                {/* Links */}
                <div className="flex gap-3">
                  {p.pitch_deck_url && (
                    <a href={p.pitch_deck_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-label-sm text-sc-teal font-medium hover:underline">
                      <ExternalLink className="size-3.5" /> Pitch Deck
                    </a>
                  )}
                  {p.google_drive_folder_id && (
                    <a href={`https://drive.google.com/drive/folders/${p.google_drive_folder_id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-label-sm text-sc-teal font-medium hover:underline">
                      <ExternalLink className="size-3.5" /> Drive Folder
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
