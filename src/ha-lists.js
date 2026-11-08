/* --------------------------------------------------------------------------
     2e. HOME ASSISTANT LISTS
     -------------------------------------------------------------------------- */
  // The shopping list, the meal ideas and the dinner plan are Home Assistant to-do entities. HaList is one such list
  // with a local copy to fall back on; items are { id, name, bought } and callers never see which store answered.
  // With an entity configured and Home Assistant reachable, the entity is the truth. Otherwise the local copy is:
  // changes made then stay on this device and are replaced by the entity's list at the next load.
  class HaList {
    constructor({ ha, entity, local, addAt = 'end', onError = () => {} }) {
      this.ha = ha;            // { getTodoItems, addTodoItem, updateTodoItem, updateTodoItemName, removeTodoItem }
      this.entity = entity;    // () => entity id ('' when none)
      this.local = local;      // { read() -> items, write(items, mirror) }; mirror: the copy of the entity's list
      this.addAt = addAt;      // where a new local item goes: 'end' or 'start'
      this.onError = onError;  // (error, what) when Home Assistant could not be reached
      this.listeners = [];
      this.seq = 0;
      this.fromHa = null;      // the entity's list as Home Assistant last answered it
      this.unsent = false;     // a change is held in the local copy because Home Assistant did not take it
      this.failed = false;     // the last read of the entity's list failed
    }

    // The entity's list while Home Assistant answers, otherwise the local copy. The copy is read fresh each time:
    // a sync can replace the household data underneath it.
    get items() { return (this.entity() && this.fromHa) || this.local.read(); }

    get configured() { return !!this.entity(); }

    // How far the list can be trusted. 'connected' means Home Assistant answered, not that Google Keep is in step:
    // Home Assistant keeps serving its copy of the list while the Keep integration is failing.
    get status() {
      if (!this.entity()) return 'local';
      if (this.unsent) return 'unsent';
      if (this.fromHa) return 'connected';
      return this.failed ? 'offline' : 'connecting';
    }

    subscribe(fn) {
      this.listeners.push(fn);
      return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }

    emit() { this.listeners.forEach(fn => fn(this.items)); }

    // Fetches the entity's list. False when there is no entity or it cannot be reached.
    async refresh() {
      const entity = this.entity();
      if (!entity) return false;
      try {
        this.fromHa = await this.ha.getTodoItems(entity);
        this.unsent = false;
        this.failed = false;
        this.local.write(this.fromHa, true);
        this.emit();
        return true;
      } catch (e) {
        this.fromHa = null;
        this.failed = true;
        this.onError(e, 'load');
        return false;
      }
    }

    async load() {
      if (!(await this.refresh())) this.emit();
      return this.items;
    }

    // The periodic re-read that shows changes made elsewhere. It waits while a change could not be sent, or the
    // re-read would wipe that change within the minute; a later change that gets through, or a reload, resumes it.
    async poll() {
      if (this.unsent) return false;
      const fresh = await this.refresh();
      if (!fresh) this.emit(); // so what is showing can say the connection was lost
      return fresh;
    }

    // Returns the new item, or null for a blank name.
    async add(name) {
      name = String(name || '').trim();
      if (!name) return null;
      const known = new Set(this.items.map(i => i.id));
      let created = null;
      await this.change('add', (entity) => this.ha.addTodoItem(entity, name), (items) => {
        created = { id: `li-${Date.now()}-${this.seq++}`, name, bought: false };
        return this.addAt === 'start' ? [created, ...items] : [...items, created];
      });
      return created || this.items.find(i => !known.has(i.id) && i.name === name) || this.items.find(i => i.name === name) || null;
    }

    async rename(id, name) {
      name = String(name || '').trim();
      if (!name || !this.items.some(i => i.id === id)) return;
      await this.change('rename', (entity) => this.ha.updateTodoItemName(entity, id, name), (items) => items.map(i => i.id === id ? { ...i, name } : i));
    }

    async toggle(id) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      await this.change('toggle', (entity) => this.ha.updateTodoItem(entity, id, !item.bought), (items) => items.map(i => i.id === id ? { ...i, bought: !i.bought } : i));
    }

    async remove(id) {
      if (!this.items.some(i => i.id === id)) return;
      await this.change('remove', (entity) => this.ha.removeTodoItem(entity, id), (items) => items.filter(i => i.id !== id));
    }

    // Sends a change to Home Assistant and shows the list it answers with. With no entity, or when Home Assistant
    // fails, the change is applied to the local copy instead.
    async change(what, viaHa, viaLocal) {
      const entity = this.entity();
      let sent = false;
      if (entity) {
        try { await viaHa(entity); sent = true; } catch (e) { this.onError(e, what); }
      }
      if (sent && await this.refresh()) return;
      this.unsent = !!entity && !sent;
      const next = viaLocal(this.items);
      this.fromHa = null;
      this.local.write(next, !!entity);
      this.emit();
    }
  }

  // The dinner plan: a list whose items read "Mon|Taco Night" (a weekday, a bar, the meal).
  class MealPlan {
    constructor(list) { this.list = list; }

    get configured() { return this.list.configured; }
    subscribe(fn) { return this.list.subscribe(fn); }
    load() { return this.list.load(); }
    entry(day) { return this.list.items.find(i => i.name.startsWith(`${day}|`)); }

    get byDay() {
      const plan = {};
      this.list.items.forEach(i => {
        const bar = i.name.indexOf('|');
        if (bar > 0) plan[i.name.slice(0, bar)] = i.name.slice(bar + 1);
      });
      return plan;
    }

    set(day, meal) {
      const entry = this.entry(day);
      return entry ? this.list.rename(entry.id, `${day}|${meal}`) : this.list.add(`${day}|${meal}`);
    }

    clear(day) {
      const entry = this.entry(day);
      return entry ? this.list.remove(entry.id) : Promise.resolve();
    }

    // The plan covers the next seven days: that weekday's meal if the date falls inside them.
    dinnerOn(date, today) {
      const ahead = ParentTasks.daysUntil(date, today);
      if (ahead < 0 || ahead > 6) return undefined;
      const [y, m, d] = date.split('-').map(Number);
      return this.byDay[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(y, m - 1, d).getDay()]];
    }
  }

  // Where a list keeps its local copy: a collection in the household document (a Home Assistant mirror is not a
  // household change), or only in memory.
  const storeList = (store, key) => ({
    read: () => store.data[key] || [],
    write(items, mirror) {
      store.data[key] = items.map(({ id, name, bought }) => ({ id, name, bought }));
      store.save(mirror ? { stamp: false, push: false } : undefined);
    }
  });
  const memoryList = () => {
    let items = [];
    return { read: () => items, write: (next) => { items = next; } };
  };
