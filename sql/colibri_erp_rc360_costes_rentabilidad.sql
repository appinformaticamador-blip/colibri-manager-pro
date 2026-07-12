-- COLIBRÍ ERP PRO · RC 3.6.0 · Costes y Rentabilidad
create extension if not exists pgcrypto;

create table if not exists public.purchase_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tax_id text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.purchase_suppliers(id) on delete restrict,
  invoice_number text,
  invoice_date date not null default current_date,
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  file_path text,
  file_name text,
  file_type text,
  source text not null default 'manual',
  status text not null default 'pending_review' check (status in ('pending_review','reviewed','rejected')),
  extraction_payload jsonb,
  notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(supplier_id,invoice_number,invoice_date)
);

create table if not exists public.purchase_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices(id) on delete cascade,
  product_name text not null,
  supplier_sku text,
  article_code text,
  quantity numeric(14,3) not null default 1,
  pack_units numeric(14,3) not null default 1,
  unit text not null default 'ud',
  net_total numeric(14,4) not null default 0,
  tax_rate numeric(6,2) not null default 10,
  unit_cost numeric(14,6) not null default 0,
  sale_price numeric(14,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_purchase_invoices_date on public.purchase_invoices(invoice_date desc);
create index if not exists idx_purchase_invoices_supplier on public.purchase_invoices(supplier_id);
create index if not exists idx_purchase_items_invoice on public.purchase_invoice_items(invoice_id);
create index if not exists idx_purchase_items_article on public.purchase_invoice_items(article_code);
create index if not exists idx_purchase_items_product on public.purchase_invoice_items(lower(product_name));

alter table public.purchase_suppliers enable row level security;
alter table public.purchase_invoices enable row level security;
alter table public.purchase_invoice_items enable row level security;

drop policy if exists purchase_suppliers_anon_all on public.purchase_suppliers;
create policy purchase_suppliers_anon_all on public.purchase_suppliers for all to anon using (true) with check (true);
drop policy if exists purchase_invoices_anon_all on public.purchase_invoices;
create policy purchase_invoices_anon_all on public.purchase_invoices for all to anon using (true) with check (true);
drop policy if exists purchase_items_anon_all on public.purchase_invoice_items;
create policy purchase_items_anon_all on public.purchase_invoice_items for all to anon using (true) with check (true);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('purchase-invoices','purchase-invoices',false,15728640,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists purchase_invoice_files_anon_select on storage.objects;
create policy purchase_invoice_files_anon_select on storage.objects for select to anon using (bucket_id='purchase-invoices');
drop policy if exists purchase_invoice_files_anon_insert on storage.objects;
create policy purchase_invoice_files_anon_insert on storage.objects for insert to anon with check (bucket_id='purchase-invoices');
drop policy if exists purchase_invoice_files_anon_update on storage.objects;
create policy purchase_invoice_files_anon_update on storage.objects for update to anon using (bucket_id='purchase-invoices') with check (bucket_id='purchase-invoices');
drop policy if exists purchase_invoice_files_anon_delete on storage.objects;
create policy purchase_invoice_files_anon_delete on storage.objects for delete to anon using (bucket_id='purchase-invoices');
