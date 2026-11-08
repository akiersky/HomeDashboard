'use strict';
// What the dashboard asks Home Assistant for, answered from files in dataDir: shared state and to-do lists in
// state.json, calendars/photos/cameras as set up in server.json. handle() takes one WebSocket message and returns
// its result, or throws; the rest serves the plain HTTP bits (photo bytes, camera stream, calendar list).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { expand } = require('./ics');

const CALENDAR_TTL = 5 * 60 * 1000;
const PICKS_KEPT = 8;
const TIMEOUT = 15000;
const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const UA = 'FamilyDashboard/1.0 (self-hosted dashboard)'; // Wikimedia asks every client to identify itself
const COMMONS = 'https://commons.wikimedia.org';
const THEME_TTL = 24 * 60 * 60 * 1000;
// Named themes are Wikimedia Commons "Featured pictures" categories: free-licensed, no account or key needed.
// Any other Commons category can be used as "category": "Featured pictures of birds".
const THEMES = {
  nature: 'Featured pictures of landscapes',
  mountains: 'Featured pictures of mountains',
  sunsets: 'Featured pictures of sunsets',
  flowers: 'Featured pictures of flowers',
  space: 'Featured pictures of astronomy',
  food: 'Featured pictures of food'
};
const DEFAULT_PHOTOS = { 'image.photos': { type: 'theme', theme: 'nature' } }; // used until server.json sets "photos"
const sin = (d) => Math.sin(d * Math.PI / 180), cos = (d) => Math.cos(d * Math.PI / 180);

