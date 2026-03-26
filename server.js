require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not set. API routes will fail until configured.");
}

const stripeEnabled = Boolean(process.env.STRIPE_SECRET_KEY);
const stripe = stripeEnabled ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const localOrdersFile = path.join(__dirname, "backend", "local-orders.json");
const providerCache = { updatedAt: 0, items: [] };
const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000;

function withPromotion(product) {
  const salePrice = Number(product.salePrice || 0);
  const originalPrice = Math.round(salePrice * 1.25 / 1000) * 1000;
  const discount = Math.max(0, Math.round(((originalPrice - salePrice) / originalPrice) * 100));
  return {
    ...product,
    originalPrice,
    promoText: `${discount}% OFF`,
    hasPromo: discount >= 8,
  };
}

function stableNumberId(text) {
  const str = String(text || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash || Math.floor(Math.random() * 1000000);
}

function asNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const num = Number(value);
    if (!Number.isNaN(num) && Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function asText(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function collectMedia(input) {
  const images = [];
  const videos = [];

  const pushImage = (url) => {
    const text = asText(url);
    if (!text) return;
    if (!images.includes(text)) images.push(text);
  };
  const pushVideo = (url) => {
    const text = asText(url);
    if (!text) return;
    if (!videos.includes(text)) videos.push(text);
  };

  pushImage(input.imageUrl);
  pushImage(input.image_url);
  pushImage(input.main_image);
  pushImage(input.thumbnail);
  pushImage(input.cover);
  pushImage(input.image);

  const fromArray = (arr) => Array.isArray(arr) ? arr : [];
  fromArray(input.images).forEach((item) => {
    if (typeof item === "string") pushImage(item);
    else {
      pushImage(item?.url);
      pushImage(item?.src);
      pushImage(item?.image);
    }
  });

  fromArray(input.gallery).forEach((item) => {
    if (typeof item === "string") pushImage(item);
    else pushImage(item?.url || item?.src);
  });

  fromArray(input.media).forEach((item) => {
    const type = asText(item?.type, item?.media_type).toLowerCase();
    const url = asText(item?.url, item?.src);
    if (!url) return;
    if (type.includes("video")) pushVideo(url);
    else pushImage(url);
  });

  fromArray(input.videos).forEach((item) => {
    if (typeof item === "string") pushVideo(item);
    else pushVideo(item?.url || item?.src);
  });

  return { images, videos };
}

function normalizeProviderProduct(input, provider) {
  const title = asText(input.name, input.title, input.product_name, input.productName, input.reference_name) || "Producto";
  const category = asText(input.category, input.product_type, input.type, input.collection, input.department) || "General";
  const { images, videos } = collectMedia(input);
  const imageUrl = images[0] || null;

  const variants = Array.isArray(input.variants) ? input.variants : [];
  const minVariantPrice = variants.length
    ? Math.min(
        ...variants
          .map((v) => asNumber(v.sale_price, v.salePrice, v.price_cop, v.price, v.selling_price, v.amount))
          .filter((n) => n > 0)
      )
    : 0;

  const salePrice = asNumber(
    input.salePrice,
    input.sale_price,
    input.price_cop,
    input.selling_price,
    input.price,
    input.amount,
    input.sale?.price,
    input.pricing?.sale,
    input.pricing?.price,
    minVariantPrice
  );

  const stock = asNumber(
    input.stock,
    input.inventory,
    input.quantity,
    input.available_quantity,
    input.available,
    variants.reduce((acc, v) => acc + asNumber(v.stock, v.inventory, v.quantity), 0)
  );

  const sku = asText(input.sku, input.reference, input.code, input.idSku) || `${provider}-${stableNumberId(`${title}-${salePrice}`)}`;
  const id = Number(input.id) || stableNumberId(`${provider}-${sku}-${title}`);

  return withPromotion({
    id,
    sku,
    name: title,
    category,
    description: input.description || "",
    imageUrl,
    salePrice,
    stock,
    videos,
    provider,
    currency: asText(input.currency, input.currency_code, input.currencyCode) || "COP",
  });
}

async function fetchShopifyCatalog() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-01";
  if (!domain || !token) return [];

  const endpoint = `https://${domain}/api/${apiVersion}/graphql.json`;
  const query = `
    query Catalog($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            productType
            description
            totalInventory
            featuredImage { url }
            images(first: 5) { edges { node { url } } }
            media(first: 5) {
              edges {
                node {
                  mediaContentType
                  ... on Video {
                    sources { url }
                  }
                }
              }
            }
            priceRange {
              minVariantPrice { amount currencyCode }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token,
    },
    body: JSON.stringify({ query, variables: { first: 120 } }),
  });
  if (!response.ok) return [];
  const json = await response.json();
  const nodes = json?.data?.products?.edges?.map((e) => e.node) || [];

  return nodes.map((node) => {
    const images = node.images?.edges?.map((e) => e.node?.url).filter(Boolean) || [];
    const videos =
      node.media?.edges
        ?.map((edge) => edge.node)
        ?.filter((m) => m?.mediaContentType === "VIDEO")
        ?.flatMap((m) => (m.sources || []).map((s) => s.url).filter(Boolean)) || [];

    return normalizeProviderProduct(
      {
        id: stableNumberId(`shopify-${node.id}`),
        sku: `SHOPIFY-${stableNumberId(node.id)}`,
        title: node.title,
        product_type: node.productType || "General",
        description: node.description,
        imageUrl: node.featuredImage?.url || images[0] || null,
        images,
        videos,
        salePrice: Number(node.priceRange?.minVariantPrice?.amount || 0),
        stock: Number(node.totalInventory || 0),
        currency: node.priceRange?.minVariantPrice?.currencyCode || "COP",
      },
      "shopify"
    );
  });
}

async function fetchDropiCatalog() {
  const baseUrl = process.env.DROPI_BASE_URL;
  const token = process.env.DROPI_TOKEN;
  const productsPath = process.env.DROPI_PRODUCTS_PATH || "/products";
  if (!baseUrl || !token) return [];

  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = productsPath.startsWith("/") ? productsPath : `/${productsPath}`;
  const endpoint = `${normalizedBase}${normalizedPath}`;

  const authMode = (process.env.DROPI_AUTH_MODE || "bearer").toLowerCase();
  const authHeaderName = process.env.DROPI_AUTH_HEADER || "Authorization";
  const tokenPrefix = process.env.DROPI_AUTH_PREFIX || "Bearer ";
  const extraHeadersRaw = process.env.DROPI_EXTRA_HEADERS || "";

  const headers = { "Content-Type": "application/json" };
  headers[authHeaderName] = authMode === "bearer" ? `${tokenPrefix}${token}` : token;

  if (extraHeadersRaw) {
    extraHeadersRaw.split(",").forEach((pair) => {
      const [k, ...rest] = pair.split(":");
      const key = asText(k);
      const value = asText(rest.join(":"));
      if (key && value) headers[key] = value;
    });
  }

  const url = new URL(endpoint);
  if (!url.searchParams.get("country")) url.searchParams.set("country", "CO");
  if (!url.searchParams.get("currency")) url.searchParams.set("currency", "COP");
  if (!url.searchParams.get("limit")) url.searchParams.set("limit", "200");

  const response = await fetch(url.toString(), {
    headers: {
      ...headers,
    },
  });
  if (!response.ok) return [];
  const json = await response.json();

  const rows =
    (Array.isArray(json) && json) ||
    json?.items ||
    json?.products ||
    json?.data?.items ||
    json?.data?.products ||
    [];
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => normalizeProviderProduct(row, "dropi")).filter((item) => item.salePrice > 0);
}

async function fetchProviderCatalog() {
  const now = Date.now();
  if (now - providerCache.updatedAt < PROVIDER_CACHE_TTL_MS && providerCache.items.length) {
    return providerCache.items;
  }

  const [shopify, dropi] = await Promise.all([fetchShopifyCatalog(), fetchDropiCatalog()]);
  const merged = [...dropi, ...shopify].filter((p) => p.salePrice > 0);
  providerCache.items = merged;
  providerCache.updatedAt = now;
  return merged;
}

function mergeCatalogItems({ dbItems = [], providerItems = [] }) {
  const map = new Map();

  const keyOf = (item) => {
    const sku = asText(item.sku).toLowerCase();
    if (sku) return `sku:${sku}`;
    const name = asText(item.name, item.title).toLowerCase();
    const price = asNumber(item.salePrice, item.sale_price, item.price);
    return `name:${name}|price:${price}`;
  };

  const upsert = (item, source) => {
    const key = keyOf(item);
    const normalized = withPromotion({
      ...item,
      id: Number(item.id) || stableNumberId(`${source}-${key}`),
      source,
    });

    if (!map.has(key)) {
      map.set(key, normalized);
      return;
    }

    const prev = map.get(key);
    const prevScore = Number(Boolean(prev.imageUrl)) + Number(Boolean(prev.description)) + Number(prev.stock > 0);
    const nextScore =
      Number(Boolean(normalized.imageUrl)) + Number(Boolean(normalized.description)) + Number(normalized.stock > 0);

    if (nextScore >= prevScore) {
      map.set(key, { ...prev, ...normalized, source: `${prev.source},${source}` });
    }
  };

  dbItems.forEach((item) => upsert(item, "db"));
  providerItems.forEach((item) => upsert(item, item.provider || "provider"));

  return Array.from(map.values());
}

app.use(cors());

app.post("/api/v1/payments/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripeEnabled || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ message: "Stripe webhook is not configured" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ message: "Missing stripe-signature" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = Number(session.metadata?.orderId || 0);
      if (orderId > 0) {
        await pool.query(
          `
          update orders
          set payment_status = 'paid',
              status = case when status = 'pending' then 'processing' else status end,
              provider_order_ref = coalesce(provider_order_ref, $2),
              updated_at = now()
          where id = $1
          `,
          [orderId, session.id]
        );
      }
    }

    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ message: "Webhook handling failed", detail: error.message });
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query("select now() as now");
    res.json({ status: "ok", dbTime: result.rows[0].now, stripeEnabled });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/api/v1/catalog", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 150), 1), 300);
  let dbItems = [];
  let providerItems = [];
  const errors = [];

  try {
    const result = await pool.query(
      `
      select id, sku, name, category, description, image_url as "imageUrl", sale_price as "salePrice", stock
      from products
      where active = true
      order by created_at desc
      limit $1
      `,
      [limit]
    );
    dbItems = result.rows.map(withPromotion);
  } catch (error) {
    errors.push(`db: ${error.message}`);
  }

  try {
    providerItems = await fetchProviderCatalog();
  } catch (error) {
    errors.push(`providers: ${error.message}`);
  }

  const merged = mergeCatalogItems({ dbItems, providerItems }).slice(0, limit);
  if (!merged.length) {
    return res.status(500).json({ message: "Catalog unavailable", errors });
  }

  return res.json({
    source: "mixed",
    counts: { db: dbItems.length, providers: providerItems.length, merged: merged.length },
    errors,
    items: merged,
  });
});

app.get("/api/v1/providers/status", async (_req, res) => {
  const status = {
    dropiConfigured: Boolean(process.env.DROPI_BASE_URL && process.env.DROPI_TOKEN),
    shopifyConfigured: Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_STOREFRONT_TOKEN),
    dropiCount: 0,
    shopifyCount: 0,
    errors: [],
  };

  try {
    const [dropi, shopify] = await Promise.all([
      fetchDropiCatalog().catch((e) => {
        status.errors.push(`dropi: ${e.message}`);
        return [];
      }),
      fetchShopifyCatalog().catch((e) => {
        status.errors.push(`shopify: ${e.message}`);
        return [];
      }),
    ]);
    status.dropiCount = dropi.length;
    status.shopifyCount = shopify.length;
    status.total = dropi.length + shopify.length;
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ message: "providers status failed", detail: error.message, ...status });
  }
});

app.get("/api/v1/products", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const category = (req.query.category || "all").toString().trim();
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 24), 1), 100);
    const offset = (page - 1) * limit;

    const values = [];
    const where = ["active = true"];

    if (q) {
      values.push(`%${q}%`);
      where.push(`name ilike $${values.length}`);
    }

    if (category && category !== "all") {
      values.push(category);
      where.push(`category = $${values.length}`);
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";

    const countQuery = `select count(*)::int as total from products ${whereSql}`;
    const itemsQuery = `
      select id, sku, name, category, description, image_url as "imageUrl", sale_price as "salePrice", stock
      from products
      ${whereSql}
      order by created_at desc
      limit $${values.length + 1} offset $${values.length + 2}
    `;

    const [{ rows: countRows }, { rows: items }] = await Promise.all([
      pool.query(countQuery, values),
      pool.query(itemsQuery, [...values, limit, offset]),
    ]);

    res.json({
      items: items.map(withPromotion),
      meta: {
        total: countRows[0].total,
        page,
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", detail: error.message });
  }
});

app.get("/api/v1/products/:id", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (Number.isNaN(productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const { rows } = await pool.query(
      `
      select p.id, p.sku, p.name, p.category, p.description, p.image_url as "imageUrl", p.sale_price as "salePrice", p.stock,
             s.id as "supplierId", s.name as "supplierName", s.api_base_url as "supplierApi"
      from products p
      left join suppliers s on s.id = p.supplier_id
      where p.id = $1 and p.active = true
      `,
      [productId]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(withPromotion(rows[0]));
  } catch (error) {
    res.status(500).json({ message: "Error fetching product", detail: error.message });
  }
});

app.get("/api/v1/products/:id/similar", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit || 4), 1), 12);
    if (Number.isNaN(productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const base = await pool.query(
      `select id, category from products where id = $1 and active = true`,
      [productId]
    );

    if (!base.rows[0]) {
      return res.status(404).json({ message: "Product not found" });
    }

    const similar = await pool.query(
      `select id, sku, name, category, description, image_url as "imageUrl", sale_price as "salePrice", stock
       from products
       where active = true and id <> $1 and category = $2
       order by created_at desc
       limit $3`,
      [productId, base.rows[0].category, limit]
    );

    res.json({ items: similar.rows.map(withPromotion) });
  } catch (error) {
    res.status(500).json({ message: "Error fetching similar products", detail: error.message });
  }
});

app.post("/api/v1/cart/quote", async (req, res) => {
  try {
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!lines.length) {
      return res.status(400).json({ message: "lines are required" });
    }

    const ids = [...new Set(lines.map((line) => Number(line.productId)).filter((id) => !Number.isNaN(id)))];
    if (!ids.length) {
      return res.status(400).json({ message: "Invalid product lines" });
    }

    const { rows } = await pool.query(
      `select id, sale_price as "salePrice", stock from products where id = any($1::bigint[]) and active = true`,
      [ids]
    );

    const map = new Map(rows.map((p) => [Number(p.id), p]));
    let subtotal = 0;

    for (const line of lines) {
      const product = map.get(Number(line.productId));
      const qty = Math.max(Number(line.qty || 0), 0);
      if (!product || qty < 1) continue;
      if (qty > Number(product.stock)) {
        return res.status(400).json({ message: `Stock insuficiente para producto ${line.productId}` });
      }
      subtotal += Number(product.salePrice) * qty;
    }

    const shippingCost = subtotal >= 180000 ? 0 : 12000;
    res.json({
      subtotal,
      shippingCost,
      total: subtotal + shippingCost,
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating quote", detail: error.message });
  }
});

app.post("/api/v1/orders", async (req, res) => {
  const client = await pool.connect();
  try {
    const customer = req.body.customer || {};
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];

    if (!customer.fullName || !customer.email || !customer.addressLine1 || !customer.city || !customer.country) {
      return res.status(400).json({ message: "Customer fields are incomplete" });
    }

    if (!lines.length) {
      return res.status(400).json({ message: "Order lines are required" });
    }

    const ids = [...new Set(lines.map((line) => Number(line.productId)).filter((id) => !Number.isNaN(id)))];
    const productsResult = await client.query(
      `select id, name, sale_price as "salePrice", stock from products where id = any($1::bigint[]) and active = true`,
      [ids]
    );

    const productsMap = new Map(productsResult.rows.map((p) => [Number(p.id), p]));
    let subtotal = 0;
    const normalizedLines = [];

    for (const line of lines) {
      const productId = Number(line.productId);
      const product = productsMap.get(productId);
      const qty = Math.max(Number(line.qty || 0), 0);
      if (!product || qty < 1) continue;
      if (qty > Number(product.stock)) {
        return res.status(400).json({ message: `Stock insuficiente para producto ${line.productId}` });
      }

      const unitPrice = Number(product.salePrice);
      subtotal += unitPrice * qty;
      normalizedLines.push({ productId, qty, unitPrice, name: product.name });
    }

    if (subtotal === 0) {
      return res.status(400).json({ message: "Order total cannot be zero" });
    }

    const shippingCost = subtotal >= 180000 ? 0 : 12000;
    const total = subtotal + shippingCost;

    await client.query("begin");

    const customerInsert = await client.query(
      `
      insert into customers (full_name, email, phone, address_line1, city, state_region, country, postal_code)
      values ($1,$2,$3,$4,$5,$6,$7,$8)
      returning id
      `,
      [
        customer.fullName,
        customer.email,
        customer.phone || null,
        customer.addressLine1,
        customer.city,
        customer.stateRegion || null,
        customer.country,
        customer.postalCode || null,
      ]
    );

    const customerId = customerInsert.rows[0].id;

    const orderInsert = await client.query(
      `
      insert into orders (customer_id, status, payment_status, subtotal, shipping_cost, total)
      values ($1, 'pending', 'unpaid', $2, $3, $4)
      returning id, status, payment_status as "paymentStatus", created_at as "createdAt"
      `,
      [customerId, subtotal, shippingCost, total]
    );

    const orderId = orderInsert.rows[0].id;

    for (const line of normalizedLines) {
      const lineTotal = line.unitPrice * line.qty;

      await client.query(
        `
        insert into order_items (order_id, product_id, quantity, unit_price, total_price)
        values ($1, $2, $3, $4, $5)
        `,
        [orderId, line.productId, line.qty, line.unitPrice, lineTotal]
      );

      await client.query(
        `update products set stock = stock - $1, updated_at = now() where id = $2`,
        [line.qty, line.productId]
      );
    }

    await client.query("commit");

    let paymentUrl = null;
    let paymentMode = "manual";

    if (stripeEnabled) {
      const successTemplate = process.env.CHECKOUT_SUCCESS_URL || `http://localhost:${port}/?order_status=success&order_id={ORDER_ID}`;
      const cancelTemplate = process.env.CHECKOUT_CANCEL_URL || `http://localhost:${port}/?order_status=cancel&order_id={ORDER_ID}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        currency: "cop",
        customer_email: customer.email,
        metadata: { orderId: String(orderId) },
        success_url: successTemplate.replace("{ORDER_ID}", String(orderId)),
        cancel_url: cancelTemplate.replace("{ORDER_ID}", String(orderId)),
        line_items: [
          ...normalizedLines.map((line) => ({
            quantity: line.qty,
            price_data: {
              currency: "cop",
              product_data: { name: line.name },
              unit_amount: Math.round(line.unitPrice),
            },
          })),
          {
            quantity: 1,
            price_data: {
              currency: "cop",
              product_data: { name: "Envio" },
              unit_amount: Math.round(shippingCost),
            },
          },
        ],
      });

      paymentUrl = session.url;
      paymentMode = "stripe";

      await pool.query(
        `
        update orders
        set payment_status = 'checkout_created', provider_order_ref = $2, updated_at = now()
        where id = $1
        `,
        [orderId, session.id]
      );
    } else {
      await pool.query(
        `
        update orders
        set payment_status = 'pending_payment', updated_at = now()
        where id = $1
        `,
        [orderId]
      );
    }

    res.status(201).json({
      orderId,
      status: orderInsert.rows[0].status,
      paymentStatus: stripeEnabled ? "checkout_created" : "pending_payment",
      paymentMode,
      total,
      paymentUrl,
      createdAt: orderInsert.rows[0].createdAt,
      message: stripeEnabled
        ? "Orden creada. Redirigiendo al checkout seguro."
        : "Orden creada. Configura Stripe para habilitar pago online.",
    });
  } catch (error) {
    await client.query("rollback");
    res.status(500).json({ message: "Error creating order", detail: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/v1/orders/:id", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) {
      return res.status(400).json({ message: "Invalid order id" });
    }

    const orderResult = await pool.query(
      `
      select o.id, o.status, o.payment_status as "paymentStatus", o.subtotal, o.shipping_cost as "shippingCost", o.total,
             o.provider_order_ref as "providerOrderRef", o.created_at as "createdAt", c.full_name as "customerName", c.email
      from orders o
      join customers c on c.id = o.customer_id
      where o.id = $1
      `,
      [orderId]
    );

    if (!orderResult.rows[0]) {
      return res.status(404).json({ message: "Order not found" });
    }

    const itemsResult = await pool.query(
      `
      select oi.product_id as "productId", p.name, oi.quantity, oi.unit_price as "unitPrice", oi.total_price as "totalPrice"
      from order_items oi
      join products p on p.id = oi.product_id
      where oi.order_id = $1
      order by oi.id asc
      `,
      [orderId]
    );

    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching order", detail: error.message });
  }
});

app.post("/api/v1/orders/local", async (req, res) => {
  try {
    const customer = req.body.customer || {};
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const payment = req.body.payment || {};

    if (!customer.fullName || !customer.email || !customer.addressLine1 || !customer.city || !customer.country) {
      return res.status(400).json({ message: "Customer fields are incomplete" });
    }

    if (!lines.length) {
      return res.status(400).json({ message: "Order lines are required" });
    }

    let subtotal = 0;
    const normalizedLines = [];
    for (const line of lines) {
      const qty = Math.max(Number(line.qty || 0), 0);
      const unitPrice = Math.max(Number(line.unitPrice || 0), 0);
      if (qty < 1 || unitPrice <= 0) continue;
      const totalPrice = unitPrice * qty;
      subtotal += totalPrice;
      normalizedLines.push({
        productId: Number(line.productId || 0),
        name: String(line.name || "Producto"),
        qty,
        unitPrice,
        totalPrice,
      });
    }

    if (!normalizedLines.length) {
      return res.status(400).json({ message: "No valid order lines" });
    }

    const shippingCost = subtotal >= 180000 ? 0 : 12000;
    const total = subtotal + shippingCost;
    const orderId = Date.now();

    let current = [];
    if (fs.existsSync(localOrdersFile)) {
      current = JSON.parse(fs.readFileSync(localOrdersFile, "utf8"));
      if (!Array.isArray(current)) current = [];
    }

    const record = {
      orderId,
      status: "pending",
      paymentStatus: "pending_payment",
      customer,
      lines: normalizedLines,
      subtotal,
      shippingCost,
      total,
      createdAt: new Date().toISOString(),
      source: "local-fallback",
    };

    current.push(record);
    fs.writeFileSync(localOrdersFile, JSON.stringify(current, null, 2), "utf8");

    let whatsappUrl = null;
    if (process.env.WHATSAPP_ORDER_PHONE) {
      const linesText = normalizedLines
        .map(
          (line, idx) =>
            `${idx + 1}. ${line.name} x${line.qty} - ${line.totalPrice.toLocaleString("es-CO")} COP`
        )
        .join("\n");
      const paymentMethod = String(payment.method || "No especificado");
      const paymentDetail = String(payment.detail || "");
      const msgRaw =
        `Hola, nuevo pedido GF Shop #${orderId}\n\n` +
        `Cliente: ${customer.fullName}\n` +
        `Correo: ${customer.email}\n` +
        `Telefono: ${customer.phone || "N/A"}\n` +
        `Direccion: ${customer.addressLine1}, ${customer.city}\n` +
        `Pais: ${customer.country}\n` +
        `Codigo postal: ${customer.postalCode || "N/A"}\n\n` +
        `Metodo de pago: ${paymentMethod}${paymentDetail ? ` (${paymentDetail})` : ""}\n\n` +
        `Productos:\n${linesText}\n\n` +
        `Subtotal: ${subtotal.toLocaleString("es-CO")} COP\n` +
        `Envio: ${shippingCost.toLocaleString("es-CO")} COP\n` +
        `Total: ${total.toLocaleString("es-CO")} COP`;
      const msg = encodeURIComponent(msgRaw);
      whatsappUrl = `https://wa.me/${process.env.WHATSAPP_ORDER_PHONE}?text=${msg}`;
    }

    res.status(201).json({
      orderId,
      status: "pending",
      paymentStatus: "pending_payment",
      paymentMode: "manual_local",
      total,
      whatsappUrl,
      message: "Orden creada en modo local. Se registro correctamente.",
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating local order", detail: error.message });
  }
});

app.listen(port, () => {
  console.log(`GF Shop running on http://localhost:${port}`);
});



