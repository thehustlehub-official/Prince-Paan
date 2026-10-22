
"use strict";

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const FALLBACK_CATEGORIES = [
    { id: "all", name: "All", icon: "fa-border-all", sort_order: 0 }
  ];

  const state = {
    products: [],
    categories: FALLBACK_CATEGORIES,
    videos: [],
    settings: {
      store_name: "PRINCE PAAN",
      is_open: true,
      closed_message: "We are currently closed and are not accepting orders. Please visit us again soon.",
      logo_url: "",
      whatsapp_number: "918384019015",
      google_reviews_url: ""
    },
    cart: {},
    selectedCategory: "all",
    activeProduct: null,
    detailQty: 1,
    view: "menuPage",
    overlayStack: [],
    loading: false,
    lastNavScroll: 0,
    toastTimer: null
  };

  const CUSTOMER_KEY = "prince_paan_customer_v1";
  const CART_KEY = "prince_paan_cart_v1";

  function money(value) {
    const amount = Number(value);
    return "₹" + (Number.isFinite(amount) ? amount : 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2
    });
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function safeImageURL(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    try {
      const parsed = new URL(url, window.location.href);
      if (["http:", "https:"].includes(parsed.protocol)) return parsed.href;
    } catch (_) {}
    return "";
  }

  function imageMarkup(url, alt, className = "") {
    const safeURL = safeImageURL(url);
    const fallback = "this.onerror=null;this.style.display='none';";
    return safeURL
      ? `<img class="${className}" src="${escapeHTML(safeURL)}" alt="${escapeHTML(alt)}" loading="lazy" onerror="${fallback}">`
      : `<span class="${className} image-fallback" aria-label="${escapeHTML(alt)}"><i class="fa-solid fa-leaf"></i></span>`;
  }

  function getClient() {
    return window.supabaseReady ? window.supabaseClient : null;
  }

  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function showError(message) {
    console.error(message);
    toast(message);
  }

  function readCustomer() {
    try {
      const data = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "{}");
      return {
        name: typeof data.name === "string" ? data.name.slice(0, 100) : "",
        phone: typeof data.phone === "string" ? data.phone.slice(0, 15) : ""
      };
    } catch (_) {
      return { name: "", phone: "" };
    }
  }

  function saveCustomer(name, phone) {
    try {
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify({
        name: name.trim().slice(0, 100),
        phone: phone.trim().slice(0, 15)
      }));
    } catch (_) {
      toast("Your browser could not save customer details.");
    }
  }

  function loadCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "{}");
      const cleaned = {};
      for (const [id, qty] of Object.entries(parsed)) {
        const product = state.products.find(p => String(p.id) === String(id));
        const quantity = Math.floor(Number(qty));
        if (product && product.available && quantity > 0 && quantity <= 99) {
          cleaned[id] = quantity;
        }
      }
      state.cart = cleaned;
    } catch (_) {
      state.cart = {};
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    } catch (_) {}
  }

  function categoryName(id) {
    const category = state.categories.find(c => String(c.id) === String(id));
    return category?.name || "Our collection";
  }

  function isStoreOpen() {
    return state.settings.is_open !== false;
  }

  function cartItems() {
    return Object.entries(state.cart)
      .map(([id, quantity]) => {
        const product = state.products.find(p => String(p.id) === String(id));
        return product ? { product, quantity } : null;
      })
      .filter(Boolean);
  }

  function cartCount() {
    return cartItems().reduce((sum, item) => sum + item.quantity, 0);
  }

  function cartTotal() {
    return cartItems().reduce((sum, item) => {
      return sum + (Number(item.product.price) || 0) * item.quantity;
    }, 0);
  }

  function updateCartBadge() {
    const badge = $("#cartBadge");
    const count = cartCount();
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("hidden", count === 0);
  }

  function updateStoreStatus() {
  const status = $("#storeStatus");
  const text = $("#storeStatusText");
  const open = isStoreOpen();

  if (status) status.classList.toggle("closed", !open);
  if (text) text.textContent = open ? "Store is open" : "Store is closed";

  const message = state.settings.closed_message ||
    "You can explore our menu, but ordering will be available when the store opens.";

  const closedMessage = $("#closedMessage");
  if (closedMessage) closedMessage.textContent = message;

  // Update the customer-facing closed popup automatically.
  const popup = $("#closedOverlay");

  if (popup && !open && !state.closedPopupShown) {
    state.closedPopupShown = true;
    openOverlay("closedOverlay");
  }

  // Allow the popup to appear again after the store reopens
  // and is subsequently closed.
  if (open) {
    state.closedPopupShown = false;

    if (popup && !popup.classList.contains("hidden")) {
      closeOverlay("closedOverlay");
    }
  }
}

  function renderCategories() {
    const strip = $("#categoryStrip");
    const categories = state.categories.filter(c => c.active !== false);
    const all = `<button class="category-chip ${state.selectedCategory === "all" ? "active" : ""}" data-category="all"><i class="fa-solid fa-border-all"></i><span>All</span></button>`;

    strip.innerHTML = all + categories.map(category => {
      const id = String(category.id);
      const icon = /^fa-[a-z0-9-]+$/.test(category.icon || "")
        ? category.icon : "fa-leaf";
      return `<button class="category-chip ${state.selectedCategory === id ? "active" : ""}" data-category="${escapeHTML(id)}">
        <i class="fa-solid ${escapeHTML(icon)}"></i>
        <span>${escapeHTML(category.name)}</span>
      </button>`;
    }).join("");
  }

  function visibleProducts() {
    return state.products.filter(product => {
      if (!product.available || product.visibility === "hidden") return false;
      return state.selectedCategory === "all" ||
        String(product.category_id) === String(state.selectedCategory);
    });
  }

  function productCard(product) {
    const category = categoryName(product.category_id);
    return `<article class="product-card" data-detail="${escapeHTML(product.id)}" tabindex="0" role="button" aria-label="View ${escapeHTML(product.name)}">
      <div class="product-image">
        ${imageMarkup(product.image_url, product.name)}
        ${product.featured ? '<span class="product-featured"><i class="fa-solid fa-star"></i> Favourite</span>' : ""}
      </div>
      <div class="product-info">
        <div class="product-category">${escapeHTML(category)}</div>
        <h3>${escapeHTML(product.name)}</h3>
        <p class="product-description">${escapeHTML(product.description || "")}</p>
        <div class="product-card-bottom">
          <strong class="product-price">${money(product.price)}</strong>
          <button class="add-button" data-add="${escapeHTML(product.id)}" aria-label="Add ${escapeHTML(product.name)} to cart">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>
    </article>`;
  }

  function renderProducts() {
    const products = visibleProducts();
    $("#resultCount").textContent = `${products.length} items`;
    $("#productGrid").innerHTML = products.length
      ? products.map(productCard).join("")
      : `<div class="empty-state"><i class="fa-solid fa-leaf"></i><h3>No items found</h3><p>Try another category or come back later.</p></div>`;
  }

  function renderRecommendations() {
    const section = $("#recommendSection");
    const featured = state.products.filter(p =>
      p.available && p.visibility !== "hidden" && p.featured
    );

    if (!featured.length) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    const makeCard = p => `<article class="recommend-card" data-detail="${escapeHTML(p.id)}" tabindex="0" role="button" aria-label="View ${escapeHTML(p.name)}">
      <div class="recommend-image">
        ${imageMarkup(p.image_url, p.name)}
        <span class="recommend-tag"><i class="fa-solid fa-star"></i> IN-HOUSE PICK</span>
      </div>
      <div class="recommend-info"><h3>${escapeHTML(p.name)}</h3><strong>${money(p.price)}</strong></div>
    </article>`;

    const track = $("#recommendTrack");
    track.classList.remove("is-scrolling");
    track.innerHTML = featured.map(makeCard).join("");

    if (featured.length > 1) {
      track.innerHTML += featured.map(makeCard).join("");
      requestAnimationFrame(() => {
        const halfWidth = track.scrollWidth / 2;
        if (halfWidth > 0) {
          track.style.setProperty("--scroll-duration", `${Math.max(18, halfWidth / 35)}s`);
          track.classList.add("is-scrolling");
        }
      });
    }
  }

  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    const results = state.products.filter(p =>
      p.available && p.visibility !== "hidden" &&
      (!q || `${p.name} ${p.description} ${categoryName(p.category_id)}`.toLowerCase().includes(q))
    );

    $("#searchResults").innerHTML = results.length
      ? results.map(p => `<article class="search-result" data-search-detail="${escapeHTML(p.id)}" tabindex="0" role="button">
          ${imageMarkup(p.image_url, p.name)}
          <div class="search-result-info">
            <h3>${escapeHTML(p.name)}</h3>
            <p>${escapeHTML(categoryName(p.category_id))}</p>
            <strong>${money(p.price)}</strong>
          </div>
          <i class="fa-solid fa-chevron-right muted-text"></i>
        </article>`).join("")
      : `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><h3>No matches found</h3><p>Try a different product or category name.</p></div>`;
  }

  function openProduct(id) {
    const product = state.products.find(p => String(p.id) === String(id));
    if (!product) {
      toast("This product is no longer available.");
      return;
    }

    state.activeProduct = product;
    state.detailQty = Math.max(1, Number(state.cart[product.id]) || 1);
    renderProductDetail();
    openOverlay("productOverlay");
  }

  function renderProductDetail() {
    const p = state.activeProduct;
    if (!p) return;

    $("#productDetailContent").innerHTML = `
      ${imageMarkup(p.image_url, p.name, "detail-hero-image")}
      <div class="detail-content">
        <span class="detail-category">${escapeHTML(categoryName(p.category_id))}</span>
        <h1>${escapeHTML(p.name)}</h1>
        <div class="detail-price">${money(p.price)}</div>
        <p class="detail-description">${escapeHTML(p.description || "A special selection from Prince Paan.")}</p>
        <div class="detail-actions">
          <div class="quantity-control">
            <button type="button" id="detailMinus" aria-label="Decrease quantity"><i class="fa-solid fa-minus"></i></button>
            <strong id="detailQty">${state.detailQty}</strong>
            <button type="button" id="detailPlus" aria-label="Increase quantity"><i class="fa-solid fa-plus"></i></button>
          </div>
          <button type="button" id="detailAdd" class="primary-button">
            <span>Add · ${money((Number(p.price) || 0) * state.detailQty)}</span>
            <i class="fa-solid fa-bag-shopping"></i>
          </button>
        </div>
        ${!isStoreOpen() ? '<p class="muted-text" style="margin-top:18px"><i class="fa-solid fa-circle-info"></i> The store is closed. You can browse, but cannot place an order.</p>' : ""}
      </div>`;
  }

  function changeDetailQty(amount) {
    state.detailQty = Math.min(99, Math.max(1, state.detailQty + amount));
    $("#detailQty").textContent = state.detailQty;
    $("#detailAdd span").textContent =
      `Add · ${money((Number(state.activeProduct?.price) || 0) * state.detailQty)}`;
  }

  function addToCart(id, quantity = 1) {
    if (!isStoreOpen()) {
      toast("The store is closed. You can browse the menu.");
      return;
    }

    const product = state.products.find(p => String(p.id) === String(id));
    if (!product || !product.available || product.visibility === "hidden") {
      toast("This item is currently unavailable.");
      return;
    }

    const key = String(product.id);
    const next = (Number(state.cart[key]) || 0) + Math.floor(Number(quantity) || 1);

    if (next > 99) {
      toast("Maximum quantity reached.");
      return;
    }

    state.cart[key] = next;
    saveCart();
    updateCartBadge();
    renderCart();
    toast(`${product.name} added to your cart.`);
  }

  function setCartQty(id, quantity) {
    const key = String(id);
    const product = state.products.find(p => String(p.id) === key);
    if (!product) return;

    if (quantity <= 0) delete state.cart[key];
    else if (quantity <= 99) state.cart[key] = quantity;

    saveCart();
    updateCartBadge();
    renderCart();
  }

  function renderCart() {
    const items = cartItems();
    const target = $("#cartContent");

    if (!items.length) {
      target.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bag-shopping"></i><h3>Your cart is waiting</h3><p>Discover something you love and add it here.</p><button class="primary-button" style="margin:20px auto 0" data-view="menuPage">Explore menu <i class="fa-solid fa-arrow-right"></i></button></div>`;
      return;
    }

    target.innerHTML = `<div class="cart-layout">
      <div class="cart-items">
        ${items.map(({product:p,quantity}) => `<article class="cart-row">
          ${imageMarkup(p.image_url,p.name)}
          <div class="cart-row-info">
            <h3>${escapeHTML(p.name)}</h3>
            <strong>${money(Number(p.price) * quantity)}</strong>
            <div class="quantity-control" style="margin-top:8px;width:max-content">
              <button data-qty="${escapeHTML(p.id)}" data-change="-1" aria-label="Decrease"><i class="fa-solid fa-minus"></i></button>
              <strong>${quantity}</strong>
              <button data-qty="${escapeHTML(p.id)}" data-change="1" aria-label="Increase"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
          <button class="icon-button" data-remove="${escapeHTML(p.id)}" aria-label="Remove ${escapeHTML(p.name)}"><i class="fa-regular fa-trash-can"></i></button>
        </article>`).join("")}
      </div>
      <div class="cart-summary">
        <div class="cart-total-row"><span>Subtotal</span><strong>${money(cartTotal())}</strong></div>
        <div class="cart-actions">
          <button class="primary-button full-button" id="checkoutStart" ${!isStoreOpen() ? "disabled" : ""}>
            ${isStoreOpen() ? "Continue to details" : "Store closed"}
            <i class="fa-solid fa-arrow-right"></i>
          </button>
          ${!isStoreOpen() ? `<p class="muted-text">Ordering is disabled until the store opens.</p>` : ""}
          <button class="secondary-button" data-clear-cart>Clear cart</button>
        </div>
      </div>
    </div>`;
  }

  function openCheckout() {
    if (!isStoreOpen()) {
      toast("The store is closed and is not accepting orders.");
      return;
    }

    if (!cartItems().length) {
      toast("Your cart is empty.");
      return;
    }

    const customer = readCustomer();
    $("#customerName").value = customer.name;
    $("#customerPhone").value = customer.phone;
    $("#specialRequest").value = "";
    $("#checkoutTotal").textContent = money(cartTotal());
    $("#checkoutSummary").innerHTML = cartItems().map(({product,quantity}) =>
      `<div class="checkout-summary-row"><span>${escapeHTML(product.name)} × ${quantity}</span><strong>${money(Number(product.price) * quantity)}</strong></div>`
    ).join("");

    $("#placeOrderButton").disabled = false;
    $("#placeOrderButton").innerHTML = "<span>Place order</span><i class='fa-solid fa-arrow-right'></i>";
    openOverlay("checkoutOverlay");
  }


