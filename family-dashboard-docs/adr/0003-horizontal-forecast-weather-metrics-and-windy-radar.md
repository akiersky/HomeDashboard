# ADR 0003: Horizontal 5-Day Forecast Grid, Extended Weather Metrics, and Interactive Windy.com Radar Modal

- **Status:** Accepted
- **Date:** 2026-10-03
- **Owner:** `decisions` skill

## What was decided
1. **Horizontal 5-Day Forecast Layout:**
   - Redesigned the 5-day outlook into a 5-column horizontal grid (`grid-template-columns: repeat(5, 1fr)`) across the widened weather modal card (`max-width: 960px`).
   - On compact/mobile screens (`<= 768px`), smoothly transforms into a touch-scrollable horizontal carousel with snap alignment (`scroll-snap-type: x mandatory`).
2. **Extended Weather Metrics & Air Quality:**
   - Both the current conditions hero and individual forecast days now provide:
     - **Precipitation probability** (Rain chance %) with visual highlighting for elevated rain risk (`> 30%`).
     - **Wind speed and compass direction** (e.g., `6 mph NW`).
     - **Relative humidity** (%).
     - **Air Quality Index (AQI)** with colored categorical chips (Good, Moderate, Sensitive, Unhealthy, Hazardous).
     - **UV Index** with category labels.
   - The top kitchen header bar's weather widget also displays mini rain % and AQI badges alongside high/low temps.
3. **Data Sourcing & Offline Fallback Strategy:**
   - Coordinates auto-detect from Home Assistant (`/api/config`) or browser geolocation, with manual overrides in Dashboard Settings (`General` tab).
   - Real-time weather and AQI are pulled via Open-Meteo's open client APIs, cached for 15 minutes.
   - When offline or disconnected, complete sample data is rendered immediately without blank dashes or layout shifts.
4. **Interactive Windy.com Radar Modal:**
   - Added a dedicated, full-featured Windy.com interactive radar modal (`#windy-radar-modal`) accessible via a prominent "Live Radar" button exclusively inside the weather forecast details modal.
   - Kept the top kitchen header bar clean and uncluttered by avoiding an extra standalone radar button in the primary navigation area.
   - Features dynamic layer switching (Radar, Wind streamlines, Rain accumulation, Temperature, Satellite clouds) and an external full-screen link.
   - Utilizes lazy-loading on the embed iframe so zero network resources are consumed until the modal is explicitly opened.

## Why
- Smart kitchen displays (e.g. 15"-21" widescreen touch displays) are landscape-oriented; a vertical list of days wasted horizontal space and required unnecessary vertical scrolling.
- Outdoor family planning (sports, playground visits, biking, dog walking) depends heavily on rain timing, wind conditions, and air quality (AQI/smoke alerts).
- Windy.com provides the premier meteorological visual map, but embedding it permanently in the dashboard header would overload browser resources; launching it inside an on-demand modal maintains dashboard speed.
- Placing the radar button exclusively inside the weather details modal keeps the top kitchen bar focused on glanceable time, date, weather summary, and primary view navigation without visual clutter.

## What was rejected and why
- **External tab redirect for radar instead of modal:** Rejected because smart kitchen displays running in kiosk mode or tablet enclosures cannot easily navigate back from third-party websites without browser navigation buttons.
- **Top header bar quick radar button:** Rejected because weather radar is a deeper inspection tool; keeping the launch button inside the weather details modal maintains an uncluttered kitchen header bar while keeping radar one click away once the forecast is open.
- **Requiring a paid OpenWeather/AccuWeather API key:** Rejected in favor of Home Assistant config + Open-Meteo (no API key required, CORS-enabled, reliable) with seamless local fallback.

## Scope
Applies to the weather widget (`#weather-card`), the forecast modal (`#weather-modal`), the live radar modal (`#windy-radar-modal`), and associated weather engine in `js/bundle.js` and `styles.css`.
