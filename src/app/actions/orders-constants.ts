// Shared types for Orders & Invoices — safe to import in client components.
// Server actions import from orders.ts directly.

export type ItemCategory = "shirt" | "polo" | "uniform" | "field_trip" | "supplies" | "fee" | "other";

export type OrderStatus = "draft" | "invoiced" | "partial" | "paid" | "cancelled" | "voided";

export type FulfillmentStatus = "pending" | "partial" | "fulfilled";

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  shirt:       "T-Shirt",
  polo:        "Polo / Uniform Shirt",
  uniform:     "Uniform",
  field_trip:  "Field Trip",
  supplies:    "Supplies",
  fee:         "Fee",
  other:       "Other",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft:     "Draft",
  invoiced:  "Invoiced",
  partial:   "Partially Paid",
  paid:      "Paid in Full",
  cancelled: "Cancelled",
  voided:    "Voided",
};

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  pending:   "Pending",
  partial:   "Partially Fulfilled",
  fulfilled: "Fulfilled",
};

// Common sizes offered; catalog items may override with their own list
export const COMMON_SIZES = ["YXS", "YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"];

export interface StoreItem {
  id:               string;
  organization_id:  string;
  name:             string;
  description:      string | null;
  category:         ItemCategory;
  unit_price_cents: number;
  available_sizes:  string[] | null;
  is_active:        boolean;
  sort_order:       number;
  created_at:       string;
}

export interface OrderItemRow {
  id:               string;
  order_id:         string;
  store_item_id:    string | null;
  item_name:        string;
  size:             string | null;
  quantity:         number;
  unit_price_cents: number;
  line_total_cents: number;
  student_id:       string | null;
  student_name:     string | null;   // joined from students
  is_voided:        boolean;
  voided_at:        string | null;
  void_reason:      string | null;
  created_at:       string;
}

export interface OrderRow {
  id:                      string;
  organization_id:         string;
  family_account_id:       string;
  family_name:             string;
  guardian_email:          string | null;
  order_status:            OrderStatus;
  fulfillment_status:      FulfillmentStatus;
  invoice_number:          string | null;
  invoice_date:            string | null;
  due_date:                string | null;
  invoice_sent_at:         string | null;
  invoice_sent_count:      number;
  invoice_sent_to:         string | null;
  billing_recipient_id:    string | null;
  billing_recipient_name:  string | null;
  billing_recipient_email: string | null;
  cancelled_at:            string | null;
  cancel_reason:           string | null;
  fulfilled_at:            string | null;
  notes:                   string | null;
  subtotal_cents:          number;
  amount_paid_cents:       number;
  balance_cents:           number;
  item_count:              number;
  items:                   OrderItemRow[];
  created_at:              string;
  created_by_name:         string | null;
}

export interface CreateOrderInput {
  family_account_id: string;
  notes?:            string;
}

export interface AddOrderItemInput {
  order_id:         string;
  store_item_id?:   string;
  item_name:        string;
  size?:            string | null;
  quantity:         number;
  unit_price_cents: number;
  student_id?:      string | null;
}

export interface VoidOrderItemInput {
  order_item_id: string;
  reason?:       string;
}

export interface CreateStoreItemInput {
  name:             string;
  description?:     string;
  category:         ItemCategory;
  unit_price_cents: number;
  available_sizes?: string[] | null;
  sort_order?:      number;
}

export interface UpdateStoreItemInput {
  id:               string;
  name?:            string;
  description?:     string;
  category?:        ItemCategory;
  unit_price_cents?: number;
  available_sizes?: string[] | null;
  is_active?:       boolean;
  sort_order?:      number;
}

// ── Phase 2 types ─────────────────────────────────────────────────────────

export type PaymentMethod = "zelle" | "cash" | "check" | "other";
export type PaymentStatus = "pending" | "verified" | "reversed";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  zelle: "Zelle",
  cash:  "Cash",
  check: "Check",
  other: "Other",
};

export interface OrderPayment {
  id:               string;
  order_id:         string;
  organization_id:  string;
  amount_cents:     number;
  payment_method:   PaymentMethod;
  payment_date:     string;
  reference_number: string | null;
  notes:            string | null;
  status:           PaymentStatus;
  verified_by:      string | null;
  verified_at:      string | null;
  reversed_at:      string | null;
  reversal_reason:  string | null;
  created_by:       string;
  created_at:       string;
  created_by_name:  string | null;
  verified_by_name: string | null;
}

export interface FinanceSettings {
  organization_id:      string;
  zelle_enabled:        boolean;
  manual_payments_enabled: boolean;
  zelle_recipient:      string | null;
  zelle_type:           "phone" | "email";
  check_payee:          string | null;
  cash_instructions:    string | null;
  invoice_due_days:     number;
  invoice_footer_text:  string | null;
}

export interface IssueInvoiceInput {
  order_id:                string;
  billing_recipient_id:    string | null;
  billing_recipient_name:  string;
  billing_recipient_email: string;
  due_date_override?:      string;   // ISO date; defaults to invoice_due_days from settings
}

export interface RecordPaymentInput {
  order_id:         string;
  amount_cents:     number;
  payment_method:   PaymentMethod;
  payment_date:     string;          // ISO date
  reference_number?: string;
  notes?:           string;
  initial_status?:  "pending" | "verified";  // defaults to "pending"
}
