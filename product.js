const localCatalog = Array.isArray(window.GF_CATALOG) ? window.GF_CATALOG : [];
const fmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const STORAGE_CART_KEY = "gfshop_cart_v1";
const STORAGE_PROFILE_KEY = "gfshop_profile_v1";

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

let revealObserver = null;

function qs(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function normalizeText(value) {
  return (value || "").toString().trim().toLowerCase();
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

function enrich(product) {
  const local = findLocalByAny(product) || {};
  const salePrice = Number(product.salePrice || local.salePrice || 0);
  const originalPrice = Number(local.originalPrice || Math.round(salePrice * 1.25 / 1000) * 1000);
  const promoPercent = Math.max(0, Math.round(((originalPrice - salePrice) / originalPrice) * 100));

  return {
    ...product,
    id: Number(product.id),
    imageUrl: product.imageUrl || local.imageUrl,
    gallery: (local.gallery && local.gallery.length ? local.gallery : [product.imageUrl || local.imageUrl]).filter(Boolean),
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
    state.products = (data.items || []).map(enrich);
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
      <img class="cart-line-image" src="${product.imageUrl}" alt="${product.name}" />
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
}

function renderDetail(product) {
  const mainImage = product.gallery[0] || product.imageUrl;

  detailRoot.innerHTML = `
    <article class="detail-card">
      <div>
        <img id="mainPhoto" class="detail-main-image" src="${mainImage}" alt="${product.name}" />
        <div class="thumb-grid">
          ${product.gallery
            .map((src) => `<button class="thumb-btn" data-photo="${src}"><img src="${src}" alt="${product.name}" /></button>`)
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
          <img class="product-image" src="${product.imageUrl}" alt="${product.name}" />
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
  };

  try {
    let response = await fetch(state.useFallback ? "/api/v1/orders/local" : "/api/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = await response.json();
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
      alert(data.message || "No fue posible crear la orden");
      return;
    }

    if (data.paymentMode === "stripe" && data.paymentUrl) {
      window.location.href = data.paymentUrl;
      return;
    }

    if (data.whatsappUrl) {
      window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    }

    alert(`Orden #${data.orderId} creada. ${data.message || "Pago pendiente."}`);
    state.cart = [];
    persistCart();
    renderCart();
    closeCheckoutModal();
    closeCart();
  } finally {
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
