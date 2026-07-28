-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00033: Parent–Staff Messaging System
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Helper for family-id lookup ────────────────────────────────────────
-- Can be created early — only references guardianships and students (pre-existing).

create or replace function get_my_family_ids(org_id uuid)
returns setof uuid
language sql security definer stable
as $$
  select distinct s.family_id
  from   guardianships g
  join   students s on s.id = g.student_id
  where  g.profile_id       = auth.uid()
    and  g.status           = 'active'
    and  s.organization_id  = org_id
    and  s.family_id        is not null;
$$;

comment on function get_my_family_ids is
  'Family IDs where auth user has an active guardianship. SECURITY DEFINER for RLS use.';

-- ── 2. Tables ─────────────────────────────────────────────────────────────

create table if not exists conversations (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id) on delete cascade,
  family_id         uuid          not null references families(id) on delete cascade,
  student_id        uuid          references students(id) on delete set null,
  subject           text          not null,
  category          text          not null default 'general'
                                  check (category in (
                                    'general','attendance','academics','schedule',
                                    'transportation','billing','medical','technical','other'
                                  )),
  status            text          not null default 'open'
                                  check (status in ('open','resolved')),
  priority          text          not null default 'normal'
                                  check (priority in ('normal','high','urgent')),
  created_by        uuid          not null references profiles(id),
  assigned_to       uuid          references profiles(id),
  last_message_at   timestamptz   not null default now(),
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid          references profiles(id)
);

comment on column conversations.status   is 'open = active; resolved = staff closed the thread.';
comment on column conversations.priority is 'normal/high/urgent — set by staff.';

create index if not exists idx_conversations_org         on conversations(organization_id);
create index if not exists idx_conversations_family      on conversations(organization_id, family_id);
create index if not exists idx_conversations_student     on conversations(student_id) where student_id is not null;
create index if not exists idx_conversations_status      on conversations(organization_id, status);
create index if not exists idx_conversations_assigned    on conversations(assigned_to) where assigned_to is not null;
create index if not exists idx_conversations_last_msg    on conversations(organization_id, last_message_at desc);
create index if not exists idx_conversations_priority    on conversations(organization_id, priority) where priority != 'normal';

create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at_column();

create table if not exists conversation_participants (
  id                uuid          primary key default gen_random_uuid(),
  conversation_id   uuid          not null references conversations(id) on delete cascade,
  organization_id   uuid          not null references organizations(id) on delete cascade,
  profile_id        uuid          not null references profiles(id) on delete cascade,
  participant_type  text          not null check (participant_type in ('parent','staff')),
  last_read_at      timestamptz,
  muted_at          timestamptz,
  created_at        timestamptz   not null default now(),
  unique (conversation_id, profile_id)
);

comment on table conversation_participants is
  'Tracks who is in each conversation and when they last read it. '
  'organization_id denormalized for RLS performance.';

create index if not exists idx_conv_participants_conv    on conversation_participants(conversation_id);
create index if not exists idx_conv_participants_profile on conversation_participants(profile_id);
create index if not exists idx_conv_participants_unread  on conversation_participants(profile_id, last_read_at);

create table if not exists messages (
  id                uuid          primary key default gen_random_uuid(),
  conversation_id   uuid          not null references conversations(id) on delete cascade,
  organization_id   uuid          not null references organizations(id) on delete cascade,
  sender_id         uuid          not null references profiles(id),
  body              text          not null check (char_length(body) between 1 and 5000),
  message_type      text          not null default 'message'
                                  check (message_type in ('message','note','system')),
  parent_visible    boolean       not null default true,
  created_at        timestamptz   not null default now(),
  edited_at         timestamptz,
  deleted_at        timestamptz
);

comment on column messages.parent_visible is
  'When false this message is never returned to parents — enforced at the RLS layer.';
comment on column messages.message_type is
  'message = normal reply; note = internal staff-only note (parent_visible must be false); system = automated.';

create index if not exists idx_messages_conversation     on messages(conversation_id, created_at);
create index if not exists idx_messages_org              on messages(organization_id);
create index if not exists idx_messages_sender           on messages(sender_id);
create index if not exists idx_messages_unread           on messages(conversation_id, created_at) where deleted_at is null;

create table if not exists notifications (
  id                uuid          primary key default gen_random_uuid(),
  organization_id   uuid          not null references organizations(id) on delete cascade,
  recipient_id      uuid          not null references profiles(id) on delete cascade,
  sender_id         uuid          references profiles(id),
  type              text          not null,
  title             text          not null,
  body              text,
  resource_type     text,
  resource_id       uuid,
  read_at           timestamptz,
  created_at        timestamptz   not null default now()
);

comment on table notifications is
  'In-app only notifications for launch. body must not include sensitive content.';

create index if not exists idx_notifications_recipient   on notifications(recipient_id, read_at, created_at desc);
create index if not exists idx_notifications_resource    on notifications(resource_type, resource_id) where resource_id is not null;

-- ── 3. Helper that references conversation_participants (must be after table) ──

create or replace function is_conversation_participant(conv_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1
    from   conversation_participants cp
    where  cp.conversation_id = conv_id
      and  cp.profile_id      = auth.uid()
  );
$$;

