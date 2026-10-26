const app = document.querySelector("#app");
const state = { user: null, config: null, route: "", prices: null, voices: [] };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function rupiah(amount) {
  return `Rp${Number(amount || 0).toLocaleString("id-ID")}`;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  let body = options.body;
  if (options.json) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  const response = await fetch(path, { method: options.method || (body ? "POST" : "GET"), headers, body, credentials: "same-origin" });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!response.ok) throw new Error(data?.error || "Gagal.");
  return data;
}

function route() {
  return location.hash.replace(/^#\/?/, "") || (state.user ? "meja" : "masuk");
}

function go(name) {
  location.hash = `#/${name}`;
}

window.addEventListener("hashchange", () => render());

function shell(body) {
  if (!state.user) return body;
  const saldo = state.user.exempt ? "Akun utama, gratis" : rupiah(state.user.balanceIdr);
  return `<div class="shell">
    <aside class="side">
      <div class="mark"><div class="mark-badge">SK</div><div><strong>Studio Konten</strong><em>buat Mandala</em></div></div>
      <nav class="nav">
        ${nav("meja", "Meja")}
        ${nav("video-bebas", "Video bebas")}
        ${nav("foto-produk", "Foto produk")}
        ${nav("video-affiliate", "Video affiliate")}
        ${nav("video-iklan", "Video iklan")}
        ${nav("riwayat", "Riwayat")}
        ${state.user.role === "admin" ? nav("admin", "Admin") : ""}
      </nav>
      <div class="side-foot">
        <div class="who">${esc(state.user.name)}</div>
        <div class="saldo" id="saldo">${esc(saldo)}</div>
        <button class="ghost" id="logout" type="button">Keluar</button>
      </div>
    </aside>
    <main class="main">${body}</main>
  </div>`;
}

function nav(id, label) {
  return `<button type="button" data-go="${id}" class="${route() === id ? "active" : ""}">${label}</button>`;
}

function banner() {
  return `<div id="banner" class="banner" hidden></div>`;
}

function voicePicker() {
  const voices = state.voices.length ? state.voices : [
    { id: "ara", name: "Ara", blurb: "Hangat dan ramah" },
    { id: "rex", name: "Rex", blurb: "Jelas dan percaya diri" },
    { id: "eve", name: "Eve", blurb: "Ceria" },
    { id: "sal", name: "Sal", blurb: "Halus" },
    { id: "leo", name: "Leo", blurb: "Tegas" },
  ];
  return `<div class="voices">${voices.map((voice, index) => `<label><input type="radio" name="voiceId" value="${esc(voice.id)}" ${index === 0 ? "checked" : ""}/> ${esc(voice.name)} <span class="tiny">${esc(voice.blurb)}</span></label>`).join("")}</div>`;
}

function pronunciationBlock() {
  return `<div id="prons">
    <div class="pron-row row">
      <input class="written" type="text" placeholder="Tulisan, contoh Loft25" />
      <input class="spoken" type="text" placeholder="Cara baca, contoh Loft dua lima" />
    </div>
  </div>
  <button class="secondary" type="button" id="add-pron">Tambah cara baca</button>
  <p class="tiny">Kalau mereknya kebaca aneh, isi di sini. Contoh: Loft25 kedengeran “Love 25”, jadi bacanya “Loft dua lima”.</p>`;
}

function consentBlock() {
  return `<div class="notice">Wajah artis atau tokoh publik tidak boleh dipakai. Cuma orang yang memang kasih izin.</div>
  <label class="check"><input type="checkbox" name="consent" value="ya"/> Saya punya izin pakai wajah ini</label>`;
}

function pageMeja() {
  const price = (key) => state.prices ? rupiah(state.prices[key]) : "";
  return `<p class="kicker">Meja kerja</p><h1>Mau bikin konten yang mana?</h1>
  <p class="lede">Upload foto, pilih gaya, nanti hasilnya bisa diunduh. Versi uji: pembayaran QRIS belum nyala.</p>
  <div class="grid">
    ${choice("01", "video-bebas", "Video bebas", `Ceritain aja, naskahnya dibikinin. ${price("video_bebas")}`)}
    ${choice("02", "foto-produk", "Foto produk", `Pilih resep atau tulis sendiri. ${price("foto_produk")}`)}
    ${choice("03", "video-affiliate", "Video affiliate", `Wajah plus produk, ngomong kayak review. ${price("video_affiliate")}`)}
    ${choice("04", "video-iklan", "Video iklan", `Konsep singkat plus foto produk. ${price("video_commercial")}`)}
  </div>`;
}

function choice(num, id, title, text) {
  return `<button class="choice" data-go="${id}" type="button"><div class="num">${num}</div><strong>${title}</strong><span>${esc(text)}</span></button>`;
}

function pageLogin() {
  return `<div class="login-wrap"><div class="card">
    <p class="kicker">AI Studio Konten</p>
    <h1>Masuk dulu.</h1>
    <p class="lede">Buat bikin foto dan video jualan. Versi uji ini masih pakai akun utama.</p>
    ${banner()}
    <form id="login-form">
      <label>Email</label><input name="email" type="email" autocomplete="username" required />
      <label>Password</label><input name="password" type="password" autocomplete="current-password" required />
      <button class="primary" type="submit">Masuk ke studio</button>
    </form>
  </div></div>`;
}

function pageFree() {
  return `${back()}<p class="kicker">Video bebas</p><h1>Ceritain mau videonya kayak apa.</h1>
  ${banner()}
  <form id="draft-form" class="card">
    <label>Cerita singkat</label>
    <textarea name="brief" required placeholder="Contoh: cewek di kafe nunjukin matcha, ngomong santai, cahaya sore."></textarea>
    <label>Cara baca merek</label>
    ${pronunciationBlock()}
    <button class="primary" type="submit">Susunin naskah</button>
  </form>
  <form id="make-form" class="card" hidden>
    <label>Naskah (boleh diubah)</label>
    <textarea name="script" id="script"></textarea>
    <label>Prompt video (boleh diubah)</label>
    <textarea name="videoPrompt" id="videoPrompt"></textarea>
    <label>Suara</label>
    ${voicePicker()}
    <button class="primary" type="submit">Bikin videonya</button>
  </form>
  <div id="result"></div>`;
}

function pageFoto() {
  return `${back()}<p class="kicker">Foto produk</p><h1>Upload barangnya, pilih gayanya.</h1>
  ${banner()}
  <form id="foto-form" class="card">
    <label>Foto produk</label><input name="product" type="file" accept="image/jpeg,image/png,image/webp" required />
    <div class="row">
      <div><label>Nama produk</label><input name="productName" type="text" /></div>
      <div><label>Ukuran</label><select name="ratio"><option value="9:16">9:16 story</option><option value="1:1">1:1 kotak</option><option value="16:9">16:9 lebar</option></select></div>
    </div>
    <label>Deskripsi singkat</label><input name="productDesc" type="text" />
    <label>Latar</label><input name="background" id="background" type="text" placeholder="Akan terisi setelah foto dibaca" />
    <div id="bg-list" class="tiny"></div>
    <label>Resep</label><div id="recipes" class="recipes">Lagi muat resep...</div>
    <label>Atau tulis prompt sendiri</label>
    <textarea name="customPrompt" placeholder="Kosongkan kalau pakai resep."></textarea>
    <div id="model-box" hidden>
      <label>Foto orang</label><input name="model" type="file" accept="image/jpeg,image/png,image/webp" />
      ${consentBlock()}
    </div>
    <button class="secondary" type="button" id="analyze">Baca fotonya dulu</button>
    <button class="primary" type="submit">Bikin fotonya</button>
  </form>
  <div id="result"></div>`;
}

function pageAffiliate() {
  return `${back()}<p class="kicker">Video affiliate</p><h1>Orangnya megang produk, terus ngomong.</h1>
  ${banner()}
  <form id="aff-form" class="card">
    <label>Foto orang</label><input name="model" type="file" accept="image/jpeg,image/png,image/webp" required />
    ${consentBlock()}
    <label>Foto produk</label><input name="product" type="file" accept="image/jpeg,image/png,image/webp" required />
    <div class="row">
      <div><label>Nama produk</label><input name="productName" type="text" /></div>
      <div><label>Gaya kamera</label>
        <select name="ugcStyle"><option>Handheld</option><option>Tripod</option><option>Vlog</option></select>
      </div>
    </div>
    <label>Deskripsi</label><input name="productDesc" type="text" />
    <label>Latar</label><input name="background" type="text" placeholder="Kafe sore, kamar, teras..." />
    <label>Suara</label>${voicePicker()}
    <label>Cara baca merek</label>${pronunciationBlock()}
    <button class="primary" type="submit">Bikin video affiliate</button>
  </form>
  <div id="result"></div>`;
}

function pageCommercial() {
  return `${back()}<p class="kicker">Video iklan</p><h1>Konsep singkat, foto produk, jadi iklan.</h1>
  ${banner()}
  <form id="com-form" class="card">
    <label>Konsep</label>
    <textarea name="concept" required placeholder="Contoh: gelas matcha di meja kayu gelap, lampu sorot, tanpa orang."></textarea>
    <label>Foto produk</label><input name="product" type="file" accept="image/jpeg,image/png,image/webp" required />
    <div class="row">
      <div><label>Nama produk</label><input name="productName" type="text" /></div>
      <div><label>Latar</label><input name="background" type="text" placeholder="Meja kayu walnut gelap" /></div>
    </div>
    <label>Deskripsi</label><input name="productDesc" type="text" />
    <label class="check"><input type="checkbox" id="use-model" name="hasModel" value="ya"/> Pakai model</label>
    <div id="model-box" hidden>
      <label>Foto orang</label><input name="model" type="file" accept="image/jpeg,image/png,image/webp" />
      ${consentBlock()}
      <label>Suara</label>${voicePicker()}
    </div>
    <label>Cara baca merek</label>${pronunciationBlock()}
    <button class="primary" type="submit">Bikin video iklan</button>
  </form>
  <div id="result"></div>`;
}

function back() {
  return `<button class="back" type="button" data-go="meja">← Balik ke meja</button>`;
}

function resultHtml(generation) {
  if (!generation) return "";
  const files = generation.files || {};
  const bits = [];
  if (files.scene) bits.push(`<img class="preview" alt="Adegan" src="${esc(files.scene.url)}" />`);
  if (files.result && files.result.mime.startsWith("video")) bits.push(`<video class="preview" controls src="${esc(files.result.url)}"></video>`);
  if (files.result && files.result.mime.startsWith("image")) bits.push(`<img class="preview" alt="Hasil" src="${esc(files.result.url)}" />`);
  if (files.voice) bits.push(`<audio controls src="${esc(files.voice.url)}"></audio>`);
  const links = ["result", "scene", "voice"].filter((key) => files[key]).map((key) => {
    const file = files[key];
    const label = key === "voice" ? "Unduh suara" : key === "scene" ? "Unduh adegan" : "Unduh hasil";
    return `<a href="${esc(file.downloadUrl)}" download="${esc(file.filename)}">${label} (${esc(file.filename)})</a>`;
  }).join("");
  const note = generation.status === "running" ? "Masih diproses. Buka lagi riwayat sebentar lagi." : generation.billingNote || "";
  return `<section class="result"><h2>${esc(generation.title || "Jadi")}</h2>
    <p class="tiny">${esc(generation.status)} · terpotong ${esc(rupiah(generation.chargedIdr))} · biaya asli $${Number(generation.costUsd || 0).toFixed(4)}</p>
    ${generation.script ? `<p>${esc(generation.script)}</p>` : ""}
    ${note ? `<p class="tiny">${esc(note)}</p>` : ""}
    <div class="file-result">${bits.join("")}</div>
    <div class="links">${links}</div>
  </section>`;
}

async function render() {
  state.route = route();
  if (!state.config) {
    try { state.config = await api("/api/config"); } catch (error) { state.config = { error: error.message }; }
  }
  if (!state.user) {
    try {
      const me = await api("/api/me");
      state.user = me.user;
      state.prices = me.prices;
      state.voices = me.voices;
    } catch { state.user = null; }
  }
  if (!state.user && state.route !== "masuk") {
    location.hash = "#/masuk";
    return;
  }
  if (state.user && state.route === "masuk") {
    location.hash = "#/meja";
    return;
  }
  const pages = {
    masuk: pageLogin,
    meja: pageMeja,
    "video-bebas": pageFree,
    "foto-produk": pageFoto,
    "video-affiliate": pageAffiliate,
    "video-iklan": pageCommercial,
    riwayat: () => `${back()}<p class="kicker">Riwayat</p><h1>Yang sudah jadi.</h1>${banner()}<div id="history" class="history"></div>`,
    admin: () => `${back()}<p class="kicker">Admin</p><h1>Kendali studio.</h1>${banner()}<div id="admin"></div>`,
  };
  const body = (pages[state.route] || pageMeja)();
  app.innerHTML = shell(body);
  wire();
}

function wire() {
  document.querySelectorAll("[data-go]").forEach((node) => node.addEventListener("click", () => go(node.dataset.go)));
  document.querySelector("#logout")?.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST", json: {} });
    state.user = null;
    go("masuk");
  });
  document.querySelector("#add-pron")?.addEventListener("click", () => {
    const box = document.querySelector("#prons");
    const row = document.createElement("div");
    row.className = "pron-row row";
    row.innerHTML = `<input class="written" type="text" placeholder="Tulisan" /><input class="spoken" type="text" placeholder="Cara baca" />`;
    box.appendChild(row);
  });
  document.querySelector("#login-form")?.addEventListener("submit", onLogin);
  document.querySelector("#draft-form")?.addEventListener("submit", onDraft);
  document.querySelector("#make-form")?.addEventListener("submit", onMake);
  document.querySelector("#foto-form")?.addEventListener("submit", (event) => onUpload(event, "/api/foto-produk"));
  document.querySelector("#aff-form")?.addEventListener("submit", (event) => onUpload(event, "/api/video-affiliate"));
  document.querySelector("#com-form")?.addEventListener("submit", (event) => onUpload(event, "/api/video-commercial"));
  document.querySelector("#analyze")?.addEventListener("click", onAnalyze);
  document.querySelector("#use-model")?.addEventListener("change", (event) => {
    document.querySelector("#model-box").hidden = !event.target.checked;
  });
  if (state.route === "foto-produk") loadRecipes();
  if (state.route === "riwayat") loadHistory();
  if (state.route === "admin") loadAdmin();
}

