const WA_PHONE = "573107831196";
const PRODUCT_NAME = "Teclado Portatil Plegable Bluetooth";
const UNIT_PRICE = 79900;

const form = document.getElementById("starOrderForm");
const orderBtn = document.getElementById("starOrderBtn");
const hint = document.getElementById("starOrderHint");
const totalEl = document.getElementById("starTotal");
const mainImage = document.getElementById("starMainImage");
const thumbs = Array.from(document.querySelectorAll(".star-thumb"));
const prevMediaBtn = document.getElementById("starMediaPrev");
const nextMediaBtn = document.getElementById("starMediaNext");
const checkoutReveal = document.getElementById("starCheckoutReveal");
const revealCheckoutTriggers = Array.from(document.querySelectorAll("[data-reveal-checkout]"));
const mobileBuyBar = document.querySelector(".mobile-buy-bar");

let submitting = false;
let launchLockUntil = 0;
let successPanel = null;
let currentMediaIndex = Math.max(0, thumbs.findIndex((thumb) => thumb.classList.contains("active")));

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function setHint(text, isError = false) {
  if (!hint) return;
  hint.textContent = text;
  hint.style.color = isError ? "#8f2a24" : "";
}

function openWhatsApp(url) {
  if (!url) return false;
  const now = Date.now();
  if (now < launchLockUntil) return true;
  launchLockUntil = now + 8000;
  const win = window.open(url, "_blank", "noopener,noreferrer");
  return Boolean(win);
}

function calcTotal(qty) {
  return Math.max(1, Number(qty || 1)) * UNIT_PRICE;
}

function updateTotal() {
  const qty = Number(form?.elements?.qty?.value || 1);
  const total = calcTotal(qty);
  if (totalEl) totalEl.textContent = `${money.format(total)} COP`;
}

function revealCheckout() {
  if (!checkoutReveal) return;
  checkoutReveal.classList.add("visible");
  const launchBtn = document.getElementById("showStarCheckoutBtn");
  if (launchBtn) {
    launchBtn.disabled = true;
    launchBtn.textContent = "Formulario habilitado";
  }
  if (mobileBuyBar) {
    mobileBuyBar.classList.add("is-hidden");
  }
  window.setTimeout(() => {
    form?.elements?.fullName?.focus();
  }, 320);
}

function showMediaByIndex(index) {
  if (!thumbs.length) return;
  const last = thumbs.length - 1;
  if (index < 0) index = last;
  if (index > last) index = 0;
  currentMediaIndex = index;

  const thumb = thumbs[index];
  const image = thumb.dataset.image;
  if (mainImage && image) mainImage.src = image;

  thumbs.forEach((btn) => btn.classList.remove("active"));
  thumb.classList.add("active");
}

function ensureSuccessPanel() {
  if (successPanel) return successPanel;
  successPanel = document.createElement("section");
  successPanel.className = "order-success-panel";
  successPanel.innerHTML = `
    <div class="order-success-card">
      <div class="success-burst"></div>
      <div class="success-check">&#10003;</div>
      <p class="success-kicker">Compra confirmada</p>
      <h2 id="successTitle">Pedido listo</h2>
      <p id="successBody">Tu pedido fue registrado correctamente.</p>
      <ul id="successOrderDetails" class="success-order-list"></ul>
      <p class="success-note"><span aria-hidden="true">&#9201;</span> Estamos preparando tu entrega contraentrega.</p>
      <div class="success-actions">
        <a id="successWaLink" class="btn btn-primary" href="#" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
        <a class="btn btn-soft" href="index.html">Ir a la tienda</a>
      </div>
    </div>
  `;
  document.body.appendChild(successPanel);
  return successPanel;
}

