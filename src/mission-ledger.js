/* --------------------------------------------------------------------------
     2d. MISSION LEDGER (chores, routines, wildcards, stars, prizes)
     -------------------------------------------------------------------------- */
  // The rules of the Mission board: who earns what and when, how a star balance changes and is logged, what a prize
  // costs, and when missions reset. Views draw and ask; this decides.
  class MissionLedger {
    constructor(store, { now = () => new Date(), addTask = () => {}, onPrize = () => {} } = {}) {
      this.store = store;
      this.now = now;
      this.addTask = addTask;   // files a to-do for the parents when a prize is bought
      this.onPrize = onPrize;   // told when a prize is bought, to celebrate
      this.seq = 0;
    }

    get d() { return this.store.data; }
    today() { return toLocalYMD(this.now()); }
    member(id) { return this.d.members.find(m => m.id === id); }
    kids() { return this.d.members.filter(m => m.role === 'kid'); }
    newId(prefix) { return `${prefix}-${this.now().getTime()}-${this.seq++}`; }

    // Prize store. First use seeds it from the old per-kid goals so nothing is lost.
    init() {
      if (this.d.rewardsSeeded) return;
      this.d.rewardsSeeded = true;
      const rewards = (this.d.rewards ||= []);
      const seen = new Set(rewards.map(r => `${r.title}|${r.cost}`));
      this.kids().filter(m => m.targetReward && m.targetStars).forEach(m => {
        const key = `${m.targetReward}|${m.targetStars}`;
        if (!seen.has(key)) { seen.add(key); rewards.push({ id: this.newId('rw'), title: m.targetReward, cost: m.targetStars }); }
      });
      this.store.save();
    }

    // ---- reading ----
    find(id) {
      const chore = this.d.chores.find(c => c.id === id);
      if (chore) return { item: chore, list: this.d.chores, kind: 'chore' };
      const routine = (this.d.routines || []).find(r => r.id === id);
      return routine ? { item: routine, list: this.d.routines, kind: 'routine' } : null;
    }

    // One kid's routines and chores, grouped for display. Routines are copies flagged `_routine`.
    itemsFor(kidId) {
      const routines = (this.d.routines || []).filter(r => r.memberId === kidId).map(r => ({ ...r, _routine: true }));
      const chores = (this.d.chores || []).filter(c => c.memberId === kidId);
      const byRoutine = { morning: [], afterschool: [], bedtime: [] };
      routines.forEach(r => byRoutine[r.routineType]?.push(r));
      chores.filter(c => c.routineType && c.routineType !== 'general').forEach(c => byRoutine[c.routineType]?.push(c));
      const isDaily = c => !c.frequency || c.frequency === 'daily';
      return {
        byRoutine,
        daily: chores.filter(c => (!c.routineType || c.routineType === 'general') && isDaily(c)),
        weekly: chores.filter(c => c.frequency === 'weekly'),
        monthly: chores.filter(c => c.frequency === 'monthly')
      };
    }

    wildcards() { return (this.d.chores || []).filter(c => c.memberId === 'either'); }
    activity(memberId) { return this.d.kidAchievements?.[memberId]?.activityLog || []; }
    rewards() { return (this.d.rewards || []).slice().sort((a, b) => a.cost - b.cost); }

    // What the star meter aims at: the cheapest prize not yet affordable (else the priciest one).
    nextPrize(member) {
      const rewards = this.rewards();
      return rewards.find(r => r.cost > member.stars) || rewards[rewards.length - 1] || null;
    }

    starPct(member) {
      const prize = this.nextPrize(member);
      return prize ? Math.min(100, Math.round((member.stars / prize.cost) * 100)) : 0;
    }

    // ---- earning ----
    // Ticks a routine (toggles; one star per routine per day) or a chore (completes once). Returns the stars earned.
    tick(id) {
      const found = this.find(id);
      if (!found) return null;
      const { item, kind } = found;
      let stars = 0;
      if (kind === 'routine') {
        item.completedToday = !item.completedToday;
        if (item.completedToday && item.starDay !== this.today()) {
          item.starDay = this.today();
          stars = this.award(item.memberId, 1, item.title);
        }
      } else if (item.memberId === 'either' || item.status === 'completed') {
        return null;   // wildcards are claimed; a finished chore stays finished
      } else {
        item.status = 'completed';
        stars = this.award(item.memberId, item.points, item.title);
      }
      this.store.save();
      return { item, stars };
    }

    claim(choreId, kidId) {
      const chore = this.d.chores.find(c => c.id === choreId && c.memberId === 'either');
      if (!chore || chore.status === 'completed') return null;
      chore.status = 'completed';
      chore.completedBy = kidId;
      const member = this.member(kidId);
      if (member) this.award(kidId, chore.points, `${chore.title} (Wildcard Bonus)`);
      this.store.save();
      return { chore, member };
    }

    award(memberId, points, title) {
      const member = this.member(memberId);
      if (!member) return 0;
      member.stars += points;
      this.log(memberId, title, points);
      return points;
    }

    log(memberId, title, points, kind = 'stars') {
      const entry = ((this.d.kidAchievements ||= {})[memberId] ||= {});
      const list = (entry.activityLog ||= []);
      const at = this.now();
      list.unshift({
        id: `act-${at.getTime()}-${this.seq++}`, title, points, kind, at: at.getTime(),
        time: at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' Today'
      });
      if (list.length > 20) list.pop();
    }

    // A parent changes a balance by hand; it never goes below zero. It is not an entry in the activity log (it never was).
    adjustStars(memberId, delta) {
      const member = this.member(memberId);
      if (!member) return null;
      member.stars = Math.max(0, member.stars + delta);
      this.store.save();
      return member.stars;
    }

    // ---- managing missions ----
    // kid: a kid id, 'both' (one independent chore each) or 'either' (a wildcard).
    add({ title, kid, points = 3, routineType = 'general', frequency = 'daily' }) {
      const owners = kid === 'both' ? this.kids().map(k => k.id) : [kid];
      const made = owners.map(memberId => ({ id: this.newId('ch'), title, memberId, points, status: 'pending', routineType, frequency }));
      this.d.chores.push(...made);
      this.store.save();
      return made;
    }

    edit(id, fields) {
      const found = this.find(id);
      if (!found) return null;
      const allowed = found.kind === 'routine' ? ['title', 'memberId', 'routineType'] : ['title', 'memberId', 'points', 'routineType', 'frequency'];
      allowed.filter(k => k in fields).forEach(k => { found.item[k] = fields[k]; });
      this.store.save();
      return found.item;
    }

    remove(id) {
      const found = this.find(id);
      if (!found) return null;
      found.list.splice(found.list.indexOf(found.item), 1);
      this.store.save();
      return found.item;
    }

    // Drag and drop: to a kid's routine section ({ kid, routine }) or weekly / monthly section ({ kid, freq }),
    // placed before another item when given.
    move(id, { kid, routine, freq, beforeId } = {}) {
      const found = this.find(id);
      if (!found || (freq && found.kind === 'routine')) return false;   // routines are daily by nature
      const { item, list, kind } = found;
      item.memberId = kid;
      if (routine) {
        item.routineType = routine;
        if (kind === 'chore' && item.frequency && item.frequency !== 'daily') item.frequency = 'daily';
      }
      if (freq) { item.frequency = freq; item.routineType = 'general'; }
      list.splice(list.indexOf(item), 1);
      const before = beforeId && list.find(c => c.id === beforeId);
      if (before) list.splice(list.indexOf(before), 0, item); else list.push(item);
      this.store.save();
      return true;
    }

    reset(id) {
      const chore = this.d.chores.find(c => c.id === id);
      if (!chore) return false;
      chore.status = 'pending';
      chore.completedBy = null;
      this.store.save();
      return true;
    }

    // Routines reset daily; chores reset by `frequency` (daily default, weekly from Sunday, monthly).
    resetPeriodic() {
      const d = this.now();
      const day = toLocalYMD(d);
      const last = this.d.lastReset || {};
      if (last.day === day) return false;
      const week = toLocalYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
      const month = day.slice(0, 7);
      const due = { daily: true, weekly: last.week !== week, monthly: last.month !== month };
      (this.d.routines || []).forEach(r => { r.completedToday = false; });
      (this.d.chores || []).forEach(c => {
        if (c.status === 'completed' && due[c.frequency || 'daily']) { c.status = 'pending'; c.completedBy = null; }
      });
      this.d.lastReset = { day, week, month };
      this.store.save();
      return true;
    }

    // ---- the prize store ----
    // Spends a kid's stars on a prize; the parents get a to-do to hand it over. Null when it cannot be bought.
    buy(memberId, rewardId) {
      const member = this.member(memberId);
      const reward = (this.d.rewards || []).find(r => r.id === rewardId);
      if (!member || !reward || member.stars < reward.cost) return null;
      member.stars -= reward.cost;
      this.log(memberId, `Bought: ${reward.title}`, -reward.cost, 'spend');
      this.addTask({ title: `Give ${member.name}: ${reward.title}`, memberId: 'shared', priority: 'high', category: 'family', dueDate: this.today() });
      this.store.save();
      this.onPrize({ memberId, title: reward.title, cost: reward.cost });
      return reward;
    }

    addReward({ title, cost }) {
      title = String(title || '').trim();
      cost = parseInt(cost, 10);
      if (!title || !(cost > 0)) return null;
      const reward = { id: this.newId('rw'), title, cost };
      (this.d.rewards ||= []).push(reward);
      this.store.save();
      return reward;
    }

    // Blank titles and non-numbers are ignored; a prize costs at least one star.
    editReward(id, { title, cost } = {}) {
      const reward = (this.d.rewards || []).find(r => r.id === id);
      if (!reward) return null;
      if (title !== undefined) reward.title = String(title).trim() || reward.title;
      if (cost !== undefined) reward.cost = Math.max(1, parseInt(cost, 10) || reward.cost);
      this.store.save();
      return reward;
    }

    removeReward(id) {
      this.d.rewards = (this.d.rewards || []).filter(r => r.id !== id);
      this.store.save();
    }
  }

  const ledger = new MissionLedger(stateManager, { addTask: (task) => parentTasks.add(task) });
