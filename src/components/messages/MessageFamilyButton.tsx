"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { StaffComposeModal } from "@/components/messages/StaffComposeModal";
import { cn } from "@/lib/utils";

interface Props {
  orgId:            string;
  familyId:         string;
  studentId?:       string;
  variant?:         "button" | "icon";
  className?:       string;
}

export function MessageFamilyButton({ orgId, familyId, studentId, variant = "button", className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          variant === "button"
            ? "flex items-center gap-2 rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors"
            : "flex items-center justify-center rounded-lg p-2 text-sc-gray hover:text-sc-navy hover:bg-sc-gray-100 transition-colors",
          className
        )}
      >
        <MessageSquare className="size-4" />
        {variant === "button" && <span>Message Family</span>}
      </button>

      {open && (
        <StaffComposeModal
          orgId={orgId}
          familyId={familyId}
          defaultFamilyId={familyId}
          defaultStudentId={studentId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
