/* CRM CPP — conexión con Supabase.
   Se encarga del login del equipo, de leer y guardar los datos en vivo y de la presencia
   (quién tiene abierta cada ficha). Expone window.claude.use(...) con la misma forma que
   usaba la versión anterior del CRM, así la interfaz no cambia. */
(function () {
  "use strict";
  const CFG = window.CRM_CONFIG || {};
  const configured = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && !/PEGA_AQUI/.test(CFG.supabaseUrl + CFG.supabaseAnonKey));
  let readyResolve;
  window.CRM_READY = new Promise(r => { readyResolve = r; });

  const PALETTE = ["#1d5ae0", "#0d7a63", "#a35f00", "#6d4fd8", "#0a7891", "#b42318", "#4d6b16", "#8a3fb3"];
  const colorFor = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let sb = null;
  let ME = null;            // {id, email, name, color, role}
  let TEAM = new Map();     // user_id -> {user_id, name, color, role, email}

  /* ---------------- login screen ---------------- */
  const style = document.createElement("style");
  style.textContent = `
  .auth{position:fixed;inset:0;z-index:100;display:grid;place-items:center;overflow-y:auto;background:var(--bg);
    padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
  .auth-card{width:min(400px,100%);background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:28px 26px;display:flex;flex-direction:column;gap:14px}
  .auth-card .brand{padding:0;margin-bottom:4px}
  .auth-card h1{margin:0;font-size:20px;letter-spacing:-.01em;font-weight:650}
  .auth-card p{margin:0;color:var(--text-3);font-size:13px;line-height:1.5}
  .auth-card .btn{height:40px;width:100%}
  .auth-card form{display:flex;flex-direction:column;gap:12px}
  .auth-err{padding:9px 12px;border-radius:var(--r-sm);background:var(--bad-soft);color:var(--text);font-size:13px}
  .auth-card code{font-family:var(--f-mono);font-size:12px;background:var(--surface-2);padding:1px 5px;border-radius:4px}`;
  document.head.appendChild(style);

  let authEl = null;
  function authCard(inner) {
    if (!authEl) { authEl = document.createElement("div"); authEl.className = "auth"; authEl.setAttribute("role", "dialog"); authEl.setAttribute("aria-modal", "true"); document.body.appendChild(authEl); }
    authEl.innerHTML = `<div class="auth-card"><div class="brand"><span class="logo">cpp</span><div><b>CRM CPP</b><small>Prospección de clientes</small></div></div>${inner}</div>`;
    return authEl;
  }
  function hideAuth() { if (authEl) { authEl.remove(); authEl = null; } }
  function showMessage(title, text, actions) {
    const el = authCard(`<h1>${escH(title)}</h1><p>${text}</p>${actions || ""}`);
    return el;
  }
  function showLoading() { authCard(`<p>Conectando con el equipo…</p><div class="skel" style="width:80%"></div><div class="skel" style="width:55%"></div>`); }
  function showSetup() {
    showMessage("Falta conectar la base de datos",
      `Abre el archivo <code>js/config.js</code> y pega la <b>Project URL</b> y la clave <b>anon public</b> de tu proyecto de Supabase. Los pasos completos están en el archivo <code>LEEME.md</code>.`);
  }
  function showLogin(errText, email) {
    const el = authCard(`<h1>Inicia sesión</h1><p>Entra con tu correo y tu contraseña del CRM.</p>
      ${errText ? `<div class="auth-err" role="alert">${escH(errText)}</div>` : ""}
      <form id="auth-form" novalidate>
        <div><label class="lbl" for="auth-email">Correo</label><input id="auth-email" class="inp" type="email" autocomplete="username" required></div>
        <div><label class="lbl" for="auth-pass">Contraseña</label><input id="auth-pass" class="inp" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit" id="auth-go">Entrar</button>
      </form>
      <button class="btn ghost" type="button" id="auth-forgot">Olvidé mi contraseña</button>`);
    const em = el.querySelector("#auth-email"), pw = el.querySelector("#auth-pass");
    el.querySelector("#auth-forgot").addEventListener("click", () => showForgot(em.value.trim()));
    if (email) em.value = email;
    setTimeout(() => (email ? pw : em).focus(), 30);
    el.querySelector("#auth-form").addEventListener("submit", async e => {
      e.preventDefault();
      const address = em.value.trim(), password = pw.value;
      if (!address || !password) { showLogin("Escribe tu correo y tu contraseña.", address); return; }
      const btn = el.querySelector("#auth-go"); btn.disabled = true; btn.textContent = "Entrando…";
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email: address, password });
        if (error) {
          const m = /invalid login credentials/i.test(error.message) ? "El correo o la contraseña no son correctos." :
            /email not confirmed/i.test(error.message) ? "Tu usuario aún no está confirmado. Pide a quien administra el CRM que lo confirme en Supabase." :
            /fetch|network/i.test(error.message) ? "No hay conexión a internet. Revisa tu red e inténtalo otra vez." :
            "No se pudo iniciar sesión. Inténtalo otra vez en unos segundos.";
          showLogin(m, address); return;
        }
        await enter(data.user);
      } catch (err) { showLogin("No hay conexión a internet. Revisa tu red e inténtalo otra vez.", address); }
    });
  }
  const backUrl = () => location.origin + location.pathname;
  function showForgot(email, sentTo) {
    if (sentTo) {
      const el = showMessage("Revisa tu correo", `Si <b>${escH(sentTo)}</b> está registrado, te llegará un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.`,
        `<button class="btn" id="auth-back">Volver a iniciar sesión</button>`);
      el.querySelector("#auth-back").addEventListener("click", () => showLogin("", sentTo));
      return;
    }
    const el = authCard(`<h1>Recuperar contraseña</h1><p>Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.</p>
      <form id="auth-form" novalidate><div><label class="lbl" for="auth-email">Correo</label><input id="auth-email" class="inp" type="email" autocomplete="username" required></div>
      <button class="btn primary" type="submit" id="auth-go">Enviar enlace</button></form>
      <button class="btn ghost" type="button" id="auth-back">Volver</button>`);
    const em = el.querySelector("#auth-email"); em.value = email || ""; setTimeout(() => em.focus(), 30);
    el.querySelector("#auth-back").addEventListener("click", () => showLogin("", em.value.trim()));
    el.querySelector("#auth-form").addEventListener("submit", async e => {
      e.preventDefault(); const address = em.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(address)) { em.focus(); return; }
      const btn = el.querySelector("#auth-go"); btn.disabled = true; btn.textContent = "Enviando…";
      const { error } = await sb.auth.resetPasswordForEmail(address, { redirectTo: backUrl() });
      if (error && /rate|seconds/i.test(error.message)) { btn.disabled = false; btn.textContent = "Enviar enlace"; showLogin("Se pidieron demasiados enlaces seguidos. Espera unos minutos y vuelve a intentarlo.", address); return; }
      showForgot("", address);
    });
  }
  function showSetPassword(u, isInvite) {
    const el = authCard(`<h1>${isInvite ? "Bienvenido al CRM de CPP" : "Crea tu contraseña nueva"}</h1>
      <p>${isInvite ? "Crea tu contraseña para entrar. La usarás junto con tu correo" : "Escribe tu contraseña nueva para"} <b>${escH(u.email || "")}</b>.</p>
      <form id="auth-form" novalidate>
        <div><label class="lbl" for="auth-pass">Contraseña</label><input id="auth-pass" class="inp" type="password" autocomplete="new-password" required><p class="hint">Mínimo 8 caracteres.</p></div>
        <div><label class="lbl" for="auth-pass2">Repite la contraseña</label><input id="auth-pass2" class="inp" type="password" autocomplete="new-password" required></div>
        <div class="auth-err" id="auth-err" role="alert" hidden></div>
        <button class="btn primary" type="submit" id="auth-go">Guardar y entrar</button>
      </form>`);
    const p1 = el.querySelector("#auth-pass"), p2 = el.querySelector("#auth-pass2"), err = el.querySelector("#auth-err");
    setTimeout(() => p1.focus(), 30);
    const fail = t => { err.textContent = t; err.hidden = false; };
    el.querySelector("#auth-form").addEventListener("submit", async e => {
      e.preventDefault();
      if (p1.value.length < 8) return fail("La contraseña debe tener al menos 8 caracteres.");
      if (p1.value !== p2.value) return fail("Las dos contraseñas no coinciden.");
      const btn = el.querySelector("#auth-go"); btn.disabled = true; btn.textContent = "Guardando…";
      const { error } = await sb.auth.updateUser({ password: p1.value });
      if (error) {
        btn.disabled = false; btn.textContent = "Guardar y entrar";
        return fail(/same|different from the old/i.test(error.message) ? "Usa una contraseña distinta de la anterior." :
          /weak|short|characters/i.test(error.message) ? "Esa contraseña es muy débil. Prueba con una más larga." :
          "No se pudo guardar. El enlace puede haber vencido: pide uno nuevo desde «Olvidé mi contraseña».");
      }
      try { history.replaceState(null, "", location.pathname); } catch (x) {}
      await enter(u);
    });
  }
  function showNotTeam(email) {
    const el = showMessage("Tu cuenta no tiene acceso",
      `Iniciaste sesión como <b>${escH(email)}</b>, pero ese correo no está en la lista del equipo. Pide a quien administra el CRM que lo agregue y vuelve a entrar.`,
      `<button class="btn" id="auth-out">Cerrar sesión</button>`);
    el.querySelector("#auth-out").addEventListener("click", async () => { try { await sb.auth.signOut(); } catch (e) {} showLogin(); });
  }

  async function enter(u) {
    showLoading();
    let row = null;
    for (let i = 0; i < 3; i++) {
      const { data, error } = await sb.from("team").select("user_id,email,name,color,role").eq("user_id", u.id).maybeSingle();
      if (!error) { row = data; break; }
      if (i === 2) {
        const el = showMessage("No se pudo verificar tu acceso", "Revisa tu conexión a internet y vuelve a intentarlo.", `<button class="btn primary" id="auth-retry">Reintentar</button>`);
        el.querySelector("#auth-retry").addEventListener("click", () => enter(u));
        return;
      }
      await wait(800);
    }
    if (!row) { showNotTeam(u.email || ""); return; }
    ME = { id: u.id, email: u.email || "", name: row.name || (u.email || "").split("@")[0], color: row.color || colorFor(u.id), role: row.role || "member" };
    await loadTeam(true);
    startRealtime();
    startRoom();
    hideAuth();
    readyResolve();
  }

  /* ---------------- team (people) ---------------- */
  let teamLoadedAt = 0;
  async function loadTeam(force) {
    if (!force && Date.now() - teamLoadedAt < 30000) return;
    teamLoadedAt = Date.now();
    const { data, error } = await sb.from("team").select("user_id,email,name,color,role");
    if (error || !data) return;
    TEAM = new Map(data.map(r => [r.user_id, r]));
    if (ME && TEAM.has(ME.id)) { const r = TEAM.get(ME.id); ME.name = r.name || ME.name; ME.role = r.role || ME.role; }
  }
  setInterval(() => { if (ME) loadTeam(true); }, 5 * 60000);
  const profileOf = id => { const r = TEAM.get(id); return { id, name: r ? (r.name || (r.email || "").split("@")[0]) : "", avatarUrl: "", color: (r && r.color) || colorFor(id), email: null, isMe: !!ME && id === ME.id, guest: false }; };
  const user = {
    me: async () => ({ id: ME.id, name: ME.name, avatarUrl: "", color: ME.color, email: ME.email, isOwner: ME.role === "admin", canEdit: true }),
    id: async () => ME.id,
    name: async () => ME.name,
    isOwner: async () => ME.role === "admin",
    canEdit: async () => true,
    can: async () => true,
    profiles: async ids => {
      ids = [].concat(ids || []);
      if (ids.some(id => !TEAM.has(id))) await loadTeam(false);
      return Object.fromEntries(ids.map(id => [id, profileOf(id)]));
    },
    search: async () => [...TEAM.keys()].map(profileOf),
    teamIds: () => [...TEAM.keys()]
  };

  /* ---------------- documents (live data) ---------------- */
  const cache = new Map();    // collection -> Map(id -> data)
  const loading = new Map();  // collection -> Promise
  const subs = new Set();     // {q, cb}
  const LIMITS = { activities: 5000 };
  let lastSync = Date.now();

  function mapErr(e) {
    const m = (e && (e.message || e.error_description)) || String(e || "error");
    if (e && (e.code === "42501" || e.code === "P0002")) return { code: "invalid_argument", message: m };
    if (/row-level security|permission denied|not_found/i.test(m)) return { code: "invalid_argument", message: m };
    return { code: "unavailable", message: m };
  }
  async function fetchCollection(col) {
    const m = new Map(); const page = 1000; const max = LIMITS[col] || 200000;
    for (let from = 0; from < max; from += page) {
      let q = sb.from("docs").select("id,data").eq("collection", col);
      q = col === "activities" ? q.order("updated_at", { ascending: false }) : q.order("id", { ascending: true });
      const { data, error } = await q.range(from, Math.min(from + page, max) - 1);
      if (error) throw mapErr(error);
      for (const r of data) m.set(r.id, r.data || {});
      if (data.length < page) break;
    }
    return m;
  }
  function ensure(col) {
    if (!loading.has(col)) {
      const p = fetchCollection(col).then(m => { cache.set(col, m); lastSync = Date.now(); return m; });
      loading.set(col, p);
      p.catch(() => { loading.delete(col); setTimeout(() => { if ([...subs].some(s => s.q.col === col)) ensure(col).then(() => notify(col), () => {}); }, 5000); });
    }
    return loading.get(col);
  }
  async function resync() {
    for (const col of [...cache.keys()]) {
      try { const m = await fetchCollection(col); cache.set(col, m); notify(col); } catch (e) { /* next try */ }
    }
    lastSync = Date.now();
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && ME && Date.now() - lastSync > 120000) resync(); });
  setInterval(() => { if (ME && document.visibilityState === "visible") resync(); }, 10 * 60000);

  const META = Object.freeze({ fromCache: false, hasPendingWrites: false });
  function snapDoc(id, data) { return Object.freeze({ id, exists: data !== undefined, data: () => data, metadata: META }); }
  function run(q) {
    const m = cache.get(q.col) || new Map();
    let rows = [];
    m.forEach((d, id) => rows.push([id, d]));
    for (const [f, op, v] of q.where) {
      rows = rows.filter(([, d]) => {
        const a = d[f];
        switch (op) {
          case "==": return a === v; case "!=": return a !== v; case "<": return a < v; case "<=": return a <= v;
          case ">": return a > v; case ">=": return a >= v; case "in": return Array.isArray(v) && v.includes(a);
          case "not-in": return Array.isArray(v) && !v.includes(a); case "array-contains": return Array.isArray(a) && a.includes(v);
          default: return true;
        }
      });
    }
    if (q.order) {
      const [f, dir] = q.order; const s = dir === "desc" ? -1 : 1;
      rows.sort((x, y) => { const a = x[1][f], b = y[1][f]; if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; return (a < b ? -1 : a > b ? 1 : 0) * s; });
    } else rows.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    if (q.limit) rows = rows.slice(0, q.limit);
    const docs = rows.map(([id, d]) => snapDoc(id, d));
    return { docs, size: docs.length, empty: !docs.length, metadata: META, docChanges: () => [] };
  }
  const dirty = new Set(); let flushT = null;
  function notify(col) {
    dirty.add(col);
    if (flushT) return;
    flushT = setTimeout(() => {
      flushT = null; const cols = new Set(dirty); dirty.clear();
      for (const s of [...subs]) if (cols.has(s.q.col) && cache.has(s.q.col)) { try { s.cb(run(s.q)); } catch (e) { console.error(e); } }
    }, 0);
  }
  function makeQuery(q) {
    return {
      where: (f, op, v) => makeQuery({ ...q, where: [...q.where, [f, op, v]] }),
      orderBy: (f, dir = "asc") => makeQuery({ ...q, order: [f, dir] }),
      limit: n => makeQuery({ ...q, limit: n }),
      get: async () => { await ensure(q.col); return run(q); },
      onSnapshot: (cb, onErr) => {
        const s = { q, cb }; subs.add(s);
        ensure(q.col).then(() => { if (subs.has(s)) { try { cb(run(q)); } catch (e) { console.error(e); } } }, () => {});
        return () => { subs.delete(s); };
      }
    };
  }
  const newId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 20) : Math.random().toString(36).slice(2) + Date.now().toString(36));
  function splitPath(path) {
    const parts = String(path).split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new TypeError("Ruta no válida: " + path);
    return parts;
  }
  function makeDoc(col, id) {
    const path = col + "/" + id;
    return {
      id, path,
      get: async () => { await ensure(col); return snapDoc(id, (cache.get(col) || new Map()).get(id)); },
      set: async data => {
        const clean = JSON.parse(JSON.stringify(data));
        const { error } = await sb.from("docs").upsert({ collection: col, id, data: clean, updated_at: new Date().toISOString() });
        if (error) throw mapErr(error);
        if (cache.has(col)) { cache.get(col).set(id, clean); notify(col); }
      },
      update: async patch => {
        const clean = JSON.parse(JSON.stringify(patch));
        const { error } = await sb.rpc("docs_merge", { p_collection: col, p_id: id, p_patch: clean });
        if (error) throw mapErr(error);
        const m = cache.get(col);
        if (m && m.has(id)) { m.set(id, { ...m.get(id), ...clean }); notify(col); }
      },
      delete: async () => {
        const { error } = await sb.from("docs").delete().eq("collection", col).eq("id", id);
        if (error) throw mapErr(error);
        const m = cache.get(col); if (m) { m.delete(id); notify(col); }
      },
      onSnapshot: (cb) => makeQuery({ col, where: [], order: null, limit: 0 }).onSnapshot(s => cb(snapDoc(id, (cache.get(col) || new Map()).get(id)))),
      collection: () => { throw new TypeError("Subcolecciones no disponibles"); }
    };
  }
  function makeCollection(col) {
    if (!col || col.includes("/")) throw new TypeError("Colección no válida: " + col);
    return Object.assign(makeQuery({ col, where: [], order: null, limit: 0 }), {
      path: col,
      doc: id => makeDoc(col, id || newId()),
      add: async data => { const r = makeDoc(col, newId()); await r.set(data); return r; }
    });
  }
  const db = { doc: path => { const [c, i] = splitPath(path); return makeDoc(c, i); }, collection: makeCollection };

  let realtimeFirst = true;
  function startRealtime() {
    sb.channel("crm-docs")
      .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, payload => {
        const row = (payload.new && payload.new.collection) ? payload.new : payload.old;
        if (!row || !row.collection) return;
        const m = cache.get(row.collection); if (!m) return;
        if (payload.eventType === "DELETE") m.delete(row.id); else m.set(row.id, payload.new.data || {});
        notify(row.collection);
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") { if (!realtimeFirst) resync(); realtimeFirst = false; }
      });
  }

  /* ---------------- presence (who is on which card right now) ---------------- */
  const tabId = "t" + Math.random().toString(36).slice(2, 10);
  let roomCh = null, roomReady = false, myPres = {}, peersSnap = Object.freeze([]);
  const peerHandlers = new Set();
  function startRoom() {
    roomCh = sb.channel("crm-presence", { config: { presence: { key: tabId } } });
    roomCh.on("presence", { event: "sync" }, () => {
      const st = roomCh.presenceState(); const list = [];
      for (const [key, metas] of Object.entries(st)) {
        const last = metas[metas.length - 1] || {}; const pr = { ...last }; delete pr.presence_ref;
        const by = typeof pr.uid === "string" ? pr.uid : null;
        list.push(Object.freeze({ peer: key, by, isMe: !!ME && by === ME.id, sameTab: key === tabId, kind: "viewer", guest: false, presence: Object.freeze(pr), updatedAt: Date.now() }));
      }
      peersSnap = Object.freeze(list);
      peerHandlers.forEach(h => { try { h({ peers: peersSnap, joined: [], left: [], updated: [] }); } catch (e) { console.error(e); } });
    });
    roomCh.subscribe(status => {
      roomReady = status === "SUBSCRIBED";
      if (roomReady) roomCh.track({ ...myPres, uid: ME.id }).catch(() => {});
    });
  }
  let trackT = null;
  const room = {
    presence: async patch => {
      for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete myPres[k]; else myPres[k] = v; }
      if (!roomCh) return;
      clearTimeout(trackT);
      trackT = setTimeout(() => { if (roomReady) roomCh.track({ ...myPres, uid: ME.id }).catch(() => {}); }, 80);
    },
    onPeers: h => { peerHandlers.add(h); setTimeout(() => { if (peerHandlers.has(h)) h({ peers: peersSnap, joined: peersSnap, left: [], updated: [] }); }, 0); return () => peerHandlers.delete(h); },
    peers: () => peersSnap,
    connected: () => roomReady
  };

  /* ---------------- downloads ---------------- */
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename || "archivo";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { status: "saved" };
    }
  };

  window.claude = { use: async name => (ME ? ({ db, user, downloads, room })[name] || null : null) };

  /* ---------------- my profile ---------------- */
  window.CRM_PROFILE = function () {
    if (!ME || typeof openModal !== "function") return;
    const m = openModal({
      title: "Mi perfil",
      body: `<div><label class="lbl" for="pf-name">Tu nombre</label><input id="pf-name" class="inp" autocomplete="name" maxlength="60"><p class="hint">Así te verá el equipo en el CRM.</p></div>
        <div><span class="lbl">Correo</span><div class="mono" id="pf-mail"></div></div>
        <div><label class="lbl" for="pf-pass">Nueva contraseña</label><input id="pf-pass" class="inp" type="password" autocomplete="new-password" placeholder="Déjala vacía para no cambiarla"><p class="hint">Mínimo 8 caracteres.</p></div>`,
      foot: `<button class="btn danger" id="pf-out">Cerrar sesión</button><span style="flex:1"></span><button class="btn" data-close>Cancelar</button><button class="btn primary" id="pf-save">Guardar</button>`
    });
    m.querySelector("#pf-name").value = ME.name;
    m.querySelector("#pf-mail").textContent = ME.email;
    m.querySelector("#pf-out").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
    m.querySelector("#pf-save").addEventListener("click", async () => {
      const name = m.querySelector("#pf-name").value.trim(); const pass = m.querySelector("#pf-pass").value;
      if (!name) { toast("Escribe tu nombre.", "bad"); return; }
      if (pass && pass.length < 8) { toast("La contraseña debe tener al menos 8 caracteres.", "bad"); return; }
      const btn = m.querySelector("#pf-save"); btn.disabled = true;
      try {
        if (name !== ME.name) {
          const { error } = await sb.from("team").update({ name }).eq("user_id", ME.id);
          if (error) throw error;
          ME.name = name; const r = TEAM.get(ME.id); if (r) TEAM.set(ME.id, { ...r, name });
          S.me.name = name; S.profiles[ME.id] = profileOf(ME.id); renderMe(); scheduleRender();
        }
        if (pass) { const { error } = await sb.auth.updateUser({ password: pass }); if (error) throw error; }
        closeModal(m); toast(pass ? "Perfil y contraseña actualizados" : "Perfil actualizado", "ok");
      } catch (e) {
        btn.disabled = false;
        toast(/same.*password|different from the old/i.test(e.message || "") ? "La nueva contraseña debe ser distinta de la actual." : "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.", "bad");
      }
    });
  };

  /* ---------------- start ---------------- */
  async function start() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      showMessage("No se pudo cargar el CRM", "Revisa tu conexión a internet y recarga la página."); return;
    }
    if (!configured) { showSetup(); return; }
    // Links from the invitation and password-recovery emails arrive with #...&type=invite|recovery
    const hp = new URLSearchParams(location.hash.slice(1)), qp = new URLSearchParams(location.search);
    const linkType = hp.get("type") || qp.get("type");
    const linkError = hp.get("error_description") || qp.get("error_description");
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } });
    let recovering = false;
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === "SIGNED_OUT" && ME) location.reload();
      if (ev === "PASSWORD_RECOVERY" && session && !recovering) { recovering = true; showSetPassword(session.user, false); }
    });
    showLoading();
    if (linkError) {
      try { history.replaceState(null, "", location.pathname); } catch (x) {}
      showLogin(/expired|invalid/i.test(linkError) ? "El enlace del correo ya venció o ya se usó. Pide uno nuevo con «Olvidé mi contraseña»." : "No se pudo usar el enlace del correo. Pide uno nuevo con «Olvidé mi contraseña».");
      return;
    }
    try {
      const { data } = await sb.auth.getSession();
      const session = data && data.session;
      if (session && (linkType === "invite" || linkType === "recovery")) { if (!recovering) { recovering = true; showSetPassword(session.user, linkType === "invite"); } }
      else if (session) await enter(session.user);
      else if (!recovering) showLogin();
    } catch (e) { showLogin(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
