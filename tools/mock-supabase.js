/* Simulación local de Supabase para probar el CRM sin tocar la base real.
   Solo se usa en tools/test.html (no se publica). Contraseña de prueba: test1234 */
(function () {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const DB = { docs: new Map(), team: new Map() };
  for (const [collection, id, data] of (window.__SEED__ || [])) DB.docs.set(collection + "|" + id, { collection, id, data, updated_at: "2026-11-01T12:00:00Z" });
  [["u_darnell", "darnell@test.com", "Darnell Vásquez", "admin"], ["u_jose", "jose@test.com", "José Santana", "member"], ["u_juan", "juan@test.com", "Juan Flores", "member"]]
    .forEach(([user_id, email, name, role]) => DB.team.set(user_id, { user_id, email, name, color: null, role }));
  const USERS = { "darnell@test.com": { id: "u_darnell", email: "darnell@test.com" }, "intruso@test.com": { id: "u_x", email: "intruso@test.com" } };
  const listeners = [], authCbs = [];
  let session = null; try { session = JSON.parse(sessionStorage.getItem("mock-session") || "null"); } catch (e) {}
  let presenceChan = null;
  window.__DB = DB;
  const emit = (eventType, n, o) => setTimeout(() => listeners.forEach(cb => cb({ eventType, new: n || {}, old: o || {} })), 20);

  class Q {
    constructor(t) { this.t = t; this.f = []; this.ord = null; this.rng = null; this.op = "select"; }
    select() { return this; } eq(c, v) { this.f.push([c, v]); return this; }
    order(c, o) { this.ord = [c, !!(o && o.ascending === false)]; return this; } range(a, b) { this.rng = [a, b]; return this; }
    maybeSingle() { this.single = true; return this; }
    upsert(row) { this.op = "upsert"; this.payload = row; return this; } update(p) { this.op = "update"; this.payload = p; return this; } delete() { this.op = "delete"; return this; }
    then(res, rej) { return this.exec().then(res, rej); }
    async exec() {
      await wait(15);
      if (window.__offline) return { data: null, error: { message: "TypeError: Failed to fetch" } };
      if (!session) return { data: null, error: { code: "42501", message: "permission denied" } };
      const inTeam = DB.team.has(session.user.id);
      if (this.t === "team") {
        let rows = inTeam ? [...DB.team.values()] : [];
        for (const [c, v] of this.f) rows = rows.filter(r => r[c] === v);
        if (this.op === "update") { rows.forEach(r => { if (r.user_id === session.user.id) Object.assign(r, { name: this.payload.name ?? r.name }); }); return { data: null, error: null }; }
        if (this.single) return { data: rows[0] ? { ...rows[0] } : null, error: null };
        return { data: rows.map(r => ({ ...r })), error: null };
      }
      if (!inTeam) return this.op === "select" ? { data: [], error: null } : { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
      if (window.__failWrites && this.op !== "select") return { data: null, error: { code: "42501", message: "row-level security" } };
      if (this.op === "upsert") { const r = JSON.parse(JSON.stringify(this.payload)); const k = r.collection + "|" + r.id; const old = DB.docs.get(k); DB.docs.set(k, r); emit(old ? "UPDATE" : "INSERT", r, old); return { data: null, error: null }; }
      let rows = [...DB.docs.values()];
      for (const [c, v] of this.f) rows = rows.filter(r => r[c] === v);
      if (this.op === "delete") { rows.forEach(r => { DB.docs.delete(r.collection + "|" + r.id); emit("DELETE", null, { collection: r.collection, id: r.id }); }); return { data: null, error: null }; }
      if (this.ord) { const [c, desc] = this.ord; rows.sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (desc ? -1 : 1)); }
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
      return { data: rows.map(r => ({ id: r.id, data: JSON.parse(JSON.stringify(r.data)) })), error: null };
    }
  }
  function merge(col, id, patch) { const k = col + "|" + id; const r = DB.docs.get(k); if (!r) return false; const n = { ...r, data: { ...r.data, ...patch }, updated_at: new Date().toISOString() }; DB.docs.set(k, n); emit("UPDATE", n, r); return true; }
  const client = {
    from: t => new Q(t),
    rpc: async (fn, a) => { await wait(15); if (window.__failWrites) return { error: { code: "42501", message: "rls" } }; return merge(a.p_collection, a.p_id, a.p_patch) ? { data: null, error: null } : { data: null, error: { code: "P0002", message: "not_found" } }; },
    auth: {
      getSession: async () => ({ data: { session } }),
      signInWithPassword: async ({ email, password }) => { await wait(60); const u = USERS[email]; if (!u || password !== "test1234") return { data: {}, error: { message: "Invalid login credentials" } }; session = { user: u }; sessionStorage.setItem("mock-session", JSON.stringify(session)); return { data: { user: u, session }, error: null }; },
      signOut: async () => { session = null; sessionStorage.removeItem("mock-session"); authCbs.forEach(c => c("SIGNED_OUT", null)); return { error: null }; },
      onAuthStateChange: cb => { authCbs.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      updateUser: async () => ({ data: {}, error: null }),
      resetPasswordForEmail: async (email, opts) => { window.__resetFor = [email, opts && opts.redirectTo]; return { data: {}, error: null }; }
    },
    channel: (name, opts) => {
      const ch = {
        on(type, filter, cb) { if (type === "postgres_changes") listeners.push(cb); else if (type === "presence") this._sync = cb; return this; },
        subscribe(cb) { if (name === "crm-presence") presenceChan = this; setTimeout(() => cb("SUBSCRIBED"), 30); return this; },
        presenceState() { return window.__presState || {}; },
        async track(p) { window.__myTrack = p; const st = { ...(window.__presState || {}) }; st[opts.config.presence.key] = [{ ...p, presence_ref: "me" }]; window.__presState = st; setTimeout(() => this._sync && this._sync(), 10); return "ok"; }
      };
      return ch;
    }
  };
  window.__remotePresence = (key, p) => { const st = { ...(window.__presState || {}) }; if (p) st[key] = [{ ...p, presence_ref: "r" }]; else delete st[key]; window.__presState = st; presenceChan && presenceChan._sync && presenceChan._sync(); };
  window.__remoteMerge = merge;
  window.__remoteInsert = (collection, id, data) => { const r = { collection, id, data, updated_at: new Date().toISOString() }; DB.docs.set(collection + "|" + id, r); emit("INSERT", r, null); };
  window.supabase = { createClient: () => client };
})();
