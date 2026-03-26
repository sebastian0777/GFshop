-- PostgreSQL schema base para GF Shop

create table if not exists suppliers (
  id bigserial primary key,
  name varchar(120) not null,
  contact_email varchar(120),
  api_base_url text,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id bigserial primary key,
  supplier_id bigint references suppliers(id),
  sku varchar(80) not null unique,
  name varchar(180) not null,
  category varchar(80),
  description text,
  image_url text,
  cost_price numeric(12,2) not null,
  sale_price numeric(12,2) not null,
  stock integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id bigserial primary key,
  full_name varchar(140) not null,
  email varchar(140) not null,
  phone varchar(40),
  address_line1 varchar(200) not null,
  city varchar(80) not null,
  state_region varchar(80),
  country varchar(80) not null,
  postal_code varchar(20),
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id bigserial primary key,
  customer_id bigint not null references customers(id),
  status varchar(40) not null default 'pending',
  payment_status varchar(40) not null default 'unpaid',
  subtotal numeric(12,2) not null,
  shipping_cost numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  provider_order_ref varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_id bigint not null references products(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  total_price numeric(12,2) not null
);

create index if not exists idx_products_category on products(category);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created_at on orders(created_at);
