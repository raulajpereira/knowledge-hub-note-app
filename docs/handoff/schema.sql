-- KnowledgeHub — esquema inicial PostgreSQL 16 (ponto de partida; gerar migrações com Drizzle)
create extension if not exists citext;
create extension if not exists pgcrypto;

-- ===== Licenciamento =====
create table plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,               -- FREE, PRO, DEVELOPER, SAP, MANAGEMENT, ULTRA, CUSTOM
  price_month_per_user numeric(10,2) not null default 0,
  annual_discount_pct int not null default 0,
  trial_enabled boolean not null default false,
  trial_days int not null default 30,
  is_popular boolean not null default false,
  color text, sort int default 0
);
create table modules (
  id text primary key,                     -- notes, tasks, passwords, mg_alloc, codelib, brand, ...
  grp text not null,                       -- base, pro, mgmt, dev, sap, feat, custom
  label_pt text not null, label_en text not null,
  addon_price_month numeric(10,2)
);
create table plan_modules (plan_id uuid references plans on delete cascade, module_id text references modules, primary key (plan_id, module_id));
create table plan_limits (plan_id uuid references plans on delete cascade, resource text, max int not null, primary key (plan_id, resource));

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('pack','individual')),
  status text not null default 'trial' check (status in ('trial','active','past_due','suspended','canceled')),
  plan_id uuid references plans,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','annual')),
  seats int not null default 1,
  renew_at timestamptz, trial_ends_at timestamptz,
  sales_notes text,                        -- vendas geridas fora da app
  deleted_at timestamptz,                  -- revogação: purge após 30 dias
  created_at timestamptz not null default now()
);
create table tenant_modules (tenant_id uuid references tenants on delete cascade, module_id text references modules, primary key (tenant_id, module_id));

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  name text not null,
  email citext unique not null,
  password_hash text not null,
  email_verified_at timestamptz,
  role_in_tenant text not null default 'member' check (role_in_tenant in ('admin','member')),
  status text not null default 'active' check (status in ('active','invited','paused','disabled')),
  photo_key text, totp_secret_enc bytea,
  registered_with_code_id uuid,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create table sessions (id uuid primary key default gen_random_uuid(), user_id uuid references users on delete cascade, created_at timestamptz default now(), expires_at timestamptz not null, ip inet, user_agent text, revoked_at timestamptz);
create table auth_tokens (token_hash bytea primary key, user_id uuid references users on delete cascade, purpose text not null, expires_at timestamptz not null, used_at timestamptz);

create table codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^KH-(INV|LIC)-[0-9]{6}$'),
  type text not null check (type in ('invite','license')),
  tenant_id uuid references tenants on delete cascade,
  plan_id uuid references plans,
  max_uses int not null default 1, uses int not null default 0,
  expires_at timestamptz,                  -- null = vitalício
  status text not null default 'active' check (status in ('active','paused','revoked','expired')),
  revoked_at timestamptz,
  created_by uuid references users, created_at timestamptz default now()
);
alter table users add constraint users_code_fk foreign key (registered_with_code_id) references codes;
create table code_redemptions (code_id uuid references codes, user_id uuid references users, redeemed_at timestamptz default now(), primary key (code_id, user_id));

create table admins (user_id uuid primary key references users on delete cascade, role text not null check (role in ('owner','admin','billing','support','readonly')), status text not null default 'active');
create table audit_log (id bigserial primary key, at timestamptz not null default now(), actor_user_id uuid, actor_kind text not null default 'user', action text not null, target_type text, target_id text, details jsonb, ip inet);
create table support_tickets (id uuid primary key default gen_random_uuid(), tenant_id uuid references tenants, user_id uuid references users, title text, priority text, status text default 'open', created_at timestamptz default now());
create table custom_plan_requests (id uuid primary key default gen_random_uuid(), tenant_id uuid references tenants, user_id uuid references users, modules text[], seats int, cycle text, notes text, status text default 'new', created_at timestamptz default now());

-- ===== Preferências =====
create table user_prefs (user_id uuid primary key references users on delete cascade, data jsonb not null default '{}', updated_at timestamptz default now());

