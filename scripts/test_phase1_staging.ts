/**
 * Phase 1 Staging Functional Tests
 *
 * Tests the 9 critical workflows for Orders & Invoices Phase 1.
 * Requires STAGING_SUPABASE_URL and STAGING_SERVICE_ROLE_KEY in .env.staging
 * Run: npx ts-node -r dotenv/config scripts/test_phase1_staging.ts dotenv_config_path=.env.staging
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.staging") });

const STAGING_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!STAGING_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.staging");
  process.exit(1);
}

const sb = createClient(STAGING_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let passed = 0;
let failed = 0;

function ok(label: string, val: boolean, detail?: string) {
  if (val) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function getOrg() {
  const { data } = await sb.from("organizations").select("id, short_name").limit(1).single();
  return data;
}

async function getStaffProfile(orgId: string) {
  const { data } = await sb
    .from("organization_members")
    .select("profile_id, profiles(full_name, email)")
    .eq("organization_id", orgId)
    .in("role", ["staff", "admin", "full_admin"])
    .eq("status", "active")
    .limit(1)
    .single();
  return data;
}

async function getFamily(orgId: string) {
  const { data } = await sb
    .from("family_finance_accounts")
    .select("id, account_name, profile_id")
    .eq("organization_id", orgId)
    .limit(1)
    .single();
  return data;
}

async function cleanup(orgId: string, itemIds: string[], orderIds: string[]) {
  if (orderIds.length) {
    await sb.from("order_items").delete().in("order_id", orderIds);
    await sb.from("orders").delete().in("id", orderIds);
  }
  if (itemIds.length) {
    await sb.from("store_items").delete().in("id", itemIds);
  }
  // Reset invoice sequence
  await sb.from("invoice_sequences").delete().eq("organization_id", orgId);
}

async function main() {
  console.log("=== Phase 1 Orders & Invoices — Staging Functional Tests ===\n");

  const org = await getOrg();
  if (!org) { console.error("No organization found in staging."); process.exit(1); }
  console.log(`Org: ${org.id} (short_name: ${org.short_name ?? "null"})\n`);

  const staff = await getStaffProfile(org.id);
  if (!staff) { console.error("No staff member found in staging."); process.exit(1); }
  const staffId = staff.profile_id as string;

  const family = await getFamily(org.id);
  if (!family) { console.error("No family_finance_account found in staging."); process.exit(1); }

  const createdItemIds: string[] = [];
  const createdOrderIds: string[] = [];

  // ── Test 1: Create catalog item ──────────────────────────────────────────
  console.log("Test 1: Create catalog item");
  const { data: item1, error: e1 } = await sb
    .from("store_items")
    .insert({
      organization_id: org.id,
      name: "Test Spirit Shirt",
      category: "shirt",
      unit_price_cents: 2500,
      available_sizes: ["XS", "S", "M", "L", "XL"],
      is_active: true,
      created_by: staffId,
    })
    .select()
    .single();
  ok("Insert store_items row", !e1 && !!item1, e1?.message);
  ok("Price stored as integer cents", item1?.unit_price_cents === 2500);
  ok("available_sizes stored as array", Array.isArray(item1?.available_sizes));
  if (item1) createdItemIds.push(item1.id);

  // ── Test 2: Family search by student name ────────────────────────────────
  console.log("\nTest 2: Family account lookup");
  const { data: accounts, error: e2 } = await sb
    .from("family_finance_accounts")
    .select("id, account_name, profile_id")
    .eq("organization_id", org.id)
    .limit(5);
  ok("family_finance_accounts readable", !e2 && Array.isArray(accounts), e2?.message);
  ok("At least one family account exists", (accounts?.length ?? 0) > 0);

  // ── Test 3: Create draft order ───────────────────────────────────────────
  console.log("\nTest 3: Create draft order");
  const { data: order1, error: e3 } = await sb
    .from("orders")
    .insert({
      organization_id: org.id,
      family_account_id: family.id,
      order_status: "draft",
      fulfillment_status: "pending",
      created_by: staffId,
      updated_by: staffId,
    })
    .select()
    .single();
  ok("Insert order row", !e3 && !!order1, e3?.message);
  ok("order_status is 'draft'", order1?.order_status === "draft");
  if (order1) createdOrderIds.push(order1.id);

  // ── Test 4: Add items to order ────────────────────────────────────────────
  console.log("\nTest 4: Add items to draft order");
  if (item1 && order1) {
    const { data: oi1, error: e4a } = await sb
      .from("order_items")
      .insert({
        order_id: order1.id,
        organization_id: org.id,
        store_item_id: item1.id,
        item_name: item1.name,
        unit_price_cents: item1.unit_price_cents,
        quantity: 2,
        size: "M",
        created_by: staffId,
        updated_by: staffId,
      })
      .select()
      .single();
    ok("Insert order_item", !e4a && !!oi1, e4a?.message);
    ok("line_total_cents computed (2 × 2500 = 5000)", oi1?.line_total_cents === 5000);
    ok("Price snapshot stored on item", oi1?.unit_price_cents === 2500);

    // Add second item with different size
    const { data: oi2, error: e4b } = await sb
      .from("order_items")
      .insert({
        order_id: order1.id,
        organization_id: org.id,
        store_item_id: item1.id,
        item_name: item1.name,
        unit_price_cents: item1.unit_price_cents,
        quantity: 1,
        size: "L",
        created_by: staffId,
        updated_by: staffId,
      })
      .select()
      .single();
    ok("Insert second order_item (different size)", !e4b && !!oi2, e4b?.message);

    // ── Test 5: Verify subtotal function ──────────────────────────────────
    console.log("\nTest 5: Verify order subtotal");
    const { data: subtotal, error: e5 } = await sb.rpc("get_order_subtotal", { p_order_id: order1.id });
    ok("get_order_subtotal() accessible", !e5, e5?.message);
    ok("Subtotal = 2×2500 + 1×2500 = 7500", subtotal === 7500, `got ${subtotal}`);

    // ── Test 6: Save and reopen draft ─────────────────────────────────────
    console.log("\nTest 6: Reopen draft order");
    const { data: reopened, error: e6 } = await sb
      .from("orders")
      .select("id, order_status, order_items(id, item_name, quantity, size)")
      .eq("id", order1.id)
      .single();
    ok("Reopen draft order by id", !e6 && !!reopened, e6?.message);
    ok("Draft status persisted", reopened?.order_status === "draft");
    ok("Line items visible on reopen", (reopened?.order_items as any[])?.length === 2);

    // ── Test 7: Edit draft item (quantity/size) ───────────────────────────
    console.log("\nTest 7: Edit draft order item");
    if (oi1) {
      const { error: e7 } = await sb
        .from("order_items")
        .update({ quantity: 3, size: "XL", updated_by: staffId })
        .eq("id", oi1.id)
        .eq("is_voided", false);
      ok("Update qty/size on draft item", !e7, e7?.message);

      const { data: updated } = await sb.from("order_items").select("quantity, size, line_total_cents").eq("id", oi1.id).single();
      ok("Quantity updated to 3", updated?.quantity === 3);
      ok("Size updated to XL", updated?.size === "XL");
      ok("line_total_cents recalculated (3×2500=7500)", updated?.line_total_cents === 7500);
    }
  }

  // ── Test 8: Invoice number format ─────────────────────────────────────────
  console.log("\nTest 8: Invoice number format");
  const { data: invNum, error: e8 } = await sb.rpc("generate_invoice_number", { p_org_id: org.id });
  ok("generate_invoice_number() accessible", !e8, e8?.message);
  const expectedPrefix = (org.short_name?.toUpperCase() ?? "SCH");
  ok(`Invoice prefix is org short_name (${expectedPrefix})`, (invNum as string)?.startsWith(expectedPrefix), `got ${invNum}`);
  ok("Invoice number ends with -YYYY-NNNN format", /^[A-Z]+-\d{4}-\d{4}$/.test(invNum as string ?? ""), `got ${invNum}`);
  // Year should be ≥ 2026 (current year or school year end)
  const yearMatch = (invNum as string ?? "").match(/-(\d{4})-/);
  ok("Invoice year is current or future school year", parseInt(yearMatch?.[1] ?? "0") >= 2026, `got ${invNum}`);
  console.log(`  Invoice sample: ${invNum}`);
  // Cleanup test sequence so production won't see it
  await sb.from("invoice_sequences").delete().eq("organization_id", org.id);

  // ── Test 9: Tuition records unchanged ─────────────────────────────────────
  console.log("\nTest 9: Tuition isolation check");
  const { data: charges } = await sb
    .from("student_charges")
    .select("id")
    .eq("organization_id", org.id)
    .limit(1);
  // Just verify orders don't touch student_charges — check no order-tagged rows exist
  const { data: orderCharges } = await sb
    .from("student_charges")
    .select("id")
    .eq("organization_id", org.id)
    .eq("charge_type", "order_item")
    .limit(1);
  ok("No student_charges rows with charge_type='order_item'", (orderCharges?.length ?? 0) === 0,
    "Orders must not create student_charge rows");

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\nCleaning up test data...");
  await cleanup(org.id, createdItemIds, createdOrderIds);
  console.log("  Cleanup complete.\n");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