function setBanner(kind, text) {
  const el = document.querySelector("#banner");
  if (!el) return;
  el.hidden = !text;
  el.className = `banner ${kind || ""}`;
  el.textContent = text || "";
}

function setBusy(busy) {
  document.querySelectorAll("button.primary").forEach((button) => { button.disabled = busy; });
}

function readPronunciations(form) {
  return [...form.querySelectorAll(".pron-row")].map((row) => ({
    written: row.querySelector(".written").value.trim(),
    spoken: row.querySelector(".spoken").value.trim(),
  })).filter((item) => item.written && item.spoken);
}

async function refreshMe() {
  const me = await api("/api/me");
  state.user = me.user;
  state.prices = me.prices;
  const saldo = document.querySelector("#saldo");
  if (saldo) saldo.textContent = state.user.exempt ? "Akun utama, gratis" : rupiah(state.user.balanceIdr);
}

async function onLogin(event) {
  event.preventDefault();
  setBusy(true);
  setBanner("", "");
  const form = new FormData(event.target);
  try {
    const data = await api("/api/auth/login", { json: { email: form.get("email"), password: form.get("password") } });
    state.user = data.user;
    const me = await api("/api/me");
    state.user = me.user;
    state.prices = me.prices;
    state.voices = me.voices;
    go("meja");
  } catch (error) {
    setBanner("error", error.message);
  } finally {
    setBusy(false);
  }
}

