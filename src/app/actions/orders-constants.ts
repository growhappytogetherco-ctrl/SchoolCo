// Shared types for Orders & Invoices — safe to import in client components.
// Server actions import from orders.ts directly.

export type ItemCategory = "shirt" | "polo" | "uniform" | "field_trip" | "supplies" | "fee" | "other";

export type OrderStatus = "draft" | "invoiced" | "partial" | "paid" | "cancelled";

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
  id:                string;
  organization_id:   string;
  family_account_id: string;
  family_name:       string;         // joined from family_finance_accounts
  guardian_email:    string | null;  // joined from profiles
  order_status:      OrderStatus;
  fulfillment_status: FulfillmentStatus;
  invoice_number:    string | null;
  invoice_date:      string | null;
  due_date:          string | null;
  invoice_sent_at:   string | null;
  invoice_sent_to:   string | null;
  cancelled_at:      string | null;
  cancel_reason:     string | null;
  fulfilled_at:      string | null;
  notes:             string | null;
  subtotal_cents:    number;         // computed: sum of non-voided line_total_cents
  amount_paid_cents: number;         // Phase 2: sum of order_payments; 0 in Phase 1
  balance_cents:     number;         // subtotal - amount_paid
  item_count:        number;         // non-voided item rows
  items:             OrderItemRow[];
  created_at:        string;
  created_by_name:   string | null;
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
