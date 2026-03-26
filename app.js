const localCatalog = Array.isArray(window.GF_CATALOG) ? window.GF_CATALOG : [];

const state = {
  search: "",
  category: "all",
  promoOnly: false,
  cart: [],
  products: [],
  allProducts: [],
  useFallback: false,
};

const STORAGE_CART_KEY = "gfshop_cart_v1";
const STORAGE_PROFILE_KEY = "gfshop_profile_v1";
const MASTER_CATEGORIES = [
  "Hogar",
  "Tecnología",
  "Bienestar",
  "Cocina",
  "Moda",
  "Aseo",
  "Deporte",
  "Oficina",
  "Mascotas",
  "Accesorios",
  "Bebes",
  "Automotriz",
];

const fmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const productsGrid = document.getElementById("productsGrid");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const categoryFilter = document.getElementById("categoryFilter");
const promoOnly = document.getElementById("promoOnly");
const cartItems = document.getElementById("cartItems");
const cartSubtotal = document.getElementById("cartSubtotal");
const cartShipping = document.getElementById("cartShipping");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const cartDrawer = document.getElementById("cartDrawer");
const cartOverlay = document.getElementById("cartOverlay");
const cartInfo = document.getElementById("cartInfo");
const openCartBtn = document.getElementById("openCart");
const checkoutModal = document.getElementById("checkoutModal");
const checkoutForm = document.getElementById("checkoutForm");
const confirmCheckout = document.getElementById("confirmCheckout");
let revealObserver = null;
let feedbackToast = null;

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
  const originalPrice = Number(local.originalPrice || Math.round(salePrice * 1.25 / 1000) * 1000);
  const discount = Math.max(0, Math.round(((originalPrice - salePrice) / originalPrice) * 100));

  return {
    ...product,
    id: Number(product.id),
    imageUrl: product.imageUrl || local.imageUrl,
    salePrice,
    originalPrice,
    promoText: discount > 0 ? `${discount}% OFF` : "PROMO",
    hasPromo: discount >= 8,
    colors: Array.isArray(local.colors) ? local.colors : [],
    gallery: Array.isArray(local.gallery) && local.gallery.length ? local.gallery : [product.imageUrl || local.imageUrl],
    features: Array.isArray(local.features) ? local.features : [],
    specs: Array.isArray(local.specs) ? local.specs : [],
  };
}

function filterProducts(list) {
  return list.filter((p) => {
    const byCategory = state.category === "all" || p.category === state.category;
    const bySearch = normalizeText(p.name).includes(normalizeText(state.search));
    const byPromo = !state.promoOnly || p.hasPromo;
    return byCategory && bySearch && byPromo;
  });
}

function fillCategoriesFrom(list) {
  const detected = [...new Set(list.map((p) => p.category).filter(Boolean))];
  const categories = [...new Set([...MASTER_CATEGORIES, ...detected])];
  categoryFilter.innerHTML = '<option value="all">Todas las categorias</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
}

async function loadAllProducts() {
  try {
    const response = await fetch("/api/v1/catalog?limit=220");
    if (!response.ok) throw new Error("all products unavailable");
    const data = await response.json();
    state.allProducts = (data.items || []).map(enrichProduct);
  } catch (_error) {
    state.useFallback = true;
    state.allProducts = localCatalog.map(enrichProduct);
  }
}

async function fetchProducts() {
  const source = state.allProducts.length ? state.allProducts : localCatalog.map(enrichProduct);
  state.products = filterProducts(source);
}

async function initCategories() {
  const source = state.allProducts.length ? state.allProducts : localCatalog.map(enrichProduct);
  fillCategoriesFrom(source);
}

function getProductById(productId) {
  return (
    state.allProducts.find((p) => Number(p.id) === Number(productId)) ||
    state.products.find((p) => Number(p.id) === Number(productId))
  );
}

function persistCart() {
  try {
    localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(state.cart));
  } catch (_error) {
    // ignore storage issues
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
    // ignore storage issues
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
    // ignore bad data
  }
}

