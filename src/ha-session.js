  /* --------------------------------------------------------------------------
     HOME ASSISTANT SESSION & THE SHARED DOCUMENT
     Whether we run inside HA (reuse its login) or standalone (token), and the
     StateManager that keeps household data on this tablet and in HA user data.
     -------------------------------------------------------------------------- */
  // True when running inside the Home Assistant frontend (card iframe or same-origin panel): its session is reused.
  const inHA = () => {
    try {
      if (window.hassConnection || (window.parent && window.parent !== window && window.parent.hassConnection)) return true;
      if (getHaDocument()) return true;
      return false;
    } catch (_) { return false; } // cross-origin parent
  };
  // Base URL for plain HTTP assets (camera, photos): the HA page's own origin when embedded, else the configured URL.
  const haBase = () => {
    if (inHA()) { try { return window.parent !== window ? window.parent.location.origin : window.location.origin; } catch (_) {} }
    return stateManager.data.settings.haUrl || 'http://homeassistant.local:8123';
  };

  // The shared copy: Home Assistant's per-user storage (frontend/set_user_data).
  const haUserData = (ha, settings) => ({
    ready() {
      const h = ha();
      if (h && typeof h.isNative === 'function' && h.isNative()) return true;
      if (inHA()) return true;
      const { haUrl, haToken } = settings();
      return !!(haUrl && haToken);
    },
    async get() { const res = await ha().send({ type: 'frontend/get_user_data', key: REMOTE_KEY }); return (res && res.value) || null; },
    set(doc) { return ha().send({ type: 'frontend/set_user_data', key: REMOTE_KEY, value: doc }); }
  });

  const stateManager = new StateManager({
    local: browserStorage,
    remote: haUserData(() => haWS, () => stateManager.data.settings),
    baseline: async () => { if (window.__FD_SEED__) return window.__FD_SEED__; const res = await fetch('./data/dashboard-data.json?t=' + Date.now()); return res.ok ? res.json() : null; },
    config: window.FAMILY_DASHBOARD_CONFIG
  });
  window.stateManager = stateManager;
