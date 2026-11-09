"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addManualCredit } from "@/app/actions/graduationPlan";

interface Props {
  planId: string;
  entryId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ManualCreditForm({ planId, entryId, onSuccess, onCancel }: Props) {
  const [credits, setCredits] = useState("1.0");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit() {
    const val = parseFloat(credits);
    if (isNaN(val) || val <= 0) {
      setError("Credits must be a positive number");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addManualCredit(planId, entryId, {
        credits_claimed: val,
        source_description: description || undefined,
      });
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-sc-gold-300 bg-sc-gold-50 p-3 space-y-3">
      <p className="text-label-sm font-medium text-sc-gold-800">Add Manual Credit Claim</p>
      <p className="text-xs text-sc-gold-700">
        Manual credits are excluded from graduation totals until duplicate review is completed.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="mc-credits" className="text-xs">Credits Claimed</Label>
          <Input
            id="mc-credits"
            type="number"
            step="0.5"
            min="0.5"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label htmlFor="mc-desc" className="text-xs">Source Description</Label>
          <Input
            id="mc-desc"
            placeholder="e.g. Dual enrollment transcript"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      {error && <p className="text-xs text-sc-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={isPending}>
          {isPending && <Loader2 className="size-3 mr-1 animate-spin" />}
          Add Claim
        </Button>
      </div>
    </div>
  );
}
