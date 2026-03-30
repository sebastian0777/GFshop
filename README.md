# GF Shop - Marketplace + Checkout

GF Shop ahora funciona como tienda orientada a productos (estilo marketplace) y tiene checkout online con Stripe.

## Archivos clave

- `index.html`: home tipo market, centrada en productos
- `product.html`: pagina de detalle de producto
- `checkout.html`: checkout completo (entrega + metodo de pago)
- `styles.css`: UI marketplace y animaciones
- `catalog-data.js`: catalogo enriquecido local (promos, colores, galeria, specs)
- `app.js`: catalogo, promociones, carrito y redirección a checkout
- `product.js`: render de detalle y productos similares
- `checkout.js`: logica de checkout y envio de pedido a WhatsApp
- `server.js`: API Express + integración Stripe
- `backend/schema.sql`: esquema PostgreSQL
- `backend/seed.sql`: productos semilla
- `backend/scripts/initDb.js`: inicialización DB

## Configuración rápida

1. Copia `.env.example` a `.env`.
2. Ajusta `DATABASE_URL`.
3. Agrega llaves Stripe:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
4. Configura WhatsApp:
   - `WHATSAPP_ORDER_PHONE` (numero destino en formato internacional, solo digitos)
   - `WHATSAPP_CLOUD_PHONE_NUMBER_ID` (opcional, para envio directo oficial con Cloud API)
   - `WHATSAPP_CLOUD_TOKEN` (opcional, para envio directo oficial con Cloud API)
5. Instala dependencias:

```bash
npm install
```

6. Crea la base de datos `gf_shop` en PostgreSQL.
7. Inicializa esquema y datos:

```bash
npm run db:init
```

8. Inicia la app:

```bash
npm run dev
```

Abrir: `http://localhost:3000`

## Stripe webhook local

Con Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/stripe/webhook
```

Copia el `whsec_...` generado y pegalo en `STRIPE_WEBHOOK_SECRET`.

## Endpoints

- `GET /api/health`
- `GET /api/v1/catalog` (unificado: DB y/o proveedores)
- `GET /api/v1/products`
- `GET /api/v1/products/:id`
- `POST /api/v1/cart/quote`
- `POST /api/v1/orders`
- `GET /api/v1/orders/:id`
- `POST /api/v1/payments/stripe/webhook`

## Comportamiento de pago

- Si Stripe esta configurado, al crear orden retorna `paymentUrl` y redirige al checkout.
- Si Stripe no esta configurado, la orden queda en `pending_payment`.

## WhatsApp de pedidos

- Con `WHATSAPP_CLOUD_PHONE_NUMBER_ID` + `WHATSAPP_CLOUD_TOKEN`, el pedido se envia directamente al WhatsApp del vendedor desde el servidor.
- Si Cloud API no esta configurada, se usa fallback `wa.me` con el mensaje completo precargado.

## Logo

Guarda el logo en:

`assets/logo-gfshop.png`

## Logos oficiales de pago

Para usar logos oficiales, coloca estos archivos:

- `assets/payments/contraentrega-official.png`
- `assets/payments/transferencia-official.png`
- `assets/payments/nequi-official.png`
- `assets/payments/daviplata-official.png`
- `assets/payments/tarjeta-official.png`

Si no existen, la tienda usa iconos locales de respaldo.
