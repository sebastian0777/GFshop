const localCatalog = Array.isArray(window.GF_CATALOG) ? window.GF_CATALOG : [];

const STORAGE_CART_KEY = "gfshop_cart_v1";
const STORAGE_PROFILE_KEY = "gfshop_profile_v1";
const DEFAULT_IMAGE = "assets/logo-gfshop.png";

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
const checkoutHint = document.getElementById("checkoutHint");
let successPanel = null;
const WA_FALLBACK_PHONE = "573107831196";
let checkoutSubmitting = false;
let lastWhatsAppOpen = { url: "", at: 0 };
let whatsappLaunchLockUntil = 0;

function normalizeText(value) {
  return (value || "").toString().trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildImagePlaceholder(product) {
  const category = escapeHtml(product?.category || "General");
  const name = escapeHtml(product?.name || "Producto");
  const shortName = name.length > 28 ? `${name.slice(0, 27)}...` : name;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#184c32"/><stop offset="100%" stop-color="#103623"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><circle cx="670" cy="120" r="120" fill="#b99a43" fill-opacity="0.25"/><text x="90" y="360" font-family="Cormorant Garamond, serif" font-size="112" fill="#f5f2eb">GF</text><text x="90" y="430" font-family="Manrope, sans-serif" font-size="34" fill="#f5f2eb" fill-opacity="0.95">${category}</text><text x="90" y="480" font-family="Manrope, sans-serif" font-size="28" fill="#f5f2eb" fill-opacity="0.82">${shortName}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function resolveProductImage(product, local) {
  const candidates = [
    local?.imageUrl,
    ...(Array.isArray(local?.gallery) ? local.gallery : []),
    product.imageUrl,
    ...(Array.isArray(product.images) ? product.images : []),
  ];
  return candidates.find((url) => typeof url === "string" && url.trim()) || buildImagePlaceholder(product);
}

function applyImageFallback(root = document) {
  root.querySelectorAll("img[data-fallback]").forEach((img) => {
    const fallback = img.dataset.fallback || DEFAULT_IMAGE;
    if (img.dataset.fallbackBound === "1") return;
    img.dataset.fallbackBound = "1";
    img.addEventListener("error", () => {
      if (img.src.endsWith(fallback)) return;
      img.src = fallback;
    });
  });
}

function openWhatsApp(url) {
  if (!url) return false;
  const now = Date.now();
  if (now < whatsappLaunchLockUntil) return true;
  whatsappLaunchLockUntil = now + 8000;
  if (lastWhatsAppOpen.url === url && now - lastWhatsAppOpen.at < 1800) {
    return true;
  }
  lastWhatsAppOpen = { url, at: now };
  const win = window.open(url, "_blank", "noopener,noreferrer");
  return Boolean(win);
}

function buildFallbackWhatsAppUrl({ customer, payment, lines, subtotal, shipping, total }) {
  const orderId = Date.now();
  const linesText = lines
    .map((line, idx) => `${idx + 1}. ${line.name} x${line.qty} - ${line.totalPrice.toLocaleString("es-CO")} COP`)
    .join("\n");
  const message =
    `Hola, nuevo pedido GF Shop #${orderId}\n\n` +
    `Cliente: ${customer.fullName}\n` +
    `Correo: ${customer.email}\n` +
    `Telefono: ${customer.phone || "N/A"}\n` +
    `Direccion: ${customer.addressLine1}, ${customer.city}\n` +
    `Pais: ${customer.country}\n` +
    `Codigo postal: ${customer.postalCode || "N/A"}\n\n` +
    `Metodo de pago: ${payment.method || "No especificado"}${payment.detail ? ` (${payment.detail})` : ""}\n\n` +
    `Productos:\n${linesText}\n\n` +
    `Subtotal: ${subtotal.toLocaleString("es-CO")} COP\n` +
    `Envio: ${shipping.toLocaleString("es-CO")} COP\n` +
    `Total: ${total.toLocaleString("es-CO")} COP`;
  return `https://wa.me/${WA_FALLBACK_PHONE}?text=${encodeURIComponent(message)}`;
}

function showCheckoutError(message) {
  if (!checkoutHint) return;
  checkoutHint.textContent = message;
  checkoutHint.style.color = "#8f2a24";
}

function ensureSuccessPanel() {
  if (successPanel) return successPanel;
  successPanel = document.createElement("section");
  successPanel.id = "orderSuccessPanel";
  successPanel.className = "order-success-panel";
  successPanel.innerHTML = `
    <div class="order-success-card">
      <div class="success-burst"></div>
      <div class="success-check">✓</div>
      <p class="success-kicker">Pedido confirmado</p>
      <h2 id="successTitle">Estamos procesando tu compra</h2>
      <p id="successBody">Tu pedido fue registrado correctamente.</p>
      <div class="success-actions">
        <a id="successWhatsAppLink" class="btn btn-primary" href="#" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
        <a class="btn btn-soft" href="index.html">Volver a la tienda</a>
      </div>
    </div>
  `;
  document.body.appendChild(successPanel);
  return successPanel;
}

function showOrderSuccess({ orderId, sentDirectly, whatsappUrl, total }) {
  const panel = ensureSuccessPanel();
  const title = panel.querySelector("#successTitle");
  const body = panel.querySelector("#successBody");
  const waLink = panel.querySelector("#successWhatsAppLink");

  if (title) {
    title.textContent = sentDirectly
      ? `Pedido #${orderId} enviado al WhatsApp del vendedor`
      : `Pedido #${orderId} creado con exito`;
  }
  if (body) {
    body.textContent = sentDirectly
      ? `Total confirmado: ${fmt.format(total)}. En breve te contactaran para confirmar entrega y pago.`
      : `Total confirmado: ${fmt.format(total)}. Si WhatsApp no se abrio, usa el boton de abajo para enviar ahora.`;
  }
  if (waLink) {
    if (whatsappUrl) {
      waLink.href = whatsappUrl;
      waLink.style.display = "inline-flex";
    } else {
      waLink.style.display = "none";
    }
  }

  panel.classList.add("show");
}

async function refreshWhatsAppStatus() {
  if (!checkoutHint) return;
  try {
    const response = await fetch("/api/v1/whatsapp/status");
    if (!response.ok) throw new Error("whatsapp status unavailable");
    const status = await response.json();
    if (status.cloudConfigured) {
      checkoutHint.textContent = "Envio directo por WhatsApp activo.";
      checkoutHint.style.color = "";
      return;
    }
    if (status.orderPhoneConfigured) {
      checkoutHint.textContent = "WhatsApp listo en modo confirmacion manual (wa.me).";
      checkoutHint.style.color = "";
      return;
    }
    showCheckoutError("Falta configurar WhatsApp en el servidor para enviar pedidos.");
  } catch (_error) {
    showCheckoutError("No se pudo validar WhatsApp. Verifica el servidor.");
  }
}

function getLocalMatch(product) {
  const sku = normalizeText(product.sku);
  const name = normalizeText(product.name);
  return localCatalog.find((item) => normalizeText(item.sku) === sku || normalizeText(item.name) === name);
}

function mergeCatalogWithLocal(apiItems) {
  const list = Array.isArray(apiItems) ? [...apiItems] : [];
  const seen = new Set(
    list.map((item) => {
      const sku = normalizeText(item?.sku);
      if (sku) return `sku:${sku}`;
      return `name:${normalizeText(item?.name)}|price:${Number(item?.salePrice || 0)}`;
    })
  );

  localCatalog.forEach((item) => {
    const sku = normalizeText(item?.sku);
    const key = sku ? `sku:${sku}` : `name:${normalizeText(item?.name)}|price:${Number(item?.salePrice || 0)}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(item);
  });

  return list;
}

function enrichProduct(product) {
  const local = getLocalMatch(product) || {};
  const salePrice = Number(product.salePrice || local.salePrice || 0);
  const imageUrl = resolveProductImage(product, local);
  return {
    ...product,
    id: Number(product.id),
    imageUrl,
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
    state.products = mergeCatalogWithLocal(data.items || []).map(enrichProduct);
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
        <img src="${line.imageUrl}" alt="${line.name}" data-fallback="${buildImagePlaceholder(line)}" />
        <div>
          <strong>${line.name}</strong>
          <small>${line.qty} x ${fmt.format(line.unitPrice)}</small>
        </div>
        <strong>${fmt.format(line.totalPrice)}</strong>
      </div>
    `
    )
    .join("");
  applyImageFallback(checkoutItems);

  checkoutSubtotal.textContent = fmt.format(summary.subtotal);
  checkoutShipping.textContent = fmt.format(summary.shipping);
  checkoutTotal.textContent = fmt.format(summary.total);
}

async function submitOrder(event) {
  event.preventDefault();
  if (!checkoutForm) return;
  if (checkoutSubmitting) return;

  const summary = getCartSummary();
  if (!summary.lines.length) {
    showCheckoutError("Tu carrito esta vacio.");
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
    showCheckoutError("Completa todos los datos obligatorios de entrega y contacto.");
    return;
  }
  checkoutSubmitting = true;

  const payment = {
    method: String(formData.get("paymentMethod") || "Contraentrega"),
    detail: String(formData.get("paymentDetail") || "").trim() || undefined,
  };
  let whatsappDispatched = false;
  const queueWhatsAppOpen = (url) => {
    if (whatsappDispatched || !url) return;
    whatsappDispatched = true;
    setTimeout(() => {
      openWhatsApp(url);
    }, 1100);
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
      const fallbackUrl = buildFallbackWhatsAppUrl({
        customer,
        payment,
        lines: summary.lines,
        subtotal: summary.subtotal,
        shipping: summary.shipping,
        total: summary.total,
      });
      state.cart = [];
      persistCart();
      showOrderSuccess({
        orderId: data.orderId || Date.now(),
        sentDirectly: false,
        whatsappUrl: fallbackUrl,
        total: summary.total,
      });
      queueWhatsAppOpen(fallbackUrl);
      return;
    }

    const sentDirectly = Boolean(data.whatsappSent && data.whatsappDelivery === "cloud_api");
    if (!sentDirectly) {
      queueWhatsAppOpen(data.whatsappUrl);
    }

    state.cart = [];
    persistCart();
    showOrderSuccess({
      orderId: data.orderId,
      sentDirectly,
      whatsappUrl: data.whatsappUrl,
      total: summary.total,
    });
  } catch (_error) {
    if (!whatsappDispatched) {
      const fallbackUrl = buildFallbackWhatsAppUrl({
        customer,
        payment,
        lines: summary.lines,
        subtotal: summary.subtotal,
        shipping: summary.shipping,
        total: summary.total,
      });
      state.cart = [];
      persistCart();
      showOrderSuccess({
        orderId: Date.now(),
        sentDirectly: false,
        whatsappUrl: fallbackUrl,
        total: summary.total,
      });
      queueWhatsAppOpen(fallbackUrl);
    }
  } finally {
    checkoutSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar pedido por WhatsApp";
    }
  }
}

(async function bootstrap() {
  restoreCart();
  restoreProfile();
  await refreshWhatsAppStatus();
  await loadProducts();
  renderSummary();

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", submitOrder);
  }
})();
