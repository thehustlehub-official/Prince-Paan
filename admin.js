
"use strict";

(() => {
  const SUPABASE_URL = "https://ihhbkpponnvdarxslzoe.supabase.co";
  const SUPABASE_KEY = "sb_publishable_mR2bpKOHR1AI4dHei1-jaA_9lgVcRuL";
  const STORAGE_BUCKET = "prince-paan-media";
  const OPEN_MESSAGE_KEY = "prince_paan_open_message";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const money = n => "₹" + (Number(n) || 0).toLocaleString("en-IN");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
  const safeURL = value => {
    if (!value) return "";
    try {
      const u = new URL(value, location.href);
      return ["http:", "https:"].includes(u.protocol) ? u.href : "";
    } catch {
      return "";
    }
  };

  const ORDER_STATUSES = [
    "pending", "confirmed", "preparing", "ready", "delivered", "cancelled"
  ];

  let db;
  let adminUser = null;
  let categories = [];
  let products = [];
  let orders = [];
  let videos = [];
  let settings = {
    id: 1,
    store_name: "PRINCE PAAN",
    is_open: true,
    closed_message: "We are currently closed and are not accepting orders. Please visit us again soon.",
    logo_url: "",
    whatsapp_number: "918384019015",
    google_reviews_url: ""
  };
  let editor = null;
  let toastTimer;

  function toast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function showLogin(text = "", error = false) {
    $("#loginScreen").classList.remove("hidden");
    $("#adminApp").classList.add("hidden");
    $("#loginMessage").textContent = text;
    $("#loginMessage").classList.toggle("error", error);
  }

  function showApp() {
    $("#loginScreen").classList.add("hidden");
    $("#adminApp").classList.remove("hidden");
  }

  function connection(text, online = true) {
    $("#connectionStatus").innerHTML =
      `<span class="status-dot ${online ? "" : "off"}"></span>${esc(text)}`;
  }

  function empty(title, description) {
    return `<div class="empty-state">
      <i class="fa-solid fa-leaf"></i>
      <h3>${esc(title)}</h3><p>${esc(description)}</p>
    </div>`;
  }

  function table(headers, rows) {
    return `<table><thead><tr>${headers.map(x => `<th>${x}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map(x => `<td>${x ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
  }

  function dateText(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" :
      d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  }

  function localOpenMessage() {
    try {
      return localStorage.getItem(OPEN_MESSAGE_KEY) ||
        "Welcome to Prince Paan! We are accepting orders.";
    } catch {
      return "Welcome to Prince Paan! We are accepting orders.";
    }
  }

  function setOpenMessage(value) {
    try {
      localStorage.setItem(OPEN_MESSAGE_KEY, value);
    } catch {
      toast("This browser cannot save the open message locally.");
    }
  }

  async function verifyAdmin(user) {
    const { data, error } = await db.from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  }

  async function login(event) {
    event.preventDefault();
    const button = $("#loginButton");
    button.disabled = true;
    $("#loginMessage").textContent = "Signing in…";
    $("#loginMessage").classList.remove("error");

    try {
      const { data, error } = await db.auth.signInWithPassword({
        email: $("#loginEmail").value.trim(),
        password: $("#loginPassword").value
      });
      if (error) throw error;

      const user = data.user;
      if (!user || !(await verifyAdmin(user))) {
        await db.auth.signOut();
        showLogin("This account is not authorised as an administrator.", true);
        return;
      }

      adminUser = user;
      showApp();
      await refreshAll();
      toast("Signed in successfully.");
    } catch (error) {
      console.error(error);
      showLogin(error.message || "Login failed.", true);
    } finally {
      button.disabled = false;
    }
  }

  async function logout() {
    try {
      await db.auth.signOut();
    } catch (error) {
      console.error(error);
    }
    adminUser = null;
    showLogin("You have signed out.");
  }

  async function refreshAll() {
    connection("Refreshing");

    try {
      const results = await Promise.all([
        db.from("categories").select("*").order("sort_order"),
        db.from("products").select("*").order("sort_order"),
        db.from("orders").select("*").order("created_at", { ascending: false }).limit(500),
        db.from("videos").select("*").order("sort_order"),
        db.from("shop_settings").select("*").eq("id", 1).maybeSingle()
      ]);

      for (let i = 0; i < results.length; i++) {
        if (results[i].error) {
          throw new Error(results[i].error.message);
        }
      }

      categories = results[0].data || [];
      products = results[1].data || [];
      orders = results[2].data || [];
      videos = results[3].data || [];
      settings = { ...settings, ...(results[4].data || {}) };

      renderDashboard();
      renderOrders();
      renderProducts();
      renderCategories();
      renderVideos();
      fillSettings();
      connection("Connected");
    } catch (error) {
      console.error(error);
      connection("Data error", false);
      $("#appMessage").textContent =
        "Could not load all data. Check table permissions and RLS: " + error.message;
      $("#appMessage").classList.remove("hidden");
      toast("Database request failed.");
    }
  }

  function renderDashboard() {
    const active = orders.filter(o =>
      ["pending", "confirmed", "preparing", "ready"].includes(o.status)
    );
    const revenue = orders.filter(o => o.status === "delivered")
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    $("#statOrders").textContent = orders.length;
    $("#statPending").textContent = active.length;
    $("#statRevenue").textContent = money(revenue);
    $("#statProducts").textContent = products.filter(p =>
      p.available && p.visibility !== "hidden"
    ).length;
    $("#pendingBadge").textContent = active.length;
    $("#dashboardStoreName").textContent = settings.store_name || "PRINCE PAAN";
    $("#dashboardStoreMessage").textContent = settings.is_open
      ? localOpenMessage()
      : settings.closed_message;

    $("#recentOrders").innerHTML = orders.length ? table(
      ["Order", "Customer", "Items", "Total", "Status"],
      orders.slice(0, 6).map(o => [
        `<strong>#${esc(o.id)}</strong><span class="cell-muted">${dateText(o.created_at)}</span>`,
        `<strong>${esc(o.customer_name)}</strong><span class="cell-muted">${esc(o.customer_phone)}</span>`,
        itemsHTML(o),
        money(o.total),
        `<span class="mini-tag">${esc(o.status)}</span>`
      ])
    ) : empty("No orders yet", "New orders will appear here.");

    updateStoreStatus();
  }

  function parsedItems(order) {
    let value = order.items;
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { value = []; }
    }
    return Array.isArray(value) ? value : [];
  }

  function itemsHTML(order) {
    const items = parsedItems(order);
    return items.map(item => {
      if (item?.type === "special_request") {
        return `<span class="cell-muted">Request: ${esc(item.note || "")}</span>`;
      }
      return `<div>${esc(item?.name || "Item")} × ${esc(item?.quantity || 1)}</div>`;
    }).join("") || '<span class="cell-muted">No item details</span>';
  }

  function renderOrders() {
    const filter = $("#orderFilter").value;
    const list = orders.filter(o => filter === "all" || o.status === filter);

    $("#ordersTable").innerHTML = list.length ? table(
      ["Order", "Customer", "Items / Request", "Total", "Update status"],
      list.map(o => [
        `<strong>#${esc(o.id)}</strong><span class="cell-muted">${dateText(o.created_at)}</span>`,
        `<strong>${esc(o.customer_name)}</strong><span class="cell-muted">${esc(o.customer_phone)}</span>`,
        itemsHTML(o),
        `<strong>${money(o.total)}</strong>`,
        `<select class="status-select" data-order-status="${esc(o.id)}" aria-label="Order status">
          ${ORDER_STATUSES.map(s =>
            `<option value="${s}" ${o.status === s ? "selected" : ""}>${s}</option>`
          ).join("")}
        </select>`
      ])
    ) : empty("No orders found", "Try another order filter.");
  }

  async function updateOrder(id, status) {
    if (!ORDER_STATUSES.includes(status)) return;

    try {
      const { error } = await db.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
      const order = orders.find(o => String(o.id) === String(id));
      if (order) order.status = status;
      renderOrders();
      renderDashboard();
      toast(`Order #${id} updated.`);
    } catch (error) {
      toast("Could not update order: " + error.message);
      await refreshAll();
    }
  }

  function categoryName(id) {
    return categories.find(c => String(c.id) === String(id))?.name || "Uncategorised";
  }

  function categoryOptions(selected = "") {
    return `<option value="">Uncategorised</option>` +
      categories.map(c =>
        `<option value="${esc(c.id)}" ${String(c.id) === String(selected) ? "selected" : ""}>${esc(c.name)}</option>`
      ).join("");
  }

  function renderProducts() {
    const query = $("#productSearch").value.trim().toLowerCase();
    const category = $("#productCategoryFilter").value;
    const select = $("#productCategoryFilter");
    const previous = select.value;

    select.innerHTML = `<option value="all">All categories</option>` +
      categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    if ([...select.options].some(o => o.value === previous)) select.value = previous;

    const list = products.filter(p =>
      (!query || `${p.name} ${p.description}`.toLowerCase().includes(query)) &&
      (category === "all" || String(p.category_id) === category)
    );

    $("#productsGrid").innerHTML = list.length ? list.map(p => {
      const image = safeURL(p.image_url);
      return `<article class="admin-product">
        <div class="admin-product-image">${
          image
            ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">`
            : `<div class="image-placeholder"><i class="fa-solid fa-leaf"></i></div>`
        }</div>
        <div class="product-card-body">
          <span class="eyebrow">${esc(categoryName(p.category_id))}</span>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description || "No description")}</p>
          <div class="product-meta"><strong>${money(p.price)}</strong>
            <span class="mini-tag">${p.available ? "AVAILABLE" : "UNAVAILABLE"}</span></div>
          <div class="card-flags">
            ${p.featured ? '<span class="mini-tag">RECOMMENDED</span>' : ""}
            ${p.visibility === "hidden" ? '<span class="mini-tag">HIDDEN</span>' : ""}
          </div>
          <div class="card-actions">
            <button class="btn secondary btn-small" data-edit-product="${esc(p.id)}">Edit</button>
            <button class="btn secondary btn-small" data-delete-product="${esc(p.id)}" aria-label="Delete product"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </div>
      </article>`;
    }).join("") : empty("No products found", "Add a product or adjust your search.");
  }

  function uploadField(kind, current = "") {
    const accept = kind === "video"
      ? "video/mp4,video/webm,video/quicktime"
      : "image/jpeg,image/png,image/webp,image/avif";
    return `
      <div class="field-full">
        <label>${kind === "video" ? "Video file" : "Photo upload"}</label>
        <div class="media-drop" data-drop="${kind}">
          <i class="fa-solid ${kind === "video" ? "fa-film" : "fa-cloud-arrow-up"}"></i>
          <strong>Drop ${kind === "video" ? "a video" : "an image"} here</strong>
          <span>or tap to browse</span>
          <input type="file" data-file-kind="${kind}" accept="${accept}">
        </div>
        <p class="upload-progress" data-upload-status="${kind}">No file selected.</p>
      </div>
      <label class="field-full">${kind === "video" ? "Video URL" : "Image URL or root filename"}
        <input name="${kind === "video" ? "video_url" : "image_url"}"
          data-media-url="${kind}" value="${esc(current)}"
          placeholder="${kind === "video" ? "https://..." : "paan1.jpg"}">
      </label>
      ${kind === "image" ? `<div class="field-full"><img class="preview-image ${safeURL(current) ? "" : "hidden"}" data-image-preview src="${esc(safeURL(current))}" alt="Preview"></div>` : ""}
      ${kind === "video" ? `<div class="field-full"><video class="preview-image ${safeURL(current) ? "" : "hidden"}" data-video-preview src="${esc(safeURL(current))}" controls playsinline></video></div>` : ""}
    `;
  }

  function productForm(p = {}) {
    return `
      <label class="field-full">Product name
        <input name="name" required maxlength="150" value="${esc(p.name || "")}">
      </label>
      <label>Category<select name="category_id">${categoryOptions(p.category_id)}</select></label>
      <label>Price (₹)<input name="price" type="number" min="0" step="0.01" value="${p.price ?? ""}"></label>
      <label class="field-full">Description
        <textarea name="description" rows="3" maxlength="3000">${esc(p.description || "")}</textarea>
      </label>
      ${uploadField("image", p.image_url || "")}
      <label>Sort order<input name="sort_order" type="number" value="${Number(p.sort_order) || 0}"></label>
      <label>Visibility<select name="visibility">
        <option value="visible" ${p.visibility !== "hidden" ? "selected" : ""}>Visible</option>
        <option value="hidden" ${p.visibility === "hidden" ? "selected" : ""}>Hidden</option>
      </select></label>
      <div class="check-field"><input id="pAvailable" name="available" type="checkbox" ${p.available !== false ? "checked" : ""}><label for="pAvailable">Available for customers</label></div>
      <div class="check-field"><input id="pFeatured" name="featured" type="checkbox" ${p.featured ? "checked" : ""}><label for="pFeatured">In-house recommendation</label></div>
      ${p.id ? `<input type="hidden" name="id" value="${esc(p.id)}">` : ""}
    `;
  }

  function renderCategories() {
    $("#categoriesTable").innerHTML = categories.length ? table(
      ["Category", "Icon class", "Order", "Status", "Actions"],
      categories.map(c => [
        `<strong><span class="categories-icon"><i class="fa-solid ${esc(c.icon || "fa-leaf")}"></i></span>${esc(c.name)}</strong>`,
        esc(c.icon || "fa-leaf"),
        esc(c.sort_order),
        `<span class="mini-tag">${c.active ? "ACTIVE" : "INACTIVE"}</span>`,
        `<button class="btn secondary btn-small" data-edit-category="${esc(c.id)}">Edit</button>
         <button class="btn secondary btn-small" data-delete-category="${esc(c.id)}">Delete</button>`
      ])
    ) : empty("No categories", "Create a category for your menu.");
  }

  function categoryForm(c = {}) {
    return `
      <label class="field-full">Category name<input name="name" required maxlength="100" value="${esc(c.name || "")}"></label>
      <label class="field-full">Font Awesome icon class
        <input name="icon" required pattern="fa-[a-z0-9-]+" value="${esc(c.icon || "fa-leaf")}">
        <span class="field-help">Example: fa-leaf, fa-mug-hot, fa-glass-water.</span>
      </label>
      <label>Sort order<input name="sort_order" type="number" value="${Number(c.sort_order) || 0}"></label>
      <div class="check-field"><input id="cActive" name="active" type="checkbox" ${c.active !== false ? "checked" : ""}><label for="cActive">Active in menu</label></div>
      ${c.id ? `<input type="hidden" name="id" value="${esc(c.id)}">` : ""}
    `;
  }

  function renderVideos() {
    $("#videosGrid").innerHTML = videos.length ? videos.map(v => {
      const image = safeURL(v.thumbnail_url);
      return `<article class="video-card">
        <div class="video-media">${image
          ? `<img src="${esc(image)}" alt="${esc(v.title)}" loading="lazy">`
          : `<div class="image-placeholder"><i class="fa-solid fa-circle-play"></i></div>`}</div>
        <div class="video-card-body">
          <span class="mini-tag">${v.active ? "ACTIVE" : "INACTIVE"}</span>
          <h3>${esc(v.title || "Untitled video")}</h3>
          <p>${esc(v.caption || "No caption")}</p>
          <div class="cell-muted">${esc(v.video_url || "No video URL")}</div>
          <div class="card-actions">
            <button class="btn secondary btn-small" data-edit-video="${esc(v.id)}">Edit</button>
            <button class="btn secondary btn-small" data-delete-video="${esc(v.id)}">Delete</button>
          </div>
        </div>
      </article>`;
    }).join("") : empty("No videos yet", "Add a video to display on the customer Reviews page.");
  }

  function videoForm(v = {}) {
    return `
      <label class="field-full">Video title<input name="title" maxlength="200" value="${esc(v.title || "")}"></label>
      ${uploadField("video", v.video_url || "")}
      <label class="field-full">Thumbnail URL or root filename
        <input name="thumbnail_url" value="${esc(v.thumbnail_url || "")}" placeholder="paan1.jpg">
      </label>
      <label class="field-full">Caption<textarea name="caption" rows="3">${esc(v.caption || "")}</textarea></label>
      <label>Sort order<input name="sort_order" type="number" value="${Number(v.sort_order) || 0}"></label>
      <div class="check-field"><input id="vActive" name="active" type="checkbox" ${v.active !== false ? "checked" : ""}><label for="vActive">Show on Reviews page</label></div>
      ${v.id ? `<input type="hidden" name="id" value="${esc(v.id)}">` : ""}
    `;
  }

  function openModal(title, type, record, html) {
    editor = { type, id: record?.id || null };
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = html;
    $("#modal").classList.remove("hidden");
    $("#modal").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    bindMediaFields();
  }

  function closeModal() {
    $("#modal").classList.add("hidden");
    $("#modal").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    $("#modalBody").querySelectorAll("video").forEach(v => v.pause());
    editor = null;
  }

  async function uploadMedia(file, kind, statusEl) {
    const maxSize = kind === "video" ? 100 * 1024 * 1024 : 12 * 1024 * 1024;
    const validType = kind === "video"
      ? ["video/mp4", "video/webm", "video/quicktime"].includes(file.type)
      : ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type);

    if (!validType) throw new Error("Unsupported file type.");
    if (file.size > maxSize) {
      throw new Error(kind === "video" ? "Video must be 100 MB or smaller." : "Image must be 12 MB or smaller.");
    }

    statusEl.textContent = "Uploading to existing Supabase Storage bucket…";

    const ext = (file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg"))
      .toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${kind}s/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });
    if (error) throw error;

    const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("Could not obtain public media URL.");

    statusEl.textContent = "Upload complete.";
    return data.publicUrl;
  }

  function bindMediaFields() {
    $$("#modalBody [data-drop]").forEach(drop => {
      const kind = drop.dataset.drop;
      const input = $(`[data-file-kind="${kind}"]`, drop);
      const status = $(`[data-upload-status="${kind}"]`, $("#modalBody"));

      async function handleFiles(files) {
        const file = files?.[0];
        if (!file) return;

        try {
          const url = await uploadMedia(file, kind, status);
          const urlInput = $(`[data-media-url="${kind}"]`, $("#modalBody"));
          urlInput.value = url;
          urlInput.dispatchEvent(new Event("input", { bubbles: true }));
          toast("Media uploaded successfully.");
        } catch (error) {
          console.error(error);
          status.textContent = "Upload failed. You can paste a hosted URL instead.";
          toast("Upload failed: " + error.message);
        }
      }

      input.addEventListener("change", () => handleFiles(input.files));
      drop.addEventListener("dragover", event => {
        event.preventDefault();
        drop.classList.add("dragover");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
      drop.addEventListener("drop", event => {
        event.preventDefault();
        drop.classList.remove("dragover");
        handleFiles(event.dataTransfer.files);
      });
    });

    $$("#modalBody [data-media-url]").forEach(input => {
      input.addEventListener("input", () => {
        const url = safeURL(input.value);
        const kind = input.dataset.mediaUrl;
        const preview = $(`[data-${kind}-preview]`, $("#modalBody"));
        if (!preview) return;

        if (url) {
          preview.src = url;
          preview.classList.remove("hidden");
        } else {
          preview.removeAttribute("src");
          preview.classList.add("hidden");
        }
      });
    });
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (!editor) return;

    const button = $("#modalSave");
    button.disabled = true;
    const fd = new FormData(event.currentTarget);
    const id = fd.get("id");

    try {
      let tableName, payload;

      if (editor.type === "product") {
        tableName = "products";
        const price = fd.get("price");
        const category = fd.get("category_id");
        payload = {
          name: String(fd.get("name") || "").trim(),
          category_id: category ? Number(category) : null,
          price: price === "" ? null : Number(price),
          description: String(fd.get("description") || "").trim(),
          image_url: String(fd.get("image_url") || "").trim(),
          available: fd.has("available"),
          featured: fd.has("featured"),
          sort_order: Number(fd.get("sort_order")) || 0,
          visibility: fd.get("visibility") === "hidden" ? "hidden" : "visible"
        };
        if (!payload.name) throw new Error("Product name is required.");
        if (payload.price !== null && (!Number.isFinite(payload.price) || payload.price < 0)) {
          throw new Error("Enter a valid price.");
        }
      }

      if (editor.type === "category") {
        tableName = "categories";
        payload = {
          name: String(fd.get("name") || "").trim(),
          icon: String(fd.get("icon") || "fa-leaf").trim(),
          sort_order: Number(fd.get("sort_order")) || 0,
          active: fd.has("active")
        };
        if (!payload.name) throw new Error("Category name is required.");
      }

      if (editor.type === "video") {
        tableName = "videos";
        payload = {
          title: String(fd.get("title") || "").trim(),
          video_url: String(fd.get("video_url") || "").trim(),
          thumbnail_url: String(fd.get("thumbnail_url") || "").trim(),
          caption: String(fd.get("caption") || "").trim(),
          sort_order: Number(fd.get("sort_order")) || 0,
          active: fd.has("active")
        };
      }

      const result = id
        ? await db.from(tableName).update(payload).eq("id", id)
        : await db.from(tableName).insert(payload);

      if (result.error) throw result.error;
      closeModal();
      toast("Changes saved.");
      await refreshAll();
    } catch (error) {
      console.error(error);
      toast("Could not save: " + error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function deleteRecord(tableName, id, label) {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

    try {
      const { error } = await db.from(tableName).delete().eq("id", id);
      if (error) throw error;
      toast(`${label} deleted.`);
      await refreshAll();
    } catch (error) {
      toast("Delete failed: " + error.message);
    }
  }

  function fillSettings() {
    $("#settingStoreName").value = settings.store_name || "PRINCE PAAN";
    $("#settingLogo").value = settings.logo_url || "";
    $("#settingWhatsApp").value = settings.whatsapp_number || "";
    $("#settingReviews").value = settings.google_reviews_url || "";
    $("#settingClosedMessage").value = settings.closed_message || "";
    $("#settingOpenMessage").value = localOpenMessage();
    $("#settingStoreOpen").checked = settings.is_open !== false;

    const logo = safeURL(settings.logo_url);
    $("#logoPreview").innerHTML = logo
      ? `<img src="${esc(logo)}" alt="Store logo">` : "";

    updateStoreStatus();
  }

  function updateStoreStatus() {
    const open = settings.is_open !== false;
    $("#sidebarStatusDot").classList.toggle("off", !open);
    $("#sidebarStatusText").textContent = open ? "Store is open" : "Store is closed";
    $("#dashboardStoreStatus").textContent = open ? "OPEN" : "CLOSED";
    $("#dashboardStoreStatus").classList.toggle("closed", !open);
    $("#quickStoreToggle").checked = open;
    $("#settingStoreOpen").checked = open;
  }

  async function setStoreOpen(open) {
    const previous = settings.is_open;
    settings.is_open = open;
    updateStoreStatus();

    try {
      const { error } = await db.from("shop_settings").update({
        is_open: open,
        updated_at: new Date().toISOString()
      }).eq("id", 1);
      if (error) throw error;

      renderDashboard();
      toast(open ? "Store opened." : "Store closed.");
    } catch (error) {
      settings.is_open = previous;
      updateStoreStatus();
      toast("Could not update store status: " + error.message);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const button = $("#saveSettingsButton");
    button.disabled = true;

    const openMessage = $("#settingOpenMessage").value.trim();
    const closedMessage = $("#settingClosedMessage").value.trim();

    try {
      const payload = {
        id: 1,
        store_name: $("#settingStoreName").value.trim(),
        logo_url: $("#settingLogo").value.trim(),
        whatsapp_number: $("#settingWhatsApp").value.trim(),
        google_reviews_url: $("#settingReviews").value.trim(),
        closed_message: closedMessage,
        is_open: $("#settingStoreOpen").checked,
        updated_at: new Date().toISOString()
      };

      if (!payload.store_name) throw new Error("Store name is required.");
      if (!payload.closed_message) throw new Error("Closed message cannot be empty.");

      const { data, error } = await db.from("shop_settings")
        .upsert(payload, { onConflict: "id" }).select().single();
      if (error) throw error;

      setOpenMessage(openMessage);
      settings = { ...settings, ...(data || payload) };
      fillSettings();
      renderDashboard();
      toast("Store settings saved.");
    } catch (error) {
      console.error(error);
      toast("Settings could not be saved: " + error.message);
    } finally {
      button.disabled = false;
    }
  }

  function navigate(page) {
    const allowed = ["dashboard", "orders", "products", "categories", "videos", "settings"];
    if (!allowed.includes(page)) return;

    $$(".page").forEach(el => el.classList.toggle("hidden", el.id !== `page-${page}`));
    $$(".nav-link[data-page]").forEach(el => el.classList.toggle("active", el.dataset.page === page));
    $("#pageTitle").textContent = ({
      dashboard: "Dashboard",
      orders: "Orders",
      products: "Products",
      categories: "Categories",
      videos: "Reviews & Videos",
      settings: "Store settings"
    })[page];

    $("#sidebar").classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindEvents() {
    $("#loginForm").addEventListener("submit", login);
    $("#logoutButton").addEventListener("click", logout);
    $("#refreshButton").addEventListener("click", refreshAll);
    $("#editorForm").addEventListener("submit", saveEditor);
    $("#settingsForm").addEventListener("submit", saveSettings);
    $("#orderFilter").addEventListener("change", renderOrders);
    $("#productSearch").addEventListener("input", renderProducts);
    $("#productCategoryFilter").addEventListener("change", renderProducts);

    $("#settingLogo").addEventListener("input", () => {
      const url = safeURL($("#settingLogo").value);
      $("#logoPreview").innerHTML = url ? `<img src="${esc(url)}" alt="Logo preview">` : "";
    });

    $("#quickStoreToggle").addEventListener("change", e => setStoreOpen(e.target.checked));
    $("#settingStoreOpen").addEventListener("change", e => {
      settings.is_open = e.target.checked;
      updateStoreStatus();
    });

    $("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const nav = target.closest("[data-page]");
      if (nav) {
        event.preventDefault();
        navigate(nav.dataset.page);
        return;
      }

      if (target.closest("[data-modal-close]")) {
        closeModal();
        return;
      }

      if (target.closest("#addProductButton")) {
        openModal("Add product", "product", null, productForm());
        return;
      }
      if (target.closest("#addCategoryButton")) {
        openModal("Add category", "category", null, categoryForm());
        return;
      }
      if (target.closest("#addVideoButton")) {
        openModal("Add video", "video", null, videoForm());
        return;
      }

      const editProduct = target.closest("[data-edit-product]");
      if (editProduct) {
        const p = products.find(x => String(x.id) === editProduct.dataset.editProduct);
        if (p) openModal("Edit product", "product", p, productForm(p));
        return;
      }

      const editCategory = target.closest("[data-edit-category]");
      if (editCategory) {
        const c = categories.find(x => String(x.id) === editCategory.dataset.editCategory);
        if (c) openModal("Edit category", "category", c, categoryForm(c));
        return;
      }

      const editVideo = target.closest("[data-edit-video]");
      if (editVideo) {
        const v = videos.find(x => String(x.id) === editVideo.dataset.editVideo);
        if (v) openModal("Edit video", "video", v, videoForm(v));
        return;
      }

      const delP = target.closest("[data-delete-product]");
      if (delP) return deleteRecord("products", delP.dataset.deleteProduct, "product");

      const delC = target.closest("[data-delete-category]");
      if (delC) return deleteRecord("categories", delC.dataset.deleteCategory, "category");

      const delV = target.closest("[data-delete-video]");
      if (delV) return deleteRecord("videos", delV.dataset.deleteVideo, "video");
    });

    document.addEventListener("change", event => {
      const el = event.target;
      if (el.matches("[data-order-status]")) {
        updateOrder(el.dataset.orderStatus, el.value);
      }
    });

    $("#modal").addEventListener("click", event => {
      if (event.target.classList.contains("modal-backdrop")) closeModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !$("#modal").classList.contains("hidden")) closeModal();
    });
  }

  async function init() {
    bindEvents();

    if (!window.supabase?.createClient) {
      showLogin("Supabase library failed to load. Check your internet connection.", true);
      return;
    }

    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    try {
      connection("Connecting");
      const { data, error } = await db.auth.getSession();
      if (error) throw error;

      if (data.session?.user) {
        const allowed = await verifyAdmin(data.session.user);
        if (allowed) {
          adminUser = data.session.user;
          showApp();
          await refreshAll();
        } else {
          await db.auth.signOut();
          showLogin("This account is not authorised as an administrator.", true);
        }
      } else {
        showLogin();
      }

      db.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          adminUser = null;
          showLogin();
        }
      });
    } catch (error) {
      console.error(error);
      connection("Authentication error", false);
      showLogin("Could not initialise authentication: " + error.message, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