// Is the sun up at this place and time? Low-precision solar position (Astronomical Almanac), good to a few minutes.
function sunIsUp(lat, lon, date) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const g = 357.529 + 0.98560028 * d;                          // mean anomaly
  const lambda = 280.459 + 0.98564736 * d + 1.915 * sin(g) + 0.020 * sin(2 * g); // ecliptic longitude
  const eps = 23.439 - 0.00000036 * d;
  const dec = Math.asin(sin(eps) * sin(lambda)) * 180 / Math.PI;
  const ra = Math.atan2(cos(eps) * sin(lambda), cos(lambda)) * 180 / Math.PI;
  const hourAngle = 15 * (18.697374558 + 24.06570982441908 * d) + lon - ra;
  const elevation = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(hourAngle)) * 180 / Math.PI;
  return elevation > -0.833; // the sun's upper edge at the horizon, with refraction
}
const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/i;
const title = (entity) => entity.split('.')[1].replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function createApi({ dataDir, fetchImpl = fetch }) {
  const statePath = path.join(dataDir, 'state.json');
  const readJson = (file, fallback) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
      if (e.code !== 'ENOENT') console.warn(`${file}: ${e.message}`);
      return fallback;
    }
  };
  const config = () => readJson(path.join(dataDir, 'server.json'), {});
  const loaded = readJson(statePath, {});
  const state = { userData: Object.assign(Object.create(null), loaded.userData), lists: loaded.lists || {} };
  const save = () => {
    const tmp = `${statePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, statePath);
  };
  const entity = (id) => { if (!ENTITY.test(id || '')) throw new Error(`Bad entity id: ${id}`); return id; };

  // ---- to-do lists ----
  const list = (id) => (state.lists[entity(id)] ||= []);
  const todo = {
    add_item: (d) => list(d.entity_id).push({ uid: crypto.randomUUID(), summary: String(d.item), status: 'needs_action' }),
    update_item(d) {
      const item = list(d.entity_id).find((i) => i.uid === d.item || i.summary === d.item);
      if (!item) throw new Error('No such to-do item');
      if (d.rename) item.summary = String(d.rename);
      if (d.status) item.status = d.status;
    },
    remove_item: (d) => { state.lists[entity(d.entity_id)] = list(d.entity_id).filter((i) => i.uid !== d.item && i.summary !== d.item); }
  };

  // ---- calendars: secret iCal URLs, read-only ----
  const icsCache = new Map(); // entity -> { at, url, text }
  async function icsText(id, url) {
    const hit = icsCache.get(id);
    if (hit && hit.url === url && Date.now() - hit.at < CALENDAR_TTL) return hit.text;
    try {
      const res = await fetchImpl(url.replace(/^webcal:/i, 'https:'), { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      icsCache.set(id, { at: Date.now(), url, text });
      return text;
    } catch (e) {
      console.warn(`calendar ${id}: ${e.message}`);
      return hit ? hit.text : null; // an old copy beats an empty calendar
    }
  }
  async function calendarEvents(ids, start, end) {
    const urls = config().calendars || {};
    const out = {};
    await Promise.all([].concat(ids).map(async (id) => {
      const text = urls[id] && await icsText(id, urls[id]);
      let events = [];
      if (text) try { events = expand(text, new Date(start), new Date(end)); } catch (e) { console.warn(`calendar ${id}: ${e.message}`); }
      out[id] = { events };
    }));
    return { response: out };
  }

  // ---- photos: a new pick per update_entity from Immich, a folder, a list of URLs, or a themed Commons category ----
  const picks = new Map();   // token -> { type, bytes }, the last few, so a second tablet doesn't break the first
  const current = new Map(); // image entity -> { token, at, exif, filename }
  const inflight = new Map();
  const photos = () => { const p = config().photos; return p && Object.keys(p).length ? p : DEFAULT_PHOTOS; };
  const photoSource = (id) => photos()[id];
  const download = async (url, headers) => {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return { type: res.headers.get('content-type') || 'image/jpeg', bytes: Buffer.from(await res.arrayBuffer()) };
  };

  async function immichPick(src) {
    const base = src.url.replace(/\/$/, ''), headers = { 'x-api-key': src.apiKey || '', 'content-type': 'application/json' };
    const found = await fetchImpl(`${base}/api/search/random`, { method: 'POST', headers, signal: AbortSignal.timeout(TIMEOUT),
      body: JSON.stringify({ size: 1, ...(src.favoritesOnly === false ? {} : { isFavorite: true }), ...(src.albumId ? { albumIds: [src.albumId] } : {}) }) });
    if (!found.ok) throw new Error(`Immich search HTTP ${found.status}`);
    const [asset] = await found.json();
    if (!asset) return null;
    const img = await fetchImpl(`${base}/api/assets/${asset.id}/thumbnail?size=preview`, { headers, signal: AbortSignal.timeout(TIMEOUT) });
    if (!img.ok) throw new Error(`Immich thumbnail HTTP ${img.status}`);
    const { city, state: region, dateTimeOriginal } = asset.exifInfo || {};
    return { type: img.headers.get('content-type') || 'image/jpeg', bytes: Buffer.from(await img.arrayBuffer()),
      exif: { city, state: region, dateTimeOriginal }, filename: asset.originalFileName };
  }
  function folderPick(src) {
    const files = fs.readdirSync(src.path, { recursive: true }).filter((f) => IMAGE_TYPES[path.extname(f).toLowerCase()]);
    if (!files.length) return null;
    const file = files[crypto.randomInt(files.length)];
    return { type: IMAGE_TYPES[path.extname(file).toLowerCase()], bytes: fs.readFileSync(path.join(src.path, file)), exif: {}, filename: path.basename(file) };
  }
  async function urlsPick(src) {
    if (!Array.isArray(src.urls) || !src.urls.length) return null;
    const url = src.urls[crypto.randomInt(src.urls.length)];
    return { ...(await download(url)), exif: {}, filename: decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Family memory') };
  }

  const commonsTitles = new Map(); // category -> { at, titles }
  async function titlesIn(category) {
    const hit = commonsTitles.get(category);
    if (hit && Date.now() - hit.at < THEME_TTL) return hit.titles;
    try {
      const url = `${COMMONS}/w/api.php?action=query&list=categorymembers&cmtype=file&cmlimit=500&format=json&formatversion=2&cmtitle=${encodeURIComponent(`Category:${category}`)}`;
      const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // ponytail: first 500 files of a category only; follow "continue" if a bigger pool is ever wanted
      const titles = ((await res.json()).query?.categorymembers || []).map((m) => m.title).filter((t) => /\.(jpe?g|png|webp)$/i.test(t));
      if (!titles.length) throw new Error('no pictures in that category');
      commonsTitles.set(category, { at: Date.now(), titles });
      return titles;
    } catch (e) {
      if (hit) return hit.titles; // an old list beats no photos
      throw new Error(`Commons category "${category}": ${e.message}`);
    }
  }
  const plain = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
  async function themePick(src) {
    const category = src.category || THEMES[src.theme || 'nature'];
    if (!category) throw new Error(`Unknown theme "${src.theme}" (use one of ${Object.keys(THEMES).join(', ')}, or "category")`);
    const titles = await titlesIn(category);
    const title = titles[crypto.randomInt(titles.length)];
    const name = title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    let url = `${COMMONS}/wiki/Special:FilePath/${encodeURIComponent(title.replace(/^File:/, ''))}?width=1920`, caption = name;
    try { // the picture's author, for the caption; the picture still shows without it
      const info = await fetchImpl(`${COMMONS}/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1920&format=json&formatversion=2&titles=${encodeURIComponent(title)}`,
        { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
      const ii = (await info.json()).query.pages[0].imageinfo[0];
      url = ii.thumburl || url;
      const meta = ii.extmetadata || {}, artist = plain(meta.Artist?.value);
      caption = `${plain(meta.ObjectName?.value) || name}${artist ? ` (${artist.slice(0, 60)})` : ''}`;
    } catch (_) { /* keep the file name */ }
    // The photo frame drops a trailing ".ext" from the file name, so give it one to drop.
    return { ...(await download(url, { 'user-agent': UA })), exif: {}, filename: `${caption}.jpg` };
  }

  const pickers = { immich: immichPick, folder: folderPick, urls: urlsPick, theme: themePick };
  function pickPhoto(id) {
    if (!inflight.has(id)) {
      const src = photoSource(id);
      inflight.set(id, (async () => {
        const pick = src && (pickers[src.type] || (() => { throw new Error(`Unknown photo type "${src.type}"`); }));
        const p = pick && await pick(src);
        if (!p) return null;
        const token = crypto.randomBytes(12).toString('hex');
        picks.set(token, p);
        if (picks.size > PICKS_KEPT) picks.delete(picks.keys().next().value);
        const now = { token, at: new Date().toISOString(), exif: p.exif, filename: p.filename };
        current.set(id, now);
        return now;
      })().catch((e) => { console.warn(`photo ${id}: ${e.message}`); return null; }).finally(() => inflight.delete(id)));
    }
    return inflight.get(id);
  }
  const image = (token) => picks.get(token) || null; // the token is the only key: 96 random bits, handed out over the socket

  // ---- cameras: the stream is proxied so its address and password never reach the browser ----
  const cameraToken = crypto.randomBytes(16).toString('hex');
  const cameraUrl = (id, token) => (token === cameraToken ? config().cameras?.[id] || null : null);

  async function states() {
    const cfg = config(), out = [];
    const { latitude, longitude } = cfg.location || {};
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) { // lets the dashboard pick day or night theme by the sun
      out.push({ entity_id: 'sun.sun', state: sunIsUp(latitude, longitude, new Date()) ? 'above_horizon' : 'below_horizon', attributes: {} });
    }
    Object.keys(cfg.calendars || {}).forEach((id) => out.push({ entity_id: id, state: 'off', attributes: { friendly_name: title(id) } }));
    Object.keys(state.lists).forEach((id) => out.push({ entity_id: id, state: String(state.lists[id].length), attributes: { friendly_name: title(id) } }));
    Object.keys(cfg.cameras || {}).forEach((id) => out.push({ entity_id: id, state: 'idle', attributes: { friendly_name: title(id), access_token: cameraToken } }));
    for (const id of Object.keys(photos())) {
      const now = current.get(id) || await pickPhoto(id);
      if (now) out.push({ entity_id: id, state: now.at, attributes: { entity_picture: `/api/image_proxy/${id}?token=${now.token}`, media_exif: now.exif, media_filename: now.filename } });
    }
    return out;
  }

  const location = () => { const l = config().location || {}; return { latitude: l.latitude, longitude: l.longitude, location_name: l.name }; };

  const services = {
    'todo': (service, d) => { if (!todo[service]) throw new Error(`Unknown service todo.${service}`); todo[service](d); save(); return null; },
    'calendar': (service, d) => { if (service !== 'get_events') throw new Error(`Unknown service calendar.${service}`); return calendarEvents(d.entity_id, d.start_date_time, d.end_date_time); },
    'homeassistant': async (service, d) => { if (service === 'update_entity' && photoSource(d.entity_id)) await pickPhoto(d.entity_id); return null; }
  };

  async function handle(msg) {
    switch (msg.type) {
      case 'frontend/get_user_data': return { value: state.userData[msg.key] ?? null };
      case 'frontend/set_user_data': state.userData[msg.key] = msg.value; save(); return null;
      case 'todo/item/list': return { items: list(msg.entity_id).map((i) => ({ ...i })) };
      case 'call_service': {
        const run = services[msg.domain];
        if (!run) throw new Error(`Unknown service ${msg.domain}.${msg.service}`);
        return run(msg.service, msg.service_data || {});
      }
      case 'get_states': return states();
      case 'get_config': return location();
      default: throw new Error(`Unknown command ${msg.type}`);
    }
  }

  return {
    handle, image, cameraUrl, location,
    calendars: () => Object.keys(config().calendars || {}).map((id) => ({ entity_id: id, name: title(id) })),
    warm: () => Object.keys(photos()).forEach((id) => pickPhoto(id))
  };
}

module.exports = { createApi, sunIsUp };