function showSuccess(orderId, total, waUrl, details = []) {
  const panel = ensureSuccessPanel();
  const title = panel.querySelector("#successTitle");
  const body = panel.querySelector("#successBody");
  const waLink = panel.querySelector("#successWaLink");
  const detailList = panel.querySelector("#successOrderDetails");

  if (title) title.textContent = `Pedido #${orderId} confirmado`;
  if (body) body.textContent = `Total ${money.format(total)} COP. En un momento abriremos WhatsApp para finalizar.`;
  if (waLink) waLink.href = waUrl;
  if (detailList) {
    detailList.innerHTML = details.map((line) => `<li>${line}</li>`).join("");
  }
  panel.classList.add("show");
}

function buildWaMessage({ orderId, fullName, phone, addressLine1, city, qty, total, note }) {
  return (
    `Hola, nuevo pedido GF Shop #${orderId}\n\n` +
    `Producto: ${PRODUCT_NAME}\n` +
    `Cantidad: ${qty}\n` +
    `Precio unitario: ${UNIT_PRICE.toLocaleString("es-CO")} COP\n` +
    `Total: ${total.toLocaleString("es-CO")} COP\n` +
    `Metodo de pago: Contraentrega\n\n` +
    `Cliente: ${fullName}\n` +
    `Telefono: ${phone}\n` +
    `Direccion: ${addressLine1}, ${city}\n` +
    `Nota: ${note || "N/A"}`
  );
}

async function submitOrder(event) {
  event.preventDefault();
  if (submitting || !form) return;

  const fullName = String(form.elements.fullName.value || "").trim();
  const phone = String(form.elements.phone.value || "").trim();
  const addressLine1 = String(form.elements.addressLine1.value || "").trim();
  const city = String(form.elements.city.value || "").trim();
  const qty = Math.max(1, Number(form.elements.qty.value || 1));
  const note = String(form.elements.note.value || "").trim();

  if (!fullName || !phone || !addressLine1 || !city) {
    setHint("Completa nombre, telefono, direccion y ciudad para continuar.", true);
    return;
  }

  submitting = true;
  setHint("Procesando tu pedido...");
  if (orderBtn) {
    orderBtn.disabled = true;
    orderBtn.textContent = "Confirmando...";
  }

  const total = calcTotal(qty);
  const orderId = Date.now();
  const message = buildWaMessage({ orderId, fullName, phone, addressLine1, city, qty, total, note });
  const waUrl = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(message)}`;
  const details = [
    `Producto: ${PRODUCT_NAME}`,
    `Cantidad: ${qty}`,
    `Metodo de pago: Contraentrega`,
    `Entrega: ${addressLine1}, ${city}`,
    `Contacto: ${phone}`,
  ];

  showSuccess(orderId, total, waUrl, details);
  setTimeout(() => {
    const opened = openWhatsApp(waUrl);
    if (!opened) {
      setHint("No pudimos abrir WhatsApp automaticamente. Habilita popups y usa el boton en pantalla.", true);
    } else {
      setHint("Listo: pedido confirmado y WhatsApp abierto.");
    }
  }, 1200);

  if (orderBtn) {
    orderBtn.disabled = false;
    orderBtn.textContent = "Confirmar compra contraentrega";
  }
  submitting = false;
}

thumbs.forEach((thumb) => {
  thumb.addEventListener("click", () => {
    const index = thumbs.indexOf(thumb);
    showMediaByIndex(index);
  });
});

if (prevMediaBtn) {
  prevMediaBtn.addEventListener("click", () => {
    showMediaByIndex(currentMediaIndex - 1);
  });
}

if (nextMediaBtn) {
  nextMediaBtn.addEventListener("click", () => {
    showMediaByIndex(currentMediaIndex + 1);
  });
}

if (form) {
  form.addEventListener("submit", submitOrder);
  const qtyInput = form.elements.qty;
  if (qtyInput) qtyInput.addEventListener("input", updateTotal);
}

revealCheckoutTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => {
    revealCheckout();
  });
});

updateTotal();
showMediaByIndex(currentMediaIndex);
