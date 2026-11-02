/* CRM CPP — Harvey: tablero de seguimiento, búsqueda de negocios nuevos y cliente ideal.
   Va aparte del resto del CRM: agrega su propia sección y guarda en sus propias colecciones
   (hv_candidates, hv_config). Solo escribe en "leads" y "activities" cuando alguien pasa un
   candidato al CRM, igual que "Nuevo contacto". Ideas tomadas de github.com/ethanplusai/harvey:
   búsqueda gratuita en OpenStreetMap, puntaje de cliente ideal con sus razones, revisión humana
   antes de contactar y un orden fijo de prioridades para decidir qué hacer ahora. */
(function () {
"use strict";
if (typeof VIEWS === "undefined" || typeof NAV === "undefined") return;

/* ================= constants ================= */
const HV_CAND = "hv_candidates", HV_CFG = "hv_config";
const CASE_URL = "https://bahia-de-cuba.github.io/Bahia-Cuba-Landing-Page/";
const CASE_TPL_ID = "tpl-hv-bahia";
// Rubro del CRM -> etiquetas de OpenStreetMap que de verdad llevan esos negocios. Sin comodín:
// una búsqueda que no se puede responder debe decirlo, no llenar la lista de cualquier cosa.
const RUBROS = [
  ["Dentista", ["amenity=dentist", "healthcare=dentist"]],
  ["Clínica / centro médico", ["amenity=clinic", "amenity=doctors", "healthcare=clinic", "healthcare=physiotherapist"]],
  ["Veterinaria", ["amenity=veterinary"]],
  ["Estética / spa / salón", ["shop=beauty", "shop=hairdresser", "shop=massage", "leisure=spa"]],
  ["Restaurante", ["amenity=restaurant"]],
  ["Cafetería", ["amenity=cafe"]],
  ["Hotel", ["tourism=hotel", "tourism=guest_house", "tourism=hostel", "tourism=motel"]],
  ["Agencia de viajes", ["shop=travel_agency", "office=travel_agent"]],
  ["Inmobiliaria", ["office=estate_agent"]],
  ["Abogados", ["office=lawyer"]],
  ["Contadores", ["office=accountant"]],
  ["Constructora", ["office=construction_company", "craft=builder"]],
  ["Gimnasio", ["leisure=fitness_centre", "leisure=sports_centre"]],
  ["Panadería / pastelería", ["shop=bakery", "shop=pastry", "shop=confectionery"]],
  ["Óptica", ["shop=optician"]],
  ["Florería", ["shop=florist"]],
  ["Tienda de ropa", ["shop=clothes", "shop=boutique"]],
  ["Academia", ["amenity=language_school", "amenity=driving_school", "amenity=music_school", "amenity=dancing_school"]]
];
const PLACES = [
  ["lima-miraflores", "Lima · Miraflores", "Lima", "Miraflores", -12.1211, -77.0297, 2.5],
  ["lima-sanisidro", "Lima · San Isidro", "Lima", "San Isidro", -12.0977, -77.0365, 2.5],
  ["lima-surco", "Lima · Santiago de Surco", "Lima", "Santiago de Surco", -12.1450, -76.9910, 3.5],
  ["lima-sanborja", "Lima · San Borja", "Lima", "San Borja", -12.1080, -76.9980, 2.5],
  ["lima-jesusmaria", "Lima · Jesús María", "Lima", "Jesús María", -12.0770, -77.0480, 2],
  ["lima-barranco", "Lima · Barranco", "Lima", "Barranco", -12.1490, -77.0210, 1.5],
  ["lima-lamolina", "Lima · La Molina", "Lima", "La Molina", -12.0800, -76.9300, 3.5],
  ["lima-losolivos", "Lima · Los Olivos", "Lima", "Los Olivos", -11.9700, -77.0730, 3],
  ["lima-cercado", "Lima · Cercado", "Lima", "Cercado de Lima", -12.0464, -77.0428, 2.5],
  ["trujillo", "Trujillo", "Trujillo", "", -8.1116, -79.0288, 4],
  ["arequipa", "Arequipa", "Arequipa", "", -16.4090, -71.5375, 4],
  ["cusco", "Cusco", "Cusco", "", -13.5320, -71.9675, 3],
  ["chiclayo", "Chiclayo", "Chiclayo", "", -6.7714, -79.8409, 3.5],
  ["piura", "Piura", "Piura", "", -5.1945, -80.6328, 3.5],
  ["huarmey", "Huarmey", "Huarmey", "", -10.0681, -78.1522, 3]
];
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const DEF = { minRating: 4.2, revMin: 15, revMax: 400, rubros: ["Dentista", "Clínica / centro médico", "Veterinaria", "Estética / spa / salón", "Hotel", "Restaurante", "Cafetería", "Inmobiliaria"] };
const TABS = [["hoy", "Hoy"], ["buscar", "Buscar negocios"], ["candidatos", "Candidatos"], ["ideal", "Cliente ideal"]];
const CAND_ST = [["revisar", "Por revisar"], ["aprobado", "En el CRM"], ["descartado", "Descartados"]];
const CASE_BODY = "Buenos días. Le escribe {mi_nombre}, de CPP (Creative Programming Partners).\n\nEncontré {negocio} en Google Maps y vi que todavía no tiene una página propia. Para un negocio como el suyo, la página puede {idea}.\n\nHace poco hicimos la página y el sistema de reservas del Hotel Bahía de Cuba, en Huarmey: sus huéspedes ven las habitaciones, cotizan y reservan en línea. Puede verla aquí: " + CASE_URL + "\n\n¿Le parece si le preparo una idea de cómo se vería la de {negocio}? Es sin compromiso.";

I.radar = '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l5.5-5.5"/>';
I.star = '<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z"/>';
NAV.push({ id: "harvey", l: "Harvey", i: "radar" });

/* ================= state ================= */
const H = { tab: store.get("crm.hv.tab", "hoy"), subs: false, cands: new Map(), candsReady: false, cfg: null,
  place: store.get("crm.hv.place", "lima-miraflores"), custom: "", rubro: store.get("crm.hv.rubro", "Dentista"), km: "",
  busy: false, err: "", results: null, meta: null, cSt: "revisar", cRubro: "", cCity: "", work: new Set() };
if (!TABS.some(t => t[0] === H.tab)) H.tab = "hoy";
const cfg = () => ({ ...DEF, ...(H.cfg || {}) });

function subscribe() {
  if (H.subs || !S.db) return; H.subs = true;
  S.db.collection(HV_CAND).onSnapshot(snap => {
    const m = new Map(); snap.docs.forEach(d => { const x = d.data(); if (x) m.set(d.id, { ...x, id: d.id }); });
    H.cands = m; H.candsReady = true; if (S.view === "harvey") scheduleRender();
  }, () => { H.candsReady = true; if (S.view === "harvey") scheduleRender(); });
  S.db.collection(HV_CFG).onSnapshot(snap => { const d = snap.docs.find(x => x.id === "icp"); H.cfg = d ? d.data() : null; if (S.view === "harvey") scheduleRender(); }, () => {});
}
const waitDb = setInterval(() => { if (S.db) { clearInterval(waitDb); subscribe(); } }, 700);

/* ================= scoring: how close a business is to CPP's ideal client ================= */
function isSocial(u) { try { return /(facebook|fb\.com|instagram|tiktok|linktr\.ee|wa\.me|whatsapp)/i.test(new URL(u).hostname); } catch (e) { return false; } }
const numOr = v => (v === null || v === undefined || v === "" || isNaN(+v)) ? null : +v;
function score(c) {
  const k = cfg(); let s = 0; const why = [], todo = [];
  if (!c.website) { s += 25; why.push(c.social ? "Solo tiene redes, sin página propia" : "Sin página web propia"); }
  else { s += 3; why.push("Ya tiene web: ofrecer mejora o rediseño"); }
  const ch = channel(c);
  if (ch === "wa") { s += 25; why.push("WhatsApp directo"); } else if (ch === "fijo") { s += 12; why.push("Solo teléfono fijo"); }
  else if (c.email) { s += 8; why.push("Solo correo"); } else todo.push("buscar su teléfono en Maps");
  const r = numOr(c.rating), n = numOr(c.reviews);
  if (r === null) todo.push("anotar sus estrellas");
  else if (r >= k.minRating + 0.3) { s += 20; why.push(`★ ${r} en Maps: clientes contentos`); }
  else if (r >= k.minRating) { s += 14; why.push(`★ ${r} en Maps`); }
  else if (r >= k.minRating - 0.4) { s += 5; why.push(`★ ${r}: reputación regular`); }
  else { s -= 10; why.push(`★ ${r}: reputación baja`); }
  if (n === null) todo.push("anotar cuántas reseñas tiene");
  else if (n >= k.revMin && n <= k.revMax) { s += 10; why.push(`${n} reseñas: va por buen camino`); }
  else if (n < k.revMin) { s += 3; why.push(`${n} reseñas: todavía poco conocido`); }
  else { s += 4; why.push(`${n} reseñas: ya es muy conocido`); }
  if (c.social) { s += 8; why.push("Activo en redes: ya entiende el valor de mostrarse"); }
  if (k.rubros.includes(c.category)) { s += 12; why.push("Rubro prioritario"); }
  else { const cc = norm(c.category); let w = 12; for (const [re, x] of CAT_W) if (re.test(cc)) { w = x; break; } s += Math.round(w / 30 * 8); }
  s = Math.max(0, Math.min(100, s));
  return { score: s, level: s >= 70 ? "alto" : s >= 45 ? "medio" : "bajo", why, todo };
}
const scoreChip = sc => `<span class="chip pot-${sc.level}" title="${esc(sc.why.join(" · "))}">Potencial ${sc.score}</span>`;

/* ================= duplicates ================= */
const phoneKey = p => { const d = normDigits(p); return d.length >= 7 ? d.slice(-9) : ""; };
function findLead(c) {
  const d = phoneKey(c.phone), n = norm(c.name).trim(), ci = norm(c.city).trim();
  for (const l of S.leads.values()) {
    if (d && phoneKey(l.phone) === d) return l;
    if (n && norm(l.name).trim() === n && (!ci || !l.city || norm(l.city).trim() === ci)) return l;
  }
  return null;
}
function findCand(c) {
  if (H.cands.has(c.id)) return H.cands.get(c.id);
  const d = phoneKey(c.phone), n = norm(c.name).trim();
  for (const x of H.cands.values()) if ((d && phoneKey(x.phone) === d) || (n && norm(x.name).trim() === n && norm(x.city) === norm(c.city))) return x;
  return null;
}
const mapsFor = c => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.name, c.zone, c.city, "Perú"].filter(Boolean).join(", "))}`;

/* ================= discovery: OpenStreetMap (free, no account) ================= */
async function overpass(q) {
  let last = null;
  for (let i = 0; i < OVERPASS.length; i++) {
    if (i) await sleep(3000);
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 90000);
    try {
      const r = await fetch(OVERPASS[i], { method: "POST", body: new URLSearchParams({ data: q }), signal: ac.signal });
      if ([429, 500, 502, 503, 504].includes(r.status)) { last = new Error("busy " + r.status); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { last = e; } finally { clearTimeout(t); }
  }
  throw last || new Error("busy");
}
async function geocode(text) {
  const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pe&q=" + encodeURIComponent(text), { headers: { "Accept-Language": "es" } });
  if (!r.ok) return null; const a = await r.json();
  return a && a[0] ? { lat: +a[0].lat, lng: +a[0].lon } : null;
}
function socialUrl(v, host) { v = String(v || "").trim(); if (!v) return ""; if (/^https?:\/\//i.test(v)) return v; if (/^[\w.-]+\.[a-z]{2,}\//i.test(v)) return "https://" + v; return `https://${host}/${v.replace(/^@/, "")}`; }
function fromOSM(el, p, rubro) {
  const t = el.tags || {}; const name = String(t.name || t["name:es"] || t.brand || "").trim(); if (!name) return null;
  let web = String(t.website || t["contact:website"] || t.url || "").trim();
  if (web && !/^https?:\/\//i.test(web)) web = "https://" + web;
  const socials = [socialUrl(t["contact:facebook"] || t.facebook, "facebook.com"), socialUrl(t["contact:instagram"] || t.instagram, "instagram.com"), socialUrl(t["contact:tiktok"], "tiktok.com")].filter(Boolean);
  if (web && isSocial(web)) { socials.unshift(web); web = ""; }
  const c = { id: `osm-${String(el.type)[0]}${el.id}`, name, category: rubro, city: p.city, zone: t["addr:suburb"] || t["addr:district"] || p.zone || "",
    address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "),
    phone: String(t.phone || t["contact:phone"] || t["contact:mobile"] || t.mobile || "").split(";")[0].trim(),
    email: String(t.email || t["contact:email"] || "").trim(), website: safeUrl(web), social: [...new Set(socials)].join(" "), hours: t.opening_hours || "",
    lat: el.lat ?? (el.center && el.center.lat) ?? null, lng: el.lon ?? (el.center && el.center.lon) ?? null, osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}` };
  c.mapsUrl = mapsFor(c); return c;
}
async function search() {
  if (H.busy) return;
  const rub = RUBROS.find(r => r[0] === H.rubro); if (!rub) return;
  H.busy = true; H.err = ""; H.results = null; renderView();
  try {
    let p;
    if (H.place === "otro") {
      const txt = H.custom.trim(); if (!txt) { const e = new Error("x"); e.user = "Escribe la ciudad o el distrito donde quieres buscar."; throw e; }
      const g = await geocode(txt + ", Perú"); if (!g) { const e = new Error("x"); e.user = `No encontramos «${txt}» en el mapa. Prueba con «distrito, ciudad».`; throw e; }
      const parts = txt.split(",").map(x => x.trim()).filter(Boolean);
      p = { label: txt, city: parts[parts.length - 1] || txt, zone: parts.length > 1 ? parts[0] : "", lat: g.lat, lng: g.lng, km: 3 };
    } else { const x = PLACES.find(q => q[0] === H.place) || PLACES[0]; p = { label: x[1], city: x[2], zone: x[3], lat: x[4], lng: x[5], km: x[6] }; }
    const km = Math.min(15, Math.max(0.5, +H.km || p.km)); const R = Math.round(km * 1000);
    const q = `[out:json][timeout:60];(${rub[1].map(t => { const [k, v] = t.split("="); return `nwr["${k}"="${v}"](around:${R},${p.lat},${p.lng});`; }).join("")});out center tags 300;`;
    const js = await overpass(q); const seen = new Set(); const list = [];
    for (const el of js.elements || []) { const c = fromOSM(el, p, rub[0]); if (!c) continue; const k = norm(c.name) + "|" + phoneKey(c.phone); if (seen.has(k)) continue; seen.add(k); list.push(c); }
    list.sort((a, b) => score(b).score - score(a).score);
    H.results = list; H.meta = { label: p.label, rubro: rub[0], km };
  } catch (e) {
    H.err = e.user || "OpenStreetMap no respondió. Es un servicio gratuito y a veces se satura: espera un minuto y vuelve a intentar.";
  } finally { H.busy = false; renderView(); }
}

/* ================= writes ================= */
async function saveCands(list) {
  if (!guardWrite() || !list.length) return 0;
  const now = nowISO(); let ok = 0;
  const errs = await pool(list, 4, async c => {
    const { id, ...data } = c;
    await withRetry(() => S.db.doc(HV_CAND + "/" + id).set({ ...data, rating: null, reviews: null, status: "revisar", leadId: null, source: "OpenStreetMap", foundBy: S.me.id || null, foundAt: now, updatedAt: now, updatedBy: S.me.id || null }));
    ok++;
  });
  if (errs.length) handleWriteError(errs[0]);
  return ok;
}
async function patchCand(id, patch) {
  if (!guardWrite()) return false;
  try { await withRetry(() => S.db.doc(HV_CAND + "/" + id).update({ ...patch, updatedAt: nowISO(), updatedBy: S.me.id || null })); return true; }
  catch (e) { handleWriteError(e); return false; }
}
function leadNotes(c, sc) {
  return [`Encontrado con Harvey (OpenStreetMap) · potencial ${sc.score}/100.`, sc.why.join(". ") + ".",
    c.address || c.zone ? `Dirección: ${[c.address, c.zone].filter(Boolean).join(", ")}.` : "",
    c.website ? `Web: ${c.website}` : "", numOr(c.rating) !== null ? `Google Maps: ★ ${c.rating}${numOr(c.reviews) !== null ? ` (${c.reviews} reseñas)` : ""}.` : "",
    c.hours ? `Horario: ${c.hours}` : "", c.notes || ""].filter(Boolean).join("\n");
}
async function toCRM(c, seq, quiet) {
  if (!guardWrite()) return false;
  const now = nowISO(); const dup = findLead(c);
  if (dup) { const ok = await patchCand(c.id, { status: "aprobado", leadId: dup.id, reviewedBy: S.me.id || null, reviewedAt: now }); if (ok && !quiet) toast(`${shortName(c.name)} ya estaba en el CRM`, "ok", dup.id); return ok; }
  if (S.leads.size >= LEAD_CAP) { toast(`La base llegó a ${LEAD_CAP} contactos. Elimina descartados antes de agregar más.`, "bad"); return false; }
  const sc = score(c);
  const doc = { ...blankLead(), name: c.name, phone: c.phone || "", city: c.city || "", category: c.category || "", mapsUrl: safeUrl(c.mapsUrl) || mapsFor(c), notes: leadNotes(c, sc),
    email: c.email || "", social: c.social || "", priority: sc.level === "alto" ? "alta" : sc.level === "medio" ? "media" : "baja", owner: S.me.id || null,
    source: "Harvey · OpenStreetMap", seq: seq || maxSeq() + 1, createdAt: now, createdBy: S.me.id || null, updatedAt: now, updatedBy: S.me.id || null };
  try {
    const ref = S.db.collection("leads").doc(); await withRetry(() => ref.set(doc));
    addActivity({ leadId: ref.id, leadName: c.name, type: "creado", text: "Desde Harvey" }).catch(() => {});
    await withRetry(() => S.db.doc(HV_CAND + "/" + c.id).update({ status: "aprobado", leadId: ref.id, reviewedBy: S.me.id || null, reviewedAt: now, updatedAt: now, updatedBy: S.me.id || null }));
    if (!quiet) toast(`${shortName(c.name)} pasó al CRM`, "ok", ref.id);
    return true;
  } catch (e) { handleWriteError(e); return false; }
}
async function bulkToCRM(list) {
  if (!list.length || !guardWrite()) return;
  if (!await confirmBox("Pasar al CRM", `Se crearán ${list.length} contactos nuevos a tu nombre, con su potencial y sus datos en las notas.`, "Pasar al CRM", false)) return;
  let seq = maxSeq(), ok = 0; list.forEach(c => H.work.add(c.id)); renderView();
  for (const c of list) { const dup = findLead(c); if (await toCRM(c, dup ? 0 : ++seq, true)) ok++; else break; }
  list.forEach(c => H.work.delete(c.id)); renderView();
  toast(ok === list.length ? `${ok} contactos pasaron al CRM` : `Pasaron ${ok} de ${list.length}. Revisa tu conexión e inténtalo con el resto.`, ok === list.length ? "ok" : "bad");
}
async function addCaseTemplate() {
  if (!guardWrite()) return;
  if (S.templates.some(t => t.id === CASE_TPL_ID)) { toast("La plantilla ya está en Plantillas", "ok"); return; }
  const order = Math.max(0, ...S.templates.map(t => t.order || 0)) + 1;
  try { await withRetry(() => S.db.doc("templates/" + CASE_TPL_ID).set({ name: "Caso de éxito: Hotel Bahía de Cuba", order, body: CASE_BODY, updatedAt: nowISO(), updatedBy: S.me.id || null })); toast("Plantilla agregada. Ya aparece en Plantillas y en Contacto rápido.", "ok"); }
  catch (e) { handleWriteError(e); }
}
function pitchFor(c) {
  const k = cfg(), r = numOr(c.rating), n = numOr(c.reviews);
  let body = CASE_BODY;
  if (r !== null && r >= k.minRating) body = body.replace("Encontré {negocio} en Google Maps y vi que todavía no tiene una página propia.", `Encontré {negocio} en Google Maps: ${String(r).replace(".", ",")} estrellas${n !== null ? ` y ${n} reseñas` : ""}, se nota que sus clientes quedan contentos. Lo que todavía no tiene es una página propia.`);
  if (c.website) body = body.replace(/vi que todavía no tiene una página propia\.|Lo que todavía no tiene es una página propia\./, "vi su página actual. Creemos que se le puede sacar más provecho.");
  return fillTpl(body, { name: c.name, category: c.category, city: c.city, contactName: "" });
}
function openPitch(c) {
  const m = openModal({ title: "Mensaje con caso de éxito", wide: true,
    body: `<p class="hint" style="margin:0 0 8px">Usa como prueba el trabajo con el Hotel Bahía de Cuba. Para enviarlo y que quede registrado, pasa primero el negocio al CRM.</p><textarea class="inp" id="hv-pitch" rows="11"></textarea>`,
    foot: `<button class="btn" data-close>Cerrar</button><button class="btn" id="hv-pcopy">${ic("copy")} Copiar</button>${c.status === "revisar" ? `<button class="btn primary" id="hv-pcrm">${ic("plus")} Pasar al CRM</button>` : ""}` });
  const ta = m.querySelector("#hv-pitch"); ta.value = pitchFor(c);
  m.querySelector("#hv-pcopy").addEventListener("click", () => copyText(ta.value, "Mensaje copiado"));
  const b = m.querySelector("#hv-pcrm"); if (b) b.addEventListener("click", async () => { b.disabled = true; m._busy = true; const ok = await toCRM(c); m._busy = false; if (ok) closeModal(m); else b.disabled = false; });
}

/* ================= styles ================= */
const css = document.createElement("style");
css.textContent = `
.hv-tabs{margin-bottom:16px;flex-wrap:wrap}
.hv-steps{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
.hv-step{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:11px 14px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
.hv-step.first{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));background:var(--accent-soft)}
.hv-step .n{font-family:var(--f-mono);font-size:19px;font-weight:600;min-width:44px;text-align:right;font-variant-numeric:tabular-nums}
.hv-step p{margin:0;flex:1;min-width:200px}
.hv-step p small{display:block;color:var(--text-3);font-size:12px}
.hv-form{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1.2fr) 96px auto;gap:10px;align-items:end;margin-bottom:6px}
.hv-form .btn{height:38px}
@media (max-width:760px){.hv-form{grid-template-columns:minmax(0,1fr)}}
.hv-row{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(190px,.9fr) minmax(0,1.2fr) auto;gap:8px 14px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line)}
.hv-row:last-child{border-bottom:0}
@media (max-width:1320px){.hv-row{grid-template-columns:minmax(0,1.6fr) minmax(190px,.9fr) minmax(0,1.2fr)}.hv-row .hv-acts{grid-column:1/-1;justify-content:flex-start}}
@media (max-width:720px){.hv-row{grid-template-columns:minmax(0,1fr)}}
.hv-row .nm{font-weight:600;overflow-wrap:anywhere}
.hv-row .sub{color:var(--text-3);font-size:12.5px;overflow-wrap:anywhere}
.hv-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
.hv-rate{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.hv-rate input{width:62px;height:30px;padding:0 8px}
.hv-rate input[data-hv-reviews]{width:84px}
.hv-rate .ic{color:var(--warn)}
.hv-acts{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.hv-why{font-size:12px;color:var(--text-3);margin-top:4px}
.hv-why b{color:var(--warn);font-weight:600}
.hv-split{display:grid;grid-template-columns:120px minmax(0,1fr) 110px;align-items:center;gap:10px;font-size:13px;padding:5px 0}
.hv-split .bar{height:10px}
.hv-split .bar i{background:var(--st-contactado)}
.hv-split span:last-child{text-align:right;font-variant-numeric:tabular-nums;color:var(--text-2)}
.hv-chk{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px 14px}
.hv-chk label{display:flex;align-items:center;gap:8px;font-size:13px}
.hv-pre{white-space:pre-wrap;background:var(--surface-2);border-radius:var(--r-sm);padding:12px 14px;font-size:13px;margin:0 0 12px}
table.t tr[data-hv-open]{cursor:pointer}
table.t tr[data-hv-open]:hover td{background:var(--surface-2)}`;
document.head.appendChild(css);

/* ================= view ================= */
const kpi = (lbl, v, s, cls = "") => `<div class="kpi ${cls}"><div class="eyebrow">${lbl}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
const stChip = st => `<span class="chip" data-st="${esc(st)}">${esc((ST[st] || { label: st }).label)}</span>`;
const nf = n => Number(n || 0).toLocaleString("es-PE");

function hoyHTML() {
  const L = [...S.leads.values()]; const t = todayStr(); const cands = [...H.cands.values()];
  const cnt = {}; L.forEach(l => { cnt[l.stage] = (cnt[l.stage] || 0) + 1; });
  const pend = L.filter(l => l.stage === "nuevo"), done = L.filter(l => l.stage !== "nuevo");
  const responded = RESPONDED.reduce((s, k) => s + (cnt[k] || 0), 0);
  const replies = L.filter(l => l.stage === "respondio" || (l.stage === "interesado" && (!l.nextDate || l.nextDate <= t)));
  const overdue = L.filter(l => l.nextDate && l.nextDate < t && !CLOSED.includes(l.stage));
  const hot = pend.filter(l => channel(l) === "wa" && (!l.owner || l.owner === S.me.id) && leadScore(l).level === "alto");
  const waLeft = pend.filter(l => channel(l) === "wa").length;
  const review = cands.filter(c => c.status === "revisar");
  // Same fixed order as Harvey: answer replies > follow-ups > contact > review new > find more.
  const steps = [];
  if (replies.length) steps.push([replies.length, replies.length === 1 ? "negocio respondió y espera respuesta" : "negocios respondieron y esperan respuesta", "Contestar rápido es lo que más clientes cierra.", "Ver", "stage:respondio"]);
  if (overdue.length) steps.push([overdue.length, overdue.length === 1 ? "seguimiento vencido" : "seguimientos vencidos", "Quedaste en escribirles y ya pasó la fecha.", "Seguimientos", "go:seguimientos"]);
  if (hot.length) steps.push([hot.length, hot.length === 1 ? "negocio con potencial alto sin contactar" : "negocios con potencial alto sin contactar", "Tienen WhatsApp y son de los rubros que más ganan con una web.", "Contacto rápido", "go:rapido"]);
  if (review.length) steps.push([review.length, review.length === 1 ? "candidato encontrado por Harvey espera revisión" : "candidatos encontrados por Harvey esperan revisión", "Revisa sus estrellas en Maps y pasa los buenos al CRM.", "Revisar", "tab:candidatos"]);
  if (waLeft < 40) steps.push([waLeft, waLeft === 1 ? "negocio con WhatsApp queda por contactar" : "negocios con WhatsApp quedan por contactar", "Busca negocios nuevos antes de que se acabe la lista.", "Buscar negocios", "tab:buscar"]);
  if (!steps.length) steps.push(["✓", "Todo al día", "No hay respuestas ni seguimientos pendientes. Buen momento para buscar negocios nuevos.", "Buscar negocios", "tab:buscar"]);
  let h = `<section class="kpis" aria-label="Indicadores">
    ${kpi("Por contactar", nf(pend.length), `${waLeft} con WhatsApp`)}
    ${kpi("Contactados", nf(done.length), `${pct(done.length, L.length)}% de ${nf(L.length)}`)}
    ${kpi("Respondieron", nf(responded), `${pct(responded, done.length)}% de los contactados`)}
    ${kpi("En negociación", nf((cnt.interesado || 0) + (cnt.propuesta || 0)), `${cnt.propuesta || 0} con propuesta`)}
    ${kpi("Clientes", nf(cnt.ganado || 0), money(L.filter(l => l.stage === "ganado").reduce((s, l) => s + (+l.value || 0), 0)))}
    ${kpi("Candidatos Harvey", nf(review.length), "por revisar")}
  </section>`;
  h += `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h2>Lo que toca ahora</h2><span>En orden de prioridad</span></div><div class="hv-steps" style="margin:0">${steps.map((s, i) => `<div class="hv-step${i ? "" : " first"}"><span class="n">${esc(String(s[0]))}</span><p><b>${esc(s[1])}</b><small>${esc(s[2])}</small></p><button class="btn sm${i ? "" : " primary"}" data-hv-do="${esc(s[4])}">${esc(s[3])}</button></div>`).join("")}</div></section>`;
  // contacted vs pending, per person and per city
  const since = Date.now() - 7 * 864e5;
  const people = teamIds().map(id => { const own = L.filter(l => l.owner === id); const a = S.acts.filter(x => x.by === id && CONTACT_TYPES.includes(x.type));
    return { id, own: own.length, done: own.filter(l => l.stage !== "nuevo").length, pend: own.filter(l => l.stage === "nuevo").length, today: a.filter(x => todayStr(new Date(x.at)) === t).length, week: a.filter(x => Date.parse(x.at) >= since).length }; });
  const unOwned = pend.filter(l => !l.owner).length;
  const cities = new Map(); L.forEach(l => { const k = l.city || "Sin ciudad"; const o = cities.get(k) || { n: 0, d: 0 }; o.n++; if (l.stage !== "nuevo") o.d++; cities.set(k, o); });
  const cityRows = [...cities.entries()].sort((a, b) => b[1].n - a[1].n);
  h += `<div class="grid2"><section class="panel"><div class="panel-h"><h2>Quién contacta</h2><span>${unOwned} por contactar sin responsable</span></div><div class="tbl-wrap"><table class="t"><thead><tr><th>Persona</th><th class="r">Asignados</th><th class="r">Contactados</th><th class="r">Faltan</th><th class="r">Hoy</th><th class="r">7 días</th></tr></thead><tbody>${people.map(r => `<tr><td>${who(r.id)}</td><td class="r">${r.own}</td><td class="r">${r.done}</td><td class="r">${r.pend}</td><td class="r">${r.today}</td><td class="r">${r.week}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="panel"><div class="panel-h"><h2>Contactados por ciudad</h2><span>${pct(done.length, L.length)}% del total</span></div>${cityRows.map(([k, o]) => `<div class="hv-split"><span>${esc(k)}</span><span class="bar"><i style="width:${pct(o.d, o.n)}%"></i></span><span>${o.d} de ${o.n}</span></div>`).join("")}</section></div>`;
  // what's left, by potential and channel
  const lv = ["alto", "medio", "bajo"], chs = [["wa", "WhatsApp"], ["fijo", "Fijo"], ["none", "Sin teléfono"]];
  const grid = {}; pend.forEach(l => { const k = leadScore(l).level + "|" + channel(l); grid[k] = (grid[k] || 0) + 1; });
  h += `<div class="grid3"><section class="panel"><div class="panel-h"><h2>Estado de los contactados</h2><span>${done.length} negocios</span></div>${done.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Negocio</th><th>Etapa</th><th>Responsable</th><th>Último contacto</th><th>Próximo paso</th></tr></thead><tbody>${done.sort((a, b) => (ST[a.stage] ? ST[a.stage].i : 9) - (ST[b.stage] ? ST[b.stage].i : 9) || String(b.lastContactAt || "").localeCompare(String(a.lastContactAt || ""))).slice(0, 40).map(l => `<tr data-hv-open="${esc(l.id)}"><td><b>${esc(shortName(l.name))}</b><div class="muted" style="font-size:12px">${esc([l.category, l.city].filter(Boolean).join(" · "))}</div></td><td>${stChip(l.stage)}</td><td>${who(l.owner)}</td><td>${l.lastContactAt ? esc(rel(l.lastContactAt)) : "—"}</td><td>${l.nextDate ? `<span${l.nextDate < t && !CLOSED.includes(l.stage) ? ' style="color:var(--bad)"' : ""}>${esc(fmtDay(l.nextDate))}</span>${l.nextAction ? `<div class="muted" style="font-size:12px">${esc(l.nextAction)}</div>` : ""}` : `<span class="muted">Sin fecha</span>`}</td></tr>`).join("")}</tbody></table></div>${done.length > 40 ? `<p class="hint">Se muestran 40 de ${done.length}. <button class="linkish" data-hv-do="stage:_open">Ver todos en Contactos</button></p>` : ""}` : `<p class="muted" style="margin:0">Todavía nadie fue contactado. Empieza por los de potencial alto.</p>`}</section>
    <section class="panel"><div class="panel-h"><h2>Faltan contactar</h2><span>${nf(pend.length)} negocios</span></div><div class="tbl-wrap"><table class="t"><thead><tr><th>Potencial</th>${chs.map(c => `<th class="r">${c[1]}</th>`).join("")}</tr></thead><tbody>${lv.map(x => `<tr><td><span class="chip pot-${x}">${x[0].toUpperCase() + x.slice(1)}</span></td>${chs.map(c => `<td class="r">${grid[x + "|" + c[0]] || 0}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="hint">Primero WhatsApp con potencial alto. Los que no tienen teléfono se pueden buscar en Maps desde su ficha.</p>
      <div class="panel-h" style="margin:16px 0 8px"><h2>De dónde vienen</h2></div>${(() => { const m = new Map(); L.forEach(l => { const k = /^Harvey/.test(l.source || "") ? "Harvey" : "Excel de Google Maps"; const o = m.get(k) || { n: 0, d: 0, r: 0 }; o.n++; if (l.stage !== "nuevo") o.d++; if (RESPONDED.includes(l.stage)) o.r++; m.set(k, o); }); return `<div class="tbl-wrap"><table class="t"><thead><tr><th>Origen</th><th class="r">Total</th><th class="r">Contact.</th><th class="r">Resp.</th></tr></thead><tbody>${[...m.entries()].map(([k, o]) => `<tr><td>${esc(k)}</td><td class="r">${o.n}</td><td class="r">${o.d}</td><td class="r">${o.r}</td></tr>`).join("")}</tbody></table></div>`; })()}</section></div>`;
  return h;
}

function resultRow(c) {
  const sc = score(c), lead = findLead(c), cand = findCand(c);
  const tags = [c.website ? `<span class="chip plain">Tiene web</span>` : `<span class="chip" style="--c:var(--ok)">Sin web</span>`, c.social ? `<span class="chip plain">Redes</span>` : "", channel(c) === "wa" ? `<span class="chip" style="--c:var(--ok)">WhatsApp</span>` : channel(c) === "fijo" ? `<span class="chip plain">Fijo</span>` : `<span class="chip plain">Sin teléfono</span>`].join("");
  const state = lead ? `<span class="chip" data-st="${esc(lead.stage)}">Ya en el CRM</span>` : cand ? `<span class="chip plain">Ya es candidato</span>` : "";
  return `<div class="hv-row"><div><div class="nm">${esc(c.name)}</div><div class="sub">${esc([c.address, c.zone, c.city].filter(Boolean).join(", ") || c.city)}</div><div class="hv-tags">${tags}</div></div>
    <div class="mono" style="font-size:12.5px">${esc(c.phone || "—")}</div><div>${scoreChip(sc)}<div class="hv-why">${esc(sc.why.slice(0, 2).join(" · "))}</div></div>
    <div class="hv-acts">${state || `<button class="btn sm" data-hv-save="${esc(c.id)}">${ic("plus", 14)} Guardar</button>`}<a class="btn sm ghost" href="${esc(c.mapsUrl)}" target="_blank" rel="noopener">${ic("map", 14)} Maps</a></div></div>`;
}
function buscarHTML() {
  const res = H.results;
  let h = `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h2>Buscar negocios nuevos</h2><span>OpenStreetMap · gratis</span></div>
    <div class="hv-form"><div><label class="lbl" for="hv-place">Dónde</label><select id="hv-place" class="inp">${PLACES.map(p => `<option value="${p[0]}"${H.place === p[0] ? " selected" : ""}>${esc(p[1])}</option>`).join("")}<option value="otro"${H.place === "otro" ? " selected" : ""}>Otro lugar…</option></select></div>
      <div><label class="lbl" for="hv-rubro">Rubro</label><select id="hv-rubro" class="inp">${RUBROS.map(r => `<option${H.rubro === r[0] ? " selected" : ""}>${esc(r[0])}</option>`).join("")}</select></div>
      <div><label class="lbl" for="hv-km">Radio (km)</label><input id="hv-km" class="inp" type="number" min="0.5" max="15" step="0.5" inputmode="decimal" placeholder="${esc(String((PLACES.find(p => p[0] === H.place) || [0, 0, 0, 0, 0, 0, 3])[6]))}" value="${esc(H.km)}"></div>
      <button class="btn primary" data-hv-search${H.busy ? " disabled" : ""}>${ic("search")} ${H.busy ? "Buscando…" : "Buscar"}</button></div>
    ${H.place === "otro" ? `<div style="margin-top:10px"><label class="lbl" for="hv-custom">Ciudad o distrito</label><input id="hv-custom" class="inp" placeholder="Por ejemplo: Chorrillos, Lima" value="${esc(H.custom)}"></div>` : ""}
    <p class="hint">OpenStreetMap no trae estrellas ni reseñas, y no tiene todos los negocios. Guarda los que te interesen y en <b>Candidatos</b> anota su reputación de Google Maps: el puntaje se recalcula solo.</p></section>`;
  if (H.err) h += `<div class="banner bad">${ic("alert", 18)}<div>${esc(H.err)}</div></div>`;
  if (H.busy) h += loadingHTML();
  else if (res) {
    const fresh = res.filter(c => !findLead(c) && !findCand(c));
    h += `<section class="list-card"><div class="panel-h" style="padding:14px 14px 0"><h2>${res.length} ${res.length === 1 ? "negocio" : "negocios"} · ${esc(H.meta.rubro)} en ${esc(H.meta.label)}</h2><span>${fresh.length} nuevos · ${res.length - fresh.length} ya conocidos</span></div>
      ${fresh.length ? `<div style="padding:10px 14px"><button class="btn primary sm" data-hv-saveall>${ic("plus", 14)} Guardar los ${fresh.length} nuevos como candidatos</button></div>` : ""}
      ${res.length ? res.map(resultRow).join("") : `<div class="empty" style="border:0">${ic("search", 28)}<h3>No hay negocios de ese rubro en el mapa</h3><p>Prueba con un radio más grande, otro distrito u otro rubro.</p></div>`}</section>`;
  }
  return h;
}
function candRow(c) {
  const sc = score(c), busy = H.work.has(c.id);
  const lead = c.leadId && S.leads.get(c.leadId);
  const tags = [c.website ? `<a class="chip plain" href="${esc(c.website)}" target="_blank" rel="noopener">Tiene web</a>` : `<span class="chip" style="--c:var(--ok)">Sin web</span>`,
    ...String(c.social || "").split(/\s+/).filter(Boolean).slice(0, 3).map(u => { let host = "Red"; try { host = new URL(u).hostname.replace(/^www\./, "").split(".")[0]; } catch (e) {} return `<a class="chip plain" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(host[0].toUpperCase() + host.slice(1))}</a>`; }),
    channel(c) === "wa" ? `<span class="chip" style="--c:var(--ok)">WhatsApp</span>` : channel(c) === "fijo" ? `<span class="chip plain">Fijo</span>` : `<span class="chip plain">Sin teléfono</span>`].join("");
  const acts = c.status === "aprobado" ? (lead ? `${stChip(lead.stage)}<button class="btn sm" data-hv-lead="${esc(lead.id)}">Abrir ficha</button>` : `<span class="chip plain">En el CRM</span>`)
    : c.status === "descartado" ? `<button class="btn sm" data-hv-restore="${esc(c.id)}">Recuperar</button>`
    : `<button class="btn sm ghost" data-hv-pitch="${esc(c.id)}">${ic("msg", 14)} Mensaje</button><button class="btn sm ghost" data-hv-drop="${esc(c.id)}"${busy ? " disabled" : ""}>Descartar</button><button class="btn sm primary" data-hv-crm="${esc(c.id)}"${busy ? " disabled" : ""}>${ic("plus", 14)} Pasar al CRM</button>`;
  const ro = c.status !== "revisar" ? " disabled" : "";
  return `<div class="hv-row"><div><div class="nm">${esc(c.name)}</div><div class="sub">${esc([c.category, [c.zone, c.city].filter(Boolean).join(", ")].filter(Boolean).join(" · "))}${c.phone ? ` · <span class="mono">${esc(c.phone)}</span>` : ""}</div><div class="hv-tags">${tags}</div></div>
    <div class="hv-rate">${ic("star", 15)}<input class="inp" type="number" min="1" max="5" step="0.1" inputmode="decimal" placeholder="★" aria-label="Estrellas en Google Maps" data-hv-rating="${esc(c.id)}" value="${esc(numOr(c.rating) ?? "")}"${ro}><input class="inp" type="number" min="0" step="1" inputmode="numeric" placeholder="Reseñas" aria-label="Reseñas en Google Maps" data-hv-reviews="${esc(c.id)}" value="${esc(numOr(c.reviews) ?? "")}"${ro}><a class="linkish" href="${esc(safeUrl(c.mapsUrl) || mapsFor(c))}" target="_blank" rel="noopener">Ver en Maps</a></div>
    <div>${scoreChip(sc)}<div class="hv-why">${esc(sc.why.slice(0, 3).join(" · "))}${sc.todo.length && c.status === "revisar" ? `<br><b>Falta:</b> ${esc(sc.todo.join(", "))}` : ""}</div></div>
    <div class="hv-acts">${acts}</div></div>`;
}
function candidatosHTML() {
  if (!H.candsReady) return loadingHTML();
  const all = [...H.cands.values()];
  const byS = Object.fromEntries(CAND_ST.map(s => [s[0], all.filter(c => (c.status || "revisar") === s[0]).length]));
  let list = all.filter(c => (c.status || "revisar") === H.cSt && (!H.cRubro || c.category === H.cRubro) && (!H.cCity || c.city === H.cCity));
  list = list.map(c => [c, score(c).score]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const rubros = uniqCount(all.map(c => c.category)), cities = uniqCount(all.map(c => c.city));
  const ready = H.cSt === "revisar" ? list.filter(c => score(c).level === "alto" && channel(c) !== "none" && !H.work.has(c.id)) : [];
  let h = `<div class="toolbar"><div class="seg" role="group" aria-label="Estado">${CAND_ST.map(s => `<button data-hv-cst="${s[0]}" class="${H.cSt === s[0] ? "on" : ""}">${esc(s[1])} (${byS[s[0]]})</button>`).join("")}</div>
    <select id="hv-crubro" aria-label="Rubro"><option value="">Todos los rubros</option>${rubros.map(([k, n]) => `<option value="${esc(k)}"${H.cRubro === k ? " selected" : ""}>${esc(k)} (${n})</option>`).join("")}</select>
    <select id="hv-ccity" aria-label="Ciudad"><option value="">Todas las ciudades</option>${cities.map(([k, n]) => `<option value="${esc(k)}"${H.cCity === k ? " selected" : ""}>${esc(k)} (${n})</option>`).join("")}</select>
    ${ready.length ? `<button class="btn primary sm" data-hv-bulk>${ic("plus", 14)} Pasar al CRM los de potencial alto (${ready.length})</button>` : ""}</div>`;
  if (!all.length) return h + `<div class="empty">${ic("radar", 28)}<h3>Todavía no hay candidatos</h3><p>Busca negocios por rubro y distrito, guarda los que te interesen y aquí los revisas con tu compañero antes de contactarlos.</p><div class="ph-act"><button class="btn primary" data-hv-do="tab:buscar">${ic("search")} Buscar negocios</button></div></div>`;
  return h + (list.length ? `<section class="list-card">${list.slice(0, 150).map(candRow).join("")}</section>${list.length > 150 ? `<p class="hint">Se muestran 150 de ${list.length}. Filtra por rubro o ciudad para ver el resto.</p>` : ""}` : `<div class="empty">${ic("check", 28)}<h3>Nada en esta lista</h3><p>Cambia el filtro o busca más negocios.</p></div>`);
}
function idealHTML() {
  const k = cfg(); const by = H.cfg && H.cfg.updatedBy ? ` · lo cambió ${esc(firstName(H.cfg.updatedBy))} ${esc(rel(H.cfg.updatedAt))}` : "";
  const ex = { name: "Clínica Dental Sonrisa", category: "Dentista", city: "Lima", contactName: "" };
  return `<div class="grid2"><section class="panel"><div class="panel-h"><h2>Cliente ideal de CPP</h2><span>Lo comparten todos${by}</span></div>
    <p class="hint" style="margin:0 0 12px">Un negocio con buena reputación en Google Maps y en redes, que va por buen camino pero todavía no es muy conocido, y que necesita una página para crecer. Harvey puntúa cada candidato con esto y dice por qué.</p>
    <div class="fgrid"><div><label class="lbl" for="hv-minr">Estrellas mínimas en Maps</label><input id="hv-minr" class="inp" type="number" min="3" max="5" step="0.1" value="${esc(k.minRating)}"></div>
      <div><label class="lbl" for="hv-rmin">Reseñas: desde</label><input id="hv-rmin" class="inp" type="number" min="0" step="1" value="${esc(k.revMin)}"></div>
      <div><label class="lbl" for="hv-rmax">Reseñas: hasta</label><input id="hv-rmax" class="inp" type="number" min="1" step="1" value="${esc(k.revMax)}"><p class="hint">Más que esto ya es «muy conocido».</p></div></div>
    <div style="margin-top:12px"><span class="lbl">Rubros prioritarios</span><div class="hv-chk">${RUBROS.map(r => `<label><input type="checkbox" data-hv-rub value="${esc(r[0])}"${k.rubros.includes(r[0]) ? " checked" : ""}> ${esc(r[0])}</label>`).join("")}</div></div>
    <div style="margin-top:14px"><button class="btn primary" data-hv-cfg>${ic("check")} Guardar cliente ideal</button></div></section>
    <section class="panel"><div class="panel-h"><h2>Cómo puntúa Harvey</h2><span>De 0 a 100</span></div><div class="tbl-wrap"><table class="t"><tbody>
      <tr><td>Sin página web propia (solo redes también cuenta)</td><td class="r">25</td></tr><tr><td>Tiene WhatsApp (fijo 12, solo correo 8)</td><td class="r">25</td></tr>
      <tr><td>Estrellas en Maps sobre el mínimo (+0,3 o más: 20)</td><td class="r">14–20</td></tr><tr><td>Reseñas dentro del rango: va por buen camino</td><td class="r">10</td></tr>
      <tr><td>Activo en redes sociales</td><td class="r">8</td></tr><tr><td>Rubro prioritario</td><td class="r">12</td></tr></tbody></table></div>
      <p class="hint">70 o más es potencial alto; 45 o más, medio. Una reputación por debajo del mínimo resta. Sin estrellas anotadas, el máximo es 70.</p></section></div>
    <section class="panel"><div class="panel-h"><h2>Caso de éxito: Hotel Bahía de Cuba</h2><a class="linkish" href="${CASE_URL}" target="_blank" rel="noopener">Ver la página ${ic("ext", 13)}</a></div>
      <p class="hint" style="margin:0 0 10px">Página y sistema de reservas en línea del eco hotel a 200 m de Playa Tuquillo, en Huarmey. Es la mejor prueba de lo que CPP hace por un negocio que ya tiene buena reputación. Así queda el mensaje para un negocio de ejemplo:</p>
      <pre class="hv-pre">${esc(fillTpl(CASE_BODY, ex))}</pre>
      <div class="ph-act"><button class="btn" data-hv-copycase>${ic("copy")} Copiar plantilla</button>${S.templates.some(t => t.id === CASE_TPL_ID) ? `<span class="chip" style="--c:var(--ok)">Ya está en Plantillas</span>` : `<button class="btn primary" data-hv-addtpl>${ic("plus")} Agregar a Plantillas</button>`}</div></section>`;
}

VIEWS.harvey = {
  mount() {
    return `<div id="hv-root"><header class="ph"><div><div class="eyebrow">CPP · Harvey</div><h1>Harvey</h1><p>Qué toca hoy, negocios nuevos por revisar y el perfil del cliente ideal.</p></div></header>
      <div class="seg hv-tabs" role="tablist" aria-label="Harvey">${TABS.map(t => `<button role="tab" data-hv-tab="${t[0]}">${t[1]}<span data-hv-n="${t[0]}"></span></button>`).join("")}</div><div id="vbody"></div></div>`;
  },
  bind(el) {
    const root = el.querySelector("#hv-root");
    root.addEventListener("click", async e => {
      const b = e.target.closest("button,[data-hv-open]"); if (!b || !root.contains(b)) return; const d = b.dataset;
      if (d.hvTab) { H.tab = d.hvTab; store.set("crm.hv.tab", H.tab); renderView(); return; }
      if (d.hvDo) { const [k, v] = d.hvDo.split(":"); if (k === "tab") { H.tab = v; store.set("crm.hv.tab", v); renderView(); } else if (k === "go") go(v); else if (k === "stage") { Object.assign(F, { q: "", stage: v, city: "", cat: "", channel: "", owner: "", page: 1 }); saveF(); go("contactos"); } return; }
      if (d.hvOpen) { openLead(d.hvOpen); return; }
      if (d.hvLead) { openLead(d.hvLead); return; }
      if ("hvSearch" in d) { search(); return; }
      if (d.hvSave) { const c = (H.results || []).find(x => x.id === d.hvSave); if (c) { b.disabled = true; const n = await saveCands([c]); if (n) toast(`${shortName(c.name)} quedó como candidato`, "ok"); scheduleRender(); } return; }
      if ("hvSaveall" in d) { const fresh = (H.results || []).filter(c => !findLead(c) && !findCand(c)); b.disabled = true; const n = await saveCands(fresh); if (n) toast(`${n} candidatos guardados. Revísalos en Candidatos.`, "ok"); scheduleRender(); return; }
      if (d.hvCst) { H.cSt = d.hvCst; renderView(); return; }
      const cand = id => H.cands.get(id);
      if (d.hvCrm) { const c = cand(d.hvCrm); if (!c) return; H.work.add(c.id); renderView(); await toCRM(c); H.work.delete(c.id); renderView(); return; }
      if (d.hvDrop) { const c = cand(d.hvDrop); if (c && await patchCand(c.id, { status: "descartado", reviewedBy: S.me.id || null, reviewedAt: nowISO() })) toast(`${shortName(c.name)} descartado`, "ok"); return; }
      if (d.hvRestore) { const c = cand(d.hvRestore); if (c) await patchCand(c.id, { status: "revisar" }); return; }
      if (d.hvPitch) { const c = cand(d.hvPitch); if (c) openPitch(c); return; }
      if ("hvBulk" in d) { const list = [...H.cands.values()].filter(c => (c.status || "revisar") === "revisar" && (!H.cRubro || c.category === H.cRubro) && (!H.cCity || c.city === H.cCity) && score(c).level === "alto" && channel(c) !== "none" && !H.work.has(c.id)); bulkToCRM(list); return; }
      if ("hvCfg" in d) {
        if (!guardWrite()) return;
        const g = id => root.querySelector(id); const minRating = Math.min(5, Math.max(3, +g("#hv-minr").value || DEF.minRating)); const revMin = Math.max(0, Math.round(+g("#hv-rmin").value || 0)); const revMax = Math.max(revMin + 1, Math.round(+g("#hv-rmax").value || DEF.revMax));
        const rubros = [...root.querySelectorAll("[data-hv-rub]:checked")].map(x => x.value);
        try { await withRetry(() => S.db.doc(HV_CFG + "/icp").set({ minRating, revMin, revMax, rubros, updatedAt: nowISO(), updatedBy: S.me.id || null })); toast("Cliente ideal guardado. Los puntajes ya se recalcularon.", "ok"); } catch (err) { handleWriteError(err); }
        return;
      }
      if ("hvCopycase" in d) { copyText(CASE_BODY, "Plantilla copiada"); return; }
      if ("hvAddtpl" in d) { b.disabled = true; await addCaseTemplate(); scheduleRender(); return; }
    });
    root.addEventListener("change", async e => {
      const x = e.target;
      if (x.id === "hv-place") { H.place = x.value; store.set("crm.hv.place", H.place); H.km = ""; renderView(); }
      else if (x.id === "hv-rubro") { H.rubro = x.value; store.set("crm.hv.rubro", H.rubro); }
      else if (x.id === "hv-km") H.km = x.value;
      else if (x.id === "hv-crubro") { H.cRubro = x.value; renderView(); }
      else if (x.id === "hv-ccity") { H.cCity = x.value; renderView(); }
      else if (x.dataset.hvRating || x.dataset.hvReviews) {
        const id = x.dataset.hvRating || x.dataset.hvReviews; const field = x.dataset.hvRating ? "rating" : "reviews";
        let v = numOr(x.value); if (v !== null) v = field === "rating" ? Math.min(5, Math.max(1, Math.round(v * 10) / 10)) : Math.max(0, Math.round(v));
        await patchCand(id, { [field]: v });
      }
    });
    root.addEventListener("input", e => { if (e.target.id === "hv-custom") H.custom = e.target.value; else if (e.target.id === "hv-km") H.km = e.target.value; });
    root.addEventListener("keydown", e => { if (e.key === "Enter" && (e.target.id === "hv-custom" || e.target.id === "hv-km")) { e.preventDefault(); H.custom = (root.querySelector("#hv-custom") || {}).value || H.custom; search(); } });
  },
  sync() {
    subscribe();
    const n = [...H.cands.values()].filter(c => (c.status || "revisar") === "revisar").length;
    $$("[data-hv-tab]").forEach(b => { const on = b.dataset.hvTab === H.tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    const badge = $('[data-hv-n="candidatos"]'); if (badge) badge.textContent = n ? ` (${n})` : "";
  },
  update(b) { b.innerHTML = H.tab === "buscar" ? buscarHTML() : H.tab === "candidatos" ? candidatosHTML() : H.tab === "ideal" ? idealHTML() : hoyHTML(); }
};

// Si el menú ya se dibujó antes de cargar este archivo, agrega el botón a mano.
const nav = document.getElementById("nav");
if (nav && !nav.querySelector('[data-nav="harvey"]')) nav.insertAdjacentHTML("beforeend", `<button class="nav-i" data-nav="harvey">${ic("radar", 18)}<span>Harvey</span><em class="nav-badge" id="nb-harvey" hidden></em></button>`);
})();
