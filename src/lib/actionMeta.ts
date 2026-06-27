export const ACTION_META: Record<string, { label: string; icon: string }> = {
  goal_review_due:   { label: "Goal Review Due",          icon: "Target"        },
  missing_checkout:  { label: "Missing Checkout",         icon: "LogOut"        },
  flag_expiring:     { label: "Support Flag Expiring",    icon: "ShieldAlert"   },
  assessment_needed: { label: "Assessment Needed",        icon: "ClipboardList" },
};

export function getActionMeta(type: string) {
  return ACTION_META[type] ?? { label: type.replace(/_/g, " "), icon: "AlertCircle" };
}
