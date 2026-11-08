/* --------------------------------------------------------------------------
     5. MEALS & GROCERIES MODULE
     -------------------------------------------------------------------------- */
  class MealsModule {
    constructor({ lists, toast }) {
      this.groceries = lists.groceries;
      this.ideas = lists.ideas;
      this.plan = lists.plan;
      this.toast = toast;
      this.initUI();
      this.load();
    }

    initUI() {
      // Grocery
      document.getElementById('grocery-add-btn')?.addEventListener('click', () => this.handleAddGrocery());
      document.getElementById('grocery-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleAddGrocery();
      });

      // Meal picker
      document.getElementById('meal-picker-close')?.addEventListener('click', () => this.closeMealPicker());
      document.getElementById('meal-picker-overlay')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('meal-picker-overlay')) this.closeMealPicker();
      });
      document.getElementById('meal-picker-add-btn')?.addEventListener('click', () => this.handlePickerAdd());
      document.getElementById('meal-picker-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handlePickerAdd();
      });
      document.getElementById('meal-picker-input')?.addEventListener('input', (e) => {
        this.renderPickerList(e.target.value);
      });
    }

    load() {
      return Promise.all([this.ideas.load(), this.plan.load(), this.groceries.load()]);
    }

    render() {
      this.renderWeekGrid();
      this.renderGroceryList();
    }

    renderWeekGrid() {
      const grid = document.getElementById('meal-week-grid');
      if (!grid) return;
      const byDay = this.plan.byDay;

      const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const DAY_FULL = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
      // Rolling seven days starting today, so past days never crowd the list.
      const today = new Date();

      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const key = DAY_KEYS[d.getDay()];
        const isToday = d.toDateString() === today.toDateString();
        return { key, date: d, isToday };
      });

      const hintDay = days.find(d => !byDay[d.key])?.key; // the hint once, on the first free day
      grid.innerHTML = days.map(({ key, date, isToday }) => {
        const meal = byDay[key] || '';
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `
          <div class="meal-day-row ${meal ? 'has-meal' : 'empty'} ${isToday ? 'today' : ''}" data-day="${key}">
            <div class="meal-day-info">
              <span class="meal-day-label">${DAY_FULL[key]}</span>
              <span class="meal-day-date">${dateStr}</span>
            </div>
            <div class="meal-day-choice">
              ${meal
                ? `<span class="meal-day-meal-text">${esc(meal)}</span>`
                : key === hintDay ? `<span class="meal-day-empty">Tap to plan</span>` : ''
              }
            </div>
            ${meal ? `<button class="meal-day-clear" data-day="${key}" title="Clear" aria-label="Clear meal"><i class="fa-solid fa-xmark"></i></button>` : ''}
          </div>`;
      }).join('');

      grid.querySelectorAll('.meal-day-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.meal-day-clear')) return;
          this.openMealPicker(row.dataset.day);
        });
      });

      grid.querySelectorAll('.meal-day-clear').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.clearMeal(btn.dataset.day);
        });
      });
    }

    openMealPicker(day) {
      this._pickerDay = day;
      const DAY_FULL = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
      const title = document.getElementById('meal-picker-title');
      if (title) title.innerHTML = `<i class="fa-solid fa-utensils text-sky"></i> ${DAY_FULL[day] || day}`;
      const input = document.getElementById('meal-picker-input');
      if (input) input.value = '';
      this.renderPickerList('');
      document.getElementById('meal-picker-overlay')?.classList.add('active');
      setTimeout(() => input?.focus(), 50);
    }

    closeMealPicker() {
      document.getElementById('meal-picker-overlay')?.classList.remove('active');
      this._pickerDay = null;
    }

    renderPickerList(filter) {
      const list = document.getElementById('meal-picker-list');
      if (!list) return;
      const q = (filter || '').toLowerCase();
      const ideas = this.ideas.items.filter(i => !q || i.name.toLowerCase().includes(q));

      if (ideas.length === 0) {
        list.innerHTML = `<li class="picker-empty">${q ? `No saved idea matches "${esc(filter)}" — tap Add to use it as a new meal.` : 'No meal ideas yet — type a meal above and tap Add.'}</li>`;
        return;
      }

      list.innerHTML = ideas.map(idea => `
        <li><button type="button" class="picker-idea" data-name="${idea.name.replace(/"/g, '&quot;')}">
          <i class="fa-solid fa-utensils" aria-hidden="true"></i>
          <span>${esc(idea.name)}</span>
        </button></li>
      `).join('');

      list.querySelectorAll('.picker-idea').forEach(el => {
        el.addEventListener('click', () => {
          if (this._pickerDay) {
            this.assignMeal(this._pickerDay, el.dataset.name);
            this.closeMealPicker();
          }
        });
      });
    }

    async handlePickerAdd() {
      const input = document.getElementById('meal-picker-input');
      const name = input?.value.trim();
      if (!name || !this._pickerDay) return;
      await this.ideas.add(name);
      this.assignMeal(this._pickerDay, name);
      this.closeMealPicker();
    }

    assignMeal(day, meal) {
      if (!this.plan.configured) { this.toast('Set Meal Plan entity in Settings first'); return; }
      return this.plan.set(day, meal);
    }

    clearMeal(day) {
      return this.plan.clear(day);
    }

    renderGroceryList() {
      const container = document.getElementById('grocery-list-container');
      const countEl = document.getElementById('grocery-count');
      const openKeepBtn = document.getElementById('open-keep-btn');
      if (!container) return;

      const keepUrl = stateManager.data.settings.googleKeepUrl || 'https://keep.google.com';
      if (openKeepBtn) openKeepBtn.href = keepUrl;
      this.renderSyncStatus();

      const items = this.groceries.items.filter(g => !g.bought);

      if (countEl) countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

      if (items.length === 0) {
        container.innerHTML = `<li style="color:var(--text-muted);font-size:0.85rem;padding:12px;text-align:center;">All clear</li>`;
        return;
      }

      container.innerHTML = items.map(g => `
        <li class="grocery-item" data-grocery-id="${g.id}">
          <div style="display:flex;align-items:center;gap:8px;">
            <i class="fa-regular fa-square"></i>
            <span>${esc(g.name)}</span>
          </div>
          <button class="icon-btn" aria-label="Remove item" style="width:24px;height:24px;font-size:0.7rem;border:none;background:none;color:var(--text-muted);">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </li>
      `).join('');

      container.querySelectorAll('.grocery-item').forEach(el => {
        el.addEventListener('click', (e) => {
          const id = el.dataset.groceryId;
          if (e.target.closest('button')) this.groceries.remove(id);
          else this.groceries.toggle(id);
        });
      });
    }

    renderSyncStatus() {
      const status = this.groceries.status;
      const text = document.getElementById('keep-sync-status');
      if (text) text.textContent = {
        local: 'Not linked to a to-do list. Set one in Settings.',
        connecting: 'Connecting…',
        connected: 'Connected. Checks for changes every minute.',
        offline: 'Home Assistant unreachable. Showing the last saved list.',
        unsent: 'Last change not sent. Saved on this tablet only.'
      }[status];
      text?.closest('.keep-sync-banner')?.classList.toggle('warn', status === 'offline' || status === 'unsent');
    }

    handleAddGrocery() {
      const input = document.getElementById('grocery-input');
      if (!input?.value.trim()) return;
      const name = input.value.trim();
      input.value = '';
      this.groceries.add(name);
    }
  }
