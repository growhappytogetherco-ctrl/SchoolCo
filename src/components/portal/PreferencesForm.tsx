"use client";

import { useState, useTransition } from "react";
import { Bell, Mail, Phone, MessageSquare, CheckCircle } from "lucide-react";
import { updateMyPreferences } from "@/app/actions/guardians";
import { Switch } from "@/components/ui/switch";
import type { Guardianship, GuardianCommunication, GuardianVisibility } from "@/types/database";
import { RELATIONSHIP_LABELS } from "@/lib/constants";
import type { RelationshipType } from "@/lib/constants";

interface PreferencesFormProps {
  guardianship: Guardianship & {
    students?: { first_name: string; last_name: string } | null;
  };
}

/**
 * Parent-facing form for updating communication and visibility preferences.
 *
 * Security:
 * - Only updates the guardianship row that belongs to the calling parent.
 * - Cannot modify custody_type, can_pickup, or staff-set custody restrictions.
 * - updateMyPreferences server action enforces these constraints server-side.
 */
export function PreferencesForm({ guardianship }: PreferencesFormProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comm = (guardianship.communication_json ?? {}) as GuardianCommunication;
  const vis  = (guardianship.visibility_json    ?? {}) as GuardianVisibility;

  const studentName = guardianship.students
    ? `${guardianship.students.first_name} ${guardianship.students.last_name}`
    : "Student";

  const relationshipLabel = RELATIONSHIP_LABELS[guardianship.relationship_type as RelationshipType] ?? guardianship.relationship_type;

  // Local state for toggles
  const [channels, setChannels] = useState<GuardianCommunication["channels"]>(
    comm.channels ?? { email: true, sms: false, push: false }
  );
  const [receive, setReceive] = useState<GuardianCommunication["receive"]>(
    comm.receive ?? { announcements: true, attendance: true, grades: true, incidents: true, newsletters: true }
  );

  async function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateMyPreferences({
        guardianship_id: guardianship.id,
        communication_json: {
          ...comm,
          channels,
          receive,
        },
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="font-serif text-heading-3 text-sc-navy">{studentName}</p>
          <p className="text-label-sm text-sc-gray mt-0.5">{relationshipLabel}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-4 py-2 text-white text-label-md font-medium disabled:opacity-60 transition-opacity"
        >
          {saved ? (
            <><CheckCircle className="size-4" /> Saved</>
          ) : isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {error && (
        <p className="text-label-sm text-sc-rose mb-4">{error}</p>
      )}

      <div className="space-y-6">
        {/* Contact channels */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Bell className="size-4 text-sc-gray" />
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">Contact Channels</p>
          </div>
          <div className="space-y-3">
            <Switch
              label="Email notifications"
              description="Receive updates at your registered email address"
              checked={!!channels.email}
              onChange={(v) => setChannels((c) => ({ ...c, email: v }))}
            />
            <Switch
              label="SMS / text message"
              description="Receive text messages for time-sensitive updates"
              checked={!!channels.sms}
              onChange={(v) => setChannels((c) => ({ ...c, sms: v }))}
            />
            <Switch
              label="Push notifications"
              description="In-app push notifications (requires mobile app)"
              checked={!!channels.push}
              onChange={(v) => setChannels((c) => ({ ...c, push: v }))}
            />
          </div>
        </section>

        {/* What to receive */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Mail className="size-4 text-sc-gray" />
            <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">What to Receive</p>
          </div>
          <div className="space-y-3">
            <Switch
              label="Announcements"
              description="School-wide and class announcements"
              checked={!!receive.announcements}
              onChange={(v) => setReceive((r) => ({ ...r, announcements: v }))}
            />
            <Switch
              label="Attendance alerts"
              description="Notify when your child is marked absent or tardy"
              checked={!!receive.attendance}
              onChange={(v) => setReceive((r) => ({ ...r, attendance: v }))}
            />
            <Switch
              label="Grade reports"
              description="Report cards and progress updates"
              checked={!!receive.grades}
              onChange={(v) => setReceive((r) => ({ ...r, grades: v }))}
            />
            <Switch
              label="Incident notifications"
              description="Resolved incidents that staff have approved for family visibility"
              checked={!!receive.incidents}
              onChange={(v) => setReceive((r) => ({ ...r, incidents: v }))}
            />
            <Switch
              label="Newsletters"
              description="Monthly newsletters and community updates"
              checked={!!receive.newsletters}
              onChange={(v) => setReceive((r) => ({ ...r, newsletters: v }))}
            />
          </div>
        </section>

        {/* Visibility note */}
        <section className="rounded-xl border border-sc-gray-100 bg-sc-cream/50 p-4">
          <p className="text-label-sm text-sc-gray-400">
            Some visibility settings are configured by school staff and cannot be changed here. Contact your school office if you have questions about what information you can access.
          </p>
        </section>
      </div>
    </div>
  );
}
