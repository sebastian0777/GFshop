const localCatalog = Array.isArray(window.GF_CATALOG) ? window.GF_CATALOG : [];
const fmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const STORAGE_CART_KEY = "gfshop_cart_v1";
const STORAGE_PROFILE_KEY = "gfshop_profile_v1";
const DEFAULT_IMAGE = "assets/logo-gfshop.png";

const state = {
  cart: [],
  products: [],
  currentProduct: null,
  useFallback: false,
};

const detailRoot = document.getElementById("productDetail");
const similarGrid = document.getElementById("similarGrid");
const cartItems = document.getElementById("cartItems");
const cartSubtotal = document.getElementById("cartSubtotal");
const cartShipping = document.getElementById("cartShipping");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const cartInfo = document.getElementById("cartInfo");
const cartDrawer = document.getElementById("cartDrawer");
const openCartBtn = document.getElementById("openCart");
const closeCartBtn = document.getElementById("closeCart");
const cartOverlay = document.getElementById("cartOverlay");
const checkoutModal = document.getElementById("checkoutModal");
const checkoutForm = document.getElementById("checkoutForm");
const confirmCheckout = document.getElementById("confirmCheckout");
const closeCheckoutBtn = document.getElementById("closeCheckout");
const WA_FALLBACK_PHONE = "573107831196";
let checkoutSubmitting = false;
let orderSuccessPanel = null;
let lastWhatsAppOpen = { url: "", at: 0 };
let whatsappLaunchLockUntil = 0;

let revealObserver = null;

function qs(key) {
  return new URLSearchParams(window.location.search).get(key);
}

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

function ensureOrderSuccessPanel() {
  if (orderSuccessPanel) return orderSuccessPanel;
  orderSuccessPanel = document.createElement("section");
  orderSuccessPanel.className = "order-success-panel";
  orderSuccessPanel.innerHTML = `
    <div class="order-success-card">
      <div class="success-burst"></div>
      <div class="success-check">✓</div>
      <p class="success-kicker">Pedido confirmado</p>
      <h2 id="successTitle">Pedido creado</h2>
      <p id="successBody">Tu pedido fue registrado correctamente.</p>
      <p id="successNote" class="success-note"><span aria-hidden="true">⏱</span> Estamos validando tu pago y entrega.</p>
      <div class="success-actions">
        <a id="successWaLink" class="btn btn-primary" href="#" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
        <button id="successCloseBtn" class="btn btn-soft" type="button">Seguir comprando</button>
      </div>
    </div>
  `;
  document.body.appendChild(orderSuccessPanel);
  const closeBtn = orderSuccessPanel.querySelector("#successCloseBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => orderSuccessPanel.classList.remove("show"));
  }
  return orderSuccessPanel;
}

function showOrderSuccess({ orderId, sentDirectly, whatsappUrl, total }) {
  const panel = ensureOrderSuccessPanel();
  const title = panel.querySelector("#successTitle");
  const body = panel.querySelector("#successBody");
  const note = panel.querySelector("#successNote");
  const waLink = panel.querySelector("#successWaLink");

  if (title) {
    title.textContent = sentDirectly
      ? `Pedido #${orderId} enviado al WhatsApp del vendedor`
      : `Pedido #${orderId} creado con exito`;
  }
  if (body) {
    body.textContent = sentDirectly
      ? `Total: ${fmt.format(total)}. Tu pedido quedo confirmado.`
      : `Total: ${fmt.format(total)}. Si no se abrio WhatsApp, toca el boton para enviarlo.`;
  }
  if (note) {
    note.textContent = sentDirectly
      ? "⏱ Confirmacion enviada. Nuestro equipo te contacta en breve."
      : "⏱ Pedido generado. Completa el envio por WhatsApp para finalizar.";
  }
  if (waLink) {
    waLink.href = whatsappUrl || "#";
    waLink.style.display = whatsappUrl ? "inline-flex" : "none";
  }
  panel.classList.add("show");
}

