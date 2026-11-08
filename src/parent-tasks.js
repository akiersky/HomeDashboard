/* --------------------------------------------------------------------------
     2c. PARENT TASKS
     -------------------------------------------------------------------------- */
  const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
  const CATEGORY_LABEL = { general: 'General', home: 'Home', vehicle: 'Vehicle', finance: 'Finance', errands: 'Errands', work: 'Work', health: 'Health', family: 'Family' };
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

  // Parent tasks (a task may repeat): add, edit, tick, remove with undo, the board's bucket / group / drop rules,
  // and the projection onto the calendar. Views draw; this decides.
  class ParentTasks {
    constructor(store, now = () => new Date()) {
      this.store = store;
      this.now = now;
    }

    get all() { return this.store.data.parentTasks || (this.store.data.parentTasks = []); }
    today() { return toLocalYMD(this.now()); }
    find(id) { return this.all.find(t => t.id === id); }
    mine(memberId) { return this.all.filter(t => t.memberId === memberId || t.memberId === 'shared'); }

    static repeats(t) { return !!t.frequency && t.frequency !== 'none'; }
    static daysUntil(ymd, todayYMD) { return Math.round((new Date(ymd) - new Date(todayYMD)) / 86400000); }
    static order(a, b) {
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (PRIORITY_RANK[a.priority || 'medium'] - PRIORITY_RANK[b.priority || 'medium']);
    }

    // Next due date of a repeating task, counted from its due date (or from today when that is past).
    static nextDue(frequency, dueYMD, now = new Date()) {
      const d = dueYMD ? new Date(dueYMD + 'T12:00:00') : new Date(now);
      const from = d < now ? new Date(now) : d;
      if (frequency === 'daily') from.setDate(from.getDate() + 1);
      else if (frequency === 'weekly') from.setDate(from.getDate() + 7);
      else if (frequency === 'monthly') from.setMonth(from.getMonth() + 1);
      else if (frequency === 'annually') from.setFullYear(from.getFullYear() + 1);
      return toLocalYMD(from);
    }

    add(fields) {
      let id = 'pt-' + Date.now();
      for (let n = 1; this.find(id); n++) id = `pt-${Date.now()}-${n}`;
      const task = { ...fields, id, completed: false };
      this.all.unshift(task);
      this.store.save();
      return task;
    }

    update(id, fields) {
      const t = this.find(id);
      if (!t) return null;
      Object.assign(t, fields);
      this.store.save();
      return t;
    }

    // Repeating tasks advance to their next due date; one-off tasks toggle done. undo() puts the task back as it was.
    toggle(id) {
      const t = this.find(id);
      if (!t) return null;
      const before = { dueDate: t.dueDate, lastCompletedDate: t.lastCompletedDate, completed: t.completed };
      if (ParentTasks.repeats(t)) {
        t.lastCompletedDate = this.today();
        t.dueDate = ParentTasks.nextDue(t.frequency, t.dueDate, this.now());
      } else {
        t.completed = !t.completed;
      }
      this.store.save();
      return { task: t, undo: () => this.update(id, before) };
    }

    // Returns an undo, or null when there was no such task.
    remove(id) { return this.withdraw(new Set([id])); }

    // Removes this parent's finished one-off tasks (and shared ones). undo is null when nothing was removed.
    clearDone(memberId) {
      const ids = new Set(this.mine(memberId).filter(t => !ParentTasks.repeats(t) && t.completed).map(t => t.id));
      return { count: ids.size, undo: this.withdraw(ids) };
    }

    // Removes tasks by id; the undo puts each back after the task that preceded it (or at its old position).
    withdraw(ids) {
      const before = this.all.map(t => t.id);
      const gone = before.map((id, index) => ({ id, index })).filter(({ id }) => ids.has(id));
      if (!gone.length) return null;
      const removed = new Map(this.all.filter(t => ids.has(t.id)).map(t => [t.id, t]));
      this.store.data.parentTasks = this.all.filter(t => !ids.has(t.id));
      this.store.save();
      return () => {
        for (const { id, index } of gone) {
          const list = this.all;
          const after = list.findIndex(t => t.id === before[index - 1]);
          list.splice(after >= 0 ? after + 1 : Math.min(index, list.length), 0, removed.get(id));
        }
        this.store.save();
      };
    }

    // Each grouping of the board: its columns, how a task maps to one, what dropping on a column does, and which tag
    // would be redundant. Time buckets: this week runs through Saturday, soon is the next 30 days, the rest is later.
    groups(open, today) {
      const plusDays = (n) => { const d = this.now(); d.setDate(d.getDate() + n); return toLocalYMD(d); };
      const weekEnd = (() => { const d = this.now(); d.setDate(d.getDate() + 6 - d.getDay()); return toLocalYMD(d); })();
      const soonEnd = plusDays(30);
      const bucket = (t) => t.dueDate && t.dueDate < today ? 'overdue' : !t.dueDate ? 'later' : t.dueDate <= weekEnd ? 'week' : t.dueDate <= soonEnd ? 'soon' : 'later';
      return {
        priority: { key: 'priority', label: 'Priority', cols: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], of: t => t.priority || 'medium', set: (t, k) => { t.priority = k; }, hide: 'priority' },
        theme: { key: 'theme', label: 'Theme', cols: Object.entries(CATEGORY_LABEL).filter(([k]) => open.some(t => (t.category || 'general') === k)), of: t => t.category || 'general', set: (t, k) => { t.category = k; }, hide: 'category' },
        time: {
          key: 'time', label: 'Time', cols: [...(open.some(t => bucket(t) === 'overdue') ? [['overdue', 'Overdue']] : []), ['week', 'This week'], ['soon', 'Soon'], ['later', 'Later']],
          of: bucket, noDrop: ['overdue'], hide: 'due',
          set: (t, k) => { if (bucket(t) !== k) t.dueDate = { week: weekEnd, soon: plusDays(14), later: '' }[k]; }
        }
      };
    }

    // What the parent page shows for one parent: the board columns for a grouping, finished and repeating tasks,
    // and the month calendar's data (tasks by due date, plus the open ones without a date).
    board(memberId, groupKey) {
      const mine = this.mine(memberId);
      const oneOff = mine.filter(t => !ParentTasks.repeats(t));
      const open = oneOff.filter(t => !t.completed);
      const groups = this.groups(open, this.today());
      const g = groups[groupKey] || groups.priority;
      const scheduled = {};
      mine.filter(t => t.dueDate && !t.completed).sort(ParentTasks.order).forEach(t => { (scheduled[t.dueDate] = scheduled[t.dueDate] || []).push(t); });
      return {
        open,
        done: oneOff.filter(t => t.completed).sort(ParentTasks.order),
        recurring: mine.filter(ParentTasks.repeats).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')),
        group: { key: g.key, label: g.label, hide: g.hide },
        groups: Object.values(groups).map(({ key, label }) => ({ key, label })),
        columns: g.cols.map(([key, label]) => ({ key, label, droppable: !(g.noDrop || []).includes(key), tasks: open.filter(t => g.of(t) === key).sort(ParentTasks.order) })),
        scheduled,
        undated: open.filter(t => !t.dueDate).sort(ParentTasks.order)
      };
    }

    // Dropping a card on a board column sets what the board is grouped by; "done" completes it. False when refused.
    dropOnColumn(id, groupKey, colKey) {
      const t = this.find(id);
      const groups = this.groups([], this.today());
      const g = groups[groupKey] || groups.priority;
      if (!t || (g.noDrop || []).includes(colKey)) return false;
      if (colKey === 'done') t.completed = true;
      else { t.completed = false; g.set(t, colKey); }
      this.store.save();
      return true;
    }

    schedule(id, ymd) { return !!this.update(id, { dueDate: ymd }); }

    // Tasks marked "show on calendar" as all-day events; a finished one-off task drops off.
    asCalendarEvents() {
      return this.all.filter(t => t.showOnCalendar && t.dueDate && (!t.completed || ParentTasks.repeats(t))).map(t => ({
        id: 'task-' + t.id, title: t.title, memberId: t.memberId, category: 'family', date: t.dueDate, time: 'All Day',
        frequency: t.frequency, location: ParentTasks.repeats(t) ? `Repeats ${t.frequency}` : '', notes: t.notes || ''
      }));
    }
  }

  const parentTasks = new ParentTasks(stateManager);