async function onDraft(event) {
  event.preventDefault();
  setBusy(true);
  const form = event.target;
  try {
    const data = await api("/api/video-bebas/draft", { json: { brief: new FormData(form).get("brief"), pronunciations: readPronunciations(form) } });
    document.querySelector("#script").value = data.script;
    document.querySelector("#videoPrompt").value = data.videoPrompt;
    document.querySelector("#make-form").hidden = false;
    document.querySelector("#make-form").dataset.brief = new FormData(form).get("brief");
    document.querySelector("#make-form").dataset.prons = JSON.stringify(readPronunciations(form));
    setBanner("info", "Naskahnya jadi. Boleh diubah sebelum dibikin videonya.");
    await refreshMe();
  } catch (error) {
    setBanner("error", error.message);
  } finally {
    setBusy(false);
  }
}

async function onMake(event) {
  event.preventDefault();
  setBusy(true);
  const form = event.target;
  const data = new FormData(form);
  try {
    const result = await api("/api/video-bebas", {
      json: {
        brief: form.dataset.brief || "",
        script: data.get("script"),
        videoPrompt: data.get("videoPrompt"),
        voiceId: data.get("voiceId"),
        pronunciations: JSON.parse(form.dataset.prons || "[]"),
      },
    });
    document.querySelector("#result").innerHTML = resultHtml(result.generation);
    setBanner("info", "Video bebas selesai.");
    await refreshMe();
  } catch (error) {
    setBanner("error", error.message);
  } finally {
    setBusy(false);
  }
}