function buildFallbackWhatsAppUrl({ customer, payment, lines }) {
  const orderId = Date.now();
  const normalizedLines = lines.map((line) => ({
    ...line,
    totalPrice: Number(line.unitPrice || 0) * Number(line.qty || 0),
  }));
  const subtotal = normalizedLines.reduce((sum, line) => sum + line.totalPrice, 0);
  const shipping = subtotal >= 180000 ? 0 : 12000;
  const total = subtotal + shipping;
  const linesText = normalizedLines
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

function findLocalByAny(product) {
  const sku = normalizeText(product.sku);
  const name = normalizeText(product.name);
  const id = Number(product.id);

  return localCatalog.find((item) => Number(item.id) === id || normalizeText(item.sku) === sku || normalizeText(item.name) === name);
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

function enrich(product) {
  const local = findLocalByAny(product) || {};
  const salePrice = Number(product.salePrice || local.salePrice || 0);
  const originalPrice = Number(local.originalPrice || Math.round(salePrice * 1.25 / 1000) * 1000);
  const promoPercent = Math.max(0, Math.round(((originalPrice - salePrice) / originalPrice) * 100));
  const imageUrl = resolveProductImage(product, local);
  const gallery = [
    ...(Array.isArray(local.gallery) ? local.gallery : []),
    ...(Array.isArray(product.images) ? product.images : []),
    product.imageUrl,
    local.imageUrl,
  ].filter((img, idx, arr) => typeof img === "string" && img.trim() && arr.indexOf(img) === idx);

  return {
    ...product,
    id: Number(product.id),
    imageUrl,
    gallery: gallery.length ? gallery : [imageUrl],
    colors: Array.isArray(local.colors) ? local.colors : ["Unico"],
    features: Array.isArray(local.features) ? local.features : ["Producto con alta demanda"],
    specs: Array.isArray(local.specs) ? local.specs : ["Informacion adicional disponible en soporte"],
    salePrice,
    originalPrice,
    promoText: promoPercent > 0 ? `${promoPercent}% OFF` : "PROMO",
    hasPromo: promoPercent >= 8,
  };
}

async function loadProductsPool() {
  try {
    const response = await fetch("/api/v1/catalog?limit=220");
    if (!response.ok) throw new Error("products unavailable");
    const data = await response.json();
    state.products = mergeCatalogWithLocal(data.items || []).map(enrich);
  } catch (_error) {
    state.useFallback = true;
    state.products = localCatalog.map(enrich);
  }
}

function getProductById(id) {
  return state.products.find((p) => Number(p.id) === Number(id));
}

function openCart() {
  if (cartDrawer) {
    cartDrawer.classList.add("open");
    cartDrawer.setAttribute("aria-hidden", "false");
  }
  if (cartOverlay) cartOverlay.classList.add("open");
}

function closeCart() {
  if (cartDrawer) {
    cartDrawer.classList.remove("open");
    cartDrawer.setAttribute("aria-hidden", "true");
  }
  if (cartOverlay) cartOverlay.classList.remove("open");
}

function openCheckoutModal() {
  if (!checkoutModal) return;
  checkoutModal.classList.add("open");
  checkoutModal.setAttribute("aria-hidden", "false");
}

function closeCheckoutModal() {
  if (!checkoutModal) return;
  checkoutModal.classList.remove("open");
  checkoutModal.setAttribute("aria-hidden", "true");
}

function addToCart(productId) {
  const product = getProductById(productId);
  if (!product || Number(product.stock) <= 0) {
    alert("Producto no disponible por stock.");
    return;
  }

  const existing = state.cart.find((line) => line.id === productId);
  if (existing) {
    if (existing.qty + 1 > Number(product.stock)) {
      alert("No hay mas unidades disponibles.");
      return;
    }
    existing.qty += 1;
  } else {
    state.cart.push({ id: productId, qty: 1 });
  }

  renderCart();
  persistCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((line) => line.id !== productId);
  renderCart();
  persistCart();
}

function updateQty(productId, delta) {
  const line = state.cart.find((item) => item.id === productId);
  const product = getProductById(productId);
  if (!line || !product) return;
  const next = line.qty + delta;
  if (next < 1) {
    removeFromCart(productId);
    return;
  }
  if (next > Number(product.stock)) {
    alert("No hay mas unidades disponibles.");
    return;
  }
  line.qty = next;
  renderCart();
  persistCart();
}

function renderCart() {
  if (!cartItems) return;
  cartItems.innerHTML = "";

  if (!state.cart.length) {
    cartItems.innerHTML = "<p>Tu carrito esta vacio.</p>";
    if (cartSubtotal) cartSubtotal.textContent = fmt.format(0);
    if (cartShipping) cartShipping.textContent = fmt.format(0);
    if (cartTotal) cartTotal.textContent = fmt.format(0);
    if (cartCount) cartCount.textContent = "0";
    if (cartInfo) cartInfo.textContent = "Tu carrito se guarda automaticamente.";
    return;
  }

  let subtotal = 0;
  let qtyCount = 0;

  state.cart.forEach((line) => {
    const product = getProductById(line.id);
    if (!product) return;

    const price = Number(product.salePrice);
    const lineTotal = price * line.qty;
    subtotal += lineTotal;
    qtyCount += line.qty;

    const row = document.createElement("div");
    row.className = "cart-line";
    row.innerHTML = `
      <img class="cart-line-image" src="${product.imageUrl}" alt="${product.name}" data-fallback="${buildImagePlaceholder(product)}" />
      <div class="cart-line-main">
        <strong>${product.name}</strong>
        <small>${fmt.format(price)}</small>
        <div class="qty-control">
          <button class="qty-btn" data-minus="${product.id}" aria-label="Disminuir">-</button>
          <span>${line.qty}</span>
          <button class="qty-btn" data-plus="${product.id}" aria-label="Aumentar">+</button>
        </div>
      </div>
      <div class="cart-line-end">
        <strong>${fmt.format(lineTotal)}</strong>
        <button class="icon-btn remove-line" data-remove="${product.id}">Quitar</button>
      </div>
    `;
    cartItems.appendChild(row);
  });

  const shipping = subtotal >= 180000 ? 0 : 12000;
  if (cartSubtotal) cartSubtotal.textContent = fmt.format(subtotal);
  if (cartShipping) cartShipping.textContent = fmt.format(shipping);
  if (cartTotal) cartTotal.textContent = fmt.format(subtotal + shipping);
  if (cartCount) cartCount.textContent = String(qtyCount);
  if (cartInfo) cartInfo.textContent = shipping === 0 ? "Envio gratis aplicado" : "Te faltan compras para envio gratis.";

  cartItems.querySelectorAll("button[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeFromCart(Number(button.dataset.remove)));
  });
  cartItems.querySelectorAll("button[data-minus]").forEach((button) => {
    button.addEventListener("click", () => updateQty(Number(button.dataset.minus), -1));
  });
  cartItems.querySelectorAll("button[data-plus]").forEach((button) => {
    button.addEventListener("click", () => updateQty(Number(button.dataset.plus), 1));
  });
  applyImageFallback(cartItems);
}

function renderDetail(product) {
  const mainImage = product.gallery[0] || product.imageUrl;

  detailRoot.innerHTML = `
    <article class="detail-card">
      <div>
        <img id="mainPhoto" class="detail-main-image" src="${mainImage}" alt="${product.name}" data-fallback="${buildImagePlaceholder(product)}" />
        <div class="thumb-grid">
          ${product.gallery
            .map(
              (src) =>
                `<button class="thumb-btn" data-photo="${src}"><img src="${src}" alt="${product.name}" data-fallback="${buildImagePlaceholder(
                  product
                )}" /></button>`
            )
            .join("")}
        </div>
      </div>

      <div>
        <p class="kicker">${product.category || "Producto"}</p>
        <h1>${product.name}</h1>
        <div class="price-wrap detail-price">
          <span class="price">${fmt.format(product.salePrice)}</span>
          <span class="old-price">${fmt.format(product.originalPrice)}</span>
          ${product.hasPromo ? `<span class="promo-badge">${product.promoText}</span>` : ""}
        </div>

        <h3 class="detail-subtitle">Colores disponibles</h3>
        <div class="color-chips">
          ${product.colors.map((color) => `<span class="color-chip">${color}</span>`).join("")}
        </div>

        <h3 class="detail-subtitle">Caracteristicas</h3>
        <ul class="detail-list">
          ${product.features.map((item) => `<li>${item}</li>`).join("")}
        </ul>

        <h3 class="detail-subtitle">Especificaciones</h3>
        <ul class="detail-list">
          ${product.specs.map((item) => `<li>${item}</li>`).join("")}
        </ul>

        <div class="detail-actions">
          <button id="addFromDetail" class="btn btn-soft" type="button">Agregar al carrito</button>
          <button id="buyFromDetail" class="btn btn-primary" type="button">Comprar ahora</button>
        </div>
      </div>
    </article>
  `;

  const mainPhotoEl = document.getElementById("mainPhoto");
  detailRoot.querySelectorAll("button[data-photo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mainPhotoEl.src = btn.dataset.photo;
    });
  });
  applyImageFallback(detailRoot);

  const addFromDetail = document.getElementById("addFromDetail");
  const buyFromDetail = document.getElementById("buyFromDetail");

  if (addFromDetail) {
    addFromDetail.addEventListener("click", () => {
      addToCart(product.id);
      openCart();
    });
  }

  if (buyFromDetail) {
    buyFromDetail.addEventListener("click", () => {
      addToCart(product.id);
      window.location.href = "checkout.html";
    });
  }

  applyReveal(detailRoot.querySelectorAll(".detail-card"));
}

function renderSimilar(products, currentId, forceLocalSource) {
  const list = products.filter((p) => Number(p.id) !== Number(currentId)).slice(0, 4);
  if (!list.length) {
    similarGrid.innerHTML = "<p>No hay productos similares en este momento.</p>";
    return;
  }

  similarGrid.innerHTML = list
    .map(
      (product) => `
      <article class="product-card">
        <a class="product-image-wrap" href="product.html?id=${product.id}${forceLocalSource ? "&source=local" : ""}">
          <img class="product-image" src="${product.imageUrl}" alt="${product.name}" data-fallback="${buildImagePlaceholder(product)}" />
          ${product.hasPromo ? `<span class="promo-badge">${product.promoText}</span>` : ""}
        </a>
        <div class="product-body">
          <h3>${product.name}</h3>
          <p>${product.category || "General"}</p>
          <div class="price-wrap">
            <span class="price">${fmt.format(Number(product.salePrice))}</span>
            <span class="old-price">${fmt.format(Number(product.originalPrice || product.salePrice))}</span>
          </div>
          <a class="btn btn-soft full" href="product.html?id=${product.id}${forceLocalSource ? "&source=local" : ""}">Ver detalle</a>
        </div>
      </article>
    `
    )
    .join("");

  applyImageFallback(similarGrid);
  applyReveal(similarGrid.querySelectorAll(".product-card"));
}

function createRevealObserver() {
  if (revealObserver) return revealObserver;
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );
  return revealObserver;
}

function applyReveal(nodes) {
  const observer = createRevealObserver();
  nodes.forEach((node) => {
    node.classList.add("reveal-up");
    observer.observe(node);
  });
}

async function submitCheckoutForm(event) {
  event.preventDefault();
  if (!checkoutForm) return;
  if (checkoutSubmitting) return;

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

  if (!customer.fullName || !customer.email || !customer.addressLine1 || !customer.city) {
    alert("Completa nombre, correo, direccion y ciudad.");
    return;
  }
  checkoutSubmitting = true;

  if (confirmCheckout) {
    confirmCheckout.disabled = true;
    confirmCheckout.textContent = "Procesando...";
  }

  persistProfile(customer);

  const payload = {
    customer,
    lines: state.cart.map((line) => {
      const product = getProductById(line.id);
      return {
        productId: line.id,
        qty: line.qty,
        name: product?.name || "Producto",
        unitPrice: Number(product?.salePrice || 0),
      };
    }),
    payment: {
      method: "Contraentrega",
      detail: "",
    },
  };
  let whatsappDispatched = false;
  const queueWhatsAppOpen = (url) => {
    if (whatsappDispatched || !url) return;
    whatsappDispatched = true;
    setTimeout(() => {
      openWhatsApp(url);
    }, 1100);
  };

  try {
    let response = await fetch(state.useFallback ? "/api/v1/orders/local" : "/api/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = await response.json();
    const subtotal = payload.lines.reduce((sum, line) => sum + Number(line.unitPrice || 0) * Number(line.qty || 0), 0);
    const shipping = subtotal >= 180000 ? 0 : 12000;
    const total = subtotal + shipping;
    if (!response.ok && !state.useFallback) {
      response = await fetch("/api/v1/orders/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await response.json();
      state.useFallback = response.ok;
    }

    if (!response.ok) {
      const fallbackUrl = buildFallbackWhatsAppUrl({
        customer,
        payment: payload.payment,
        lines: payload.lines,
      });
      state.cart = [];
      persistCart();
      renderCart();
      closeCheckoutModal();
      closeCart();
      showOrderSuccess({
        orderId: data.orderId || Date.now(),
        sentDirectly: false,
        whatsappUrl: fallbackUrl,
        total,
      });
      queueWhatsAppOpen(fallbackUrl);
      return;
    }

    if (data.paymentMode === "stripe" && data.paymentUrl) {
      window.location.href = data.paymentUrl;
      return;
    }

    const sentDirectly = Boolean(data.whatsappSent && data.whatsappDelivery === "cloud_api");
    if (!sentDirectly) {
      queueWhatsAppOpen(data.whatsappUrl);
    }

    state.cart = [];
    persistCart();
    renderCart();
    closeCheckoutModal();
    closeCart();
    showOrderSuccess({
      orderId: data.orderId,
      sentDirectly,
      whatsappUrl: data.whatsappUrl,
      total,
    });
  } catch (_error) {
    if (!whatsappDispatched) {
      const fallbackUrl = buildFallbackWhatsAppUrl({
        customer,
        payment: payload.payment,
        lines: payload.lines,
      });
      const subtotalFallback = payload.lines.reduce(
        (sum, line) => sum + Number(line.unitPrice || 0) * Number(line.qty || 0),
        0
      );
      const shippingFallback = subtotalFallback >= 180000 ? 0 : 12000;
      const totalFallback = subtotalFallback + shippingFallback;
      state.cart = [];
      persistCart();
      renderCart();
      closeCheckoutModal();
      closeCart();
      showOrderSuccess({
        orderId: Date.now(),
        sentDirectly: false,
        whatsappUrl: fallbackUrl,
        total: totalFallback,
      });
      queueWhatsAppOpen(fallbackUrl);
    }
  } finally {
    checkoutSubmitting = false;
    if (confirmCheckout) {
      confirmCheckout.disabled = false;
      confirmCheckout.textContent = "Ir a pagar";
    }
  }
}

async function bootstrap() {
  restoreCart();
  restoreProfile();

  await loadProductsPool();
  renderCart();

  const id = Number(qs("id"));
  const source = qs("source");

  if (!id) {
    detailRoot.innerHTML = "<p>Producto no encontrado.</p>";
    return;
  }

  let product = getProductById(id);
  if (!product && source === "local") {
    product = localCatalog.map(enrich).find((p) => Number(p.id) === id);
  }

  if (!product && !state.useFallback) {
    try {
      const response = await fetch(`/api/v1/products/${id}`);
      if (response.ok) {
        const apiProduct = await response.json();
        product = enrich(apiProduct);
      }
    } catch (_error) {
      // ignore
    }
  }

  if (!product) {
    detailRoot.innerHTML = "<p>No se pudo cargar el producto.</p>";
    return;
  }

  state.currentProduct = product;
  renderDetail(product);

  if (!state.products.length) {
    state.products = localCatalog.map(enrich);
  }

  renderSimilar(state.products, product.id, state.useFallback || source === "local");

  if (openCartBtn) openCartBtn.addEventListener("click", openCart);
  if (closeCartBtn) closeCartBtn.addEventListener("click", closeCart);
  if (cartOverlay) cartOverlay.addEventListener("click", closeCart);

  const checkoutBtn = document.getElementById("checkoutBtn");
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", () => {
      if (!state.cart.length) {
        alert("Tu carrito esta vacio.");
        return;
      }
      window.location.href = "checkout.html";
    });
  }

  if (checkoutForm) checkoutForm.addEventListener("submit", submitCheckoutForm);
  if (closeCheckoutBtn) closeCheckoutBtn.addEventListener("click", closeCheckoutModal);
  if (checkoutModal) {
    checkoutModal.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.closeCheckout === "true") {
        closeCheckoutModal();
      }
    });
  }
}

bootstrap();
