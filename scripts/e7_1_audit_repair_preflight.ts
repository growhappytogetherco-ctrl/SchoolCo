import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const vars: Record<string, string> = {};
for (const line of env.split('\n')) {
  const m = line.match(/^([^=#][^=]*)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const ORG_ID = '9fd43346-f43b-41d1-9b4c-fe8702471b07';

async function main() {
  const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

  // Find admin members
  const { data: members, error } = await (supabase as any)
    .from('organization_members')
    .select('profile_id, role, profiles(id, email, full_name)')
    .eq('organization_id', ORG_ID)
    .eq('status', 'active')
    .in('role', ['admin', 'full_admin', 'platform_admin', 'registrar']);

  if (error) { console.error('members error:', error.message); process.exit(1); }
  console.log('=== Admin/registrar members ===');
  for (const m of (members as any[])) {
    const p = (m as any).profiles;
    console.log(`  ${m.role}: ${p?.full_name} <${p?.email}> — profile_id: ${m.profile_id}`);
  }

  // Check recent audit_logs for this org
  const { data: recentAudit, error: auditErr } = await (supabase as any)
    .from('audit_logs')
    .select('id, actor_id, action, resource_type, resource_id, created_at')
    .eq('organization_id', ORG_ID)
    .order('created_at', { ascending: false })
    .limit(15);

  if (auditErr) { console.log('audit query error:', auditErr.message); }
  else {
    console.log('\n=== Recent audit_logs for RLA ===');
    for (const a of (recentAudit as any[])) {
      console.log(`  ${a.created_at} | ${a.action} | ${a.resource_type} ${a.resource_id?.substring(0,8)} | actor: ${a.actor_id?.substring(0,8)}`);
    }
  }

  // Check for any enrollment_credit_updated events near the correction time
  const { data: creditAudit } = await (supabase as any)
    .from('audit_logs')
    .select('id, actor_id, action, resource_id, created_at, metadata, new_values')
    .eq('organization_id', ORG_ID)
    .eq('action', 'enrollment_credit_updated')
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('\n=== enrollment_credit_updated audit events ===');
  if (!creditAudit?.length) {
    console.log('  NONE FOUND — confirms 9 events are missing');
  } else {
    for (const a of (creditAudit as any[])) {
      console.log(`  ${a.created_at} | enr: ${a.resource_id?.substring(0,8)} | actor: ${a.actor_id?.substring(0,8)}`);
    }
  }
}

main().catch(console.error);
