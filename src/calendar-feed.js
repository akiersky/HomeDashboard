/* --------------------------------------------------------------------------
     3. CALENDAR MODULE
     -------------------------------------------------------------------------- */
  function toLocalYMD(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /* --------------------------------------------------------------------------
     3a. CALENDAR FEED
     -------------------------------------------------------------------------- */
  // Small storage for data that must stay on this device (a cache, a preference): one JSON value under one key.
  function localCache(key) {
    return {
      read() { try { return JSON.parse(localStorage.getItem(key))?.events || []; } catch (_) { return []; } },
      write(events) { try { localStorage.setItem(key, JSON.stringify({ events })); } catch (_) { /* full or private mode: next sync refills it */ } }
    };
  }

  const isHaEvent = (e) => String(e.id).startsWith('ha-');

  // Which events exist and how they are read: your own events, the Home Assistant calendars (a cache, kept out of the
  // household document) and tasks marked for the calendar. Times travel as display strings ("9:00 AM - 10:00 AM",
  // "All Day") and are parsed here, once. Views draw what this returns.
  class CalendarFeed {
    constructor({ store, tasks, cache, ha, now = () => new Date() }) {
      this.store = store;
      this.tasks = tasks;
      this.cache = cache;   // { read() -> events, write(events) }
      this.ha = ha;         // { getCalendarEvents(entityIds, fromIso, toIso) }
      this.now = now;
      this.onChange = null; // told when a sync brought events
      this.haEvents = cache.read();
      this.adoptLegacyEvents();
    }

    // Older documents carried the Home Assistant events (and some sample events) inside the household document.
    adoptLegacyEvents() {
      const events = this.store.data.events || [];
      const sample = (e) => /^evt-[1-8]$/.test(e.id);
      const legacy = events.filter(isHaEvent);
      if (!legacy.length && !events.some(sample)) return;
      if (legacy.length && !this.haEvents.length) { this.haEvents = legacy; this.cache.write(legacy); }
      this.store.data.events = events.filter(e => !isHaEvent(e) && !sample(e));
      this.store.save({ stamp: false, push: false });
    }

    stored() { return [...(this.store.data.events || []).filter(e => !isHaEvent(e)), ...this.haEvents]; }
    all() { return [...this.stored(), ...this.tasks.asCalendarEvents()]; }

    // ---- your own events ----
    // A Home Assistant event is not yours to save: it would be filtered out of stored() and the edit would vanish.
    save(event) {
      if (isHaEvent(event)) throw new Error('Events from Home Assistant calendars cannot be edited');
      const events = (this.store.data.events ||= []);
      if (!event.id) {
        let id = 'evt-' + this.now().getTime();
        for (let n = 1; events.some(e => e.id === id); n++) id = `evt-${this.now().getTime()}-${n}`;
        event = { ...event, id };
      }
      const i = events.findIndex(e => e.id === event.id);
      if (i >= 0) events[i] = event; else events.push(event);
      this.store.save();
      return event;
    }

    // A Home Assistant event is only hidden until the next sync brings it back.
    remove(id) {
      this.store.data.events = (this.store.data.events || []).filter(e => e.id !== id);
      if (this.haEvents.some(e => e.id === id)) {
        this.haEvents = this.haEvents.filter(e => e.id !== id);
        this.cache.write(this.haEvents);
      }
      this.store.save();
    }

    // ---- Home Assistant ----
    // Replaces the cached events (a month back, two months ahead). Resolves how many arrived; keeps what it had
    // when Home Assistant fails or returns nothing.
    async sync() {
      const members = this.store.data.members;
      const entityIds = members.map(m => m.haCalendarEntity).filter(Boolean);
      if (!entityIds.length) return 0;
      const from = this.now(); from.setDate(from.getDate() - 30);
      const to = this.now(); to.setDate(to.getDate() + 60);
      let results;
      try {
        results = await this.ha.getCalendarEvents(entityIds, from.toISOString(), to.toISOString());
      } catch (err) {
        console.warn('Failed syncing HA calendars via WebSocket:', err);
        return 0;
      }
      const fetched = members.filter(m => m.haCalendarEntity).flatMap(m => CalendarFeed.fromHa(m, results[m.haCalendarEntity]?.events || []));
      if (!fetched.length) return 0;
      this.haEvents = fetched;
      this.cache.write(fetched);
      this.onChange?.();
      return fetched.length;
    }

    // ---- reading ----
    // Everything on one date that this member can see (everyone, by default), with copies on several calendars merged.
    day(date, memberId = 'all') {
      let events = this.all().filter(e => e.date === date);
      if (memberId !== 'all') events = events.filter(e => e.memberId === memberId || e.memberId === 'shared');
      return CalendarFeed.merge(events);
    }

    // One member's upcoming events grouped by date: [{ date, events }]. With nothing ahead, whatever they have.
    agenda(memberId, today) {
      const mine = this.all().filter(e => e.memberId === memberId || e.memberId === 'shared');
      let upcoming = mine.filter(e => e.date >= today);
      if (!upcoming.length && mine.length) upcoming = mine;
      upcoming.sort((a, b) => a.date.localeCompare(b.date) || CalendarFeed.parseTime(a.time).startMinutes - CalendarFeed.parseTime(b.time).startMinutes);
      const days = [];
      upcoming.forEach(e => {
        let day = days[days.length - 1];
        if (!day || day.date !== e.date) days.push(day = { date: e.date, events: [] });
        day.events.push(e);
      });
      return days;
    }

    // Today's timed events that are not over yet, soonest first (the screensaver's list).
    remaining(now) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      return this.day(toLocalYMD(now))
        .map(e => ({ e, t: CalendarFeed.parseTime(e.time) }))
        .filter(({ t }) => !t.isAllDay && t.endMinutes > nowMinutes)
        .sort((a, b) => a.t.startMinutes - b.t.startMinutes)
        .map(({ e }) => e);
    }

    // The same event on several calendars, gathered: every attendee, and any location or notes one copy has.
    copiesOf(evt) {
      const copies = this.stored().filter(e => CalendarFeed.key(e) === CalendarFeed.key(evt));
      if (!copies.some(e => e.id === evt.id)) copies.unshift(evt);
      return {
        ...evt,
        memberIds: [...new Set(copies.map(e => e.memberId))],
        location: copies.map(e => e.location).find(l => l && l.trim()) || '',
        notes: copies.map(e => e.notes).find(n => n && n.trim()) || ''
      };
    }

    // ---- rules that need no data ----
    static key(e) { return `${(e.title || '').toLowerCase().trim()}|${e.date}|${e.time || 'allday'}`; }

    static merge(events) {
      const groups = new Map();
      for (const e of events) {
        const k = CalendarFeed.key(e);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
      }
      return [...groups.values()].map(group => {
        if (group.length === 1) return group[0];
        const memberIds = [...new Set(group.map(e => e.memberId))];
        return { ...group[0], memberIds, memberId: memberIds[0] };
      });
    }

    // "9:00 AM - 10:30 AM" -> minutes from midnight. No end: an hour. At least 30 minutes. Unreadable: all day.
    static parseTime(timeStr) {
      const allDay = { isAllDay: true, startMinutes: 0, endMinutes: 1440, duration: 1440 };
      if (!timeStr || /all[-\s]?day/i.test(timeStr)) return allDay;
      const minutes = (text) => {
        let str = (text || '').trim();
        const meridiem = str.match(/(am|pm)/i);
        if (meridiem) str = str.replace(/(am|pm)/i, '').trim();
        const [hh, mm] = str.split(':');
        let h = parseInt(hh, 10);
        let m = mm ? parseInt(mm, 10) : 0;
        if (isNaN(h)) return null;
        if (isNaN(m)) m = 0;
        if (meridiem && /pm/i.test(meridiem[0]) && h < 12) h += 12;
        if (meridiem && /am/i.test(meridiem[0]) && h === 12) h = 0;
        return h * 60 + m;
      };
      const [from, to] = timeStr.split(/\s*-\s*/);
      const startMinutes = minutes(from);
      if (startMinutes === null) return allDay;
      let endMinutes = to ? minutes(to) : null;
      if (endMinutes === null || endMinutes <= startMinutes) endMinutes = Math.min(1440, startMinutes + 60);
      const duration = Math.max(30, endMinutes - startMinutes);
      return { isAllDay: false, startMinutes, endMinutes: startMinutes + duration, duration };
    }

    // "09:00 AM - 10:30 AM" -> "9:00 AM". All-day and unreadable times have no start to show.
    static startTime(timeStr) {
      if (CalendarFeed.parseTime(timeStr).isAllDay) return '';
      return timeStr.split(/\s*-\s*/)[0].trim().replace(/^0/, '');
    }

    // The time field of the event dialog ("14:05") <-> the stored display time ("2:05 PM").
    static to24(timeStr) {
      if (/^\d{2}:\d{2}$/.test((timeStr || '').trim())) return timeStr.trim();
      const t = CalendarFeed.parseTime(timeStr);
      if (t.isAllDay) return '09:00';
      return `${String(Math.floor(t.startMinutes / 60)).padStart(2, '0')}:${String(t.startMinutes % 60).padStart(2, '0')}`;
    }

    // The event dialog's fields <-> the stored display time.
    static timeFields(timeStr) {
      if (CalendarFeed.parseTime(timeStr).isAllDay) return { allDay: true, start: '09:00', end: '' };
      const [from, to] = timeStr.split(/\s*-\s*/);
      return { allDay: false, start: CalendarFeed.to24(from), end: to ? CalendarFeed.to24(to) : '' };
    }

    static timeFromFields({ allDay, start, end }) {
      if (allDay) return 'All Day';
      return end ? `${CalendarFeed.from24(start)} - ${CalendarFeed.from24(end)}` : CalendarFeed.from24(start);
    }

    static from24(time24) {
      if (!time24) return '09:00 AM';
      const [hh, mm] = time24.split(':');
      const h = parseInt(hh, 10);
      if (isNaN(h)) return time24;
      return `${h % 12 || 12}:${mm || '00'} ${h >= 12 ? 'PM' : 'AM'}`;
    }

    // Lays one day's events out for a time grid: overlapping events share the width in columns.
    static layout(events, hourHeight) {
      const allDay = [];
      const timed = [];
      for (const e of events) {
        const t = CalendarFeed.parseTime(e.time);
        if (t.isAllDay) allDay.push(e); else timed.push({ ...e, _times: t });
      }
      timed.sort((a, b) => a._times.startMinutes - b._times.startMinutes || b._times.duration - a._times.duration);

      const clusters = [];
      let cluster = [];
      let clusterEnd = -1;
      for (const item of timed) {
        if (cluster.length && item._times.startMinutes >= clusterEnd) { clusters.push(cluster); cluster = []; }
        cluster.push(item);
        clusterEnd = cluster.length === 1 ? item._times.endMinutes : Math.max(clusterEnd, item._times.endMinutes);
      }
      if (cluster.length) clusters.push(cluster);

      const placed = [];
      for (const group of clusters) {
        const columns = [];
        for (const item of group) {
          let col = columns.findIndex(c => c[c.length - 1]._times.endMinutes <= item._times.startMinutes);
          if (col < 0) { col = columns.length; columns.push([]); }
          columns[col].push(item);
          item._col = col;
        }
        for (const item of group) {
          const widthPct = 100 / columns.length;
          placed.push({
            event: item,
            topPx: (item._times.startMinutes / 60) * hourHeight,
            heightPx: Math.max(26, (item._times.duration / 60) * hourHeight) - 2,
            leftPct: item._col * widthPct,
            widthPct
          });
        }
      }
      return { timed: placed, allDay };
    }

    // Home Assistant events -> dashboard events for one member.
    static fromHa(member, haEvents) {
      return haEvents.map(he => {
        const { dateStr, timeStr } = CalendarFeed.dateAndTime(he.start, he.end);
        const key = he.uid ? `${he.uid}-${he.recurrence_id || dateStr}` : `${he.summary || 'event'}-${dateStr}-${timeStr}`;
        return {
          id: `ha-${member.id}-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          title: he.summary || 'Untitled Event',
          memberId: member.id,
          category: member.role === 'kid' ? 'school' : 'family',
          date: dateStr,
          time: timeStr,
          location: he.location || '',
          notes: he.description || ''
        };
      });
    }

    // Home Assistant start / end ("2026-10-14T16:00:00", "2026-10-14 16:00:00" or a bare date) -> { dateStr, timeStr }.
    static dateAndTime(startObj, endObj) {
      const raw = (v, k) => typeof v === 'string' ? v.trim() : (v && typeof v === 'object' ? (v.dateTime || v.date || v[k] || '').trim() : '');
      const parse = (text) => new Date(text.includes(' ') && !text.includes('T') ? text.replace(' ', 'T') : text);
      const clock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const startRaw = raw(startObj, 'start');
      if (!startRaw) return { dateStr: toLocalYMD(new Date()), timeStr: 'All Day' };
      if (/^\d{4}-\d{2}-\d{2}$/.test(startRaw)) return { dateStr: startRaw, timeStr: 'All Day' };
      const start = parse(startRaw);
      if (isNaN(start.getTime())) return { dateStr: toLocalYMD(new Date()), timeStr: 'All Day' };
      let timeStr = clock(start);
      const endRaw = raw(endObj, 'end');
      if (endRaw && !/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
        const end = parse(endRaw);
        if (!isNaN(end.getTime()) && clock(end) !== timeStr) timeStr = `${timeStr} - ${clock(end)}`;
      }
      return { dateStr: toLocalYMD(start), timeStr };
    }
  }