function formWithProns(form) {
  const data = new FormData(form);
  const prons = readPronunciations(form);
  if (prons.length) data.set("pronunciations", JSON.stringify(prons));
  if (!data.get("customPrompt")) data.delete("customPrompt");
  return data;
}

async function onUpload(event, path) {
  event.preventDefault();
  setBusy(true);
  try {
    const result = await api(path, { body: formWithProns(event.target) });
    document.querySelector("#result").innerHTML = resultHtml(result.generation);
    setBanner("info", "Selesai. Tombol unduh ada di bawah.");
    await refreshMe();
  } catch (error) {
    setBanner("error", error.message);
  } finally {
    setBusy(false);
  }
}

async function onAnalyze() {
  const form = document.querySelector("#foto-form");
  const file = form.querySelector('input[name="product"]').files[0];
  if (!file) return setBanner("error", "Pilih fotonya dulu.");
  setBusy(true);
  const data = new FormData();
  data.set("product", file);
  data.set("mode", "commercial");
  try {
    const result = await api("/api/analyze", { body: data });
    form.productName.value = result.productName;
    form.productDesc.value = result.productDesc;
    form.background.value = result.backgrounds[0] || "";
    document.querySelector("#bg-list").textContent = `Ide latar: ${result.backgrounds.slice(0, 7).join(" · ")}`;
    setBanner("info", "Fotonya kebaca. Nama dan latar sudah diisi, boleh diubah.");
  } catch (error) {
    setBanner("error", error.message);
  } finally {
    setBusy(false);
  }
}

