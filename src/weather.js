/* --------------------------------------------------------------------------
     1. WEATHER & CLOCK
     -------------------------------------------------------------------------- */
  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;

    const clockEl = document.getElementById('clock');
    const clockText = `${hours}:${minutes} ${ampm}`;
    if (clockEl && clockEl.dataset.t !== clockText) {
      clockEl.dataset.t = clockText;
      clockEl.innerHTML = `${hours}:${minutes} <span class="ampm">${ampm}</span>`;
    }

    const dateEl = document.getElementById('current-date');
    if (dateEl) {
      const day = now.toLocaleDateString('en-US', { weekday: 'long' });
      const date = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const dateText = `${day}\n${date}`;
      if (dateEl.dataset.t !== dateText) {
        dateEl.dataset.t = dateText;
        dateEl.innerHTML = `<span>${day}</span><span>${date}</span>`;
      }
    }
  }

  /* --------------------------------------------------------------------------
     WEATHER & RADAR ENGINE (Live Open-Meteo & Windy.com Embed)
     -------------------------------------------------------------------------- */
  let weatherCache = {
    timestamp: 0,
    data: null
  };

  const DEFAULT_WEATHER_DATA = {
    locationName: 'Home',
    current: {
      temp: 74,
      feelsLike: 75,
      condition: 'Sunny & Clear',
      icon: 'fa-sun text-amber',
      hilo: 'H: 78° • L: 58°',
      rainProb: 0,
      windSpeed: 6,
      windDir: 'NW',
      humidity: 45,
      aqi: 32,
      uv: 5
    },
    forecast: [
      { day: 'Today', dateStr: 'Oct 3', isToday: true, icon: 'fa-sun text-amber', desc: 'Sunny & Clear', tempHigh: 78, tempLow: 58, precipProb: 0, windSpeed: 6, humidity: 45, aqi: 32 },
      { day: 'Sun', dateStr: 'Oct 4', isToday: false, icon: 'fa-cloud-sun text-amber', desc: 'Partly Cloudy', tempHigh: 76, tempLow: 57, precipProb: 10, windSpeed: 8, humidity: 52, aqi: 38 },
      { day: 'Mon', dateStr: 'Oct 5', isToday: false, icon: 'fa-cloud-rain text-sky', desc: 'Light Rain', tempHigh: 70, tempLow: 54, precipProb: 65, windSpeed: 12, humidity: 75, aqi: 24 },
      { day: 'Tue', dateStr: 'Oct 6', isToday: false, icon: 'fa-cloud text-secondary', desc: 'Mostly Cloudy', tempHigh: 73, tempLow: 56, precipProb: 20, windSpeed: 9, humidity: 60, aqi: 29 },
      { day: 'Wed', dateStr: 'Oct 7', isToday: false, icon: 'fa-sun text-amber', desc: 'Clear Skies', tempHigh: 79, tempLow: 60, precipProb: 5, windSpeed: 7, humidity: 46, aqi: 35 }
    ]
  };

  // Older versions saved these defaults into settings, so they can't be told apart from "never set".
  const isDefaultLocation = (w) => !w?.lat || (w.lat === 37.7749 && w.lon === -122.4194 && (!w.locationName || w.locationName === 'Home'));

  // Home Assistant only knows its home as "Home"; turn the coordinates into a city name (cached per place).
  const cityCache = {};
  async function lookupCityName(lat, lon) {
    const key = `${lat},${lon}`;
    if (!(key in cityCache)) {
      cityCache[key] = null;
      try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        const g = res.ok ? await res.json() : {};
        const city = g.city || g.locality;
        cityCache[key] = city ? [city, g.principalSubdivision].filter(Boolean).join(', ') : null;
      } catch (_) {}
    }
    return cityCache[key];
  }

  function getWeatherCoordinates() {
    const s = (typeof stateManager !== 'undefined' && stateManager?.data?.settings) || {};
    const cfg = window.FAMILY_DASHBOARD_CONFIG || {};

    let lat = s.weather?.lat ?? cfg.weather?.latitude ?? 37.7749;
    let lon = s.weather?.lon ?? cfg.weather?.longitude ?? -122.4194;
    let locationName = s.weather?.locationName || cfg.weather?.locationName || 'Home';

    return { lat, lon, locationName };
  }

  function getWmoCondition(code) {
    if (code === 0) return { desc: 'Clear Sky', icon: 'fa-sun text-amber' };
    if (code === 1) return { desc: 'Mainly Clear', icon: 'fa-sun text-amber' };
    if (code === 2) return { desc: 'Partly Cloudy', icon: 'fa-cloud-sun text-amber' };
    if (code === 3) return { desc: 'Overcast', icon: 'fa-cloud text-secondary' };
    if (code === 45 || code === 48) return { desc: 'Foggy', icon: 'fa-smog text-secondary' };
    if (code >= 51 && code <= 55) return { desc: 'Drizzle', icon: 'fa-cloud-rain text-sky' };
    if (code === 56 || code === 57) return { desc: 'Freezing Drizzle', icon: 'fa-snowflake text-sky' };
    if (code === 61 || code === 63) return { desc: 'Rain', icon: 'fa-cloud-rain text-sky' };
    if (code === 65) return { desc: 'Heavy Rain', icon: 'fa-cloud-showers-heavy text-sky' };
    if (code === 66 || code === 67) return { desc: 'Freezing Rain', icon: 'fa-snowflake text-sky' };
    if (code >= 71 && code <= 77) return { desc: 'Snowfall', icon: 'fa-snowflake text-sky' };
    if (code === 80 || code === 81) return { desc: 'Rain Showers', icon: 'fa-cloud-rain text-sky' };
    if (code === 82) return { desc: 'Heavy Showers', icon: 'fa-cloud-showers-heavy text-sky' };
    if (code === 85 || code === 86) return { desc: 'Snow Showers', icon: 'fa-snowflake text-sky' };
    if (code === 95) return { desc: 'Thunderstorm', icon: 'fa-cloud-bolt text-amber' };
    if (code >= 96) return { desc: 'Severe Storm', icon: 'fa-cloud-bolt text-danger' };
    return { desc: 'Partly Cloudy', icon: 'fa-cloud-sun text-amber' };
  }

  function getAqiCategory(aqi) {
    if (aqi <= 50) return { text: 'Good', className: 'aqi-good', iconColor: 'text-success' };
    if (aqi <= 100) return { text: 'Moderate', className: 'aqi-moderate', iconColor: 'text-amber' };
    if (aqi <= 150) return { text: 'Sensitive', className: 'aqi-sensitive', iconColor: 'text-rose' };
    if (aqi <= 200) return { text: 'Unhealthy', className: 'aqi-unhealthy', iconColor: 'text-danger' };
    return { text: 'Hazardous', className: 'aqi-hazardous', iconColor: 'text-purple' };
  }

  function degToCompass(deg) {
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(deg / 45) % 8;
    return compass[idx] || 'N';
  }

  async function fetchLiveWeatherData(force = false) {
    const now = Date.now();
    if (!force && weatherCache.data && (now - weatherCache.timestamp < 15 * 60 * 1000)) {
      return weatherCache.data;
    }

    const { lat, lon, locationName: savedName } = getWeatherCoordinates();
    const locationName = savedName === 'Home' ? (await lookupCityName(lat, lon)) || savedName : savedName;

    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=5`;
      const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5&hourly=us_aqi&timezone=auto&forecast_days=5`;

      const [wRes, aRes] = await Promise.all([
        fetch(weatherUrl).catch(() => null),
        fetch(aqiUrl).catch(() => null)
      ]);

      if (!wRes || !wRes.ok) {
        throw new Error('Weather API request failed');
      }

      const wData = await wRes.json();
      const aData = aRes && aRes.ok ? await aRes.json() : null;

      const current = wData.current || {};
      const daily = wData.daily || {};
      const currentCode = current.weather_code ?? 0;
      const currentCond = getWmoCondition(currentCode);
      const currentWindDir = degToCompass(current.wind_direction_10m || 0);
      const currentAqiVal = Math.round(aData?.current?.us_aqi || 32);

      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const forecastList = [];
      const times = daily.time || [];

      for (let i = 0; i < Math.min(5, times.length); i++) {
        const dateParts = times[i].split('-');
        const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        const isToday = i === 0;
        const dayLabel = isToday ? 'Today' : daysOfWeek[dateObj.getDay()];
        const dateLabel = `${months[dateObj.getMonth()]} ${dateObj.getDate()}`;
        const code = daily.weather_code ? daily.weather_code[i] : 0;
        const cond = isToday ? currentCond : getWmoCondition(code); // today's card matches the header

        let dayAqi = currentAqiVal;
        if (aData?.hourly?.us_aqi && aData.hourly.us_aqi.length >= (i + 1) * 24) {
          const slice = aData.hourly.us_aqi.slice(i * 24, (i + 1) * 24).filter(v => v !== null);
          if (slice.length > 0) {
            dayAqi = Math.round(slice.reduce((acc, v) => acc + v, 0) / slice.length);
          }
        }

        forecastList.push({
          day: dayLabel,
          dateStr: dateLabel,
          isToday: isToday,
          icon: cond.icon,
          desc: cond.desc,
          tempHigh: Math.round(daily.temperature_2m_max ? daily.temperature_2m_max[i] : 75),
          tempLow: Math.round(daily.temperature_2m_min ? daily.temperature_2m_min[i] : 55),
          precipProb: Math.round(daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : 0),
          windSpeed: Math.round(daily.wind_speed_10m_max ? daily.wind_speed_10m_max[i] : 7),
          humidity: Math.round(current.relative_humidity_2m || 50),
          aqi: dayAqi,
          uv: daily.uv_index_max ? Math.round(daily.uv_index_max[i]) : 5
        });
      }

      const todayHigh = forecastList[0]?.tempHigh ?? 78;
      const todayLow = forecastList[0]?.tempLow ?? 58;

      const parsedData = {
        locationName: locationName,
        sun: { sunrise: daily.sunrise?.[0], sunset: daily.sunset?.[0] },
        current: {
          temp: Math.round(current.temperature_2m ?? 74),
          feelsLike: Math.round(current.apparent_temperature ?? current.temperature_2m ?? 74),
          condition: currentCond.desc,
          icon: currentCond.icon,
          hilo: `H: ${todayHigh}° • L: ${todayLow}°`,
          rainProb: forecastList[0]?.precipProb ?? 0,
          windSpeed: Math.round(current.wind_speed_10m ?? 6),
          windDir: currentWindDir,
          humidity: Math.round(current.relative_humidity_2m ?? 45),
          aqi: currentAqiVal,
          uv: forecastList[0]?.uv ?? 5
        },
        forecast: forecastList
      };

      weatherCache = {
        timestamp: Date.now(),
        data: parsedData
      };

      return parsedData;
    } catch (err) {
      console.warn('Weather fetch fallback triggered:', err);
      return weatherCache.data || { ...DEFAULT_WEATHER_DATA, offline: true };
    }
  }

  function renderWeatherUI(data) {
    if (!data) return;

    // 1. Update Header Weather Widget
    const weatherIcon = document.getElementById('weather-icon');
    const weatherTemp = document.getElementById('weather-temp');
    const weatherDesc = document.getElementById('weather-desc');
    const weatherHilo = document.getElementById('weather-hilo');
    const rainVal = document.getElementById('header-rain-val');
    const aqiVal = document.getElementById('header-aqi-val');

    if (weatherIcon) weatherIcon.className = `fa-solid weather-icon ${data.current.icon}`;
    if (weatherTemp) weatherTemp.textContent = data.offline ? '--' : `${data.current.temp}°F`;
    if (weatherDesc) weatherDesc.textContent = data.offline ? 'Weather unavailable' : data.current.condition;
    if (weatherHilo) weatherHilo.textContent = data.current.hilo;
    if (rainVal) rainVal.textContent = `${data.current.rainProb}%`;
    if (aqiVal) aqiVal.textContent = `${data.current.aqi}`;

    // Screensaver weather (under the date)
    const pw = document.getElementById('photo-weather');
    if (pw) {
      pw.hidden = !!data.offline;
      document.getElementById('photo-weather-icon').className = `fa-solid ${data.current.icon}`;
      document.getElementById('photo-weather-temp').textContent = `${data.current.temp}°F`;
      document.getElementById('photo-weather-aqi').textContent = data.current.aqi;
    }

    // 2. Update Weather Modal Hero
    const heroIcon = document.getElementById('hero-weather-icon');
    const heroTemp = document.getElementById('hero-weather-temp');
    const heroDesc = document.getElementById('hero-weather-desc');
    const heroLocation = document.getElementById('hero-weather-location');
    const heroHilo = document.getElementById('hero-weather-hilo');
    const heroFeels = document.getElementById('hero-weather-feels');

    if (heroIcon) heroIcon.className = `fa-solid hero-icon ${data.current.icon}`;
    if (heroTemp) heroTemp.textContent = `${data.current.temp}°F`;
    if (heroDesc) heroDesc.textContent = data.current.condition;
    if (heroLocation) heroLocation.innerHTML = `<i class="fa-solid fa-location-dot text-rose"></i> ${esc(data.locationName || 'Home')}`;
    if (heroHilo) heroHilo.textContent = data.current.hilo;
    if (heroFeels) heroFeels.textContent = `Feels like ${data.current.feelsLike}°F`;

    // 3. Extended Metric Pills
    const metricRain = document.getElementById('metric-rain');
    const metricWind = document.getElementById('metric-wind');
    const metricHumidity = document.getElementById('metric-humidity');
    const metricAqi = document.getElementById('metric-aqi');
    const metricAqiIcon = document.getElementById('metric-aqi-icon');
    const metricUv = document.getElementById('metric-uv');

    if (metricRain) metricRain.textContent = `${data.current.rainProb}%`;
    if (metricWind) metricWind.textContent = `${data.current.windSpeed} mph ${data.current.windDir}`;
    if (metricHumidity) metricHumidity.textContent = `${data.current.humidity}%`;
    if (metricAqi) {
      const aqiCat = getAqiCategory(data.current.aqi);
      metricAqi.textContent = `AQI ${data.current.aqi} (${aqiCat.text})`;
      if (metricAqiIcon) metricAqiIcon.className = `fa-solid fa-leaf ${aqiCat.iconColor}`;
    }
    if (metricUv) {
      let uvLabel = 'Low';
      if (data.current.uv >= 3) uvLabel = 'Mod';
      if (data.current.uv >= 6) uvLabel = 'High';
      if (data.current.uv >= 8) uvLabel = 'Very High';
      metricUv.textContent = `${data.current.uv} (${uvLabel})`;
    }

    // 4. Horizontal 5-Day Forecast Grid
    const container = document.getElementById('forecast-grid-container');
    if (container && data.forecast && data.forecast.length) {
      container.innerHTML = data.forecast.map(f => {
        const aqiInfo = getAqiCategory(f.aqi);
        const rainHighlight = f.precipProb >= 30 ? 'high-precip' : '';
        return `
          <div class="forecast-day-card glass-card ${f.isToday ? 'is-today' : ''}">
            <div class="forecast-day-header">
              <span class="forecast-day-name">${f.day}</span>
              <span class="forecast-day-date">${f.dateStr}</span>
            </div>
            <div class="forecast-day-icon-wrap">
              <i class="fa-solid ${f.icon} forecast-day-icon"></i>
              <span class="forecast-day-desc">${f.desc}</span>
            </div>
            <div class="forecast-day-temps">
              <span class="temp-high">${f.tempHigh}°</span>
              <span class="temp-separator">/</span>
              <span class="temp-low">${f.tempLow}°</span>
            </div>
            <div class="forecast-day-details">
              <div class="forecast-detail-row" title="Chance of Precipitation">
                <span><i class="fa-solid fa-droplet text-sky"></i> Rain</span>
                <span class="detail-val ${rainHighlight}">${f.precipProb}%</span>
              </div>
              <div class="forecast-detail-row" title="Peak wind speed for the day">
                <span><i class="fa-solid fa-wind text-sky"></i> Peak wind</span>
                <span class="detail-val">${f.windSpeed} mph</span>
              </div>
              <div class="forecast-detail-row" title="Relative Humidity">
                <span><i class="fa-solid fa-water text-sky"></i> Humidity</span>
                <span class="detail-val">${f.humidity}%</span>
              </div>
              <div class="forecast-detail-row" title="Air Quality Index">
                <span><i class="fa-solid fa-leaf ${aqiInfo.iconColor}"></i> AQI</span>
                <span class="detail-val aqi-val ${aqiInfo.className}">${f.aqi}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Windy Radar Modal Manager
  function openWindyRadarModal(layer = 'radar') {
    const modal = document.getElementById('windy-radar-modal');
    const iframe = document.getElementById('windy-iframe');
    const spinner = document.getElementById('windy-spinner');
    const extLink = document.getElementById('windy-external-link');
    if (!modal || !iframe) return;

    const { lat, lon } = getWeatherCoordinates();

    document.querySelectorAll('.layer-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layer === layer);
    });

    if (extLink) {
      extLink.href = `https://www.windy.com/?${layer},${lat},${lon},8`;
    }

    // Show the modal before loading: Windy sizes/centers its map from the iframe's viewport, which is 0x0 while hidden.
    modal.classList.add('active');

    if (spinner) spinner.classList.remove('loaded');
    const product = layer === 'radar' ? 'radar' : 'ecmwf';
    const targetSrc = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=%C2%B0F&metricWind=mph&zoom=8&overlay=${layer}&product=${product}&level=surface&lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&marker=true`;

    if (iframe.src !== targetSrc) {
      iframe.onload = () => {
        if (spinner) spinner.classList.add('loaded');
      };
      iframe.src = targetSrc;
    } else {
      if (spinner) spinner.classList.add('loaded');
    }
  }

  // Click the location name in the weather popup to search for another place
  function initLocationPicker() {
    const btn = document.getElementById('hero-weather-location');
    const box = document.getElementById('weather-location-picker');
    const input = document.getElementById('weather-location-search');
    const list = document.getElementById('weather-location-results');
    if (!btn || !box || !input || !list) return;

    let places = [];
    let timer;

    btn.addEventListener('click', () => {
      box.hidden = !box.hidden;
      if (!box.hidden) input.focus();
    });

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim();
        if (q.length < 2) { list.innerHTML = ''; return; }
        try {
          const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
          places = (await res.json()).results || [];
          list.innerHTML = places.length
            ? places.map((p, i) => `<li><button type="button" data-i="${i}">${esc([p.name, p.admin1, p.country_code].filter(Boolean).join(', '))}</button></li>`).join('')
            : '<li class="muted">No matches</li>';
        } catch (_) {
          list.innerHTML = '<li class="muted">Search unavailable offline</li>';
        }
      }, 300);
    });

    list.addEventListener('click', (e) => {
      const p = places[e.target.closest('button[data-i]')?.dataset.i];
      if (!p) return;
      const s = stateManager.data.settings;
      s.weather = { ...s.weather, lat: p.latitude, lon: p.longitude, locationName: [p.name, p.admin1].filter(Boolean).join(', ') };
      stateManager.save();
      box.hidden = true;
      input.value = '';
      list.innerHTML = '';
      fetchLiveWeatherData(true).then(renderWeatherUI);
    });
  }

  function initWindyRadar() {
    const radarBtn = document.getElementById('open-windy-radar-btn');
    const modal = document.getElementById('windy-radar-modal');
    const closeBtn = document.getElementById('windy-radar-modal-close');

    if (radarBtn) {
      radarBtn.addEventListener('click', () => openWindyRadarModal('radar'));
    }
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    document.querySelectorAll('.layer-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.dataset.layer;
        if (layer) openWindyRadarModal(layer);
      });
    });
  }

  async function checkHomeAssistantCoordinates() {
    try {
      const s = (typeof stateManager !== 'undefined' && stateManager?.data?.settings) || {};
      const haUrl = s.haUrl || window.FAMILY_DASHBOARD_CONFIG?.homeAssistant?.url;
      const haToken = s.haToken || window.FAMILY_DASHBOARD_CONFIG?.homeAssistant?.token;

      if ((haWS?.isNative?.() || (haUrl && haToken)) && isDefaultLocation(s.weather)) {
        let cfg = null;
        try {
          cfg = await haWS.send({ type: 'get_config' });
        } catch (_) {}
        if (!cfg && haUrl && haToken) {
          const res = await fetch(`${haUrl}/api/config`, {
            headers: { 'Authorization': `Bearer ${haToken}` }
          });
          if (res.ok) cfg = await res.json();
        }
        if (cfg && cfg.latitude && cfg.longitude) {
          if (!s.weather) s.weather = {};
          s.weather.lat = cfg.latitude;
          s.weather.lon = cfg.longitude;
          s.weather.locationName = cfg.location_name || 'Home';
          if (typeof stateManager !== 'undefined') stateManager.save();
          fetchLiveWeatherData(true).then(renderWeatherUI);
        }
      }
    } catch (e) {
      // HA unreachable or offline
    }
  }

  function initClockAndWeather(toast) {
    updateClock();
    setInterval(updateClock, 1000);

    const weatherCard = document.getElementById('weather-card');
    const weatherModal = document.getElementById('weather-modal');
    const weatherModalClose = document.getElementById('weather-modal-close');
    const weatherRefreshBtn = document.getElementById('weather-refresh-btn');

    renderWeatherUI({ ...DEFAULT_WEATHER_DATA, offline: true });
    fetchLiveWeatherData().then(renderWeatherUI);

    setTimeout(checkHomeAssistantCoordinates, 2000);

    setInterval(() => {
      fetchLiveWeatherData(true).then(renderWeatherUI);
    }, 15 * 60 * 1000);

    if (weatherCard && weatherModal) {
      weatherCard.addEventListener('click', () => {
        fetchLiveWeatherData().then(renderWeatherUI);
        weatherModal.classList.add('active');
      });

      if (weatherModalClose) {
        weatherModalClose.addEventListener('click', () => {
          weatherModal.classList.remove('active');
        });
      }

      weatherModal.addEventListener('click', (e) => {
        if (e.target === weatherModal) weatherModal.classList.remove('active');
      });
    }

    if (weatherRefreshBtn) {
      weatherRefreshBtn.addEventListener('click', async () => {
        const icon = weatherRefreshBtn.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        try {
          const data = await fetchLiveWeatherData(true);
          renderWeatherUI(data);
          toast?.('🌤️ Weather forecast updated!');
        } finally {
          setTimeout(() => {
            if (icon) icon.classList.remove('fa-spin');
          }, 600);
        }
      });
    }

    initWindyRadar();
    initLocationPicker();
  }
