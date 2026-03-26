# API spec inicial (v1)

Base path: `/api/v1`

## Productos

- `GET /products`
  - Query params: `q`, `category`, `page`, `limit`, `sort`
  - Response:
    - `items[]`: `id, sku, name, category, imageUrl, salePrice, stock`
    - `meta`: `total, page, limit`

- `GET /products/:id`
  - Response: detalle completo del producto y proveedor.

## Carrito

- `POST /cart/quote`
  - Body: líneas de carrito (`productId`, `qty`) + ciudad/país.
  - Response: subtotal, costo de envío estimado, total.

## Órdenes

- `POST /orders`
  - Body: customer info + cart lines + payment method.
  - Response: `orderId`, `status`, `paymentUrl` o `paymentIntent`.

- `GET /orders/:id`
  - Response: estado de pago y estado de despacho.

## Webhooks

- `POST /webhooks/payment`
- `POST /webhooks/supplier`

## Reglas operativas recomendadas

- Validar stock con proveedor al confirmar orden.
- Bloquear checkout si `stock <= 0`.
- Registrar eventos de estado (`pending`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`).
- Idempotencia en creación de órdenes (header `Idempotency-Key`).
