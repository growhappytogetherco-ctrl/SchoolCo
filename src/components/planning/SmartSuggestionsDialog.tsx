"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SmartSuggestion } from "@/app/actions/planning";
import { createFromSmartSuggestions } from "@/app/actions/planning";
import { toast } from "sonner";

interface SmartSuggestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  suggestions: SmartSuggestion[];
}

export function SmartSuggestionsDialog({
  open,
  onOpenChange,
  eventId,
  suggestions: initialSuggestions,
}: SmartSuggestionsDialogProps) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>(initialSuggestions);
  const [applying, setApplying] = useState(false);

  function toggle(idx: number) {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, selected: !s.selected } : s))
    );
  }

  async function handleApply() {
    setApplying(true);
    const result = await createFromSmartSuggestions(eventId, suggestions);
    if (result.success) {
      const count = suggestions.filter((s) => s.selected).length;
      toast.success(`Created ${count} item${count !== 1 ? "s" : ""}`);
      onOpenChange(false);
      router.push(`/dashboard/events/${eventId}`);
    } else {
      toast.error(result.error);
    }
    setApplying(false);
  }

  function handleSkip() {
    onOpenChange(false);
    router.push(`/dashboard/events/${eventId}`);
  }

  const selectedCount = suggestions.filter((s) => s.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="size-5 text-sc-teal" />
            <DialogTitle>Auto-create related items?</DialogTitle>
          </div>
          <DialogDescription>
            SchoolCo can automatically create tasks and reminders to help you manage this event.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              onClick={() => toggle(idx)}
              className="w-full flex items-start gap-3 rounded-xl border border-sc-gray-100 p-3 text-left hover:bg-sc-gray-100/50 transition-colors"
            >
              {s.selected
                ? <CheckSquare className="size-4 shrink-0 mt-0.5 text-sc-teal" />
                : <Square className="size-4 shrink-0 mt-0.5 text-sc-gray-400" />}
              <div className="flex-1 min-w-0">
                <p className="text-label-sm font-medium text-sc-navy">{s.label}</p>
                <p className="text-xs text-sc-gray capitalize">{s.type}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={handleSkip} className="flex-1">
            Skip
          </Button>
          <Button
            onClick={handleApply}
            disabled={applying || selectedCount === 0}
            className="flex-1 bg-sc-teal hover:bg-sc-teal-700 text-white"
          >
            {applying ? "Creating…" : `Apply ${selectedCount > 0 ? `(${selectedCount})` : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
