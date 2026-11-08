/* --------------------------------------------------------------------------
     2. STATE MANAGEMENT & LOCAL STORAGE
     -------------------------------------------------------------------------- */
  const STORAGE_KEY = 'family_dashboard_state_v1';
  const SCHEMA_VERSION = 1;
  const REMOTE_KEY = 'family_dashboard_state';

  // Every setting once: its starting value, the config.js key that seeds it, the form field that edits it and how far
  // it may travel. scope: 'device' stays on this tablet (tokens); 'private' is shared between tablets but never
  // exported (the parent PIN); anything else is household data. blank: what an empty form field means ('keep' the
  // saved value, use the 'default', or leave it empty). min: the smallest number the form accepts.
  const SETTINGS = [
    { key: 'haUrl', def: 'http://homeassistant.local:8123', config: 'homeAssistant.url', field: 'ha-url-input', blank: 'keep' },
    { key: 'haToken', def: '', config: 'homeAssistant.token', field: 'ha-token-input', blank: 'keep', scope: 'device' },
    { key: 'haKioskMode', def: false, config: 'haKioskMode', field: 'ha-kiosk-mode-toggle', type: 'boolean', scope: 'device' },
    { key: 'googleKeepUrl', def: 'https://keep.google.com', config: 'googleKeepUrl', field: 'keep-url-input', blank: 'keep' },
    { key: 'haGroceryTodoEntity', def: '', config: 'haGroceryTodoEntity', field: 'grocery-entity-input' },
    { key: 'haMealIdeasEntity', def: 'todo.meal_ideas', config: 'haMealIdeasEntity', field: 'meal-ideas-entity-input', blank: 'default' },
    { key: 'haMealPlanEntity', def: 'todo.weekly_meal_plan', config: 'haMealPlanEntity', field: 'meal-plan-entity-input', blank: 'default' },
    { key: 'photoEntity', def: 'image.immich_random_favorite_image', config: 'photoEntity', field: 'photo-entity-input', blank: 'default' }, // image.* entity that serves the screensaver photo
    { key: 'immichUrl', def: 'http://homeassistant.local:2283', config: 'immich.url' },
    { key: 'immichApiKey', def: '', config: 'immich.apiKey', scope: 'device' },
    { key: 'idleSaverMinutes', def: 2, field: 'idle-minutes-input', min: 1 },
    { key: 'photoIntervalSeconds', def: 30, field: 'photo-interval-input', min: 10 },
    { key: 'nightMode', def: 'off', field: 'night-mode-select', blank: 'default' }, // 'off', 'schedule' or 'sun'
    { key: 'nightStart', def: '21:00', field: 'night-start-input', blank: 'default' },
    { key: 'nightStop', def: '07:00', field: 'night-stop-input', blank: 'default' },
    { key: 'nightBrightness', def: 15, field: 'night-brightness-input', min: 5 }, // percent left showing
    { key: 'doorbellEntity', def: '', config: 'doorbell.entity', field: 'doorbell-entity-input' }, // event.* or binary_sensor.* that fires on a doorbell press
    { key: 'doorbellCamera', def: '', config: 'doorbell.camera', field: 'doorbell-camera-input' }, // camera.* shown in the popup
    { key: 'doorbellSeconds', def: 30, config: 'doorbell.seconds', field: 'doorbell-seconds-input', min: 5 },
    { key: 'parentPin', scope: 'private' }, // unset until a parent sets one; the PIN gate falls back to '1234'
    // No defaults: unset means "use the Home Assistant home location" (weather.js falls back to a built-in default)
    { key: 'weather.lat', config: 'weather.latitude' },
    { key: 'weather.lon', config: 'weather.longitude' },
    { key: 'weather.locationName', config: 'weather.locationName' }
  ];

  const settingAt = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
  const putSetting = (obj, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => (o[k] ||= {}), obj)[last] = value;
  };

  const SettingsSchema = {
    defaults() {
      const settings = {};
      SETTINGS.filter(e => 'def' in e).forEach(e => putSetting(settings, e.key, e.def));
      return settings;
    },

    // config.js wins over a saved value wherever it sets one.
    applyConfig(settings, cfg) {
      if (!cfg) return;
      SETTINGS.filter(e => e.config).forEach(e => {
        const value = settingAt(cfg, e.config);
        if (e.type === 'boolean') {
          if (typeof value === 'boolean') putSetting(settings, e.key, value);
        } else if (value) {
          putSetting(settings, e.key, value);
        }
      });
    },

    // A blank saved where a blank is not allowed means "never set": use the default.
    normalize(settings) {
      SETTINGS.filter(e => e.blank === 'default').forEach(e => { if (!settings[e.key]) settings[e.key] = e.def; });
      if (typeof settings.haKioskMode !== 'boolean') settings.haKioskMode = false;
    },

    without(settings, scopes) {
      const out = { ...settings };
      SETTINGS.filter(e => scopes.includes(e.scope)).forEach(e => { delete out[e.key]; });
      return out;
    },

    pick(settings, scopes) {
      const out = {};
      SETTINGS.filter(e => scopes.includes(e.scope) && e.key in settings).forEach(e => { out[e.key] = settings[e.key]; });
      return out;
    },

    fields() { return SETTINGS.filter(e => e.field).map(e => e.field); },

    // { field id: text to show } for the settings form.
    toForm(settings) {
      const form = {};
      SETTINGS.filter(e => e.field).forEach(e => {
        if (e.type === 'boolean') {
          form[e.field] = settings[e.key] ? 'true' : 'false';
        } else {
          form[e.field] = String(settings[e.key] || (e.min !== undefined || e.blank === 'default' ? e.def : ''));
        }
      });
      return form;
    },

    // What was typed ({ field id: text }, missing fields left out) -> the settings to change.
    fromForm(values) {
      const patch = {};
      SETTINGS.filter(e => e.field && values[e.field] !== undefined).forEach(e => {
        const raw = values[e.field];
        if (e.type === 'boolean') {
          patch[e.key] = raw === 'true' || raw === 'on' || raw === true;
        } else if (e.min !== undefined) {
          const n = parseInt(raw, 10);
          if (n >= e.min) patch[e.key] = n;
        } else if (e.blank === 'keep') {
          if (raw) patch[e.key] = raw;
        } else {
          patch[e.key] = e.blank === 'default' ? (raw || e.def) : raw;
        }
      });
      return patch;
    }
  };

  // Schema skeleton only. Household seed data lives in data/dashboard-data.json.
  const defaultState = () => ({
    schemaVersion: SCHEMA_VERSION,
    activeMemberId: 'all', // which member this tablet is showing; never shared with other tablets
    themeMode: 'auto',
    members: [],
    events: [], // your own events; Home Assistant's are kept apart by the calendar feed
    routines: [],
    chores: [],
    rewards: [], // prize store: { id, title, cost }
    parentTasks: [],
    kidAchievements: {},
    groceries: [],
    mealIdeas: [],
    settings: SettingsSchema.defaults()
  });

  // Parent "reminders" and "tasks" are one thing: a task that may repeat.
  function unifyTasks(state) {
    if (!state.recurringReminders) return state;
    state.parentTasks = [...(state.parentTasks || []), ...state.recurringReminders.map(r => ({
      id: r.id, memberId: r.memberId === 'both' ? 'shared' : r.memberId, title: r.title, notes: r.notes || '',
      priority: 'medium', category: r.category === 'routine' ? 'home' : (r.category || 'home'),
      dueDate: r.nextDueDate || '', frequency: r.frequency || 'none', lastCompletedDate: r.lastCompletedDate || null,
      showOnCalendar: !!r.showOnCalendar, completed: false
    }))];
    delete state.recurringReminders;
    return state;
  }

  // What a member keeps from the saved copy when config.js is applied: earned stars and goals, and what Settings edits.
  const MEMBER_EDITS = ['stars', 'targetReward', 'targetStars', 'goalDoneFor', 'avatar', 'haCalendarEntity'];

  // The household document: where it is kept (this tablet, and Home Assistant so every tablet shares it), how a saved
  // copy, config.js and the defaults combine, and which copy wins when tablets disagree (the newest edit).
  class StateManager {
    constructor({ local, remote, baseline, config, now = () => Date.now(), pushDelay = 1500 }) {
      this.local = local;       // { get(key) -> string | null, set(key, string) }: this tablet's storage
      this.remote = remote;     // { ready() -> bool, get() -> document | null, set(document) }: the copy tablets share
      this.baseline = baseline; // async () -> seed document | null: data/dashboard-data.json
      this.config = config;     // window.FAMILY_DASHBOARD_CONFIG
      this.now = now;
      this.pushDelay = pushDelay;
      this.listeners = [];
      this.pushTimer = null;
      this.data = this.loadState();
    }

    subscribe(fn) {
      this.listeners.push(fn);
      return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }

    // The defaults, then the document, then config.js where it sets something (members keep what was saved for them).
    hydrate(doc) {
      const base = defaultState();
      const state = { ...base, ...doc, settings: { ...base.settings, ...(doc.settings || {}) } };
      unifyTasks(state);
      ['theme', 'meals'].forEach(k => { delete state[k]; });                                  // no longer used
      ['haConnected', 'immichEnabled', 'haTasksTodoEntity'].forEach(k => { delete state.settings[k]; });
      SettingsSchema.normalize(state.settings);
      SettingsSchema.applyConfig(state.settings, this.config);
      this.applyConfigMembers(state);
      state.schemaVersion = SCHEMA_VERSION; // ponytail: no migrations yet; branch on doc.schemaVersion here when the shape changes
      return state;
    }

    applyConfigMembers(state) {
      const configured = this.config?.members;
      if (!Array.isArray(configured) || !configured.length) return;
      state.members = configured.map(cm => {
        const saved = (state.members || []).find(m => m.id === cm.id) || {};
        const kept = {};
        MEMBER_EDITS.filter(k => saved[k] != null).forEach(k => { kept[k] = saved[k]; });
        return { ...cm, stars: cm.stars || 0, ...kept };
      });
    }

    loadState() {
      let doc = {};
      try {
        const saved = this.local.get(STORAGE_KEY);
        if (saved) doc = JSON.parse(saved);
      } catch (e) {
        console.warn('Error loading saved state:', e);
      }
      return this.hydrate(doc);
    }

    async loadBaselineIfEmpty() {
      if (this.local.get(STORAGE_KEY)) return false;
      try {
        const seed = await this.baseline();
        if (seed) {
          this.data = this.hydrate(seed);
          this.save({ stamp: false, push: false });
          return true;
        }
      } catch (e) {
        console.warn('Could not load data/dashboard-data.json on first run:', e);
      }
      return false;
    }

    async resetToBaseline() {
      try {
        const seed = await this.baseline();
        if (seed) {
          this.data = this.hydrate(seed);
          this.save();
          return true;
        }
      } catch (err) {
        console.warn('Could not fetch data/dashboard-data.json:', err);
      }
      return false; // keep existing data rather than wiping it
    }

    // ---- backup ----
    // Never tokens, the PIN, or which member this tablet is showing.
    exportJson() {
      const { activeMemberId, ...doc } = this.data;
      return JSON.stringify({ ...doc, settings: SettingsSchema.without(doc.settings, ['device', 'private']) }, null, 2);
    }

    exportData() {
      const blob = new Blob([this.exportJson()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dashboard-data.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    importData(jsonString) {
      try {
        const imported = JSON.parse(jsonString);
        if (!imported || typeof imported !== 'object') {
          throw new Error('Invalid JSON format: root must be an object.');
        }
        if (!imported.members && !imported.chores && !imported.settings) {
          throw new Error('Unrecognized format: Missing essential dashboard collections.');
        }
        const settings = { ...SettingsSchema.without(imported.settings || {}, ['device', 'private']), ...SettingsSchema.pick(this.data.settings, ['device', 'private']) };
        this.data = { ...this.hydrate({ ...imported, settings }), activeMemberId: this.data.activeMemberId };
        this.save();
        return { success: true };
      } catch (err) {
        console.error('Import error:', err);
        return { success: false, error: err.message };
      }
    }

    // ---- saving and sharing ----
    // opts.stamp:false / opts.push:false for loads that must not look like a fresh local edit.
    save({ stamp = true, push = true } = {}) {
      if (stamp) this.data.updatedAt = this.now();
      this.local.set(STORAGE_KEY, JSON.stringify(this.data));
      if (push) this.schedulePush();
      this.listeners.forEach(fn => fn(this.data));
    }

    // Choosing which member to show is this tablet's own business: saved here, never stamped or shared.
    setActiveMember(memberId) {
      this.data.activeMemberId = memberId;
      this.save({ stamp: false, push: false });
    }

    /* The whole household document lives in Home Assistant's per-user storage, so every tablet using the same
       account shares it and it survives cleared browsers. Last write wins on `updatedAt`. */
    schedulePush() {
      if (!this.remote.ready()) return;
      clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(() => { this.pushTimer = null; this.pushRemote(); }, this.pushDelay);
    }

    // Tokens stay on their tablet, and so does the member it is showing.
    sharedDocument() {
      const { activeMemberId, ...doc } = this.data;
      return { ...doc, settings: SettingsSchema.without(doc.settings, ['device']) };
    }

    async pushRemote() {
      if (!this.remote.ready()) return;
      try {
        await this.remote.set(this.sharedDocument());
      } catch (e) {
        console.warn('HA state push failed:', e);
      }
    }

    // Adopt the shared copy if newer; push ours if there is none or ours is newer.
    async syncRemote() {
      if (!this.remote.ready() || this.pushTimer) return; // a pending local edit wins; it pushes itself
      try {
        const remote = await this.remote.get();
        const mine = this.data.updatedAt || 0;
        if (remote && (remote.updatedAt || 0) > mine) {
          const own = SettingsSchema.pick(this.data.settings, ['device']);
          const view = this.data.activeMemberId;
          this.data = this.hydrate(remote);
          Object.entries(own).forEach(([key, value]) => { if (value !== undefined && value !== '') this.data.settings[key] = value; });
          this.data.activeMemberId = view;
          this.data.updatedAt = remote.updatedAt;
          this.save({ stamp: false, push: false });
        } else if (!remote || mine > (remote.updatedAt || 0)) {
          await this.pushRemote();
        }
      } catch (e) {
        console.warn('HA state sync failed:', e);
      }
    }
  }

  // This tablet's storage; a full or blocked store only costs persistence.
  const browserStorage = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { console.error('Error saving state:', e); } }
  };
