const localCatalog = Array.isArray(window.GF_CATALOG) ? window.GF_CATALOG : [];

const STORAGE_CART_KEY = "gfshop_cart_v1";
const STORAGE_PROFILE_KEY = "gfshop_profile_v1";

const fmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const state = {
  cart: [],
  products: [],
  useFallback: false,
};

const checkoutForm = document.getElementById("checkoutPageForm");
const submitBtn = document.getElementById("submitCheckoutPage");
const checkoutItems = document.getElementById("checkoutItems");
const checkoutSubtotal = document.getElementById("checkoutSubtotal");
const checkoutShipping = document.getElementById("checkoutShipping");
const checkoutTotal = document.getElementById("checkoutTotal");

function normalizeText(value) {
  return (value || "").toString().trim().toLowerCase();
}

function getLocalMatch(product) {
  const sku = normalizeText(product.sku);
  const name = normalizeText(product.name);
  return localCatalog.find((item) => normalizeText(item.sku) === sku || normalizeText(item.name) === name);
}

function enrichProduct(product) {
  const local = getLocalMatch(product) || {};
  const salePrice = Number(product.salePrice || local.salePrice || 0);
  return {
    ...product,
    id: Number(product.id),
    imageUrl: product.imageUrl || local.imageUrl,
    salePrice,
  };
}

function persistCart() {
  try {
    localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(state.cart));
  } catch (_error) {
    // ignore
  }
}

function restoreCart() {
  try {
    const raw = localStorage.getItem(STORAGE_CART_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    state.cart = parsed
      .map((item) => ({ id: Number(item.id), qty: Math.max(1, Number(item.qty || 1)) }))
      .filter((item) => !Number.isNaN(item.id));
  } catch (_error) {
    state.cart = [];
  }
}

function persistProfile(profile) {
  try {
    localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
  } catch (_error) {
    // ignore
  }
}

function restoreProfile() {
  if (!checkoutForm) return;
  try {
    const raw = localStorage.getItem(STORAGE_PROFILE_KEY);
    if (!raw) return;
    const profile = JSON.parse(raw);
    if (!profile || typeof profile !== "object") return;

    const set = (name, value) => {
      const input = checkoutForm.querySelector(`[name="${name}"]`);
      if (input) input.value = value || "";
    };

    set("fullName", profile.fullName);
    set("email", profile.email);
    set("phone", profile.phone);
    set("addressLine1", profile.addressLine1);
    set("city", profile.city || "Bogota");
    set("postalCode", profile.postalCode);
  } catch (_error) {
    // ignore
  }
}

async function loadProducts() {
  try {
    const response = await fetch("/api/v1/catalog?limit=220");
    if (!response.ok) throw new Error("products unavailable");
    const data = await response.json();
    state.products = (data.items || []).map(enrichProduct);
  } catch (_error) {
    state.useFallback = true;
    state.products = localCatalog.map(enrichProduct);
  }
}

function getProductById(id) {
  return state.products.find((p) => Number(p.id) === Number(id));
}

function getCartSummary() {
  let subtotal = 0;
  const lines = state.cart
    .map((line) => {
      const product = getProductById(line.id);
      if (!product) return null;
      const unitPrice = Number(product.salePrice || 0);
      const totalPrice = unitPrice * line.qty;
      subtotal += totalPrice;
      return {
        productId: line.id,
        name: product.name || "Producto",
        qty: line.qty,
        unitPrice,
        totalPrice,
        imageUrl: product.imageUrl,
      };
    })
    .filter(Boolean);

  const shipping = subtotal >= 180000 ? 0 : 12000;
  return { lines, subtotal, shipping, total: subtotal + shipping };
}

function renderSummary() {
  const summary = getCartSummary();

  if (!summary.lines.length) {
    checkoutItems.innerHTML = "<p>Tu carrito esta vacio. Vuelve a la tienda para agregar productos.</p>";
    checkoutSubtotal.textContent = fmt.format(0);
    checkoutShipping.textContent = fmt.format(0);
    checkoutTotal.textContent = fmt.format(0);
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  checkoutItems.innerHTML = summary.lines
    .map(
      (line) => `
      <div class="checkout-item">
        <img src="${line.imageUrl}" alt="${line.name}" />
        <div>
          <strong>${line.name}</strong>
          <small>${line.qty} x ${fmt.format(line.unitPrice)}</small>
        </div>
        <strong>${fmt.format(line.totalPrice)}</strong>
      </div>
    `
    )
    .join("");

  checkoutSubtotal.textContent = fmt.format(summary.subtotal);
  checkoutShipping.textContent = fmt.format(summary.shipping);
  checkoutTotal.textContent = fmt.format(summary.total);
}

async function submitOrder(event) {
  event.preventDefault();
  if (!checkoutForm) return;

  const summary = getCartSummary();
  if (!summary.lines.length) {
    alert("Tu carrito esta vacio.");
    return;
  }

  const formData = new FormData(checkoutForm);
  const customer = {
    fullName: String(formData.get("fullName") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim() || undefined,
    addressLine1: String(formData.get("addressLine1") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    postalCode: String(formData.get("postalCode") || "").trim() || undefined,
    country: "Colombia",
  };

  if (!customer.fullName || !customer.email || !customer.phone || !customer.addressLine1 || !customer.city) {
    alert("Completa todos los datos obligatorios de entrega y contacto.");
    return;
  }

  const payment = {
    method: String(formData.get("paymentMethod") || "Contraentrega"),
    detail: String(formData.get("paymentDetail") || "").trim() || undefined,
  };

  persistProfile(customer);

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";
  }

  try {
    const response = await fetch("/api/v1/orders/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer, lines: summary.lines, payment }),
    });
    const data = await response.json();

    if (!response.ok) {
      alert(data.message || "No se pudo crear la orden.");
      return;
    }

    state.cart = [];
    persistCart();

    if (data.whatsappUrl) {
      window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    } else {
      alert("Orden creada, pero falta configurar WHATSAPP_ORDER_PHONE en el servidor.");
    }

    alert(`Pedido #${data.orderId} enviado. Te redirigimos a la tienda.`);
    window.location.href = "index.html";
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar pedido por WhatsApp";
    }
  }
}

(async function bootstrap() {
  restoreCart();
  restoreProfile();
  await loadProducts();
  renderSummary();

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", submitOrder);
  }
})();
