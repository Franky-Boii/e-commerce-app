-- ============================================================
-- E-commerce app — initial schema
-- Target: Supabase Postgres
-- Run via: supabase migration new init  (paste this in), then
--          supabase db push  (or supabase migration up locally)
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------- Enums ----------
create type user_role as enum ('customer', 'admin');
create type product_status as enum ('active', 'inactive', 'archived');
create type order_status as enum (
  'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
);
create type payment_status as enum ('pending', 'paid', 'failed', 'cancelled');

-- ============================================================
-- PROFILES (extends auth.users — Supabase's built-in auth table)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up
create function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- CATEGORIES
-- ============================================================
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references categories(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PRODUCTS
-- ============================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'ZAR',
  category_id uuid references categories(id) on delete set null,
  status product_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_category on products(category_id);
create index idx_products_status on products(status);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  alt_text text,
  sort_order int not null default 0
);
create index idx_product_images_product on product_images(product_id);

-- ============================================================
-- INVENTORY (separate from products so stock changes are auditable)
-- ============================================================
create table inventory (
  product_id uuid primary key references products(id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ADDRESSES
-- ============================================================
create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  line1 text not null,
  line2 text,
  city text not null,
  province text,
  postal_code text not null,
  country text not null default 'South Africa',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_addresses_user on addresses(user_id);

-- ============================================================
-- CARTS (one persistent cart per user)
-- ============================================================
create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, product_id)
);
create index idx_cart_items_cart on cart_items(cart_id);

-- ============================================================
-- ORDERS
-- ============================================================
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  status order_status not null default 'pending_payment',
  subtotal numeric(12,2) not null,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  currency text not null default 'ZAR',
  shipping_address_id uuid references addresses(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_orders_user on orders(user_id);
create index idx_orders_status on orders(status);

-- order_items snapshot product info at time of purchase — never
-- depend on live product/price data for historical orders.
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  sku text not null,
  unit_price numeric(12,2) not null,
  quantity int not null check (quantity > 0),
  line_total numeric(12,2) not null
);
create index idx_order_items_order on order_items(order_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null default 'payfast',
  provider_reference text,
  amount numeric(12,2) not null,
  currency text not null default 'ZAR',
  status payment_status not null default 'pending',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_payments_order on payments(order_id);
create unique index idx_payments_provider_ref on payments(provider, provider_reference)
  where provider_reference is not null;

-- ============================================================
-- WEBHOOK EVENTS (idempotency for PayFast ITN callbacks)
-- ============================================================
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'payfast',
  event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table inventory enable row level security;
alter table addresses enable row level security;
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table webhook_events enable row level security;

-- Helper: is the current user an admin?
create function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- profiles
create policy "read own profile" on profiles for select using (id = auth.uid());
create policy "admin reads all profiles" on profiles for select using (is_admin());
create policy "update own profile" on profiles for update using (id = auth.uid());
create policy "admin updates any profile" on profiles for update using (is_admin());

-- categories / products / product_images — public read, admin write
create policy "public read categories" on categories for select using (true);
create policy "admin writes categories" on categories for all using (is_admin()) with check (is_admin());

create policy "public read active products" on products for select using (status = 'active' or is_admin());
create policy "admin writes products" on products for all using (is_admin()) with check (is_admin());

create policy "public read product images" on product_images for select using (true);
create policy "admin writes product images" on product_images for all using (is_admin()) with check (is_admin());

-- inventory — public can read stock levels, only admin/service role writes
create policy "public read inventory" on inventory for select using (true);
create policy "admin writes inventory" on inventory for all using (is_admin()) with check (is_admin());

-- addresses — owner only
create policy "manage own addresses" on addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- carts / cart_items — owner only
create policy "manage own cart" on carts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "manage own cart items" on cart_items for all
  using (cart_id in (select id from carts where user_id = auth.uid()))
  with check (cart_id in (select id from carts where user_id = auth.uid()));

-- orders — users read their own; INSERT/UPDATE reserved for the
-- service role (an Edge Function), so totals/stock can never be
-- set directly by the client. Admin can read + update all.
create policy "read own orders" on orders for select using (user_id = auth.uid());
create policy "admin reads all orders" on orders for select using (is_admin());
create policy "admin updates orders" on orders for update using (is_admin());

create policy "read own order items" on order_items for select
  using (order_id in (select id from orders where user_id = auth.uid()));
create policy "admin reads all order items" on order_items for select using (is_admin());

-- payments — users can read their own payment rows; writes are
-- service-role only (webhook handler)
create policy "read own payments" on payments for select
  using (order_id in (select id from orders where user_id = auth.uid()));
create policy "admin reads all payments" on payments for select using (is_admin());

-- webhook_events — service role only (no policies = no client access)