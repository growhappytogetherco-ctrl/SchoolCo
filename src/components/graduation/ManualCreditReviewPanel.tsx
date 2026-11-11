"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { verifyManualCredit, resolveDuplicateCredit, type ManualCredit } from "@/app/actions/graduationPlan";

interface Props {
  credits: ManualCredit[];
  onUpdate: () => void;
}

function StatusRow({ mc, onUpdate }: { mc: ManualCredit; onUpdate: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");

  const isVerified = mc.verification_status === "verified";
  const dupStatus = mc.duplicate_status;
  const isUnique = dupStatus === "confirmed_unique";
  const isDuplicate = dupStatus === "confirmed_duplicate";
  const isResolved = isUnique || isDuplicate;

  async function handleVerify(status: "verified" | "unverified") {
    setError(null);
    startTransition(async () => {
      const result = await verifyManualCredit(mc.id, { verification_status: status, verification_notes: notes || undefined });
      if (!result.success) setError(result.error);
      else { setShowNotes(false); setNotes(""); onUpdate(); }
    });
  }

  async function handleResolve(status: "confirmed_unique" | "confirmed_duplicate") {
    setError(null);
    startTransition(async () => {
      const result = await resolveDuplicateCredit(mc.id, { duplicate_status: status, duplicate_resolution_notes: notes || undefined });
      if (!result.success) setError(result.error);
      else { setShowNotes(false); setNotes(""); onUpdate(); }
    });
  }

  return (
    <div className="rounded-lg border border-sc-gray-100 bg-sc-cream p-3 space-y-2">
      {/* Credit identity row */}
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <span className="text-label-sm font-medium text-sc-navy">
            {mc.credits_claimed.toFixed(1)} cr manual
          </span>
          {mc.source_description && (
            <span className="text-xs text-sc-gray-400 ml-2">— {mc.source_description}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {/* Verification status badge */}
          {isVerified ? (
            <Badge className="bg-sc-teal/10 text-sc-teal border-sc-teal/20 text-xs gap-1">
              <CheckCircle2 className="size-3" /> Verified
            </Badge>
          ) : (
            <Badge className="bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200 text-xs gap-1">
              <XCircle className="size-3" /> Unverified
            </Badge>
          )}
          {/* Duplicate status badge */}
          {isUnique && (
            <Badge className="bg-sc-teal/10 text-sc-teal border-sc-teal/20 text-xs gap-1">
              <CheckCircle2 className="size-3" /> Unique
            </Badge>
          )}
          {isDuplicate && (
            <Badge className="bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200 text-xs gap-1">
              <XCircle className="size-3" /> Duplicate
            </Badge>
          )}
          {!isResolved && isVerified && (
            <Badge className="bg-sc-gold-50 text-sc-gold-700 border-sc-gold-300 text-xs gap-1">
              <AlertCircle className="size-3" /> Needs duplicate review
            </Badge>
          )}
          {!isResolved && !isVerified && (
            <Badge className="bg-sc-gold-50 text-sc-gold-700 border-sc-gold-300 text-xs gap-1">
              <AlertCircle className="size-3" /> Pending verification
            </Badge>
          )}
        </div>
      </div>

      {/* Counts toward graduation indicator */}
      {isVerified && isUnique && (
        <p className="text-xs text-sc-teal font-medium flex items-center gap-1">
          <CheckCircle2 className="size-3" /> Counts toward graduation totals
        </p>
      )}
      {(!isVerified || !isUnique) && !isDuplicate && (
        <p className="text-xs text-sc-gray-400 italic">Excluded from graduation totals until verified and confirmed unique</p>
      )}
      {isDuplicate && (
        <p className="text-xs text-sc-rose-700 font-medium flex items-center gap-1">
          <XCircle className="size-3" /> Marked duplicate — excluded from totals
        </p>
      )}

      {/* Optional notes toggle */}
      <button
        className="text-xs text-sc-gray-400 hover:text-sc-navy flex items-center gap-1"
        onClick={() => setShowNotes((v) => !v)}
      >
        {showNotes ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        {showNotes ? "Hide notes" : "Add notes"}
      </button>
      {showNotes && (
        <textarea
          className="w-full text-xs rounded border border-sc-gray-200 p-2 resize-none focus:outline-none focus:ring-1 focus:ring-sc-teal"
          rows={2}
          placeholder="Optional: explain verification or duplicate decision…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      )}

      {error && <p className="text-xs text-sc-rose-700">{error}</p>}

      {/* Action buttons — always visible */}
      <div className="flex flex-wrap gap-2">
        {/* Step 1: Verification */}
        {!isVerified ? (
          <Button
            size="sm"
            className="h-7 text-xs bg-sc-teal hover:bg-sc-teal-700 text-white"
            disabled={isPending}
            onClick={() => handleVerify("verified")}
          >
            {isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <CheckCircle2 className="size-3 mr-1" />}
            Verify Credit
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-sc-rose-700 border-sc-rose-200 hover:bg-sc-rose-50"
            disabled={isPending}
            onClick={() => handleVerify("unverified")}
          >
            {isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : null}
            Unverify
          </Button>
        )}

        {/* Step 2: Duplicate resolution (only when verified and not yet resolved) */}
        {isVerified && !isResolved && (
          <>
            <Button
              size="sm"
              className="h-7 text-xs bg-sc-navy hover:bg-sc-navy/90 text-white"
              disabled={isPending}
              onClick={() => handleResolve("confirmed_unique")}
            >
              {isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <CheckCircle2 className="size-3 mr-1" />}
              Confirm Unique
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-sc-rose-700 border-sc-rose-200 hover:bg-sc-rose-50"
              disabled={isPending}
              onClick={() => handleResolve("confirmed_duplicate")}
            >
              {isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <XCircle className="size-3 mr-1" />}
              Mark Duplicate
            </Button>
          </>
        )}

        {/* Re-resolve if already resolved */}
        {isVerified && isResolved && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-sc-gray-400"
            disabled={isPending}
            onClick={() => handleResolve(isUnique ? "confirmed_duplicate" : "confirmed_unique")}
          >
            {isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : null}
            {isUnique ? "Change to Duplicate" : "Change to Unique"}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ManualCreditReviewPanel({ credits, onUpdate }: Props) {
  if (credits.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs font-medium text-sc-gray-400 uppercase tracking-wide">Manual Credits</p>
      {credits.map((mc) => (
        <StatusRow key={mc.id} mc={mc} onUpdate={onUpdate} />
      ))}
    </div>
  );
}