const ORDER_WHATSAPP_NUMBER = "918384019015";

function openOrderWhatsApp({ name, phone, items, total, specialRequest }) {
  const itemLines = items.map(({ product, quantity }) => {
    const price = Number(product.price) || 0;
    return `${product.name} x ${quantity} = Rs. ${(price * quantity).toFixed(2)}`;
  });

  const message = [
    "NEW PRINCE PAAN ORDER",
    "",
    `Customer: ${name}`,
    `Phone: ${phone}`,
    "",
    "ORDER ITEMS:",
    ...itemLines,
    "",
    `TOTAL: Rs. ${Number(total).toFixed(2)}`,
    ...(specialRequest ? ["", `Special request: ${specialRequest}`] : []),
    "",
    "Please confirm this order."
  ].join("\n");

  const url =
    `https://wa.me/${ORDER_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  window.location.href = url;
}

  async function submitCheckout(event) {
    event.preventDefault();

    if (!isStoreOpen()) {
      closeOverlay("checkoutOverlay");
      toast("The store has closed. Your order was not submitted.");
      return;
    }

    const name = $("#customerName").value.trim();
    const phone = $("#customerPhone").value.trim();
    const specialRequest = $("#specialRequest").value.trim();
    const items = cartItems();

    if (name.length < 2) {
      toast("Please enter your name.");
      $("#customerName").focus();
      return;
    }

    if (!/^[+\d][\d\s()-]{7,14}$/.test(phone)) {
      toast("Please enter a valid phone number.");
      $("#customerPhone").focus();
      return;
    }

    if (!items.length) {
      toast("Your cart is empty.");
      closeOverlay("checkoutOverlay");
      return;
    }

    const client = getClient();
    if (!client) {
      toast("Connection unavailable. Please try again when online.");
      return;
    }

    const button = $("#placeOrderButton");
    button.disabled = true;
    button.innerHTML = "<span>Submitting...</span><i class='fa-solid fa-spinner fa-spin'></i>";

    try {
      // Recheck store status before submitting.
      const settingsResult = await client
        .from("shop_settings")
        .select("is_open,closed_message")
        .eq("id", 1)
        .maybeSingle();

      if (settingsResult.error) throw settingsResult.error;

      if (settingsResult.data && settingsResult.data.is_open === false) {
        state.settings.is_open = false;
        if (settingsResult.data.closed_message) {
          state.settings.closed_message = settingsResult.data.closed_message;
        }
        updateStoreStatus();
        renderCart();
        closeOverlay("checkoutOverlay");
        toast("The store has closed. No order was submitted.");
        return;
      }

      // Send only fields that exist in the supplied orders schema.
      // Special request is included in the first item JSON as a compatible
      // schema-preserving field because orders has no dedicated request column.
      const orderItems = items.map(({product,quantity}) => ({
        product_id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        quantity
      }));

      if (specialRequest) {
        orderItems.push({
          type: "special_request",
          note: specialRequest
        });
      }

      const payload = {
        customer_name: name,
        customer_phone: phone,
        items: orderItems,
        total: cartTotal(),
        status: "pending"
      };

      const result = await client
  .from("orders")
  .insert(payload);

if (result.error) {
  console.error("Supabase order insert details:", {
    code: result.error.code,
    message: result.error.message,
    details: result.error.details,
    hint: result.error.hint,
    payload
  });

  throw result.error;
}

      
      // Save customer details for the next order.
      saveCustomer(name, phone);

      // Prepare WhatsApp message using the original cart items.
      const orderTotal = cartTotal();

      // Clear and refresh the local cart after Supabase confirms success.
      state.cart = {};
      saveCart();
      updateCartBadge();
      renderCart();
      closeOverlay("checkoutOverlay");

      toast("Order saved! Opening WhatsApp...");

      // Open WhatsApp with the complete order message.
      openOrderWhatsApp({
        name,
        phone,
        items,
        total: orderTotal,
        specialRequest
      });

    } catch (error) {
      console.error("Order submission failed:", error);
      toast("Order could not be submitted. Please check your connection and try again.");
      button.disabled = false;
      button.innerHTML = "<span>Try again</span><i class='fa-solid fa-arrow-right'></i>";
    }
  }

  function showView(view, push = true) {
    const valid = ["menuPage", "cartPage", "reviewsPage"];
    if (!valid.includes(view)) return;

    if (push && state.view !== view) {
      history.pushState({ princePaanView: view }, "");
    }

    state.view = view;
    $$(".page").forEach(page => page.classList.toggle("active", page.id === view));
    $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));

    if (view === "cartPage") renderCart();
    if (view === "reviewsPage") renderVideos();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openOverlay(id) {
    const overlay = document.getElementById(id);
    if (!overlay || !overlay.classList.contains("hidden")) return;

    const current = $(".overlay:not(.hidden)");
    if (current && current.id !== id) closeOverlay(current.id, false);

    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    state.overlayStack = state.overlayStack.filter(x => x !== id);
    state.overlayStack.push(id);
    history.pushState({ princePaanOverlay: id }, "");
  }

  function closeOverlay(id, goBack = true) {
    const overlay = document.getElementById(id);
    if (!overlay || overlay.classList.contains("hidden")) return;

    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    state.overlayStack = state.overlayStack.filter(x => x !== id);

    if (!$(".overlay:not(.hidden)")) document.body.style.overflow = "";

    if (goBack && history.state?.princePaanOverlay === id) {
      history.back();
    }
  }

  function handleBack() {
    const overlay = $(".overlay:not(.hidden)");
    if (overlay) {
      const id = overlay.id;
      closeOverlay(id, false);
      if (history.state?.princePaanOverlay === id) history.back();
      return;
    }
    if (state.view !== "menuPage") {
      showView("menuPage", false);
      return;
    }
    // On the root menu page, do not unexpectedly navigate away.
  }

  function extractVideoEmbed(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

      if (host === "youtube.com" || host === "m.youtube.com") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : "";
      }

      if (host === "youtu.be") {
        const id = parsed.pathname.split("/").filter(Boolean)[0];
        return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : "";
      }

      if (host === "youtube-nocookie.com" && parsed.pathname.startsWith("/embed/")) return parsed.href;
      if (host === "player.vimeo.com" && parsed.pathname.startsWith("/video/")) return parsed.href;
      return "";
    } catch (_) {
      return "";
    }
  }

  function renderVideos() {
    const target = $("#videosList");
    if (!state.videos.length) {
      target.innerHTML = `<div class="empty-state"><i class="fa-solid fa-film"></i><h3>Something special is coming</h3><p>Our latest moments will appear here.</p></div>`;
      return;
    }

    target.innerHTML = state.videos.map(video => {
      const url = safeImageURL(video.video_url);
      const embed = url ? extractVideoEmbed(url) : "";

      let media = "";
      if (embed) {
        media = `<iframe class="video-frame" src="${escapeHTML(embed)}" title="${escapeHTML(video.title || "Prince Paan video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      } else if (url && /\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
        media = `<video class="video-frame" controls playsinline preload="metadata" poster="${escapeHTML(safeImageURL(video.thumbnail_url))}"><source src="${escapeHTML(url)}"></video>`;
      } else if (safeImageURL(video.thumbnail_url)) {
        media = imageMarkup(video.thumbnail_url, video.title || "Prince Paan video", "video-thumb");
        if (url) media += `<div class="video-info"><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Watch video <i class="fa-solid fa-arrow-up-right-from-square"></i></a></div>`;
      } else {
        media = `<div class="empty-state"><i class="fa-solid fa-circle-play"></i><p>Video preview unavailable.</p></div>`;
      }

      return `<article class="video-card">${media}<div class="video-info"><h3>${escapeHTML(video.title || "Prince Paan moments")}</h3><p>${escapeHTML(video.caption || "")}</p></div></article>`;
    }).join("");
  }

  async function loadData() {
    const client = getClient();

    if (!client) {
      $("#productGrid").innerHTML = `<div class="empty-state"><i class="fa-solid fa-wifi"></i><h3>Menu connection unavailable</h3><p>Please check your internet connection and refresh the page.</p><button class="primary-button" id="retryLoad" style="margin:16px auto 0">Try again</button></div>`;
      return;
    }

    try {
      const [settingsRes, categoriesRes, productsRes, videosRes] = await Promise.all([
        client.from("shop_settings").select("*").eq("id", 1).maybeSingle(),
        client.from("categories").select("*").eq("active", true).order("sort_order"),
        client.from("products").select("*").eq("available", true).eq("visibility", "visible").order("sort_order"),
        client.from("videos").select("*").eq("active", true).order("sort_order")
      ]);

      if (settingsRes.error) console.warn("Settings could not load:", settingsRes.error);
      if (categoriesRes.error) console.warn("Categories could not load:", categoriesRes.error);
      if (productsRes.error) throw productsRes.error;
      if (videosRes.error) console.warn("Videos could not load:", videosRes.error);

      if (settingsRes.data) {
        state.settings = { ...state.settings, ...settingsRes.data };
      }

      state.categories = categoriesRes.data?.length
        ? categoriesRes.data
        : FALLBACK_CATEGORIES;

      state.products = (productsRes.data || []).filter(p =>
        p.visibility !== "hidden" && p.available !== false
      );

      state.videos = (videosRes.data || []).filter(v => v.active !== false);

      if (state.selectedCategory !== "all" &&
          !state.categories.some(c => String(c.id) === state.selectedCategory)) {
        state.selectedCategory = "all";
      }

      $("#brandName").textContent = state.settings.store_name || "PRINCE PAAN";
      const logo = safeImageURL(state.settings.logo_url);
      if (logo) {
        $(".brand-mark").innerHTML = `<img src="${escapeHTML(logo)}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:12px">`;
      }

      loadCart();
      updateStoreStatus();
      renderCategories();
      renderProducts();
      renderRecommendations();
      renderCart();
      renderVideos();
      updateCartBadge();

      if (!isStoreOpen()) {
        // Browsing remains available; checkout is explicitly blocked.
        $("#checkoutStart")?.setAttribute("disabled", "disabled");
      }
    } catch (error) {
      console.error("Could not load customer website data:", error);
      $("#productGrid").innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Menu couldn't load</h3><p>Please try again. If the problem continues, check your Supabase connection and read policies.</p><button class="primary-button" id="retryLoad" style="margin:16px auto 0">Try again</button></div>`;
    }
  }

  function openSearch() {
    $("#searchInput").value = "";
    renderSearchResults("");
    openOverlay("searchOverlay");
    setTimeout(() => $("#searchInput").focus(), 80);
  }

  function bindEvents() {
    $("#searchOpen").addEventListener("click", openSearch);
    $("#searchInput").addEventListener("input", event => renderSearchResults(event.target.value));
    $("#searchClear").addEventListener("click", () => {
      $("#searchInput").value = "";
      renderSearchResults("");
      $("#searchInput").focus();
    });

    document.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const nav = target.closest("[data-view]");
      if (nav) {
        showView(nav.dataset.view);
        return;
      }

      if (target.closest("[data-home]")) {
        event.preventDefault();
        showView("menuPage");
        return;
      }

      const retry = target.closest("#retryLoad");
      if (retry) {
        retry.disabled = true;
        loadData().finally(() => { retry.disabled = false; });
        return;
      }

      const category = target.closest("[data-category]");
      if (category) {
        state.selectedCategory = category.dataset.category;
        renderCategories();
        renderProducts();
        $("#menuSection").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const add = target.closest("[data-add]");
      if (add) {
        event.stopPropagation();
        addToCart(add.dataset.add);
        return;
      }

      const qty = target.closest("[data-qty]");
      if (qty) {
        const id = qty.dataset.qty;
        const next = (Number(state.cart[id]) || 0) + Number(qty.dataset.change);
        setCartQty(id, next);
        return;
      }

      const remove = target.closest("[data-remove]");
      if (remove) {
        setCartQty(remove.dataset.remove, 0);
        toast("Item removed.");
        return;
      }

      if (target.closest("[data-clear-cart]")) {
        state.cart = {};
        saveCart();
        updateCartBadge();
        renderCart();
        toast("Cart cleared.");
        return;
      }

      const searchDetail = target.closest("[data-search-detail]");
      if (searchDetail) {
        closeOverlay("searchOverlay", false);
        openProduct(searchDetail.dataset.searchDetail);
        return;
      }

      const detail = target.closest("[data-detail]");
      if (detail) {
        openProduct(detail.dataset.detail);
        return;
      }

      const close = target.closest("[data-close]");
      if (close) {
        closeOverlay(close.dataset.close);
        return;
      }

      if (target.closest("#detailMinus")) { changeDetailQty(-1); return; }
      if (target.closest("#detailPlus")) { changeDetailQty(1); return; }

      if (target.closest("#detailAdd")) {
        if (state.activeProduct) {
          addToCart(state.activeProduct.id, state.detailQty);
          closeOverlay("productOverlay");
        }
        return;
      }

      if (target.closest("#checkoutStart")) {
        openCheckout();
        return;
      }

      if (target.closest("[data-back]")) {
        handleBack();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        const overlay = $(".overlay:not(.hidden)");
        if (overlay && overlay.id !== "closedOverlay") closeOverlay(overlay.id);
      }

      if ((event.key === "Enter" || event.key === " ") &&
          event.target instanceof Element &&
          event.target.matches(".product-card, .recommend-card, .search-result")) {
        event.preventDefault();
        const id = event.target.dataset.detail ||
          event.target.dataset.searchDetail;
        if (id) openProduct(id);
      }
    });

    $("#checkoutForm").addEventListener("submit", submitCheckout);

    $$(".overlay").forEach(overlay => {
      overlay.addEventListener("click", event => {
        if (event.target === overlay && overlay.id !== "closedOverlay") {
          closeOverlay(overlay.id);
        }
      });
    });

    window.addEventListener("popstate", () => {
      const overlay = $(".overlay:not(.hidden)");
      if (overlay) {
        closeOverlay(overlay.id, false);
        return;
      }

      if (state.view !== "menuPage") {
        showView("menuPage", false);
      }
    });
  }

  async function init() {
    bindEvents();
    updateStoreStatus();
    updateCartBadge();
    renderCart();
    renderVideos();

    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(error => {
          console.warn("Service worker registration failed:", error);
        });
      });
    }

    await loadData();
    // Refresh store status periodically so admin changes reach customers.
setInterval(async () => {
  const client = getClient();
  if (!client) return;

  try {
    const { data, error } = await client
      .from("shop_settings")
      .select("is_open, closed_message, store_name")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) return;

    const wasOpen = isStoreOpen();

    state.settings = {
      ...state.settings,
      ...data
    };

    updateStoreStatus();

    if (wasOpen && data.is_open === false) {
      renderCart();
    }

    if (data.is_open === true) {
      renderCart();
    }
  } catch (error) {
    console.warn("Store status refresh failed:", error);
  }
}, 10000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