async function loadRecipes() {
  const box = document.querySelector("#recipes");
  try {
    const data = await api("/api/recipes?feature=foto_produk");
    box.innerHTML = data.recipes.map((recipe, index) => `<label><input type="radio" name="recipeId" value="${esc(recipe.slug)}" ${index === 0 ? "checked" : ""} data-model="${recipe.config_json.includes('"hasModel":true') ? "1" : "0"}"/> <strong>${esc(recipe.name)}</strong><br/><span class="tiny">${esc(recipe.description)}</span></label>`).join("");
    box.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
      document.querySelector("#model-box").hidden = input.dataset.model !== "1" || !input.checked;
    }));
  } catch (error) {
    box.textContent = error.message;
  }
}

async function loadHistory() {
  const box = document.querySelector("#history");
  try {
    const data = await api("/api/generations");
    if (!data.generations.length) {
      box.innerHTML = `<p>Belum ada hasil. Bikin yang pertama dari meja.</p>`;
      return;
    }
    box.innerHTML = data.generations.map((item) => `<article class="card">${resultHtml(item)}</article>`).join("");
  } catch (error) {
    setBanner("error", error.message);
  }
}

async function loadAdmin() {
  const box = document.querySelector("#admin");
  try {
    const [summary, users, recipes, generations] = await Promise.all([
      api("/api/admin/summary"),
      api("/api/admin/users"),
      api("/api/admin/recipes"),
      api("/api/admin/generations"),
    ]);
    const pct = Math.min(100, summary.capUsd ? (summary.spendUsd / summary.capUsd) * 100 : 0);
    box.innerHTML = `
      <section class="panel">
        <h2>Hari ini (${esc(summary.day)})</h2>
        <p>Terpakai $${summary.spendUsd.toFixed(2)} dari batas $${summary.capUsd.toFixed(2)}</p>
        <div class="meter"><span style="width:${pct}%"></span></div>
        <p>${summary.killSwitch ? "Kill switch NYALA. Generate mati." : "Kill switch mati. Generate boleh jalan."}</p>
        <button class="primary" id="kill" type="button">${summary.killSwitch ? "Hidupkan lagi" : "Matikan semua generate"}</button>
        <div class="tiny">${(summary.alerts || []).map((alert) => esc(alert.message)).join("<br/>")}</div>
      </section>
      <section class="panel">
        <h2>Harga dan pengali</h2>
        <form id="settings-form" class="row">
          ${settingField("price_multiplier", "Pengali biaya", summary.settings.priceMultiplier)}
          ${settingField("usd_to_idr", "Kurs USD ke Rp", summary.settings.usdToIdr)}
          ${settingField("price_foto_produk", "Harga foto", summary.settings.prices.foto_produk)}
          ${settingField("price_video_bebas", "Harga video bebas", summary.settings.prices.video_bebas)}
          ${settingField("price_video_affiliate", "Harga affiliate", summary.settings.prices.video_affiliate)}
          ${settingField("price_video_commercial", "Harga iklan", summary.settings.prices.video_commercial)}
          ${settingField("daily_spend_cap_usd", "Batas harian USD", summary.settings.dailySpendCapUsd)}
          ${settingField("alert_usd_1", "Alarm pertama USD", summary.settings.alertUsd1)}
          ${settingField("alert_usd_2", "Alarm kedua USD", summary.settings.alertUsd2)}
          ${settingField("video_duration_seconds", "Durasi video detik", summary.settings.videoDurationSeconds)}
          ${settingField("video_resolution", "Resolusi video", summary.settings.videoResolution)}
          ${settingField("image_model", "Model gambar", summary.settings.imageModel)}
          <button class="primary" type="submit">Simpan pengaturan</button>
        </form>
      </section>
      <section class="panel">
        <h2>Pengguna</h2>
        <form id="new-user" class="row">
          <input name="name" placeholder="Nama" required />
          <input name="email" type="email" placeholder="Email" required />
          <input name="password" type="text" placeholder="Password awal" required />
          <input name="creditIdr" type="number" placeholder="Saldo awal" value="0" />
          <button class="secondary" type="submit">Bikin akun</button>
        </form>
        <table><thead><tr><th>Email</th><th>Saldo</th><th>Isi</th></tr></thead><tbody>
          ${users.users.map((user) => `<tr><td>${esc(user.email)}<br/><span class="tiny">${esc(user.role)}${user.exempt_billing ? " · gratis" : ""}</span></td><td>${rupiah(user.credit_balance_idr)}</td><td><form class="topup" data-id="${esc(user.id)}"><input name="amountIdr" type="number" min="1" placeholder="Rp" /><button type="submit">Isi</button></form></td></tr>`).join("")}
        </tbody></table>
      </section>
      <section class="panel">
        <h2>Resep</h2>
        <form id="new-recipe">
          <div class="row"><input name="name" placeholder="Nama resep" required /><input name="description" placeholder="Penjelasan singkat" /></div>
          <div class="row"><select name="mode"><option>commercial</option><option>affiliate</option><option>ugc</option><option>mirror</option><option>pov</option></select>
          <input name="feature" value="foto_produk" /></div>
          <textarea name="prompt_template" placeholder="Prompt. Kosongkan kalau mau pakai mesin bawaan. Bisa pakai {{productName}} {{productDesc}} {{background}} {{ratio}} {{negative}}"></textarea>
          <button class="secondary" type="submit">Tambah resep</button>
        </form>
        ${recipes.recipes.map((recipe) => `<article class="card"><strong>${esc(recipe.name)}</strong> <span class="tag">${esc(recipe.mode)}</span><p class="tiny">${esc(recipe.description)}</p><button class="text-btn" data-del="${esc(recipe.id)}" type="button">Hapus</button></article>`).join("")}
      </section>
      <section class="panel">
        <h2>Log generate</h2>
        <table><thead><tr><th>Waktu</th><th>Siapa</th><th>Apa</th><th>Status</th><th>USD</th><th>Terpotong</th></tr></thead><tbody>
          ${generations.generations.map((item) => `<tr><td>${esc(item.createdAt)}</td><td>${esc(item.userEmail || "")}</td><td>${esc(item.feature)}</td><td>${esc(item.status)}</td><td>$${Number(item.costUsd).toFixed(4)}</td><td>${rupiah(item.chargedIdr)}</td></tr>`).join("")}
        </tbody></table>
      </section>`;
    document.querySelector("#kill").addEventListener("click", async () => {
      await api("/api/admin/kill-switch", { json: { enabled: !summary.killSwitch } });
      loadAdmin();
    });
    document.querySelector("#settings-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const settings = {};
      for (const [key, value] of data.entries()) settings[key] = value;
      await api("/api/admin/settings", { method: "PUT", json: { settings } });
      setBanner("info", "Pengaturan tersimpan.");
      await refreshMe();
    });
    document.querySelector("#new-user").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      await api("/api/admin/users", { json: Object.fromEntries(data.entries()) });
      setBanner("info", "Akun baru dibuat.");
      loadAdmin();
    });
    document.querySelectorAll(".topup").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const amount = new FormData(form).get("amountIdr");
      await api(`/api/admin/users/${form.dataset.id}/topup`, { json: { amountIdr: Number(amount), note: "Isi saldo dari admin" } });
      loadAdmin();
    }));
    document.querySelector("#new-recipe").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target).entries());
      data.config = {};
      await api("/api/admin/recipes", { json: data });
      loadAdmin();
    });
    document.querySelectorAll("[data-del]").forEach((button) => button.addEventListener("click", async () => {
      await api(`/api/admin/recipes/${button.dataset.del}`, { method: "DELETE" });
      loadAdmin();
    }));
  } catch (error) {
    box.innerHTML = `<p>${esc(error.message)}</p>`;
  }
}

function settingField(name, label, value) {
  return `<label>${esc(label)}<input name="${esc(name)}" value="${esc(value)}" /></label>`;
}

render();
