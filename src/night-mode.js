/* --------------------------------------------------------------------------
     NIGHT MODE RULES
     -------------------------------------------------------------------------- */
  const NightMode = {
    // settings: nightMode ('off' | 'schedule' | 'sun'), nightStart, nightStop ('HH:MM').
    // sun: today's { sunrise, sunset } as 'YYYY-MM-DDTHH:MM', or nothing when the weather has not loaded (set times apply).
    isNight(settings, now, sun) {
      if (settings.nightMode !== 'sun' && settings.nightMode !== 'schedule') return false;
      const useSun = settings.nightMode === 'sun' && sun?.sunset && sun?.sunrise;
      const start = useSun ? sun.sunset.slice(11) : settings.nightStart;
      const stop = useSun ? sun.sunrise.slice(11) : settings.nightStop;
      const minutes = (hhmm) => {
        const [h, m] = String(hhmm).split(':').map(Number);
        return h * 60 + m;
      };
      const from = minutes(start);
      const to = minutes(stop);
      const at = now.getHours() * 60 + now.getMinutes();
      if (from === to || Number.isNaN(from) || Number.isNaN(to)) return false; // an empty window or a malformed saved time
      return from < to ? at >= from && at < to : at >= from || at < to; // usually crosses midnight
    }
  };
