class CalendarModule {
    constructor({ feed, mealPlan }) {
      this.feed = feed;
      this.mealPlan = mealPlan;
      this.currentDate = new Date();
      this.activeView = 'week';
      this.selectedEvent = null;
      this.HOUR_HEIGHT = 54;
      // Phones can't fit a week grid: open on the agenda.
      if (matchMedia('(max-width: 600px)').matches) this.activeView = 'agenda';
      this.initUI();
      if (this.activeView === 'agenda') {
        document.querySelectorAll('.switch-btn').forEach(b => b.classList.toggle('active', b.dataset.calView === 'agenda'));
        document.querySelectorAll('.cal-grid-view, .cal-timeline-view, .cal-agenda-view').forEach(v => v.classList.remove('active'));
        document.getElementById('cal-view-agenda')?.classList.add('active');
      }
      // A member filter someone left on shouldn't hide everyone else's events for good.
      let filterTimer;
      const armFilterReset = () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => {
          const f = stateManager.data.activeMemberId;
          if (f && f !== 'all') stateManager.setActiveMember('all');
        }, 2 * 60 * 1000);
      };
      ['pointerdown', 'keydown'].forEach(evt => window.addEventListener(evt, armFilterReset, { passive: true }));
      this.syncViewPicker();
      this.render();
    }

    // The dropdown shows the active view; opening one calendar dropdown closes the other.
    syncViewPicker() {
      const label = document.getElementById('cal-view-current-label');
      const active = document.querySelector('.switch-btn.active');
      if (label && active) label.textContent = active.textContent;
    }

    initUI() {
      const viewPicker = document.getElementById('cal-view-picker');
      const viewCurrent = document.getElementById('cal-view-current');
      viewCurrent?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('cal-member-picker')?.classList.remove('open');
        viewCurrent.setAttribute('aria-expanded', viewPicker.classList.toggle('open'));
      });
      document.addEventListener('click', () => {
        viewPicker?.classList.remove('open');
        viewCurrent?.setAttribute('aria-expanded', 'false');
      });

      // Navigation buttons
      document.getElementById('cal-today-btn')?.addEventListener('click', () => {
        this.currentDate = new Date();
        this.render();
      });

      document.getElementById('cal-prev-btn')?.addEventListener('click', () => {
        if (this.activeView === 'month') {
          this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        } else if (this.activeView === 'week') {
          this.currentDate.setDate(this.currentDate.getDate() - 7);
        } else if (this.activeView === '3day') {
          this.currentDate.setDate(this.currentDate.getDate() - 3);
        } else if (this.activeView === 'agenda') {
          this.currentDate.setDate(this.currentDate.getDate() - 7);
        }
        this.render();
      });

      document.getElementById('cal-next-btn')?.addEventListener('click', () => {
        if (this.activeView === 'month') {
          this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        } else if (this.activeView === 'week') {
          this.currentDate.setDate(this.currentDate.getDate() + 7);
        } else if (this.activeView === '3day') {
          this.currentDate.setDate(this.currentDate.getDate() + 3);
        } else if (this.activeView === 'agenda') {
          this.currentDate.setDate(this.currentDate.getDate() + 7);
        }
        this.render();
      });

      // View Switcher Buttons
      document.querySelectorAll('.switch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.activeView = btn.dataset.calView;
          
          document.querySelectorAll('.cal-grid-view, .cal-timeline-view, .cal-agenda-view').forEach(v => v.classList.remove('active'));
          document.getElementById(`cal-view-${this.activeView}`)?.classList.add('active');
          this.syncViewPicker();

          // A hidden grid loses its scroll position, so coming back to it has to scroll again.
          this._scrolledKey = null;
          this.render();
        });
      });

      // Event Details Popover buttons & dismiss listeners
      document.getElementById('popover-close-btn')?.addEventListener('click', () => {
        this.closeEventPopover();
      });

      document.getElementById('popover-edit-btn')?.addEventListener('click', () => {
        if (this.selectedEvent) {
          const evt = this.selectedEvent;
          this.closeEventPopover();
          this.openEventModal(evt);
        }
      });

      document.getElementById('popover-delete-btn')?.addEventListener('click', () => {
        if (this.selectedEvent) {
          this.feed.remove(this.selectedEvent.id);
          this.closeEventPopover();
          this.render();
        }
      });

      // Light dismiss when clicking outside popover
      document.addEventListener('pointerdown', (e) => {
        const popover = document.getElementById('event-details-popover');
        if (!popover || !popover.classList.contains('active')) return;
        if (!popover.contains(e.target) && !e.target.closest('.timeline-event-card, .event-chip, .agenda-card-item, .allday-chip')) {
          this.closeEventPopover();
        }
      });

      // Escape key to dismiss popover
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeEventPopover();
        }
      });

      // Add Event Modal Listeners
      document.getElementById('add-event-btn')?.addEventListener('click', () => {
        this.openEventModal();
      });

      document.getElementById('event-modal-close')?.addEventListener('click', () => {
        this.closeEventModal();
      });

      document.getElementById('event-modal-cancel')?.addEventListener('click', () => {
        this.closeEventModal();
      });

      document.getElementById('event-allday-check')?.addEventListener('change', () => this.syncEventTimeFields());
      document.getElementById('event-time-input')?.addEventListener('input', () => this.syncEventTimeFields());

      document.getElementById('event-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSaveEvent();
      });

      document.getElementById('event-delete-btn')?.addEventListener('click', () => {
        const eventId = document.getElementById('event-id').value;
        if (eventId) {
          this.feed.remove(eventId);
          this.closeEventModal();
          this.render();
        }
      });

    }

    // Open the time grid an hour before now, once per visible period, so today's events aren't below the fold.
    scrollTimelineToNow(containerId, key) {
      if (this._scrolledKey === key) return;
      const box = document.getElementById(containerId);
      if (!box) return;
      this._scrolledKey = key;
      const now = new Date();
      box.scrollTop = Math.max(0, ((now.getHours() * 60 + now.getMinutes()) / 60 - 1) * this.HOUR_HEIGHT);
    }

    render() {
      if (this.activeView === 'month') {
        this.renderMonthView();
      } else if (this.activeView === 'week') {
        const startOfWeek = new Date(this.currentDate);
        startOfWeek.setDate(this.currentDate.getDate() - this.currentDate.getDay());
        this.renderTimelineView(7, startOfWeek, 'week');
        this.scrollTimelineToNow('week-scroll-container', `w${toLocalYMD(startOfWeek)}`);
      } else if (this.activeView === '3day') {
        const startOf3Day = new Date(this.currentDate);
        this.renderTimelineView(3, startOf3Day, 'threeday');
        this.scrollTimelineToNow('threeday-scroll-container', `d${toLocalYMD(startOf3Day)}`);
      } else if (this.activeView === 'agenda') {
        this.renderAgendaView();
      }
    }

    // HOURLY TIMELINE ENGINE (Week & 3-Day Views)
    renderTimelineView(numDays, startDate, prefix) {
      const titleEl = document.getElementById('cal-current-label');
      if (titleEl) {
        if (numDays === 7) {
          const endWeek = new Date(startDate);
          endWeek.setDate(endWeek.getDate() + 6);
          titleEl.textContent = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        } else if (numDays === 3) {
          const end3Day = new Date(startDate);
          end3Day.setDate(end3Day.getDate() + 2);
          titleEl.textContent = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end3Day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }
      }

      const headerRow = document.getElementById(`${prefix}-header-row`);
      const alldayRow = document.getElementById(`${prefix}-allday-row`);
      const timeScale = document.getElementById(`${prefix}-time-scale`);
      const daysGrid = document.getElementById(`${prefix}-days-container`);

      if (!headerRow || !alldayRow || !timeScale || !daysGrid) return;

      headerRow.innerHTML = '';
      alldayRow.innerHTML = '';
      timeScale.innerHTML = '';
      daysGrid.innerHTML = '';

      // Render 24-hour time scale
      for (let h = 0; h < 24; h++) {
        const slot = document.createElement('div');
        slot.className = 'time-scale-slot';
        let label = '12 AM';
        if (h === 0) label = '12 AM';
        else if (h < 12) label = `${h} AM`;
        else if (h === 12) label = '12 PM';
        else label = `${h - 12} PM`;
        slot.textContent = label;
        timeScale.appendChild(slot);
      }

      const todayStr = toLocalYMD(new Date());
      const activeMemberId = stateManager.data.activeMemberId;

      for (let i = 0; i < numDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dateStr = toLocalYMD(d);
        const isToday = dateStr === todayStr;

        // 1. Day Header Cell
        const hCell = document.createElement('div');
        hCell.className = `timeline-day-header-cell ${isToday ? 'today' : ''}`;
        hCell.innerHTML = `
          <div class="timeline-day-name">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
          <div class="timeline-day-num">${d.getDate()}</div>
        `;
        headerRow.appendChild(hCell);

        // 2. All-Day Row Column
        const adCol = document.createElement('div');
        adCol.className = 'allday-day-col';

        const { timed, allDay } = CalendarFeed.layout(this.feed.day(dateStr, activeMemberId), this.HOUR_HEIGHT);

        allDay.forEach(adEvt => {
          const chip = document.createElement('div');
          chip.className = 'allday-chip';
          chip.tabIndex = 0;
          chip.setAttribute('role', 'button');
          styleEvent(chip, adEvt);
          chip.innerHTML = `
            ${evDots(adEvt)}
            <div class="event-card-title">${esc(adEvt.title)}</div>`;
          chip.title = `${esc(adEvt.title)} (${adEvt.time || 'All Day'})`;
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openEventPopover(adEvt, chip, e);
          });
          adCol.appendChild(chip);
        });
        alldayRow.appendChild(adCol);

        // 3. Timeline Day Column in Grid
        const dayCol = document.createElement('div');
        dayCol.className = `timeline-day-col ${isToday ? 'today' : ''}`;

        // Dinner stays pinned to the bottom of the visible day, whatever the scroll position
        const dayMeal = this.mealPlan.dinnerOn(dateStr, todayStr);
        const mealPin = document.createElement('div');
        mealPin.className = dayMeal ? 'meal-pin has-meal' : 'meal-pin';
        if (dayMeal) mealPin.innerHTML = `<div class="timeline-meal-footer" title="${esc(dayMeal)}">Dinner: ${esc(dayMeal)}</div>`;

        // 24 Hour Slots
        for (let h = 0; h < 24; h++) {
          const hourSlot = document.createElement('div');
          hourSlot.className = 'timeline-hour-slot';
          hourSlot.dataset.hour = h;
          hourSlot.addEventListener('click', (e) => {
            if (e.target === hourSlot) {
              const hourStr = `${String(h).padStart(2, '0')}:00`;
              this.openEventModal(null, dateStr, hourStr);
            }
          });
          dayCol.appendChild(hourSlot);
        }
        dayCol.appendChild(mealPin);

        // Render Timed Event Cards
        timed.forEach(item => {
          const evt = item.event;

          const card = document.createElement('div');
          card.className = 'timeline-event-card';
          card.tabIndex = 0;
          card.setAttribute('role', 'button');
          card.style.top = `${item.topPx}px`;
          card.style.height = `${item.heightPx}px`;
          card.style.left = `calc(${item.leftPct}% + 1px)`;
          card.style.width = `calc(${item.widthPct}% - 3px)`;
          styleEvent(card, evt);
          if (item.heightPx < 40) card.classList.add('compact'); // under ~45 min: time and title share one line
          else if (item.heightPx < 80) card.classList.add('short'); // under 1.5 h: no room for the location

          card.innerHTML = `
            <div class="event-card-time">${evDots(evt)}${esc(item.heightPx < 80 ? CalendarFeed.startTime(evt.time) : evt.time || '')}</div>
            <div class="event-card-title">${esc(evt.title)}</div>
            ${evt.location ? `<div class="event-card-loc"><i class="fa-solid fa-location-dot"></i> ${esc(evt.location)}</div>` : ''}
          `;

          card.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openEventPopover(evt, card, e);
          });

          dayCol.appendChild(card);
        });

        daysGrid.appendChild(dayCol);
      }

      this.placeTimeLine();
    }

    // The "now" line across today's column; redrawn each minute.
    placeTimeLine() {
      document.querySelectorAll('.current-time-line').forEach(el => el.remove());
      const todayCol = document.querySelector('.cal-timeline-view.active .timeline-day-col.today');
      if (!todayCol) return;
      const now = new Date();
      const line = document.createElement('div');
      line.className = 'current-time-line';
      line.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 60) * this.HOUR_HEIGHT}px`;
      line.innerHTML = '<span class="current-time-dot"></span>';
      todayCol.appendChild(line);
    }

    // MONTH GRID VIEW
    renderMonthView() {
      const year = this.currentDate.getFullYear();
      const month = this.currentDate.getMonth();

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const titleEl = document.getElementById('cal-current-label');
      if (titleEl) titleEl.textContent = `${monthNames[month]} ${year}`;

      const container = document.getElementById('month-days-container');
      if (!container) return;
      container.innerHTML = '';

      const firstDayIndex = new Date(year, month, 1).getDay();
      const totalDays = new Date(year, month + 1, 0).getDate();
      const prevMonthDays = new Date(year, month, 0).getDate();

      const activeMemberId = stateManager.data.activeMemberId;
      const todayStr = toLocalYMD(new Date());

      // Previous Month Days Padding
      for (let i = firstDayIndex; i > 0; i--) {
        const prevDay = prevMonthDays - i + 1;
        const cell = document.createElement('div');
        cell.className = 'day-cell other-month';
        cell.innerHTML = `<span class="day-number">${prevDay}</span>`;
        container.appendChild(cell);
      }

      // Current Month Days
      for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;

        const cell = document.createElement('div');
        cell.className = `day-cell ${isToday ? 'today' : ''}`;
        cell.innerHTML = `<span class="day-number">${day}</span>`;

        const dayEvents = this.feed.day(dateStr, activeMemberId);

        const eventsList = document.createElement('div');
        eventsList.className = 'day-events-list';

        dayEvents.forEach(evt => {
          const chip = document.createElement('div');
          chip.className = 'event-chip';
          chip.tabIndex = 0;
          chip.setAttribute('role', 'button');
          styleEvent(chip, evt);
          const start = CalendarFeed.startTime(evt.time);
          chip.innerHTML = `${evDots(evt)}<strong class="event-chip-title">${esc(evt.title)}</strong>${start ? `<span class="event-chip-time">${esc(start)}</span>` : ''}`;

          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openEventPopover(evt, chip, e);
          });

          eventsList.appendChild(chip);
        });

        cell.appendChild(eventsList);

        // Click cell to add event for that date
        cell.addEventListener('click', () => {
          this.openEventModal(null, dateStr);
        });

        container.appendChild(cell);
      }
    }

    // MULTI-COLUMN FAMILY AGENDA VIEW
    renderAgendaView() {
      const titleEl = document.getElementById('cal-current-label');
      if (titleEl) titleEl.textContent = 'Family Agenda';

      const container = document.getElementById('agenda-members-container');
      if (!container) return;
      container.innerHTML = '';

      const activeMemberId = stateManager.data.activeMemberId;
      const members = stateManager.data.members;
      const todayStr = toLocalYMD(new Date());

      const formatAgendaHeading = (dateStr) => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = toLocalYMD(tomorrow);

        try {
          const [y, m, d] = dateStr.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
          const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          if (dateStr === todayStr) return `TODAY • ${dayName}, ${monthDay}`;
          if (dateStr === tomorrowStr) return `TOMORROW • ${dayName}, ${monthDay}`;
          return `${dayName}, ${monthDay}`;
        } catch (_) {
          return dateStr;
        }
      };

      const membersToRender = activeMemberId === 'all' 
        ? members 
        : members.filter(m => m.id === activeMemberId);

      if (activeMemberId !== 'all') {
        container.style.gridTemplateColumns = 'minmax(320px, 640px)';
        container.style.justifyContent = 'center';
      } else {
        container.style.gridTemplateColumns = '';
        container.style.justifyContent = '';
      }

      membersToRender.forEach(m => {
        const col = document.createElement('div');
        col.className = 'agenda-member-col';

        col.innerHTML = `
          <div class="agenda-col-header" style="color: ${m.color};">
            <div class="agenda-member-profile">
              <span class="agenda-avatar">${esc(m.avatar)}</span>
              <div>
                <div class="agenda-member-name">${esc(m.name)}</div>
                <div class="agenda-member-role">${m.role === 'kid' ? 'Kid' : 'Parent'}</div>
              </div>
            </div>
            ${m.role === 'kid' ? `<div class="agenda-member-stars">
              <i class="fa-solid fa-star"></i> ${m.stars || 0} stars
            </div>` : ''}
          </div>
          <div class="agenda-col-body" id="agenda-col-body-${m.id}"></div>
        `;

        const colBody = col.querySelector(`#agenda-col-body-${m.id}`);

        const days = this.feed.agenda(m.id, todayStr);
        if (days.length === 0) {
          colBody.innerHTML = `<div class="agenda-empty-state">No upcoming events scheduled for ${esc(m.name)}</div>`;
        } else {
          days.forEach(({ date: dStr, events }) => {
            const divider = document.createElement('div');
            divider.className = 'agenda-date-divider';
            divider.textContent = formatAgendaHeading(dStr);
            colBody.appendChild(divider);

            events.forEach(evt => {
              const card = document.createElement('div');
              card.className = 'agenda-card-item';
          card.tabIndex = 0;
          card.setAttribute('role', 'button');
              styleEvent(card, evt, [m.id]);

              card.innerHTML = `
                <div class="agenda-card-time">${evt.time || 'All Day'}</div>
                <div class="agenda-card-title">${esc(evt.title)}</div>
                ${evt.location ? `<div class="agenda-card-loc"><i class="fa-solid fa-location-dot"></i> ${esc(evt.location)}</div>` : ''}
              `;

              card.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEventPopover(evt, card, e);
              });

              colBody.appendChild(card);
            });
          });
        }

        container.appendChild(col);
      });
    }

    // EVENT DETAILS POPOVER
    openEventPopover(evt, anchorEl, mouseEvt = null) {
      const popover = document.getElementById('event-details-popover');
      if (!popover) return;

      evt = this.feed.copiesOf(evt); // same event on several calendars: every attendee, any location or notes
      this.selectedEvent = evt;

      const member = stateManager.data.members.find(m => m.id === evt.memberId);

      const memberTag = document.getElementById('popover-member-tag');
      if (memberTag) {
        const ids = evt.memberIds && evt.memberIds.length > 1 ? evt.memberIds : [evt.memberId];
        memberTag.innerHTML = ids.map(mid => {
          const m = mid === 'shared'
            ? { name: 'Shared', color: 'var(--color-shared)' }
            : stateManager.data.members.find(x => x.id === mid);
          return `<span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:12px;background:${m?.color || 'var(--color-primary)'}22;font-size:12px;font-weight:600;">${esc(m?.name || mid)}</span>`;
        }).join('');
      }

      const titleEl = document.getElementById('popover-title');
      if (titleEl) titleEl.textContent = evt.title || 'Untitled Event';

      const timeTextEl = document.getElementById('popover-time-text');
      if (timeTextEl) {
        let datePart = evt.date || '';
        try {
          const [y, m, d] = evt.date.split('-').map(Number);
          const dObj = new Date(y, m - 1, d);
          datePart = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } catch (_) {}
        timeTextEl.textContent = `${datePart} • ${evt.time || 'All Day'}`;
      }

      const locRow = document.getElementById('popover-location-row');
      const locText = document.getElementById('popover-location-text');
      if (locRow && locText) {
        if (evt.location && evt.location.trim()) {
          locRow.style.display = 'flex';
          locText.textContent = evt.location.trim();
        } else {
          locRow.style.display = 'none';
        }
      }

      const notesRow = document.getElementById('popover-notes-row');
      const notesText = document.getElementById('popover-notes-text');
      if (notesRow && notesText) {
        if (evt.notes && evt.notes.trim()) {
          notesRow.style.display = 'flex';
          notesText.textContent = evt.notes.trim();
        } else {
          notesRow.style.display = 'none';
        }
      }

      // Events from Home Assistant's calendars belong to those calendars: they can be hidden here, not changed.
      const editBtn = document.getElementById('popover-edit-btn');
      if (editBtn) editBtn.style.display = isHaEvent(evt) ? 'none' : '';

      popover.classList.add('active');
      const popoverWidth = popover.offsetWidth || 320;
      const popoverHeight = popover.offsetHeight || 220;

      let left = 20;
      let top = 100;

      if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
        const rect = anchorEl.getBoundingClientRect();
        left = rect.left;
        top = rect.bottom + 8;

        if (left + popoverWidth > window.innerWidth - 16) {
          left = Math.max(16, window.innerWidth - popoverWidth - 16);
        }
        if (top + popoverHeight > window.innerHeight - 16) {
          top = Math.max(16, rect.top - popoverHeight - 8);
        }
      } else if (mouseEvt) {
        left = Math.min(window.innerWidth - popoverWidth - 16, Math.max(16, mouseEvt.clientX));
        top = Math.min(window.innerHeight - popoverHeight - 16, Math.max(16, mouseEvt.clientY + 8));
      }

      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(top)}px`;
    }

    closeEventPopover() {
      this.selectedEvent = null;
      const popover = document.getElementById('event-details-popover');
      if (popover) {
        popover.classList.remove('active');
      }
    }

    // MODAL HANDLERS
    openEventModal(event = null, defaultDate = null, defaultTime = null) {
      const modal = document.getElementById('event-modal');
      const memberSelect = document.getElementById('event-member-select');
      if (!modal || !memberSelect) return;

      // Populate Member dropdown
      memberSelect.innerHTML = stateManager.data.members.map(m => `
        <option value="${m.id}">${esc(m.avatar)} ${esc(m.name)}</option>
      `).join('') + `<option value="shared">Shared</option>`;

      if (event) {
        document.getElementById('event-modal-title').textContent = 'Edit Family Event';
        document.getElementById('event-id').value = event.id;
        document.getElementById('event-title-input').value = event.title;
        document.getElementById('event-member-select').value = event.memberId;
        document.getElementById('event-category-select').value = event.category || 'family';
        document.getElementById('event-date-input').value = event.date;
        const fields = CalendarFeed.timeFields(event.time);
        document.getElementById('event-allday-check').checked = fields.allDay;
        document.getElementById('event-time-input').value = fields.start;
        document.getElementById('event-end-input').value = fields.end;
        document.getElementById('event-location-input').value = event.location || '';
        document.getElementById('event-delete-btn').classList.remove('hidden');
      } else {
        document.getElementById('event-modal-title').textContent = 'Add Family Event';
        document.getElementById('event-id').value = '';
        document.getElementById('event-title-input').value = '';
        document.getElementById('event-member-select').value = stateManager.data.activeMemberId !== 'all' ? stateManager.data.activeMemberId : stateManager.data.members[0].id;
        document.getElementById('event-date-input').value = defaultDate || toLocalYMD(new Date());
        document.getElementById('event-allday-check').checked = false;
        document.getElementById('event-time-input').value = defaultTime || '09:00';
        document.getElementById('event-end-input').value = '';
        document.getElementById('event-location-input').value = '';
        document.getElementById('event-delete-btn').classList.add('hidden');
      }

      this.syncEventTimeFields();
      modal.classList.add('active');
    }

    // All day hides the times (disabled fields skip validation); an end time can't precede the start.
    syncEventTimeFields() {
      const allDay = document.getElementById('event-allday-check').checked;
      const start = document.getElementById('event-time-input');
      const end = document.getElementById('event-end-input');
      document.getElementById('event-time-row').classList.toggle('hidden', allDay);
      start.disabled = allDay;
      end.disabled = allDay;
      end.min = start.value;
    }

    closeEventModal() {
      document.getElementById('event-modal')?.classList.remove('active');
    }

    handleSaveEvent() {
      const formattedTime = CalendarFeed.timeFromFields({
        allDay: document.getElementById('event-allday-check').checked,
        start: document.getElementById('event-time-input').value,
        end: document.getElementById('event-end-input').value
      });

      const eventObj = {
        id: document.getElementById('event-id').value,
        title: document.getElementById('event-title-input').value,
        memberId: document.getElementById('event-member-select').value,
        category: document.getElementById('event-category-select').value,
        date: document.getElementById('event-date-input').value,
        time: formattedTime,
        location: document.getElementById('event-location-input').value
      };

      this.feed.save(eventObj);
      this.closeEventModal();
      this.render();
    }

  }
