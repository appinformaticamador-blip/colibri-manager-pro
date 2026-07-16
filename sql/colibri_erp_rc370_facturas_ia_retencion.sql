-- COLIBRÍ ERP PRO · RC 3.7.0
-- Procesamiento IA de facturas + clasificación + retención de archivos 4 meses
create extension if not exists pgcrypto;

alter table public.purchase_invoices alter column supplier_id drop not null;
alter table public.purchase_invoices drop constraint if exists purchase_invoices_status_check;
alter table public.purchase_invoices add constraint purchase_invoices_status_check
  check (status in ('queued','processing','awaiting_review','reviewed','failed','rejected','pending_review'));

alter table public.purchase_invoices add column if not exists detected_supplier_name text;
alter table public.purchase_invoices add column if not exists detected_supplier_tax_id text;
alter table public.purchase_invoices add column if not exists processing_progress integer not null default 0 check (processing_progress between 0 and 100);
alter table public.purchase_invoices add column if not exists processing_step text;
alter table public.purchase_invoices add column if not exists processing_error text;
alter table public.purchase_invoices add column if not exists processing_started_at timestamptz;
alter table public.purchase_invoices add column if not exists processing_finished_at timestamptz;
alter table public.purchase_invoices add column if not exists retention_delete_at timestamptz;
alter table public.purchase_invoices add column if not exists file_deleted_at timestamptz;
alter table public.purchase_invoices add column if not exists extraction_version text;

update public.purchase_invoices
set retention_delete_at=coalesce(retention_delete_at,created_at + interval '4 months')
where file_path is not null;

alter table public.purchase_invoice_items add column if not exists category text;
alter table public.purchase_invoice_items add column if not exists sub_category text;
alter table public.purchase_invoice_items add column if not exists review_status text not null default 'pending' check (review_status in ('pending','confirmed','ignored'));
alter table public.purchase_invoice_items add column if not exists source text not null default 'manual' check (source in ('manual','ai'));
alter table public.purchase_invoice_items add column if not exists confidence numeric(5,4);
alter table public.purchase_invoice_items add column if not exists raw_description text;
alter table public.purchase_invoice_items add column if not exists master_item_id uuid;

create table if not exists public.purchase_master_items (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 normalized_name text not null unique,
 category text not null,
 sub_category text,
 base_unit text not null default 'ud',
 numier_article_code text,
 usage_type text not null default 'purchase' check (usage_type in ('purchase','recipe','sale','consumable','asset','expense')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.purchase_item_aliases (
 id uuid primary key default gen_random_uuid(),
 master_item_id uuid not null references public.purchase_master_items(id) on delete cascade,
 supplier_id uuid references public.purchase_suppliers(id) on delete cascade,
 alias text not null,
 normalized_alias text not null,
 created_at timestamptz not null default now(),
 unique(supplier_id,normalized_alias)
);

alter table public.purchase_invoice_items
 drop constraint if exists purchase_invoice_items_master_item_id_fkey;
alter table public.purchase_invoice_items
 add constraint purchase_invoice_items_master_item_id_fkey foreign key(master_item_id) references public.purchase_master_items(id) on delete set null;

create index if not exists idx_purchase_invoice_processing on public.purchase_invoices(status,created_at);
create index if not exists idx_purchase_invoice_retention on public.purchase_invoices(retention_delete_at) where file_path is not null;
create index if not exists idx_purchase_items_review on public.purchase_invoice_items(invoice_id,review_status);

alter table public.purchase_master_items enable row level security;
alter table public.purchase_item_aliases enable row level security;
drop policy if exists purchase_master_items_anon_all on public.purchase_master_items;
create policy purchase_master_items_anon_all on public.purchase_master_items for all to anon using (true) with check (true);
drop policy if exists purchase_item_aliases_anon_all on public.purchase_item_aliases;
create policy purchase_item_aliases_anon_all on public.purchase_item_aliases for all to anon using (true) with check (true);
