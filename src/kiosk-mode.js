// Finds Home Assistant document across same-origin parent/top frame boundaries.
  const getHaDocument = () => {
    if (typeof window === 'undefined') return null;
    try {
      if (window.parent && window.parent !== window && window.parent.document && window.parent.document.querySelector('home-assistant')) {
        return window.parent.document;
      }
    } catch (_) {}
    try {
      if (window.top && window.top !== window && window.top.document && window.top.document.querySelector('home-assistant')) {
        return window.top.document;
      }
    } catch (_) {}
    try {
      if (typeof document !== 'undefined' && document.querySelector('home-assistant')) {
        return document;
      }
    } catch (_) {}
    return null;
  };

  // Kiosk mode is the WallPanel integration (https://github.com/j-a-n/lovelace-wallpanel) switched on per device:
  // it reads wp_* URL parameters over the dashboard's own wallpanel: YAML, so the page URL is the toggle.
  const KIOSK_PARAMS = { wp_enabled: 'true', wp_hide_toolbar: 'true', wp_hide_sidebar: 'true', wp_idle_time: '0' };

  const isKioskEscape = (haDoc) => {
    try {
      const searches = [typeof window !== 'undefined' && window.location && window.location.search, haDoc?.defaultView?.location?.search];
      return searches.some(search => /[?&](disable_kiosk|disable_km)(=[^&]*)?(&|$)/i.test(search || '') || /[?&]kiosk=(0|false|off)(&|$)/i.test(search || ''));
    } catch (_) {
      return false;
    }
  };

  // The query string the page should have with kiosk on or off, or null when it already does.
  const kioskSearch = (search, enable) => {
    const params = new URLSearchParams(search);
    const on = Object.entries(KIOSK_PARAMS).every(([k, v]) => params.get(k) === v);
    const any = Object.keys(KIOSK_PARAMS).some(k => params.has(k));
    if (enable ? on : !any) return null;
    Object.keys(KIOSK_PARAMS).forEach(k => params.delete(k));
    if (enable) Object.entries(KIOSK_PARAMS).forEach(([k, v]) => params.set(k, v));
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  // Reloads the Home Assistant page with kiosk on or off. Does nothing outside Home Assistant or when already right.
  const setHaKioskMode = (enable, haDocOverride = null) => {
    const haDoc = haDocOverride || getHaDocument();
    const loc = haDoc?.defaultView?.location;
    if (!loc) return;
    const next = kioskSearch(loc.search, !!enable && !isKioskEscape(haDoc));
    if (next !== null) loc.replace(loc.pathname + next + (loc.hash || ''));
  };

  // The dashboard's iframe can end up taller than what Home Assistant shows (its header, space a hidden toolbar leaves
  // behind, 100vh on a tablet), which pushes the bottom of the app off screen. Keep its bottom edge on the screen's.
  const fitToHaViewport = (haDoc = getHaDocument()) => {
    try {
      const frame = window.frameElement;
      const view = haDoc?.defaultView;
      if (!frame || !view) return;
      const rect = frame.getBoundingClientRect();
      const height = Math.max(240, Math.floor(view.innerHeight - rect.top));
      if (Math.abs(rect.height - height) < 2) return;
      frame.style.setProperty('height', `${height}px`, 'important');
      frame.style.setProperty('min-height', '0', 'important');
    } catch (_) {}
  };

  const watchHaViewport = () => {
    if (!getHaDocument()) return;
    fitToHaViewport();
    [1000, 3000, 8000].forEach(ms => setTimeout(fitToHaViewport, ms)); // WallPanel hides the toolbar a moment after load
    try { window.parent.addEventListener('resize', () => fitToHaViewport()); } catch (_) {}
    // Home Assistant can also move the frame without a window resize: its container resizes then.
    try {
      const container = window.frameElement?.parentElement;
      if (container && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fitToHaViewport()).observe(container);
    } catch (_) {}
  };