function addToCart(productId, triggerButton) {
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
  applyAddButtonFeedback(triggerButton);
  animateAddToCart(triggerButton);
  showAddToast(product.name);
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

function productLink(product) {
  return `product.html?id=${product.id}${state.useFallback ? "&source=local" : ""}`;
}

function renderProducts() {
  productsGrid.innerHTML = "";

  if (!state.products.length) {
    productsGrid.innerHTML = '<p>No encontramos productos con ese filtro.</p>';
    return;
  }

  state.products.forEach((product, index) => {
    const lowStock = Number(product.stock) <= 5;
    const card = document.createElement("article");
    card.className = "product-card";
    card.style.animationDelay = `${index * 45}ms`;

    const colorsText = product.colors.length ? product.colors.slice(0, 3).join(" · ") : "Color unico";

    card.innerHTML = `
      <a class="product-image-wrap" href="${productLink(product)}">
        <img class="product-image" src="${product.imageUrl}" alt="${product.name}" />
        ${product.hasPromo ? `<span class="promo-badge">${product.promoText}</span>` : ""}
      </a>
      <div class="product-body">
        <h3>${product.name}</h3>
        <p>${product.category || "General"}</p>
        <div class="price-wrap">
          <span class="price">${fmt.format(Number(product.salePrice))}</span>
          <span class="old-price">${fmt.format(Number(product.originalPrice))}</span>
        </div>
        <div class="product-meta">
          <span>${colorsText}</span>
          <span class="${lowStock ? "stock-low" : ""}">Stock: ${product.stock}</span>
        </div>
        <div class="card-actions">
          <a class="btn btn-soft" href="${productLink(product)}">Ver detalle</a>
          <button class="btn btn-primary" data-id="${product.id}">Agregar</button>
        </div>
      </div>
    `;

    productsGrid.appendChild(card);
  });

  productsGrid.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", () => addToCart(Number(button.dataset.id), button));
  });

  applyReveal(productsGrid.querySelectorAll(".product-card"));
}

