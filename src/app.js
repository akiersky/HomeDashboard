/* --------------------------------------------------------------------------
     7. MAIN FAMILY DASHBOARD APP
     -------------------------------------------------------------------------- */
  class FamilyDashboardApp {
    constructor() {
      window.familyDashboard = this;
      this.calendarModule = null;
      this.choresModule = null;
      this.choresAdminModule = null;
      this.mealsModule = null;
      this.photoFrameModule = null;
      this.init();
    }

    init() {
      this.parentGate = new ParentGate(stateManager, pinDialogView());
      this.calendarFeed = new CalendarFeed({ store: stateManager, tasks: parentTasks, cache: localCache('family_dashboard_calendar_v1'), ha: haWS });
      const settings = () => stateManager.data.settings;
      const onError = (e, what) => {
        console.warn(`Home Assistant list ${what} failed:`, e);
        if (what !== 'load') this.showToast('⚠ Home Assistant is unreachable. Saved on this tablet only.');
      };
      this.lists = {
        groceries: new HaList({ ha: haWS, entity: () => settings().haGroceryTodoEntity, local: storeList(stateManager, 'groceries'), onError }),
        ideas: new HaList({ ha: haWS, entity: () => settings().haMealIdeasEntity, local: storeList(stateManager, 'mealIdeas'), addAt: 'start', onError }),
        plan: new MealPlan(new HaList({ ha: haWS, entity: () => settings().haMealPlanEntity, local: memoryList(), onError }))
      };
      this.lists.ideas.subscribe(() => this.renderSettingsMealIdeas(document.getElementById('filter-meal-ideas-input')?.value || ''));

      // 1. Clock & Weather
      try {
        initClockAndWeather((message) => this.showToast(message));
      } catch (e) {
        console.warn('Clock/Weather init error:', e);
      }

      // 2. UI Controls (Navigation, Filters, Theme, Settings)
      try {
        this.renderFamilyFilterBar();
        this.initNavigation();
        this.initTheme();
        this.initNightMode();
        this.initSettingsModal();
      } catch (e) {
        console.warn('UI controls init error:', e);
      }

      // 3. Sub-modules
      try {
        this.calendarModule = new CalendarModule({ feed: this.calendarFeed, mealPlan: this.lists.plan });
      } catch (e) {
        console.error('CalendarModule init error:', e);
      }

      try {
        this.choresModule = new ChoresModule({ gate: this.parentGate, tasks: parentTasks, ledger, toast: (message, action) => this.showToast(message, action) });
      } catch (e) {
        console.error('ChoresModule init error:', e);
      }

      try {
        this.choresAdminModule = new ChoresAdminModule({ gate: this.parentGate, ledger, editChore: (id) => this.choresModule.openChoreModal(null, id) });
      } catch (e) {
        console.error('ChoresAdminModule init error:', e);
      }

      try {
        this.mealsModule = new MealsModule({ lists: this.lists, toast: (message) => this.showToast(message) });
      } catch (e) {
        console.error('MealsModule init error:', e);
      }

      try {
        this.photoFrameModule = new PhotoFrameModule({ feed: this.calendarFeed, beforeStart: () => this.calendarModule?.closeEventPopover() });
      } catch (e) {
        console.error('PhotoFrameModule init error:', e);
      }

      // One owner decides what re-renders when: the household document, the calendar feed and the lists invalidate
      // views, and a view that is not showing waits until it is shown.
      const renderer = this.renderer = new Renderer({ preserve: keepScrollPositions });
      const showing = (id) => () => !!document.getElementById(id)?.classList.contains('active');
      const view = (name, owner, options) => { if (owner) renderer.add(name, owner, options); };
      view('calendar', this.calendarModule, { visible: showing('view-calendar') });
      view('chores', this.choresModule, { visible: showing('view-chores') });
      view('meals', this.mealsModule, { visible: showing('view-meals') });
      view('prize-store', this.choresModule, { method: 'renderStore', visible: showing('store-modal') });
      view('manage-panel', this.choresAdminModule, { method: 'renderAdminBody', visible: showing('admin-panel-modal') });
      view('member-bar', this, { method: 'renderFamilyFilterBar' });
      stateManager.subscribe(() => renderer.invalidate());
      this.calendarFeed.onChange = () => renderer.invalidate('calendar');
      this.lists.groceries.subscribe(() => renderer.invalidate('meals'));
      this.lists.plan.subscribe(() => renderer.invalidate('calendar', 'meals'));

      // Home Assistant calendars every 5 minutes (an ambient display), and the "now" line every minute.
      this.calendarFeed.sync();
      setInterval(() => this.calendarFeed.sync(), 5 * 60 * 1000);
      // The shopping list also changes from phones (through Google Keep), so a wall tablet must keep re-reading it.
      setInterval(() => this.lists.groceries.poll(), 60 * 1000);
      setInterval(() => this.calendarModule?.placeTimeLine(), 60 * 1000);

    }

    renderFamilyFilterBar() {
      const container = document.getElementById('family-filter-bar');
      if (!container) return;

      const activeMemberId = stateManager.data.activeMemberId || 'all';
      const members = stateManager.data.members || [];

      const kids = members.filter(m => m.role === 'kid');
      const parents = members.filter(m => m.role === 'parent');

      let html = `
        <div class="member-pill ${activeMemberId === 'all' ? 'active' : ''}" data-member-id="all" role="button" tabindex="0" aria-pressed="${activeMemberId === 'all'}" aria-label="${this.currentViewId === 'chores' ? 'Kids' : 'Everyone'}" style="--pill-accent: var(--color-primary); color: var(--color-primary-text);">
          <div class="member-avatar" style="background: var(--color-primary)"><i class="fa-solid fa-users" aria-hidden="true"></i></div>
          <div class="member-info">
            <span class="member-name">${this.currentViewId === 'chores' ? 'Kids' : 'Everyone'}</span>
          </div>
        </div>
      `;

      if (kids.length > 0) {
        html += `<div class="family-bar-divider"></div>`;
        kids.forEach(k => {
          const isActive = activeMemberId === k.id;
          html += `
            <div class="member-pill ${isActive ? 'active' : ''}" data-member-id="${k.id}" role="button" tabindex="0" aria-pressed="${isActive}" aria-label="${esc(k.name)}" style="--pill-accent: ${k.color}; color: ${k.color};">
              <div class="member-avatar" style="background: ${k.color}">${esc(k.avatar)}</div>
              <div class="member-info">
                <span class="member-name">${esc(k.name)}</span>
              </div>
            </div>
          `;
        });
      }

      if (parents.length > 0) {
        html += `<div class="family-bar-divider"></div>`;
        parents.forEach(p => {
          const isActive = activeMemberId === p.id;
          html += `
            <div class="member-pill ${isActive ? 'active' : ''}" data-member-id="${p.id}" role="button" tabindex="0" aria-pressed="${isActive}" aria-label="${esc(p.name)}" style="--pill-accent: ${p.color}; color: ${p.color};">
              <div class="member-avatar" style="background: ${p.color}">${esc(p.avatar)}</div>
              <div class="member-info">
                <span class="member-name">${esc(p.name)}</span>
              </div>
            </div>
          `;
        });
      }

      container.innerHTML = html;

      const pick = (root) => root.querySelectorAll('.member-pill').forEach(pill => {
        pill.addEventListener('click', () => stateManager.setActiveMember(pill.dataset.memberId));
      });
      pick(container);

      // Calendar: the bar isn't there; show just the current selection, tap to open the full list.
      const picker = document.getElementById('cal-member-picker');
      if (picker) {
        const current = container.querySelector('.member-pill.active');
        const open = picker.classList.contains('open');
        picker.innerHTML = `
          <button type="button" class="member-pill active picker-current" aria-haspopup="true" aria-expanded="${open}" style="${current?.getAttribute('style') || ''}">
            ${current?.querySelector('.member-avatar')?.outerHTML || ''}
            <span class="member-name">${esc(current?.querySelector('.member-name')?.textContent || 'Everyone')}</span>
            <i class="fa-solid fa-chevron-down picker-caret" aria-hidden="true"></i>
          </button>
          <div class="picker-menu" role="menu">${html}</div>`;
        pick(picker.querySelector('.picker-menu'));
        picker.querySelector('.picker-current').addEventListener('click', (e) => {
          e.stopPropagation();
          document.getElementById('cal-view-picker')?.classList.remove('open');
          e.currentTarget.setAttribute('aria-expanded', picker.classList.toggle('open'));
        });
        if (!this._pickerCloser) {
          this._pickerCloser = true;
          document.addEventListener('click', () => document.getElementById('cal-member-picker')?.classList.remove('open'));
        }
      }
    }

    _handleViewActivation(viewId) {
      this.currentViewId = viewId;
      this.renderFamilyFilterBar(); // the first pill reads "Kids" on Chores, "Everyone" elsewhere
    }

    switchView(viewId, updateHash = true) {
      const validViews = ['calendar', 'chores', 'meals'];
      if (!validViews.includes(viewId)) viewId = 'calendar';

      document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === viewId);
      });
      document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `view-${viewId}`);
      });

      this._handleViewActivation(viewId);

      if (viewId === 'calendar') this.calendarModule?.render();
      if (viewId === 'chores') this.choresModule?.render();
      if (viewId === 'meals') this.mealsModule?.render();

      if (updateHash && window.location.hash !== `#${viewId}`) {
        history.replaceState(null, '', `#${viewId}`);
      }
    }

    initNavigation() {
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchView(btn.dataset.view, true);
        });
      });

      // Restore view from URL hash if valid
      const initialHash = window.location.hash.replace('#', '');
      if (['calendar', 'chores', 'meals'].includes(initialHash)) {
        this.switchView(initialHash, false);
      } else {
        this.switchView('calendar', false);
      }

      window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '');
        if (['calendar', 'chores', 'meals'].includes(hash)) {
          this.switchView(hash, false);
        }
      });
    }

    initTheme() {
      const themeMode = stateManager.data.themeMode || 'auto';
      this._applyThemeMode(themeMode);
      this._startSunsetTimer();

      // Wire settings modal toggle buttons
      const syncModeButtons = () => {
        const mode = stateManager.data.themeMode || 'auto';
        document.querySelectorAll('.theme-mode-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.mode === mode);
        });
      };

      document.querySelectorAll('.theme-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode;
          stateManager.data.themeMode = mode;
          stateManager.save();
          this._applyThemeMode(mode);
          syncModeButtons();
        });
      });

      // Sync button states when settings modal opens
      const settingsBtn = document.getElementById('settings-btn');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => setTimeout(syncModeButtons, 50));
      }
    }

    _applyThemeMode(mode) {
      if (mode === 'auto') {
        this._applyAutoTheme();
      } else {
        document.documentElement.setAttribute('data-theme', mode);
      }
    }

    _applyAutoTheme() {
      const now = new Date();
      const hour = now.getHours();
      const fallbackDaytime = hour >= 7 && hour < 20;

      const applyResult = (isDaytime) => {
        const theme = isDaytime ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
      };

      if (haWS && typeof haWS.getEntityState === 'function') {
        haWS.getEntityState('sun.sun').then(state => {
          applyResult(state ? state.state === 'above_horizon' : fallbackDaytime); // no sun.sun without Home Assistant
        }).catch(() => applyResult(fallbackDaytime));
      } else {
        applyResult(fallbackDaytime);
      }
    }

    _startSunsetTimer() {
      setInterval(() => {
        if ((stateManager.data.themeMode || 'auto') === 'auto') {
          this._applyAutoTheme();
        }
      }, 10 * 60 * 1000);
    }


    // A black layer over everything but the doorbell popup: a web page cannot reach the tablet's backlight (ADR 0014).
    initNightMode() {
      const dim = document.getElementById('night-dim');
      const modeSelect = document.getElementById('night-mode-select');
      const brightness = document.getElementById('night-brightness-input');
      let wakeTimer = null;    // set while a tap has lifted the dimming
      let previewLevel = null; // the slider's value while a parent is dragging it
      let previewTimer = null;

      const apply = () => {
        const s = stateManager.data.settings;
        const night = !wakeTimer && NightMode.isNight(s, new Date(), weatherCache.data?.sun);
        const level = previewLevel ?? (night ? s.nightBrightness : 100);
        dim.style.opacity = String(1 - level / 100);
        dim.classList.toggle('active', night && previewLevel === null); // only catches taps when really dimmed
      };

      const keepAwake = () => {
        clearTimeout(wakeTimer);
        wakeTimer = setTimeout(() => { wakeTimer = null; apply(); }, (stateManager.data.settings.idleSaverMinutes || 2) * 60 * 1000);
      };

      // The first tap only wakes the screen, so nothing hidden gets pressed in the dark.
      dim.addEventListener('click', () => { keepAwake(); apply(); });
      ['pointerdown', 'keydown'].forEach(evt => window.addEventListener(evt, () => { if (wakeTimer) keepAwake(); }, { passive: true }));

      const syncFields = () => {
        document.getElementById('night-times').hidden = modeSelect.value !== 'schedule';
        document.getElementById('night-brightness-group').hidden = modeSelect.value === 'off';
        document.getElementById('night-brightness-value').textContent = `${brightness.value}%`;
      };
      modeSelect.addEventListener('change', syncFields);
      brightness.addEventListener('input', () => {
        syncFields();
        previewLevel = Number(brightness.value);
        apply();
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => { previewLevel = null; apply(); }, 1500);
      });
      document.addEventListener('settings-opened', syncFields);
      document.addEventListener('settings-saved', apply);

      apply();
      setInterval(apply, 30 * 1000); // also picks up the sun times once the weather has loaded
    }

    initSettingsModal() {
      const modal = document.getElementById('settings-modal');
      const openBtn = document.getElementById('settings-btn');
      const closeBtn = document.getElementById('settings-modal-close');
      const cancelBtn = document.getElementById('settings-modal-cancel');
      const resetBtn = document.getElementById('reset-data-btn');
      const haTestBtn = document.getElementById('ha-test-btn');
      const syncHABtn = document.getElementById('sync-ha-calendars-btn') || document.getElementById('sync-ical-btn');
      const addMealIdeaBtn = document.getElementById('add-meal-idea-btn');
      const newMealIdeaInput = document.getElementById('new-meal-idea-input');
      const filterMealIdeasInput = document.getElementById('filter-meal-ideas-input');

      this.activeSettingsTab = 'calendar';
      this.editingMealIdeaId = null;

      // Tab switcher helper
      this.switchSettingsTab = (tabName) => {
        this.activeSettingsTab = tabName;
        const tabs = modal?.querySelectorAll('.settings-tab') || [];
        const panels = modal?.querySelectorAll('.settings-tab-panel') || [];

        tabs.forEach(tab => {
          const isCurrent = tab.dataset.settingsTab === tabName;
          tab.classList.toggle('active', isCurrent);
          tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
          tab.setAttribute('tabindex', isCurrent ? '0' : '-1');
        });

        panels.forEach(panel => {
          const isCurrent = panel.id === `settings-tab-${tabName}`;
          if (isCurrent) {
            panel.removeAttribute('hidden');
            panel.classList.add('active');
          } else {
            panel.setAttribute('hidden', '');
            panel.classList.remove('active');
          }
        });

        if (tabName === 'calendar') {
          this.renderHACalendarSettingsInputs();
        } else if (tabName === 'todos') {
          this.renderMemberSettingsInputs();
        } else if (tabName === 'meals') {
          this.renderSettingsMealIdeas(filterMealIdeasInput?.value || '');
        }
      };

      // Settings tabs click & keyboard navigation
      const tabButtons = modal?.querySelectorAll('.settings-tab') || [];
      tabButtons.forEach((tab, index) => {
        tab.addEventListener('click', () => {
          const tabName = tab.dataset.settingsTab;
          if (tabName) this.switchSettingsTab(tabName);
        });

        tab.addEventListener('keydown', (e) => {
          let targetIndex = -1;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            targetIndex = (index + 1) % tabButtons.length;
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            targetIndex = (index - 1 + tabButtons.length) % tabButtons.length;
          } else if (e.key === 'Home') {
            targetIndex = 0;
          } else if (e.key === 'End') {
            targetIndex = tabButtons.length - 1;
          }

          if (targetIndex !== -1) {
            e.preventDefault();
            const targetTab = tabButtons[targetIndex];
            targetTab.focus();
            const tabName = targetTab.dataset.settingsTab;
            if (tabName) this.switchSettingsTab(tabName);
          }
        });
      });

      // Meal ideas add & filter listeners in Settings
      if (addMealIdeaBtn && newMealIdeaInput) {
        addMealIdeaBtn.addEventListener('click', () => this.handleAddSettingsMealIdea());
        newMealIdeaInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.handleAddSettingsMealIdea();
          }
        });
      }

      if (filterMealIdeasInput) {
        filterMealIdeasInput.addEventListener('input', (e) => {
          this.renderSettingsMealIdeas(e.target.value);
        });
      }

      if (openBtn && modal) {
        openBtn.addEventListener('click', async () => {
          if (!(await this.parentGate.ask('Parent Settings', 'Enter your 4-digit parent PIN to open settings.'))) return;
          const s = stateManager.data.settings;
          Object.entries(SettingsSchema.toForm(s)).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) {
              if (input.type === 'checkbox') input.checked = (value === 'true');
              else input.value = value;
            }
          });
          document.dispatchEvent(new Event('settings-opened'));

          const latInput = document.getElementById('weather-lat-input');
          const lonInput = document.getElementById('weather-lon-input');
          const locNameInput = document.getElementById('weather-location-name-input');
          if (latInput) latInput.value = s.weather?.lat ?? '';
          if (lonInput) lonInput.value = s.weather?.lon ?? '';
          if (locNameInput) locNameInput.value = s.weather?.locationName ?? '';

          this.switchSettingsTab(this.activeSettingsTab || 'calendar');
          this.renderHACalendarSettingsInputs();
          this.renderMemberSettingsInputs();
          this.renderSettingsMealIdeas();
          modal.classList.add('active');
        });
      }
      if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
      }
      if (cancelBtn && modal) {
        cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
      }

      // Data Export / Import / Reset to Baseline
      const exportDataBtn = document.getElementById('export-data-btn');
      const importDataBtn = document.getElementById('import-data-btn');
      const importFileInput = document.getElementById('import-data-file-input');

      if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
          try {
            stateManager.exportData();
            this.showToast('✅ Exported dashboard-data.json successfully!');
          } catch (err) {
            console.error('Export error:', err);
            this.showToast('❌ Failed to export data backup: ' + err.message);
          }
        });
      }

      if (importDataBtn && importFileInput) {
        importDataBtn.addEventListener('click', () => {
          importFileInput.click();
        });

        importFileInput.addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const content = event.target?.result;
              if (typeof content !== 'string') throw new Error('File read failed');
              const res = stateManager.importData(content);
              if (res.success) {
                this.showToast('✅ Dashboard data restored successfully! Refreshing...');
                setTimeout(() => {
                  location.reload();
                }, 800);
              } else {
                this.showToast('❌ Import error: ' + res.error);
              }
            } catch (err) {
              this.showToast('❌ Invalid JSON backup file');
            } finally {
              importFileInput.value = '';
            }
          };
          reader.onerror = () => {
            this.showToast('❌ Error reading file');
            importFileInput.value = '';
          };
          reader.readAsText(file);
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
          if (confirm('Are you sure you want to reset all dashboard data back to baseline? Any local customizations will be reverted to data/dashboard-data.json.')) {
            this.showToast('🔄 Resetting data to baseline...');
            if (await stateManager.resetToBaseline()) location.reload();
            else this.showToast('⚠️ Could not load data/dashboard-data.json. Data left unchanged.');
          }
        });
      }

      if (haTestBtn) {
        haTestBtn.addEventListener('click', async () => {
          const urlInput = document.getElementById('ha-url-input');
          const tokenInput = document.getElementById('ha-token-input');
          const badge = document.getElementById('ha-status-badge');

          if (haWS?.isNative?.()) {
            this.showToast('Testing native Home Assistant connection...');
            if (badge) {
              badge.className = 'ha-status-badge';
              badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing connection...';
            }
            try {
              await haWS.send({ type: 'get_config' });
              if (badge) {
                badge.className = 'ha-status-badge success';
                badge.innerHTML = '<i class="fa-solid fa-check"></i> Connected via Home Assistant Session';
              }
              this.showToast('✅ Home Assistant session is active and operational!');
              await this.populateHACalendarsDropdown();
            } catch (err) {
              if (badge) {
                badge.className = 'ha-status-badge error';
                badge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Native Session Error';
              }
              this.showToast('❌ Native connection error: ' + err.message);
            }
            return;
          }

          const testUrl = (urlInput?.value || stateManager.data.settings.haUrl || 'http://homeassistant.local:8123').trim();
          const testToken = (tokenInput?.value || stateManager.data.settings.haToken || '').trim();

          this.showToast(`Testing connection to Home Assistant (${testUrl})...`);
          if (badge) {
            badge.className = 'ha-status-badge';
            badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing connection...';
          }

          try {
            const res = await fetch(`${testUrl}/api/`, {
              headers: { 'Authorization': `Bearer ${testToken}` }
            });
            if (res.ok) {
              if (badge) {
                badge.className = 'ha-status-badge success';
                badge.innerHTML = `<i class="fa-solid fa-check"></i> Connected (${testUrl})`;
              }
              this.showToast('✅ Home Assistant is connected and operational!');
              await this.populateHACalendarsDropdown();
            } else if (res.status === 401) {
              if (badge) {
                badge.className = 'ha-status-badge error';
                badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 401 Unauthorized: Invalid Token';
              }
              this.showToast('❌ 401 Unauthorized: Invalid token. Generate a new Long-Lived Access Token in HA.');
            } else {
              if (badge) {
                badge.className = 'ha-status-badge error';
                badge.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> HTTP Error ${res.status}`;
              }
              this.showToast(`❌ Connection error: HTTP ${res.status}`);
            }
          } catch (err) {
            console.error('HA connection test failed:', err);
            if (badge) {
              badge.className = 'ha-status-badge error';
              badge.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Cannot Reach ${testUrl}`;
            }
            this.showToast(`❌ Cannot connect to ${testUrl}. Check network/CORS.`);
          }
        });
      }

      if (syncHABtn) {
        syncHABtn.addEventListener('click', async () => {
          this.saveHACalendarInputs();
          stateManager.save();
          this.showToast('📡 Syncing Home Assistant calendars...');
          const count = await this.calendarFeed.sync();
          if (count > 0) {
            this.showToast(`✅ Synced ${count} events from Home Assistant!`);
          } else {
            this.showToast('⚠️ No events found. Check calendar entity IDs and token.');
          }
        });
      }

      const weatherDetectBtn = document.getElementById('weather-detect-location-btn');
      if (weatherDetectBtn) {
        weatherDetectBtn.addEventListener('click', async () => {
          const statusEl = document.getElementById('weather-detect-status');
          if (statusEl) statusEl.textContent = 'Detecting location...';

          const s = stateManager.data.settings;
          if (haWS.isNative() || (s.haUrl && s.haToken)) {
            try {
              let cfg = null;
              if (haWS.isNative()) cfg = await haWS.send({ type: 'get_config' });
              else {
                const res = await fetch(`${s.haUrl}/api/config`, { headers: { 'Authorization': `Bearer ${s.haToken}` } });
                if (res.ok) cfg = await res.json();
              }
              if (cfg) {
                if (cfg.latitude && cfg.longitude) {
                  const latIn = document.getElementById('weather-lat-input');
                  const lonIn = document.getElementById('weather-lon-input');
                  const nameIn = document.getElementById('weather-location-name-input');
                  if (latIn) latIn.value = cfg.latitude;
                  if (lonIn) lonIn.value = cfg.longitude;
                  if (nameIn) nameIn.value = cfg.location_name || 'Home';
                  if (statusEl) statusEl.textContent = `Found via Home Assistant: ${cfg.location_name || 'Home'}`;
                  return;
                }
              }
            } catch (e) {}
          }

          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const latIn = document.getElementById('weather-lat-input');
                const lonIn = document.getElementById('weather-lon-input');
                const nameIn = document.getElementById('weather-location-name-input');
                if (latIn) latIn.value = pos.coords.latitude.toFixed(4);
                if (lonIn) lonIn.value = pos.coords.longitude.toFixed(4);
                if (nameIn) nameIn.value = 'Local';
                if (statusEl) statusEl.textContent = 'Found via GPS / Browser.';
              },
              () => {
                if (statusEl) statusEl.textContent = 'Could not detect automatically. Enter coordinates manually.';
              }
            );
          } else {
            if (statusEl) statusEl.textContent = 'Geolocation not supported by browser.';
          }
        });
      }

      document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
        const typed = Object.fromEntries(SettingsSchema.fields().map(id => {
          const el = document.getElementById(id);
          if (!el) return [id, undefined];
          if (el.type === 'checkbox') return [id, el.checked ? 'true' : 'false'];
          return [id, el.value?.trim()];
        }));
        Object.assign(stateManager.data.settings, SettingsSchema.fromForm(typed));

        const weatherLat = parseFloat(document.getElementById('weather-lat-input')?.value);
        const weatherLon = parseFloat(document.getElementById('weather-lon-input')?.value);
        const weatherLocName = document.getElementById('weather-location-name-input')?.value?.trim();
        if (!isNaN(weatherLat) && !isNaN(weatherLon)) {
          if (!stateManager.data.settings.weather) stateManager.data.settings.weather = {};
          stateManager.data.settings.weather.lat = weatherLat;
          stateManager.data.settings.weather.lon = weatherLon;
          if (weatherLocName) stateManager.data.settings.weather.locationName = weatherLocName;
          fetchLiveWeatherData(true).then(renderWeatherUI);
        }
        
        this.saveHACalendarInputs();
        this.saveMemberSettingsInputs();
        stateManager.save();
        document.dispatchEvent(new Event('settings-saved'));
        
        modal?.classList.remove('active');
        this.showToast('💾 Settings saved! Syncing Home Assistant calendars...');
        // Switching kiosk mode reloads the page, so let the save above reach Home Assistant first.
        setTimeout(() => setHaKioskMode(!!stateManager.data.settings.haKioskMode), 1500);

        const count = await this.calendarFeed.sync();
        if (count > 0) {
          this.showToast(`✅ Synced ${count} events from Home Assistant!`);
        }
      });
    }

    async handleAddSettingsMealIdea() {
      const input = document.getElementById('new-meal-idea-input');
      const name = input?.value?.trim();
      if (!name) return;

      const added = await this.lists.ideas.add(name);
      if (added) {
        input.value = '';
        this.showToast(`✓ Added "${name}" to meal ideas`);
      }
    }

    renderSettingsMealIdeas(filterQuery = '') {
      const list = document.getElementById('settings-meal-ideas-list');
      const badge = document.getElementById('meal-ideas-count-badge');
      if (!list) return;

      const allIdeas = this.lists.ideas.items;

      const q = (filterQuery || '').trim().toLowerCase();
      const filtered = allIdeas.filter(item => !q || item.name.toLowerCase().includes(q));

      if (badge) {
        badge.textContent = `${allIdeas.length} idea${allIdeas.length !== 1 ? 's' : ''}`;
      }

      if (filtered.length === 0) {
        list.innerHTML = `<li class="meal-ideas-empty">${q ? `No meal ideas matching "${esc(filterQuery)}"` : 'No meal ideas yet. Add your favorite dinners above!'}</li>`;
        return;
      }

      list.innerHTML = filtered.map(idea => {
        const isEditing = this.editingMealIdeaId === idea.id;
        const safeName = esc(idea.name);
        if (isEditing) {
          return `
            <li class="settings-meal-idea-item editing" data-idea-id="${idea.id}">
              <div class="idea-edit-row">
                <input type="text" class="idea-edit-input" id="edit-meal-input-${idea.id}" value="${safeName}" aria-label="Edit meal idea" />
                <button type="button" class="idea-action-btn btn-save" data-action="save" data-id="${idea.id}" title="Save changes" aria-label="Save">
                  <i class="fa-solid fa-check"></i>
                </button>
                <button type="button" class="idea-action-btn btn-cancel" data-action="cancel" data-id="${idea.id}" title="Cancel" aria-label="Cancel">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </li>
          `;
        }

        return `
          <li class="settings-meal-idea-item" data-idea-id="${idea.id}">
            <div class="idea-content">
              <i class="fa-solid fa-bowl-food idea-icon"></i>
              <span class="idea-name" title="${safeName}">${esc(idea.name)}</span>
            </div>
            <div class="idea-actions">
              <button type="button" class="idea-action-btn btn-edit" data-action="edit" data-id="${idea.id}" title="Modify meal idea" aria-label="Modify idea">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button type="button" class="idea-action-btn btn-delete" data-action="delete" data-id="${idea.id}" title="Remove meal idea" aria-label="Remove idea">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </li>
        `;
      }).join('');

      // Wire up action buttons
      list.querySelectorAll('.idea-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          if (!id) return;

          if (action === 'edit') {
            this.editingMealIdeaId = id;
            this.renderSettingsMealIdeas(filterQuery);
            const editInput = document.getElementById(`edit-meal-input-${id}`);
            if (editInput) {
              editInput.focus();
              editInput.select();
            }
          } else if (action === 'cancel') {
            this.editingMealIdeaId = null;
            this.renderSettingsMealIdeas(filterQuery);
          } else if (action === 'save') {
            const editInput = document.getElementById(`edit-meal-input-${id}`);
            const newName = editInput?.value?.trim();
            if (newName) {
              await this.lists.ideas.rename(id, newName);
              this.editingMealIdeaId = null;
              this.renderSettingsMealIdeas(filterQuery);
              this.showToast('✓ Meal idea updated!');
            }
          } else if (action === 'delete') {
            await this.lists.ideas.remove(id);
            this.renderSettingsMealIdeas(filterQuery);
            this.showToast('✓ Removed meal idea');
          }
        });
      });

      // Wire up Enter / Escape in edit mode
      list.querySelectorAll('.idea-edit-input').forEach(input => {
        input.addEventListener('keydown', async (e) => {
          const id = input.id.replace('edit-meal-input-', '');
          if (e.key === 'Enter') {
            e.preventDefault();
            const newName = input.value.trim();
            if (newName) {
              await this.lists.ideas.rename(id, newName);
              this.editingMealIdeaId = null;
              this.renderSettingsMealIdeas(filterQuery);
              this.showToast('✓ Meal idea updated!');
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.editingMealIdeaId = null;
            this.renderSettingsMealIdeas(filterQuery);
          }
        });
      });
    }

    renderMemberSettingsInputs() {
      const container = document.getElementById('member-settings-container');
      if (!container) return;

      const members = stateManager.data.members || [];
      container.innerHTML = members.map(m => {
        const isKid = m.role === 'kid';
        return `
          <div class="member-setting-card" data-member-id="${m.id}">
            <div class="member-setting-profile">
              <input type="text" class="member-setting-avatar" id="member-avatar-${m.id}" value="${esc(m.avatar || '')}" maxlength="4" aria-label="${esc(m.name)} icon" style="width:56px;text-align:center;padding:0;" />
              <div>
                <div class="member-setting-name">${esc(m.name)}</div>
                <span class="member-setting-role-badge">${m.role}</span>
              </div>
            </div>
            ${isKid ? `
              <div class="member-setting-inputs">
                <div class="member-setting-field">
                  <label for="member-target-stars-${m.id}">Target Stars:</label>
                  <input type="number" id="member-target-stars-${m.id}" value="${m.targetStars || 50}" min="1" max="500" />
                </div>
                <div class="member-setting-field" style="flex:1;">
                  <label for="member-target-reward-${m.id}">Reward:</label>
                  <input type="text" id="member-target-reward-${m.id}" value="${(m.targetReward || '').replace(/"/g, '&quot;')}" placeholder="e.g. Lego Set..." style="width:100%;" />
                </div>
              </div>
            ` : `
              <div class="member-setting-inputs">
                <span style="font-size:0.8rem; color:var(--text-secondary);"><i class="fa-solid fa-shield"></i> Parent Admin</span>
              </div>
            `}
          </div>
        `;
      }).join('');
    }

    saveMemberSettingsInputs() {
      const members = stateManager.data.members || [];
      members.forEach(m => {
        const avatarInput = document.getElementById(`member-avatar-${m.id}`);
        if (avatarInput?.value.trim()) m.avatar = avatarInput.value.trim();
        if (m.role === 'kid') {
          const starsInput = document.getElementById(`member-target-stars-${m.id}`);
          const rewardInput = document.getElementById(`member-target-reward-${m.id}`);
          if (starsInput && starsInput.value) {
            m.targetStars = parseInt(starsInput.value, 10) || m.targetStars;
          }
          if (rewardInput) {
            m.targetReward = rewardInput.value.trim() || m.targetReward;
          }
        }
      });
    }

    renderHACalendarSettingsInputs() {
      const container = document.getElementById('ha-calendar-entities-container') || document.getElementById('ical-feeds-inputs-container');
      if (!container) return;

      const members = stateManager.data.members;
      container.innerHTML = members.map(m => `
        <div class="form-group" style="margin-bottom: 12px;">
          <label style="display: flex; align-items: center; gap: 8px; font-weight: 600;">
            <span style="font-size: 1.2rem;">${esc(m.avatar)}</span>
            <span>${esc(m.name)}</span>
            <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: normal;">(${m.role})</span>
          </label>
          <input 
            type="text" 
            id="ha-cal-entity-${m.id}" 
            list="ha-calendars-datalist" 
            value="${m.haCalendarEntity || ''}" 
            placeholder="calendar.${m.id.toLowerCase()}..." 
            style="width: 100%; font-family: monospace; font-size: 0.9rem;"
          />
        </div>
      `).join('');

      this.populateHACalendarsDropdown();
    }

    saveHACalendarInputs() {
      const members = stateManager.data.members;
      members.forEach(m => {
        const input = document.getElementById(`ha-cal-entity-${m.id}`);
        if (input) {
          m.haCalendarEntity = input.value.trim();
        }
      });
    }

    async populateHACalendarsDropdown() {
      const datalist = document.getElementById('ha-calendars-datalist');
      if (!datalist) return;

      if (haWS.isNative()) {
        try {
          const states = await haWS.send({ type: 'get_states' });
          datalist.innerHTML = states.filter(e => e.entity_id.startsWith('calendar.')).map(e => `
            <option value="${esc(e.entity_id)}">${esc(e.attributes?.friendly_name || e.entity_id)}</option>
          `).join('');
        } catch (err) {
          console.warn('Could not fetch calendar entities for autocomplete:', err);
        }
        return;
      }

      let haUrl = stateManager.data.settings.haUrl || 'http://homeassistant.local:8123';
      if (window.location.pathname.includes('/local/') || window.location.port === '8123') {
        haUrl = window.location.origin;
      }
      const token = stateManager.data.settings.haToken;
      if (!token) return;

      try {
        const res = await fetch(`${haUrl}/api/calendars`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const calendars = await res.json();
          datalist.innerHTML = calendars.map(c => `
            <option value="${esc(c.entity_id)}">${esc(c.name || c.entity_id)}</option>
          `).join('');
        }
      } catch (err) {
        console.warn('Could not fetch calendar entities for autocomplete:', err);
      }
    }

    // Leading emoji in a message picks the icon (error / success / info) and is not displayed.
    showToast(message, action) {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const kind = /^(❌|⚠)/u.test(message) ? 'fa-circle-exclamation' : /^(✅|✓)/u.test(message) ? 'fa-circle-check' : 'fa-circle-info';
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `${icon(kind)}<span></span>`;
      toast.lastElementChild.textContent = message.replace(/^[^\p{L}\p{N}]+/u, '');
      if (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.addEventListener('click', () => { action.run(); toast.remove(); });
        toast.appendChild(btn);
      }
      container.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 300);
      }, action ? 6000 : 3500);
    }
  }

  /* --------------------------------------------------------------------------
     ACCESSIBILITY: GLOBAL MODAL KEYBOARD MANAGEMENT & FOCUS TRAPPING
     -------------------------------------------------------------------------- */
  function initAccessibleModals() {
    let lastActiveElement = null;

    document.querySelectorAll('.modal-overlay, .meal-picker-overlay').forEach(m => {
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      const heading = m.querySelector('h3[id], h4[id]') || m.querySelector('h3, h4');
      if (heading) {
        if (!heading.id) heading.id = `${m.id}-title`;
        m.setAttribute('aria-labelledby', heading.id);
      }
    });

    function getFocusableElements(container) {
      if (!container) return [];
      return Array.from(container.querySelectorAll(
        'button:not([disabled]):not([aria-hidden="true"]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetParent !== null);
    }

    // Capture triggering element before modal opens
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('button, [role="button"], .clickable');
      if (trigger) {
        lastActiveElement = trigger;
      }
    }, true);

    // Watch for modals opening / closing
    // Mirror the visual `.active` state of toggle-style buttons into ARIA.
    const syncPressed = (t) => {
      const on = t.classList.contains('active');
      if (t.matches('.nav-btn')) { on ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current'); }
      else if (t.matches('.switch-btn, .theme-mode-btn, .layer-toggle-btn, .admin-tab')) t.setAttribute('aria-pressed', on);
    };
    document.querySelectorAll('.nav-btn, .switch-btn, .theme-mode-btn, .layer-toggle-btn, .admin-tab').forEach(syncPressed);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.target.matches?.('.nav-btn, .switch-btn, .theme-mode-btn, .layer-toggle-btn, .admin-tab')) syncPressed(mutation.target);
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.classList && (target.classList.contains('modal-overlay') || target.classList.contains('meal-picker-overlay'))) {
            if (target.classList.contains('active')) {
              requestAnimationFrame(() => {
                const card = target.querySelector('.modal-card') || target;
                card.tabIndex = -1;
                card.focus({ preventScroll: true });
              });
            } else {
              if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
                lastActiveElement.focus();
              }
            }
          }
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class']
    });

    // Enter/Space activates non-<button> controls (role=button/checkbox) and keeps focus across re-renders.
    document.addEventListener('keydown', (e) => {
      const el = e.target.closest?.('[role="button"], [role="checkbox"]');
      if (!el || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      const id = ['data-item-id', 'data-member-id', 'data-kid-tab'].map(a => [a, el.getAttribute(a)]).find(([, v]) => v);
      el.click();
      if (id) setTimeout(() => [...document.querySelectorAll(`[${id[0]}="${id[1]}"]`)].find(n => n.offsetParent)?.focus(), 0);
    });

    // Keyboard handlers: Escape to close, Tab to trap focus
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModals = document.querySelectorAll('.modal-overlay.active, .meal-picker-overlay.active');
        if (activeModals.length > 0) {
          e.preventDefault();
          const topModal = activeModals[activeModals.length - 1];
          topModal.classList.remove('active');
          if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
            lastActiveElement.focus();
          }
          return;
        }

        const popover = document.getElementById('event-details-popover');
        if (popover && popover.classList.contains('active')) {
          e.preventDefault();
          popover.classList.remove('active');
          if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
            lastActiveElement.focus();
          }
          return;
        }

        const photoSaver = document.getElementById('photo-frame-overlay');
        if (photoSaver && photoSaver.classList.contains('active')) {
          e.preventDefault();
          photoSaver.classList.remove('active');
          return;
        }
      }

      if (e.key === 'Tab') {
        const activeModal = document.querySelector('.modal-overlay.active, .meal-picker-overlay.active');
        if (!activeModal) return;

        const focusable = getFocusableElements(activeModal);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !focusable.includes(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !activeModal.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    });

    // Global backdrop click dismissal for modals
    document.addEventListener('click', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
        e.target.classList.remove('active');
        if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
          lastActiveElement.focus();
        }
      }
    });
  }

