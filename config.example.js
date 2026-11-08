/* ==========================================================================
   FAMILY DASHBOARD - USER CONFIGURATION FILE (config.js)
   ==========================================================================
   Copy this file to config.js and fill in your own values.
   config.js is gitignored — your token and personal details stay local.
   ========================================================================== */

window.FAMILY_DASHBOARD_CONFIG = {
  // Display name shown in the greeting header
  familyName: 'Your Family',

  // Home Assistant Integration Settings
  homeAssistant: {
    url: 'http://homeassistant.local:8123',
    token: 'YOUR_LONG_LIVED_ACCESS_TOKEN_HERE'
  },

  // Kiosk Mode (optional; also toggleable in Settings): hides Home Assistant's header and sidebar on this device (needs the WallPanel integration)
  haKioskMode: false,

  // Doorbell popup (optional; also editable in Settings): shows camera feed when `entity` changes state.
  // doorbell: { entity: 'event.front_door_ding', camera: 'camera.front_door', seconds: 30 },

  // Screensaver photo: any HA image entity (default is the Immich random favorite)
  // photoEntity: 'image.immich_random_favorite_image',

  // Google Keep / Shopping List URL
  googleKeepUrl: 'https://keep.google.com',

  // HA todo entity created by google_keep_sync integration
  haGroceryTodoEntity: 'todo.google_keep_shopping_list',

  // HA to-do entity for meal ideas library
  haMealIdeasEntity: 'todo.meal_ideas',

  // HA to-do entity for weekly dinner plan
  haMealPlanEntity: 'todo.weekly_meal_plan',

  // Immich Self-Hosted Photo Screensaver Settings
  immich: {
    url: 'http://homeassistant.local:2283',
    apiKey: ''
  },

  // Weather & Live Radar Location (Optional — auto-detected from Home Assistant if omitted)
  weather: {
    latitude: 37.7749,
    longitude: -122.4194,
    locationName: 'Home'
  },

  // Family Members & Home Assistant Calendar Entity Mappings
  members: [
    {
      id: 'mom',
      name: 'Mom',
      fullName: 'Mom',
      role: 'parent',
      avatar: '👩',
      color: '#f43f5e',
      haCalendarEntity: 'calendar.your_mom_calendar',
      stars: 0,
      targetReward: 'Your Reward',
      targetStars: 100
    },
    {
      id: 'dad',
      name: 'Dad',
      fullName: 'Dad',
      role: 'parent',
      avatar: '👨',
      color: '#0284c7',
      haCalendarEntity: 'calendar.your_dad_calendar',
      stars: 0,
      targetReward: 'Your Reward',
      targetStars: 100
    },
    {
      id: 'kid1',
      name: 'Kid 1',
      fullName: 'Kid 1',
      role: 'kid',
      avatar: '👦',
      color: '#f59e0b',
      haCalendarEntity: 'calendar.your_kid_calendar',
      stars: 0,
      targetReward: 'Their Reward',
      targetStars: 50
    }
  ]
};