function renderCart() {
  cartItems.innerHTML = "";

  if (!state.cart.length) {
    cartItems.innerHTML = "<p>Tu carrito esta vacio.</p>";
    if (cartSubtotal) cartSubtotal.textContent = fmt.format(0);
    if (cartShipping) cartShipping.textContent = fmt.format(0);
    cartTotal.textContent = fmt.format(0);
    cartCount.textContent = "0";
    cartInfo.textContent = "Tu carrito se guarda automaticamente.";
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
  cartTotal.textContent = fmt.format(subtotal + shipping);
  cartCount.textContent = String(qtyCount);
  cartInfo.textContent = shipping === 0 ? "Envio gratis aplicado" : "Te faltan compras para envio gratis.";

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

async function reloadProducts() {
  await fetchProducts();
  renderProducts();
  renderCart();
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

function ensureToast() {
  if (feedbackToast) return feedbackToast;
  feedbackToast = document.createElement("div");
  feedbackToast.className = "add-toast";
  document.body.appendChild(feedbackToast);
  return feedbackToast;
}

function showAddToast(productName) {
  const toast = ensureToast();
  toast.textContent = `${productName} agregado al carrito`;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1300);
  if (openCartBtn) {
    openCartBtn.classList.add("cart-pop");
    setTimeout(() => openCartBtn.classList.remove("cart-pop"), 360);
  }
}

function animateAddToCart(triggerButton) {
  if (!triggerButton || !openCartBtn) return;
  const card = triggerButton.closest(".product-card");
  const img = card ? card.querySelector(".product-image") : null;
  if (!img) return;

  const start = img.getBoundingClientRect();
  const end = openCartBtn.getBoundingClientRect();
  const flyer = document.createElement("img");
  flyer.src = img.src;
  flyer.className = "fly-item";
  flyer.style.left = `${start.left + start.width / 2 - 18}px`;
  flyer.style.top = `${start.top + start.height / 2 - 18}px`;
  flyer.style.setProperty("--dx", `${end.left - start.left}px`);
  flyer.style.setProperty("--dy", `${end.top - start.top}px`);
  document.body.appendChild(flyer);
  setTimeout(() => flyer.remove(), 700);
}

function applyAddButtonFeedback(triggerButton) {
  if (!triggerButton) return;
  triggerButton.classList.add("btn-clicked");
  setTimeout(() => triggerButton.classList.remove("btn-clicked"), 180);

  const originalText = triggerButton.dataset.originalText || triggerButton.textContent;
  triggerButton.dataset.originalText = originalText;
  triggerButton.textContent = "Agregado ✓";
  triggerButton.classList.add("btn-added");
  triggerButton.disabled = true;
  setTimeout(() => {
    triggerButton.textContent = originalText;
    triggerButton.classList.remove("btn-added");
    triggerButton.disabled = false;
  }, 900);
}

function showOrderStatusFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const orderStatus = params.get("order_status");
  const orderId = params.get("order_id");

  if (orderStatus === "success") {
    alert(`Pago exitoso. Orden #${orderId || ""} confirmada.`);
  }

  if (orderStatus === "cancel") {
    alert(`Pago cancelado${orderId ? ` para orden #${orderId}` : ""}. Puedes intentarlo de nuevo.`);
  }
}

function applyCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get("cat");
  if (!cat) return;
  state.category = cat === "all" ? "all" : cat;
}

async function checkout() {
  if (!state.cart.length) {
    alert("Tu carrito esta vacio.");
    return;
  }
  persistCart();
  window.location.href = "checkout.html";
}

async function submitCheckoutForm(event) {
  event.preventDefault();
  if (!checkoutForm) return;

  const formData = new FormData(checkoutForm);
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const addressLine1 = String(formData.get("addressLine1") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const postalCode = String(formData.get("postalCode") || "").trim();

  if (!fullName || !email || !addressLine1 || !city) {
    alert("Completa nombre, correo, direccion y ciudad.");
    return;
  }

  if (confirmCheckout) {
    confirmCheckout.disabled = true;
    confirmCheckout.textContent = "Procesando...";
  }

  const customer = {
    fullName,
    email,
    phone: phone || undefined,
    addressLine1,
    city,
    postalCode: postalCode || undefined,
    country: "Colombia",
  };
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
    closeCheckoutModal();
    await reloadProducts();
    cartDrawer.classList.remove("open");
    cartDrawer.setAttribute("aria-hidden", "true");
  } finally {
    if (confirmCheckout) {
      confirmCheckout.disabled = false;
      confirmCheckout.textContent = "Ir a pagar";
    }
  }
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

searchInput.addEventListener("input", async (event) => {
  state.search = event.target.value;
  if (clearSearch) {
    clearSearch.classList.toggle("visible", state.search.trim().length > 0);
  }
  await reloadProducts();
});

if (clearSearch) {
  clearSearch.addEventListener("click", async () => {
    state.search = "";
    searchInput.value = "";
    clearSearch.classList.remove("visible");
    await reloadProducts();
  });
}

categoryFilter.addEventListener("change", async (event) => {
  state.category = event.target.value;
  await reloadProducts();
});

if (promoOnly) {
  promoOnly.addEventListener("change", async (event) => {
    state.promoOnly = event.target.checked;
    await reloadProducts();
  });
}

document.getElementById("openCart").addEventListener("click", () => {
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
  if (cartOverlay) cartOverlay.classList.add("open");
});

document.getElementById("closeCart").addEventListener("click", () => {
  cartDrawer.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
  if (cartOverlay) cartOverlay.classList.remove("open");
});

if (cartOverlay) {
  cartOverlay.addEventListener("click", () => {
    cartDrawer.classList.remove("open");
    cartDrawer.setAttribute("aria-hidden", "true");
    cartOverlay.classList.remove("open");
  });
}

document.getElementById("checkoutBtn").addEventListener("click", checkout);

if (checkoutForm) {
  checkoutForm.addEventListener("submit", submitCheckoutForm);
}

const closeCheckoutBtn = document.getElementById("closeCheckout");
if (closeCheckoutBtn) {
  closeCheckoutBtn.addEventListener("click", closeCheckoutModal);
}

if (checkoutModal) {
  checkoutModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeCheckout === "true") {
      closeCheckoutModal();
    }
  });
}

(async function bootstrap() {
  showOrderStatusFromUrl();
  applyCategoryFromUrl();
  applyReveal(document.querySelectorAll(".hero-market, .catalog-section"));
  restoreCart();
  restoreProfile();
  await loadAllProducts();
  await initCategories();
  if (categoryFilter) categoryFilter.value = state.category;
  await reloadProducts();
})();