comment on function is_conversation_participant is
  'True if auth user is a participant in the given conversation. '
  'SECURITY DEFINER prevents circular RLS evaluation.';

-- ── 4. RLS: conversations ─────────────────────────────────────────────────

alter table conversations enable row level security;

drop policy if exists "staff_select_conversations"   on conversations;
create policy "staff_select_conversations" on conversations for select
  using (is_staff_or_above(organization_id));

drop policy if exists "staff_insert_conversations"   on conversations;
create policy "staff_insert_conversations" on conversations for insert
  with check (
    is_staff_or_above(organization_id)
    and auth.uid() = created_by
  );

drop policy if exists "staff_update_conversations"   on conversations;
create policy "staff_update_conversations" on conversations for update
  using  (is_staff_or_above(organization_id))
  with check (is_staff_or_above(organization_id));

drop policy if exists "parent_select_conversations"  on conversations;
create policy "parent_select_conversations" on conversations for select
  using (
    is_org_member(conversations.organization_id)
    and conversations.family_id in (
      select distinct s.family_id
      from   guardianships g
      join   students s on s.id = g.student_id
      where  g.profile_id      = auth.uid()
        and  g.status          = 'active'
        and  s.organization_id = conversations.organization_id
        and  s.family_id       is not null
    )
    and exists (
      select 1 from conversation_participants cp
      where  cp.conversation_id = conversations.id
        and  cp.profile_id      = auth.uid()
    )
  );

drop policy if exists "parent_insert_conversations"  on conversations;
create policy "parent_insert_conversations" on conversations for insert
  with check (
    is_org_member(conversations.organization_id)
    and auth.uid() = conversations.created_by
    and conversations.family_id in (
      select distinct s.family_id
      from   guardianships g
      join   students s on s.id = g.student_id
      where  g.profile_id      = auth.uid()
        and  g.status          = 'active'
        and  s.organization_id = conversations.organization_id
        and  s.family_id       is not null
    )
  );

-- ── 5. RLS: conversation_participants ─────────────────────────────────────

alter table conversation_participants enable row level security;

drop policy if exists "staff_select_conv_participants"  on conversation_participants;
create policy "staff_select_conv_participants" on conversation_participants for select
  using (is_staff_or_above(organization_id));

drop policy if exists "staff_insert_conv_participants"  on conversation_participants;
create policy "staff_insert_conv_participants" on conversation_participants for insert
  with check (is_staff_or_above(organization_id));

drop policy if exists "staff_update_conv_participants"  on conversation_participants;
create policy "staff_update_conv_participants" on conversation_participants for update
  using  (is_staff_or_above(organization_id))
  with check (is_staff_or_above(organization_id));

drop policy if exists "parent_select_conv_participants" on conversation_participants;
create policy "parent_select_conv_participants" on conversation_participants for select
  using (
    profile_id = auth.uid()
    and is_org_member(organization_id)
  );

drop policy if exists "parent_insert_conv_participants" on conversation_participants;
create policy "parent_insert_conv_participants" on conversation_participants for insert
  with check (
    profile_id       = auth.uid()
    and participant_type = 'parent'
    and is_org_member(organization_id)
  );

drop policy if exists "parent_update_conv_participants" on conversation_participants;
create policy "parent_update_conv_participants" on conversation_participants for update
  using  (profile_id = auth.uid() and is_org_member(organization_id))
  with check (profile_id = auth.uid() and is_org_member(organization_id));

-- ── 6. RLS: messages ──────────────────────────────────────────────────────

alter table messages enable row level security;

drop policy if exists "staff_select_messages"   on messages;
create policy "staff_select_messages" on messages for select
  using (
    is_staff_or_above(organization_id)
    and deleted_at is null
  );

drop policy if exists "staff_insert_messages"   on messages;
create policy "staff_insert_messages" on messages for insert
  with check (
    is_staff_or_above(organization_id)
    and sender_id = auth.uid()
  );

-- Parents see only parent_visible=true messages in their own conversations
drop policy if exists "parent_select_messages"  on messages;
create policy "parent_select_messages" on messages for select
  using (
    messages.parent_visible = true
    and messages.deleted_at  is null
    and is_org_member(messages.organization_id)
    and exists (
      select 1 from conversation_participants cp
      where  cp.conversation_id = messages.conversation_id
        and  cp.profile_id      = auth.uid()
    )
  );

drop policy if exists "parent_insert_messages"  on messages;
create policy "parent_insert_messages" on messages for insert
  with check (
    parent_visible = true
    and sender_id  = auth.uid()
    and is_org_member(organization_id)
    and exists (
      select 1 from conversation_participants cp
      where  cp.conversation_id = messages.conversation_id
        and  cp.profile_id      = auth.uid()
    )
  );

-- ── 7. RLS: notifications ─────────────────────────────────────────────────

alter table notifications enable row level security;

drop policy if exists "recipient_select_notifications"  on notifications;
create policy "recipient_select_notifications" on notifications for select
  using (recipient_id = auth.uid());

drop policy if exists "org_member_insert_notifications" on notifications;
create policy "org_member_insert_notifications" on notifications for insert
  with check (is_org_member(organization_id));

drop policy if exists "recipient_update_notifications"  on notifications;
create policy "recipient_update_notifications" on notifications for update
  using  (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