// JS fallback for touch scrolling. Embedded web views (the Home Assistant iPad app) can swallow the native
  // swipe for nested overflow areas; handling the drag ourselves works wherever touch events arrive.
  function enableTouchScroll() {
    if (!('ontouchstart' in window)) return;
    let el = null, startX = 0, startY = 0, startTop = 0, lastY = 0, lastT = 0, vel = 0, dir = null, raf = 0;
    const scrollerOf = (node) => {
      for (; node && node !== document.body; node = node.parentElement) {
        const oy = getComputedStyle(node).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
      }
      return null;
    };
    document.addEventListener('touchstart', (e) => {
      cancelAnimationFrame(raf);
      el = null; dir = null;
      if (e.touches.length !== 1 || e.target.closest('input, select, textarea, [draggable="true"], iframe')) return;
      el = scrollerOf(e.target);
      if (!el) return;
      startX = e.touches[0].clientX; startY = lastY = e.touches[0].clientY; startTop = el.scrollTop; lastT = e.timeStamp; vel = 0;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!el) return;
      const t = e.touches[0];
      const dx = t.clientX - startX, dy = t.clientY - startY;
      if (!dir) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        dir = Math.abs(dy) >= Math.abs(dx) ? 'v' : 'h';
      }
      if (dir === 'h') { el = null; return; } // leave sideways swipes to the browser
      const dt = Math.max(1, e.timeStamp - lastT);
      vel = (lastY - t.clientY) / dt; // px per ms, positive = scrolling down
      lastY = t.clientY; lastT = e.timeStamp;
      el.scrollTop = startTop - dy;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      const node = el; el = null;
      if (!node || dir !== 'v' || Math.abs(vel) < 0.15) return;
      let v = vel * 16, last = performance.now();
      const step = (now) => {
        const f = Math.min(3, (now - last) / 16); last = now;
        node.scrollTop += v * f;
        v *= Math.pow(0.95, f);
        if (Math.abs(v) > 0.5) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
  }

  async function initApp() {
    if (!window.familyDashboard) {
      if (typeof stateManager !== 'undefined' && stateManager.loadBaselineIfEmpty) {
        try {
          await stateManager.loadBaselineIfEmpty();
        } catch (e) {
          console.warn('Baseline hydration warning:', e);
        }
      }
      // Pull HA's copy before the first render, but never block startup on an unreachable HA.
      await Promise.race([stateManager.syncRemote(), new Promise(r => setTimeout(r, 3000))]);
      // The bundled Docker server stands in for Home Assistant: no URL, token or WallPanel kiosk to set up.
      if (window.FAMILY_DASHBOARD_CONFIG?.backend === 'server') document.getElementById('ha-section').style.display = 'none';
      if (inHA()) { // the HA login is reused, so there is nothing to type
        document.getElementById('ha-credentials')?.setAttribute('hidden', '');
        document.getElementById('ha-embedded-note')?.removeAttribute('hidden');
      }
      ledger.init();
      ledger.resetPeriodic();
      setInterval(() => ledger.resetPeriodic(), 60 * 1000);
      setInterval(() => stateManager.syncRemote(), 60 * 1000);
      new FamilyDashboardApp();
      new DoorbellModule();
      enableTouchScroll();
      initAccessibleModals();

      watchHaViewport();
      if (stateManager?.data?.settings?.haKioskMode) {
        setHaKioskMode(true);
      }
    }
  }

  // Test seam: tests/ run the bundle without a DOM, take the modules from here and skip booting.
  if (window.__FD_TEST__) { window.__FD_TEST__.api = { ParentGate, ParentTasks, MissionLedger, CalendarFeed, HaList, MealPlan, storeList, SettingsSchema, NightMode, StateManager, HAWebSocket, Renderer, kioskSearch, setHaKioskMode }; return; }

  window.initFamilyDashboardApp = initApp;

  if (!window.__FD_DEFER_BOOT__) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }
