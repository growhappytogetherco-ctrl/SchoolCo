"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { CalendarEvent, EventCategory, EventVisibility, EventStatus } from "@/app/actions/planning";
import { createEvent, updateEvent, getSmartSuggestions } from "@/app/actions/planning";
import { EVENT_CATEGORY_CONFIG, VISIBILITY_LABELS } from "@/lib/planning-config";
import { SmartSuggestionsDialog } from "./SmartSuggestionsDialog";
import type { SmartSuggestion } from "@/app/actions/planning";
import { toast } from "sonner";

interface EventFormProps {
  event?: CalendarEvent;
}

const CATEGORIES = Object.entries(EVENT_CATEGORY_CONFIG) as [EventCategory, (typeof EVENT_CATEGORY_CONFIG)[EventCategory]][];
const VISIBILITIES = Object.entries(VISIBILITY_LABELS) as [EventVisibility, string][];
const STATUSES: { value: EventStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
];

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function toIso(local: string) {
  return new Date(local).toISOString();
}

export function EventForm({ event }: EventFormProps) {
  const router = useRouter();
  const isEdit = !!event;

  const now = new Date();
  const defaultStart = format(now, "yyyy-MM-dd'T'09:00");
  const defaultEnd = format(now, "yyyy-MM-dd'T'10:00");

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startAt, setStartAt] = useState(event ? toDatetimeLocal(event.start_at) : defaultStart);
  const [endAt, setEndAt] = useState(event ? toDatetimeLocal(event.end_at) : defaultEnd);
  const [isAllDay, setIsAllDay] = useState(event?.is_all_day ?? false);
  const [category, setCategory] = useState<EventCategory>(event?.category ?? "other");
  const [visibility, setVisibility] = useState<EventVisibility>(event?.visibility ?? "school_wide");
  const [status, setStatus] = useState<EventStatus>(event?.status ?? "draft");
  const [requiresRsvp, setRequiresRsvp] = useState(event?.requires_rsvp ?? false);
  const [requiresPermissionSlip, setRequiresPermissionSlip] = useState(event?.requires_permission_slip ?? false);
  const [requiresTransportation, setRequiresTransportation] = useState(event?.requires_transportation ?? false);

  const [saving, setSaving] = useState(false);
  const [smartDialog, setSmartDialog] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    const data = {
      title: title.trim(),
      description: description || null,
      location: location || null,
      start_at: toIso(startAt),
      end_at: toIso(endAt),
      is_all_day: isAllDay,
      category,
      visibility,
      status,
      requires_rsvp: requiresRsvp,
      requires_permission_slip: requiresPermissionSlip,
      requires_transportation: requiresTransportation,
      requires_parent_confirm: false,
    };

    if (isEdit) {
      const result = await updateEvent(event!.id, data);
      if (result.success) {
        toast.success("Event updated");
        router.push(`/dashboard/events/${event!.id}`);
      } else {
        toast.error(result.error);
        setSaving(false);
      }
    } else {
      const result = await createEvent(data as any);
      if (result.success) {
        toast.success("Event created");
        const suggestions = await getSmartSuggestions(category, title);
        if (suggestions.length > 0) {
          setCreatedEventId(result.data.id);
          setSmartSuggestions(suggestions);
          setSmartDialog(true);
        } else {
          router.push(`/dashboard/events/${result.data.id}`);
        }
      } else {
        toast.error(result.error);
        setSaving(false);
      }
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 space-y-4">
          <h2 className="font-serif text-sc-navy font-semibold">Event Details</h2>
          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="title">Title <span className="text-sc-rose">*</span></Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description…"
              className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, address, or link…" />
          </div>
        </div>

        {/* Date & Time */}
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 space-y-4">
          <h2 className="font-serif text-sc-navy font-semibold">Date & Time</h2>
          <Separator />

          <div className="flex items-center gap-2">
            <input
              id="all-day"
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="all-day" className="cursor-pointer">All-day event</Label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input
                type={isAllDay ? "date" : "datetime-local"}
                value={isAllDay ? startAt.split("T")[0] : startAt}
                onChange={(e) => setStartAt(isAllDay ? e.target.value + "T00:00" : e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input
                type={isAllDay ? "date" : "datetime-local"}
                value={isAllDay ? endAt.split("T")[0] : endAt}
                onChange={(e) => setEndAt(isAllDay ? e.target.value + "T23:59" : e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 space-y-4">
          <h2 className="font-serif text-sc-navy font-semibold">Classification</h2>
          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => {
                const cat = v as EventCategory;
                setCategory(cat);
                setVisibility(EVENT_CATEGORY_CONFIG[cat]?.defaultVisibility ?? "school_wide");
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(([val, cfg]) => (
                    <SelectItem key={val} value={val}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as EventVisibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITIES.map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EventStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Requirements */}
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 space-y-4">
          <h2 className="font-serif text-sc-navy font-semibold">Requirements</h2>
          <Separator />

          <div className="space-y-3">
            {[
              { id: "rsvp", label: "Requires RSVP", value: requiresRsvp, setter: setRequiresRsvp },
              { id: "permission", label: "Requires permission slip", value: requiresPermissionSlip, setter: setRequiresPermissionSlip },
              { id: "transportation", label: "Requires transportation", value: requiresTransportation, setter: setRequiresTransportation },
            ].map(({ id, label, value, setter }) => (
              <div key={id} className="flex items-center gap-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setter(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor={id} className="cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !title.trim()} className="bg-sc-teal hover:bg-sc-teal-700 text-white">
            {saving ? "Saving…" : isEdit ? "Update Event" : "Create Event"}
          </Button>
        </div>
      </form>

      {smartDialog && createdEventId && (
        <SmartSuggestionsDialog
          open={smartDialog}
          onOpenChange={setSmartDialog}
          eventId={createdEventId}
          suggestions={smartSuggestions}
        />
      )}
    </>
  );
}