-- ===== Conteúdo (todas com tenant_id + RLS) =====
create table folders (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null references users, kind text not null, name text not null, color text, parent_id uuid references folders, sort int default 0);
create table notes (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null references users, folder_id uuid references folders, shared_folder_id uuid, title text, content jsonb, content_text tsvector, tags text[] default '{}', favorite boolean default false, meta jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz);
create index notes_fts on notes using gin (content_text);
create table tasks (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null references users, folder_id uuid, shared_folder_id uuid, title text not null, type text not null default 'tech', priority text default 'medium', due_at timestamptz, repeat text default 'none', project_id uuid, notes text, pinned boolean default false, done_at timestamptz, created_at timestamptz default now(), deleted_at timestamptz);
create table task_subtasks (id uuid primary key default gen_random_uuid(), task_id uuid references tasks on delete cascade, title text, done boolean default false, sort int);
create table calendar_events (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null, title text, start_at timestamptz, end_at timestamptz, all_day boolean, color text, notes text, linked_type text, linked_id uuid);
create table voice_notes (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null, title text, audio_key text, duration_s int, transcript text, created_at timestamptz default now());
create table vault_keys (user_id uuid primary key references users on delete cascade, kdf jsonb not null, verifier text not null, dek_wrapped_mp jsonb not null, dek_wrapped_rk jsonb, rk_fingerprint text, rk_created_at timestamptz);
create table vault_items (id uuid primary key default gen_random_uuid(), owner_id uuid not null references users on delete cascade, folder_id uuid, ciphertext bytea not null, iv bytea not null, version int default 1, updated_at timestamptz default now());
create table emails (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null, folder_id uuid, subject text, from_name text, from_email text, to_list text, cc_list text, sent_at timestamptz, body_text text, body_html_key text, file_key text, starred boolean, pinned boolean, notes text, imported_at timestamptz default now());
create table email_attachments (id uuid primary key default gen_random_uuid(), email_id uuid references emails on delete cascade, name text, mime text, storage_key text);
create table issues (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, project_id uuid, title text, status text, priority text, owner_id uuid, due_at timestamptz, description text, created_at timestamptz default now());
create table artifacts (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null, folder_id uuid, shared_folder_id uuid, title text, description text, tags text[], pinned boolean, current_html text, created_at timestamptz default now(), updated_at timestamptz default now());
create table artifact_versions (id uuid primary key default gen_random_uuid(), artifact_id uuid references artifacts on delete cascade, html text, created_at timestamptz default now());
create table snippets (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null, title text, type text, tags text[], description text, favorite boolean, created_at timestamptz default now(), updated_at timestamptz default now());
create table snippet_files (id uuid primary key default gen_random_uuid(), snippet_id uuid references snippets on delete cascade, name text, language text, code text, sort int);
create table snippet_links (a_id uuid references snippets on delete cascade, b_id uuid references snippets on delete cascade, primary key (a_id, b_id));
create table api_requests (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null, folder_id uuid, name text, method text, url text, headers jsonb, params jsonb, body text, auth_enc bytea);
create table whiteboards (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null, name text, doc jsonb, thumbnail_key text, updated_at timestamptz default now());

-- ===== SAP =====
create table sap_objects (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, type text not null, name text not null, package text, description text, source text, fields jsonb, params jsonb, components jsonb, unique (tenant_id, type, name));
create table sap_systems (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid, sid text, client_no text, sys_type text, host text, instance text, saprouter text, msg_server text, logon_group text, description text);
create table sap_tcodes (code text primary key, description_pt text, description_en text, module text, program text);
create table tcode_usage (user_id uuid references users on delete cascade, code text, count int default 0, last_used timestamptz, primary key (user_id, code));
create table transports (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, tr_number text, description text, tr_type text, owner text, system_id uuid references sap_systems, project_id uuid, status text, stage text, objects jsonb, released_at timestamptz);
create table fn_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, page text not null check (page in ('proc','test','mig','cut')), title text, code text, status text, fields jsonb, rows jsonb, client_id uuid, project_id uuid, created_at timestamptz default now(), updated_at timestamptz default now());

-- ===== Management =====
create table mg_clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, kind text, sector text, contact text, email text);
create table mg_teams (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, lead_person_id uuid, color text, target_pct int default 90, description text, areas text[]);
create table mg_people (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid references users, team_id uuid references mg_teams, name text, email text, role text, area text, level int, cost_rate numeric, sell_rate numeric, capacity_h int default 40, location text, since date);
create table mg_skills (person_id uuid references mg_people on delete cascade, skill text, level int, primary key (person_id, skill));
create table mg_projects (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid references mg_clients, code text, name text, status text, budget numeric, start_date date, end_date date, manager_id uuid, color text);
create table mg_phases (id uuid primary key default gen_random_uuid(), project_id uuid references mg_projects on delete cascade, name text, start_date date, end_date date);
create table mg_allocations (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, person_id uuid references mg_people on delete cascade, project_id uuid references mg_projects on delete cascade, start_date date, end_date date, hours_per_week numeric, week_overrides jsonb default '{}', day_overrides jsonb default '{}');
create table mg_staff_requests (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, project_id uuid, skills jsonb, level_min int, hours_week numeric, start_date date, end_date date, max_rate numeric, status text default 'open', filled_by uuid);
create table mg_timesheets (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, person_id uuid references mg_people on delete cascade, week_start date, status text default 'draft', rows jsonb, unique (person_id, week_start));

-- ===== Partilha / notícias =====
create table public_links (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, item_type text, item_id uuid, token text unique not null, password_hash text, expires_at timestamptz, views int default 0, created_by uuid, revoked_at timestamptz, created_at timestamptz default now());
create table shared_folders (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_id uuid not null, kind text not null, name text, source_folder_id uuid references folders, paused boolean default false);
create table share_members (folder_id uuid references shared_folders on delete cascade, user_id uuid references users, email citext, permission text default 'read', status text default 'invited', invited_at timestamptz default now(), primary key (folder_id, email));
create table news_sources (id uuid primary key default gen_random_uuid(), owner_id uuid, scope text check (scope in ('sap','footer')), name text, url text, enabled boolean default true);
create table news_items (id uuid primary key default gen_random_uuid(), source_id uuid references news_sources on delete cascade, guid text, title text, link text, image text, excerpt text, html text, published_at timestamptz, unique (source_id, guid));
create table news_saved (user_id uuid references users on delete cascade, news_item_id uuid references news_items on delete cascade, saved_at timestamptz default now(), primary key (user_id, news_item_id));

-- ===== RLS (exemplo; repetir para cada tabela de conteúdo) =====
alter table notes enable row level security;
create policy notes_tenant on notes using (
  tenant_id = current_setting('app.tenant_id')::uuid and (
    owner_id = current_setting('app.user_id')::uuid
    or shared_folder_id in (select folder_id from share_members m join shared_folders f on f.id = m.folder_id
                            where m.user_id = current_setting('app.user_id')::uuid and m.status = 'active' and not f.paused)
  )
);
