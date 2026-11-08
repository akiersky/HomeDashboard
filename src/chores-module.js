/* --------------------------------------------------------------------------
     4. CHORES & ROUTINES MODULE
     -------------------------------------------------------------------------- */
  // Confetti cannons from both bottom corners (canvas, no library); skipped for reduced-motion users.
  function launchConfetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const colors = ['#f59e0b', '#fbbf24', '#2563eb', '#38bdf8', '#e11d48', '#fb7185', '#10b981', '#a78bfa'];
    const bits = [];
    const start = performance.now();
    const fire = (count) => {
      for (const side of [-1, 1]) {
        const x = side < 0 ? 0 : canvas.width;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI / 180) * (50 + Math.random() * 35);   // degrees above the horizon, aimed inward
          const speed = (canvas.height / 26) * (0.65 + Math.random() * 0.6) + 8;
          bits.push({
            x, y: canvas.height, vx: -side * Math.cos(angle) * speed, vy: -Math.sin(angle) * speed,
            w: 6 + Math.random() * 7, h: 9 + Math.random() * 8, round: Math.random() < 0.25,
            rot: Math.random() * 6.28, vr: -0.3 + Math.random() * 0.6, tilt: Math.random() * 6.28,
            c: colors[(Math.random() * colors.length) | 0], life: 1
          });
        }
      }
    };
    fire(90);
    setTimeout(() => fire(60), 220);
    setTimeout(() => fire(45), 520);
    let last = start;
    (function frame(now) {
      const dt = Math.min(3, (now - last) / 16.67); // frame-rate independent (a slow tablet shouldn't run in slow motion)
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const b of bits) {
        b.vx *= 0.985 ** dt; b.vy = b.vy * 0.985 ** dt + 0.38 * dt;   // drag + gravity
        b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt; b.tilt += 0.12 * dt;
        if (b.vy > 0 && b.y > canvas.height * 0.55) b.life -= 0.012 * dt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.scale(1, Math.cos(b.tilt));                    // flutter
        ctx.fillStyle = b.c;
        if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.w / 2, 0, 6.28); ctx.fill(); } else ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      const elapsed = now - start;
      if (elapsed < 7000 && (elapsed < 700 || bits.some(b => b.life > 0 && b.y < canvas.height + 40))) requestAnimationFrame(frame);
      else canvas.remove();
    })(start);
  }

  /* --- Chores page view helpers: one vocabulary of rows, cards, tags and meters --- */
  const icon = (name, cls = '') => `<i class="${name.includes(' ') ? name : 'fa-solid ' + name} ${cls}" aria-hidden="true"></i>`;
  const ROUTINE_ORDER = ['morning', 'afterschool', 'bedtime', 'general'];
  const ROUTINE_META = {
    morning: { label: 'Morning', icon: 'fa-sun' },
    afterschool: { label: 'After school', icon: 'fa-school' },
    bedtime: { label: 'Bedtime', icon: 'fa-moon' },
    general: { label: 'Daily chores', icon: 'fa-list-check' }
  };
  const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', annually: 'Yearly' };
  // Entries store a timestamp; older seed entries only have a text label.
  const logTime = (a) => {
    if (!a.at) return a.time;
    const d = new Date(a.at), days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return days === 0 ? clock : days === 1 ? `Yesterday ${clock}` : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const ptsHtml = (n) => `<span class="pts">${n < 0 ? '−' : '+'}${Math.abs(n)} ${icon('fa-star')}</span>`;
  const avatarHtml = (m, cls = '') => `<span class="avatar ${cls}" aria-hidden="true">${esc(m.avatar)}</span>`;
  const meterHtml = (pct) => `<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>`;
  const emptyHtml = (ic, text) => `<div class="empty-state">${icon(ic)}<span>${text}</span></div>`;
  const sectionHtml = (label, ic, body, aside = '') => `<section class="section"><h4 class="section-label">${icon(ic)} <span>${label}</span>${aside ? `<span class="tag">${aside}</span>` : ''}</h4>${body}</section>`;
  const itemRow = (item, { meta = '', edit = false } = {}) => {
    const routine = !!item._routine;
    const done = routine ? item.completedToday : item.status === 'completed';
    const type = routine ? 'routine' : 'chore';
    if (edit) return `<div class="check-row edit" data-item-id="${item.id}" data-item-type="${type}">
      <span class="drag-handle" data-drag role="button" aria-label="Drag ${esc(item.title)} to move">${icon('fa-grip-vertical')}</span>
      <span class="check-main"><span class="check-title">${esc(item.title)}</span><span class="check-meta">${ptsHtml(routine ? 1 : item.points)}</span></span>
      <button type="button" class="icon-quiet" data-edit-item aria-label="Edit ${esc(item.title)}">${icon('fa-pen')}</button>
      <button type="button" class="icon-quiet" data-delete-item aria-label="Delete ${esc(item.title)}">${icon('fa-trash')}</button>
    </div>`;
    return `<div class="check-row${done ? ' done' : ''}" data-item-id="${item.id}" data-item-type="${type}" role="checkbox" aria-checked="${!!done}" tabindex="0">
      <span class="check-box">${icon('fa-check')}</span>
      <span class="check-main"><span class="check-title">${esc(item.title)}</span>${meta ? `<span class="check-meta">${meta}</span>` : ''}</span>
      ${ptsHtml(routine ? 1 : item.points)}
    </div>`;
  };

  // 'both' assigns one independent chore to each kid; it only makes sense with two or more.
  const everyKidOption = (n) => n < 2 ? '' : `<option value="both">👫 ${n === 2 ? 'Both' : 'All'} kids</option>`;

  class ChoresModule {
    constructor({ gate, tasks, ledger, toast }) {
      this.gate = gate;
      this.tasks = tasks;
      this.ledger = ledger;
      this.toast = toast;
      this.activeTab = 'both'; // 'both' (Kids Dashboard) | a member id
      const saved = (k, d) => { try { return localStorage.getItem(k) || d; } catch (_) { return d; } };
      this.taskGroup = saved('taskGroup', 'priority'); // board columns: 'priority' | 'theme' | 'time'
      this.taskView = saved('taskView', 'board');      // 'board' | 'calendar'
      this.taskMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      this.initUI();
      this.render();
    }

    initUI() {
      // Header Add Item button (prompts PIN for kids' chores)
      document.getElementById('todos-add-item-btn')?.addEventListener('click', async () => {
        if (this.roleOf(this.activeTab) === 'parent') {
          this.openParentTaskModal(this.activeTab);
        } else if (await this.gate.ask('Add Chore', 'Enter 4-digit parent PIN to add a chore')) {
          this.openChoreModal();
        }
      });

      // Wildcard Header Add button (PIN-gated, opens the chore dialog on "Wildcard")
      document.getElementById('btn-add-wildcard-header')?.addEventListener('click', async () => {
        if (await this.gate.ask('Add wildcard', 'Enter your 4-digit parent PIN to add a wildcard.')) this.openChoreModal('either', null, { freq: 'weekly' });
      });
      this.bindToolbar(document.getElementById('view-chores') || document);
      document.getElementById('chore-member-select')?.addEventListener('change', (e) => {
        // Wildcards reset weekly by default, kid chores daily.
        if (!this.editingChoreId) document.getElementById('chore-frequency-select').value = e.target.value === 'either' ? 'weekly' : 'daily';
      });
      this.initStore();

      // Kid Chore Modal listeners
      document.getElementById('chore-modal-close')?.addEventListener('click', () => this.closeChoreModal());
      document.getElementById('chore-modal-cancel')?.addEventListener('click', () => this.closeChoreModal());
      document.getElementById('chore-modal-delete')?.addEventListener('click', () => {
        if (!this.editingChoreId) return;
        this.ledger.remove(this.editingChoreId);
        this.closeChoreModal();
        this.render();
        this.toast('Chore deleted');
      });
      document.getElementById('chore-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleCreateChore();
      });

      // Parent Task Modal listeners
      document.getElementById('parent-task-modal-close')?.addEventListener('click', () => this.closeParentTaskModal());
      document.getElementById('parent-task-modal-cancel')?.addEventListener('click', () => this.closeParentTaskModal());
      document.getElementById('parent-task-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleCreateParentTask();
      });

      this.ledger.onPrize = (prize) => this.celebratePurchase(prize);
      document.getElementById('goal-banner-close')?.addEventListener('click', () => document.getElementById('goal-banner').classList.remove('active'));
    }

    // Banner + confetti when a kid buys a prize.
    celebratePurchase({ memberId, title, cost }) {
      const member = stateManager.data.members.find(m => m.id === memberId);
      const banner = document.getElementById('goal-banner');
      if (!member || !banner) return;
      document.getElementById('goal-banner-title').textContent = `${member.name} got a prize!`;
      document.getElementById('goal-banner-name').textContent = title;
      document.getElementById('goal-banner-sub').textContent = `Spent ${cost} stars. A to-do was added for Mom and Dad.`;
      banner.classList.add('active');
      this.playChime();
      launchConfetti();
    }

    playChime() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = (this.audioCtx = this.audioCtx || new AudioCtx());
        if (ctx.state === 'suspended') ctx.resume();
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.07);
          osc.stop(ctx.currentTime + idx * 0.07 + 0.25);
        });
      } catch (_) {}
    }

    triggerStarPop(element, text = `${icon('fa-star')} +1`) {
      this.playChime();
      const star = document.createElement('div');
      star.innerHTML = text;
      star.style.position = 'fixed';
      const rect = element.getBoundingClientRect();
      star.style.left = `${rect.left + rect.width / 2}px`;
      star.style.top = `${rect.top}px`;
      star.style.color = 'var(--color-amber)';
      star.style.fontWeight = 'bold';
      star.style.fontSize = 'var(--text-lg)';
      star.style.zIndex = '9999';
      star.className = 'star-celebrate';
      document.body.appendChild(star);
      setTimeout(() => star.remove(), 750);
    }

    render() {
      // Synchronize with activeMemberId from stateManager
      const activeMem = stateManager.data.activeMemberId;
      if (activeMem === 'all' || !activeMem) {
        this.activeTab = 'both';
      } else if (this.roleOf(activeMem)) {
        this.activeTab = activeMem;
      }

      this.updateHeaderInfo();

      const kidsMainEl = document.getElementById('todos-kids-main-container');
      const kidPageEl = document.getElementById('todos-kid-page-container');
      const parentPageEl = document.getElementById('todos-parent-page-container');

      // Side-by-side kids boards & right wildcard panel (See ADR 0001 in family-dashboard-docs/adr/)
      if (this.activeTab === 'both') {
        if (kidsMainEl) kidsMainEl.style.display = '';
        if (kidPageEl) kidPageEl.style.display = 'none';
        if (parentPageEl) parentPageEl.style.display = 'none';

        this.syncKidCharts();
        this.renderWildcardChores();
      } else if (this.roleOf(this.activeTab) === 'kid') {
        if (kidsMainEl) kidsMainEl.style.display = 'none';
        if (kidPageEl) kidPageEl.style.display = 'flex';
        if (parentPageEl) parentPageEl.style.display = 'none';

        this.renderKidAchievementsPage(this.activeTab);
      } else if (this.roleOf(this.activeTab) === 'parent') {
        if (kidsMainEl) kidsMainEl.style.display = 'none';
        if (kidPageEl) kidPageEl.style.display = 'none';
        if (parentPageEl) parentPageEl.style.display = 'flex';

        this.renderParentTacticalPage(this.activeTab);
      }

    }

    roleOf(memberId) { return stateManager.data.members.find(m => m.id === memberId)?.role; }

    // One chart per kid, in member order, in a horizontally scrolling row beside the wildcard column.
    syncKidCharts() {
      const grid = document.getElementById('todos-kids-main-container');
      if (!grid) return;
      let row = document.getElementById('kid-charts-row');
      if (!row) {
        row = document.createElement('div');
        row.id = 'kid-charts-row';
        row.className = 'kid-charts-row';
        grid.insertBefore(row, grid.firstChild);
      }
      const kids = stateManager.data.members.filter(m => m.role === 'kid');
      const wanted = new Set(kids.map(k => `${k.id}-chore-chart`));
      row.querySelectorAll('.kid-chore-chart').forEach(el => { if (!wanted.has(el.id)) el.remove(); });
      kids.forEach(k => {
        const id = `${k.id}-chore-chart`;
        let el = document.getElementById(id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'kid-chore-chart glass-panel';
          el.id = id;
        }
        row.appendChild(el); // keeps member order
        this.renderKidChart(k.id);
      });
    }

    updateHeaderInfo() {
      const actions = document.getElementById('todos-header-actions');
      const addBtnText = document.getElementById('todos-add-item-text');

      document.getElementById('view-chores')?.classList.toggle('edit-mode', !!this.editMode);
      document.querySelectorAll('#todos-header-actions [data-toggle-edit]').forEach(b => {
        b.innerHTML = `${icon(this.editMode ? 'fa-check' : 'fa-pen')} ${this.editMode ? 'Done' : 'Edit'}`;
        b.classList.toggle('btn-primary', !!this.editMode);
        b.classList.toggle('btn-secondary', !this.editMode);
      });
      if (this.activeTab === 'both') {
        if (actions) actions.style.display = '';
        if (addBtnText) addBtnText.textContent = 'Add chore';
      } else {
        // Individual task dashboards (kids or parents) carry their own actions in the hero header.
        if (actions) actions.style.display = 'none';
      }
    }

    renderKidChart(memberId) {
      const el = document.getElementById(`${memberId}-chore-chart`);
      if (!el) return;

      const member = stateManager.data.members.find(m => m.id === memberId);
      if (!member) return;

      const pct = this.ledger.starPct(member);
      const next = this.ledger.nextPrize(member);
      const { byRoutine, daily } = this.ledger.itemsFor(memberId);
      const body = ROUTINE_ORDER.map(t => this.routineSection(t, t === 'general' ? daily : byRoutine[t], memberId)).join('');

      el.style.setProperty('--member-color', member.color);
      el.innerHTML = `
        <button type="button" class="card-head card-head--link" data-open-member="${member.id}" aria-label="Open ${esc(member.name)}'s page">
          ${avatarHtml(member)}
          <span class="card-head-main">
            <span class="card-title">${esc(member.name)}</span>
            <span class="stars">${icon('fa-star')} ${member.stars}${next && member.stars < next.cost ? ` / ${next.cost}` : ''}</span>
          </span>
          ${icon('fa-chevron-right', 'card-head-chevron')}
        </button>
        <div class="card-meter">
          ${meterHtml(pct)}
          ${next && member.stars >= next.cost ? `<p class="card-meta">${esc(this.prizeLine(member))}</p>` : ''}
        </div>
        <div class="card-body">
          ${body || emptyHtml('fa-list-check', 'No daily chores yet.')}
        </div>
      `;

      this.bindChecks(el);
      el.querySelector('[data-open-member]')?.addEventListener('click', () => this.openMember(member.id));
    }

    // In edit mode every section shows (even empty) as a drop target with an Add button.
    routineSection(type, items, kidId, edit = this.editMode) {
      items = items || [];
      if (!items.length && !edit) return '';
      const { label, icon: ic } = ROUTINE_META[type];
      const done = items.filter(i => i._routine ? i.completedToday : i.status === 'completed').length;
      return this.dropSection(label, ic, items, edit, done, { kid: kidId, routine: type });
    }

    // Section body; `where` = { kid, routine } or { kid, freq } describes what a drop or an Add here means.
    dropSection(label, ic, items, edit, done, where) {
      const attrs = Object.entries(where).map(([k, v]) => `data-${k}="${v}"`).join(' ');
      const rows = items.map(i => itemRow(i, { edit })).join('');
      if (!edit) return sectionHtml(label, ic, `<div class="stack">${rows}</div>`, `${done}/${items.length}`);
      return sectionHtml(label, ic, `<div class="stack drop-zone" data-drop ${attrs}>${rows}</div>
        <button type="button" class="btn-secondary btn-sm add-here" data-add-chore ${attrs}>${icon('fa-plus')} Add</button>`);
    }

    // One click handler for every check row (routines toggle; chores complete once). Edit mode: rows don't check off.
    bindChecks(root) {
      this.bindEdit(root);
      root.querySelectorAll('.check-row[data-item-id]:not(.edit)').forEach(row => {
        row.addEventListener('click', () => {
          const earned = this.ledger.tick(row.dataset.itemId);
          if (earned?.stars) this.triggerStarPop(row, `${icon('fa-star')} +${earned.stars}`);
          this.render();
        });
      });
    }

    async toggleEdit() {
      if (this.editMode) { this.editMode = false; this.render(); return; }
      if (await this.gate.ask('Edit chores', 'Enter your 4-digit parent PIN to edit chores.')) { this.editMode = true; this.render(); }
    }

    // Header/hero buttons: Prize store and Edit toggle.
    bindToolbar(root) {
      root.querySelectorAll('[data-open-store]').forEach(b => b.addEventListener('click', () => this.openStore()));
      root.querySelectorAll('[data-toggle-edit]').forEach(b => b.addEventListener('click', () => this.toggleEdit()));
    }

    // Edit-mode controls inside a rendered root: edit, delete, add-here, drag to move.
    bindEdit(root) {
      if (!this.editMode) return;
      root.querySelectorAll('[data-edit-item]').forEach(b => b.addEventListener('click', () =>
        this.openChoreModal(null, b.closest('[data-item-id]').dataset.itemId)));
      root.querySelectorAll('[data-delete-item]').forEach(b => b.addEventListener('click', () => {
        const id = b.closest('[data-item-id]').dataset.itemId;
        const found = this.ledger.find(id);
        if (!found || !confirm(`Delete "${found.item.title}"?`)) return;
        this.ledger.remove(id);
        this.render();
      }));
      root.querySelectorAll('[data-add-chore]').forEach(b => b.addEventListener('click', () =>
        this.openChoreModal(b.dataset.kid, null, { routine: b.dataset.routine, freq: b.dataset.freq })));
      root.querySelectorAll('[data-drag]').forEach(h => h.addEventListener('pointerdown', (e) => this.startDrag(e, h.closest('.check-row'))));
    }

    // Pointer-based drag (works for touch, pen and mouse): drop on any section to move the item there.
    startDrag(e, row) {
      if (e.button) return;
      e.preventDefault();
      const ghost = row.cloneNode(true);
      const rect = row.getBoundingClientRect();
      Object.assign(ghost.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', margin: 0, zIndex: 3000, pointerEvents: 'none', opacity: 0.9, boxShadow: '0 10px 28px rgba(0,0,0,.25)' });
      document.body.appendChild(ghost);
      row.classList.add('dragging');
      const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
      let zone = null;
      const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop]');
      const move = (ev) => {
        ghost.style.left = ev.clientX - dx + 'px';
        ghost.style.top = ev.clientY - dy + 'px';
        const z = targetAt(ev.clientX, ev.clientY);
        if (z !== zone) { zone?.classList.remove('drop-over'); zone = z; zone?.classList.add('drop-over'); }
      };
      const end = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        ghost.remove();
        row.classList.remove('dragging');
        zone?.classList.remove('drop-over');
        const z = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null;
        if (z) this.dropItem(row.dataset.itemId, z, ev.clientY);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    }

    dropItem(id, zone, y) {
      const found = this.ledger.find(id);
      if (!found) return;
      const { kid, routine, freq } = zone.dataset;
      // Position: before the first row of this kind that sits below the drop point, else last.
      const rows = [...zone.querySelectorAll('.check-row:not(.dragging)')].filter(r => r.dataset.itemType === found.kind);
      const below = rows.find(r => r.getBoundingClientRect().top + r.offsetHeight / 2 > y);
      this.ledger.move(id, { kid, routine, freq, beforeId: below?.dataset.itemId });
      this.render();
    }

    remember(key, value) {
      try { localStorage.setItem(key, value); } catch (_) { /* private mode: just don't persist */ }
    }

    openMember(id) {
      this.activeTab = id;
      stateManager.setActiveMember(id);
      this.render();
    }

    renderWildcardChores() {
      const container = document.getElementById('wildcard-chores-container');
      if (!container) return;

      const wildcards = this.ledger.wildcards();
      const kids = this.ledger.kids();

      if (!wildcards.length) {
        container.innerHTML = emptyHtml('fa-bolt', 'No wildcard chores right now.');
        return;
      }

      container.innerHTML = wildcards.map(c => {
        const claimedBy = c.completedBy && stateManager.data.members.find(m => m.id === c.completedBy);
        const edit = this.editMode;
        const action = edit ? `<div class="item-actions">
            <button type="button" class="btn-secondary btn-sm" data-edit-item>${icon('fa-pen')} Edit</button>
            <button type="button" class="btn-secondary btn-sm" data-delete-item>${icon('fa-trash')} Delete</button>
          </div>`
          : c.status === 'completed'
          ? `<span class="tag tag--done">${icon('fa-circle-check')} Claimed by ${esc(claimedBy ? claimedBy.name : 'a kid')}</span>`
          : `<div class="item-actions">${kids.map(k => `
              <button type="button" class="btn-secondary btn-sm" data-claim="${c.id}" data-member-id="${k.id}">${esc(k.avatar)} ${esc(k.name)}</button>`).join('')}
            </div>`;
        return `
          <div class="item-card${c.status === 'completed' && !edit ? ' done' : ''}" data-item-id="${c.id}">
            <div class="item-head"><span class="check-title">${esc(c.title)}</span>${ptsHtml(c.points)}</div>
            ${action}
          </div>`;
      }).join('');

      this.bindEdit(container);
      container.querySelectorAll('[data-claim]').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = this.ledger.claim(btn.dataset.claim, btn.dataset.memberId);
          if (r) this.triggerStarPop(btn, `${icon('fa-star')} +${r.chore.points}`);
          this.render();
        });
      });
    }

    /* ---- Prize store: kids spend stars; the parents get a to-do ---- */
    initStore() {
      document.getElementById('store-modal-close')?.addEventListener('click', () => this.closeStore());
      document.getElementById('store-modal')?.addEventListener('click', (e) => { if (e.target.id === 'store-modal') this.closeStore(); });
    }

    openStore() {
      this.storeEdit = false;
      this.armed = null;
      this.renderStore();
      document.getElementById('store-modal')?.classList.add('active');
    }

    closeStore() { document.getElementById('store-modal')?.classList.remove('active'); }

    renderStore() {
      const body = document.getElementById('store-body');
      if (!body) return;
      const kids = this.ledger.kids();
      const rewards = this.ledger.rewards();
      const edit = this.storeEdit;

      const bal = kids.map(k => `<span class="store-bal" style="--member-color:${k.color}">${avatarHtml(k)} <b>${esc(k.name)}</b> ${icon('fa-star')} ${k.stars}</span>`).join('');
      const rows = rewards.map(w => edit ? `
        <div class="store-item" data-reward="${w.id}">
          <input type="text" class="store-title-input" value="${esc(w.title)}" maxlength="40" aria-label="Prize name" />
          <input type="number" class="store-cost-input" value="${w.cost}" min="1" max="999" aria-label="Star cost" />
          <button type="button" class="icon-quiet" data-del-reward aria-label="Delete ${esc(w.title)}">${icon('fa-trash')}</button>
        </div>` : `
        <div class="store-item" data-reward="${w.id}">
          <span class="store-item-title">${icon('fa-gift')} ${esc(w.title)}</span>
          <span class="pts">${w.cost} ${icon('fa-star')}</span>
          <span class="store-buy">${kids.map(k => {
            const can = k.stars >= w.cost, armed = this.armed === `${k.id}|${w.id}`;
            return `<button type="button" class="btn-${armed ? 'primary' : 'secondary'} btn-sm" data-buy="${w.id}" data-kid="${k.id}" ${can ? '' : 'disabled'}>${armed ? 'Tap to confirm' : `${esc(k.avatar)} ${esc(k.name)}`}</button>`;
          }).join('')}</span>
        </div>`).join('') || emptyHtml('fa-gift', 'No prizes yet. Tap Edit prizes to add some.');

      body.innerHTML = `
        <div class="store-balances">${bal}</div>
        <div class="stack">${rows}</div>
        ${edit ? `<div class="store-item store-add">
          <input type="text" id="store-new-title" class="store-title-input" placeholder="New prize…" maxlength="40" />
          <input type="number" id="store-new-cost" class="store-cost-input" placeholder="Stars" min="1" max="999" />
          <button type="button" class="btn-primary btn-sm" id="store-add-btn">${icon('fa-plus')} Add</button>
        </div>` : ''}
        <div class="store-foot">
          <button type="button" class="btn-secondary btn-sm" id="store-edit-toggle">${icon(edit ? 'fa-check' : 'fa-pen')} ${edit ? 'Done' : 'Edit prizes'}</button>
        </div>`;

      body.querySelector('#store-edit-toggle').addEventListener('click', async () => {
        if (this.storeEdit) { this.storeEdit = false; this.renderStore(); return; }
        if (await this.gate.ask('Edit prizes', 'Enter your 4-digit parent PIN to edit the prize store.')) { this.storeEdit = true; this.renderStore(); }
      });
      body.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
        const key = `${b.dataset.kid}|${b.dataset.buy}`;
        if (this.armed !== key) { // two taps so a stray touch can't spend stars
          this.armed = key; this.renderStore();
          clearTimeout(this.armTimer); this.armTimer = setTimeout(() => { this.armed = null; this.renderStore(); }, 4000);
          return;
        }
        this.armed = null;
        if (this.ledger.buy(b.dataset.kid, b.dataset.buy)) { this.closeStore(); this.render(); }
      }));
      body.querySelectorAll('.store-item[data-reward]').forEach(row => {
        const id = row.dataset.reward;
        row.querySelector('.store-title-input')?.addEventListener('change', (e) => this.ledger.editReward(id, { title: e.target.value }));
        row.querySelector('.store-cost-input')?.addEventListener('change', (e) => this.ledger.editReward(id, { cost: e.target.value }));
        row.querySelector('[data-del-reward]')?.addEventListener('click', () => {
          const reward = this.ledger.rewards().find(r => r.id === id);
          if (reward && confirm(`Delete prize "${reward.title}"?`)) this.ledger.removeReward(id);
        });
      });
      body.querySelector('#store-add-btn')?.addEventListener('click', () => {
        this.ledger.addReward({ title: document.getElementById('store-new-title').value, cost: document.getElementById('store-new-cost').value });
      });
    }

    prizeLine(member) {
      const prize = this.ledger.nextPrize(member);
      return !prize ? 'No prizes yet' : member.stars >= prize.cost ? `Ready to buy: ${prize.title}` : `${prize.cost - member.stars} more stars for ${prize.title}`;
    }

    renderKidAchievementsPage(kidId) {
      const container = document.getElementById('todos-kid-page-container');
      const member = stateManager.data.members.find(m => m.id === kidId);
      if (!container || !member) return;

      const pct = this.ledger.starPct(member);
      const { byRoutine, daily, weekly, monthly } = this.ledger.itemsFor(kidId);
      const wildcards = this.ledger.wildcards().filter(c => c.status === 'pending');

      const missions = ROUTINE_ORDER.map(t => this.routineSection(t, t === 'general' ? daily : byRoutine[t], kidId)).join('');
      const wildcardSection = wildcards.length ? sectionHtml('Bonus wildcards', 'fa-bolt', `<div class="stack">${wildcards.map(w => `
        <div class="item-card">
          <div class="item-head"><span class="check-title">${esc(w.title)}</span>${ptsHtml(w.points)}</div>
          <button type="button" class="btn-primary btn-sm" data-claim="${w.id}">Claim</button>
        </div>`).join('')}</div>`) : '';

      const cadence = (label, ic, items, freq) => this.dropSection(label, ic, items, this.editMode,
        items.filter(c => c.status === 'completed').length, { kid: kidId, freq });

      const log = this.ledger.activity(kidId).map(a => `
        <div class="log-row"><span>${esc(a.title)}</span><span class="log-meta">${a.kind === 'goal' ? `<span class="tag tag--done">${icon('fa-trophy')} Goal</span>` : a.points ? ptsHtml(a.points) : ''} <span>${esc(logTime(a))}</span></span></div>`).join('')
        || emptyHtml('fa-clock-rotate-left', 'No stars earned yet today.');

      container.style.setProperty('--member-color', member.color);
      container.innerHTML = `
        <div class="kid-hero-card glass-panel">
          <div class="hero-main">
            ${avatarHtml(member, 'avatar--lg')}
            <h3 class="hero-title">${esc(member.name)}'s stars</h3>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-row">
              <div class="hero-count">${member.stars}<span class="card-meta"> stars</span></div>
            </div>
            ${meterHtml(pct)}
            <p class="card-meta">${esc(this.prizeLine(member))}</p>
          </div>
          <div class="hero-actions">
            <button type="button" class="btn-primary" data-open-store>${icon('fa-gift')} Prize store</button>
            <button type="button" class="btn-secondary" data-toggle-edit>${icon(this.editMode ? 'fa-check' : 'fa-pen')} ${this.editMode ? 'Done' : 'Edit'}</button>
          </div>
        </div>

        <div class="kid-page-grid">
          <div class="panel glass-panel">
            <div class="panel-head"><h3>${icon('fa-clipboard-check')} Today</h3></div>
            ${missions || emptyHtml('fa-list-check', 'No missions today.')}
            ${wildcardSection}
          </div>
          <div class="stack-col">
            <div class="panel glass-panel">
              <div class="panel-head"><h3>${icon('fa-calendar-week')} Weekly &amp; monthly</h3></div>
              ${cadence('Weekly', 'fa-calendar-check', weekly, 'weekly')}
              ${cadence('Monthly', 'fa-calendar-days', monthly, 'monthly')}
            </div>
            <div class="panel glass-panel">
              <div class="panel-head"><h3>${icon('fa-clock-rotate-left')} Recent stars</h3></div>
              <div class="stack">${log}</div>
            </div>
          </div>
        </div>`;

      this.bindToolbar(container);
      this.bindChecks(container);
      container.querySelectorAll('[data-claim]').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = this.ledger.claim(btn.dataset.claim, kidId);
          if (r) this.triggerStarPop(btn, `${icon('fa-star')} +${r.chore.points}`);
          this.render();
        });
      });
    }

    renderParentTacticalPage(parentId) {
      const container = document.getElementById('todos-parent-page-container');
      const member = stateManager.data.members.find(m => m.id === parentId);
      if (!container || !member) return;

      const tasks = this.tasks;
      const today = tasks.today();
      const b = tasks.board(parentId, this.taskGroup);
      const { open, done, recurring, group: g } = b;

      const dueTag = (t) => {
        if (!t.dueDate || t.completed) return '';
        const d = ParentTasks.daysUntil(t.dueDate, today);
        if (d < 0) return `<span class="tag tag--high">Overdue ${-d}d</span>`;
        if (d === 0) return '<span class="tag tag--medium">Due today</span>';
        return `<span class="tag">${icon('fa-regular fa-calendar')} ${d === 1 ? 'Tomorrow' : d <= 7 ? `In ${d} days` : esc(t.dueDate)}</span>`;
      };

      const card = (t) => `
        <article class="task-card${t.completed ? ' done' : ''}" data-task-id="${t.id}" draggable="true">
          <div class="task-card-top">
            <button type="button" class="check-box" role="checkbox" aria-checked="${!!t.completed}" aria-label="Done: ${esc(t.title)}">${icon('fa-check')}</button>
            <button type="button" class="task-title" data-edit-task>${esc(t.title)}</button>
            <button type="button" class="icon-quiet icon-quiet--danger" data-delete-task aria-label="Delete ${esc(t.title)}">${icon('fa-trash-can')}</button>
          </div>
          ${t.notes ? `<p class="check-meta task-notes">${esc(t.notes)}</p>` : ''}
          <div class="check-meta tag-line">
            ${g.hide !== 'priority' ? `<span class="tag tag--${t.priority || 'medium'}">${PRIORITY_LABEL[t.priority || 'medium']}</span>` : ''}
            ${g.hide !== 'category' ? `<span class="tag">${CATEGORY_LABEL[t.category] || esc(t.category || 'General')}</span>` : ''}
            ${g.hide !== 'due' ? dueTag(t) : ''}
            ${t.memberId === 'shared' ? '<span class="tag">Shared</span>' : ''}
          </div>
        </article>`;

      const column = (key, label, items, { drop = true, extra = '' } = {}) => `
        <section class="board-col" data-col="${key}" ${drop ? '' : 'data-nodrop'} aria-label="${label}">
          <header class="board-col-head"><h4>${label}</h4><span class="tag">${items.length}</span>${extra}</header>
          <div class="board-col-body">${items.map(card).join('') || '<p class="board-empty">Nothing here</p>'}</div>
        </section>`;

      const board = b.columns.map(c => column(c.key, c.label, c.tasks, { drop: c.droppable })).join('')
        + column('done', 'Done', done, { extra: done.length ? '<button type="button" class="link-btn board-clear" data-clear-done>Clear</button>' : '' });

      const repeatCard = (t) => `
        <div class="item-card" data-task-id="${t.id}">
          <div class="item-head"><span class="tag">${icon('fa-repeat')} ${FREQ_LABEL[t.frequency]}</span>${dueTag(t)}</div>
          <button type="button" class="task-title" data-edit-task>${esc(t.title)}</button>
          ${t.notes ? `<p class="check-meta">${esc(t.notes)}</p>` : ''}
          <div class="item-actions item-actions--between">
            <span class="check-meta">Last done: ${esc(t.lastCompletedDate || 'never')}</span>
            <span class="item-actions">
              <button type="button" class="btn-secondary btn-sm" data-complete>${icon('fa-circle-check')} Done</button>
              <button type="button" class="icon-quiet icon-quiet--danger" data-delete-task aria-label="Delete ${esc(t.title)}">${icon('fa-trash-can')}</button>
            </span>
          </div>
        </div>`;

      const monthStart = new Date(this.taskMonth);
      const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const taskCalendar = () => {
        const lead = monthStart.getDay();
        const days = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
        const cells = Math.ceil((lead + days) / 7) * 7;
        const chip = (t) => `<button type="button" class="tc-chip tc-${t.priority || 'medium'}" data-task-id="${t.id}" draggable="true" title="${esc(t.title)}">${ParentTasks.repeats(t) ? icon('fa-repeat') + ' ' : ''}<span>${esc(t.title)}</span></button>`;
        const grid = Array.from({ length: cells }, (_, i) => {
          const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - lead + i);
          const ymd = toLocalYMD(d), list = b.scheduled[ymd] || [];
          const inMonth = d.getMonth() === monthStart.getMonth();
          return `<div class="tc-day${inMonth ? '' : ' tc-other'}${ymd === today ? ' tc-today' : ''}" data-date="${ymd}">
            <button type="button" class="tc-num" data-add-date="${ymd}" aria-label="Add task on ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}">${d.getDate()}</button>
            ${list.slice(0, 3).map(chip).join('')}${list.length > 3 ? `<span class="tc-more">+${list.length - 3} more</span>` : ''}
          </div>`;
        }).join('');
        return `
          <div class="tc-head">
            <div class="item-actions">
              <button type="button" class="icon-quiet" data-month="-1" aria-label="Previous month">${icon('fa-chevron-left')}</button>
              <h4 class="tc-title">${monthLabel}</h4>
              <button type="button" class="icon-quiet" data-month="1" aria-label="Next month">${icon('fa-chevron-right')}</button>
            </div>
            <button type="button" class="btn-secondary btn-sm" data-month="0">Today</button>
          </div>
          <div class="tc-weekdays">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span>${d}</span>`).join('')}</div>
          <div class="tc-grid">${grid}</div>
          <div class="tc-undated"><span class="card-meta">No date${b.undated.length ? ' · drag onto a day to schedule' : ''}</span>
            <div class="tag-line">${b.undated.map(chip).join('') || '<span class="card-meta">Everything has a date.</span>'}</div>
          </div>`;
      };

      container.innerHTML = `
        <div class="parent-hero-card glass-panel" style="--member-color: ${member.color};">
          <div class="hero-main">
            ${avatarHtml(member, 'avatar--lg')}
            <div>
              <h3 class="hero-title">${esc(member.name)}'s tasks</h3>
              <p class="card-meta">${open.length} open · ${recurring.length} repeating · ${done.length} done</p>
            </div>
          </div>
          <form class="quick-add hero-quick" id="tactical-quick-add-form">
            <input type="text" id="tactical-quick-title" placeholder="Quick add a task" aria-label="Quick add task" enterkeyhint="done" autocomplete="off" required />
          </form>
          <div class="hero-actions">
            <button type="button" class="btn-primary" id="btn-parent-new-task">${icon('fa-plus')} Add task</button>
          </div>
        </div>

        <div class="parent-layout">
          <div class="panel glass-panel">
            <div class="panel-head">
              <div class="seg" role="group" aria-label="View">${[['board', 'fa-table-columns', 'Board'], ['calendar', 'fa-calendar-days', 'Calendar']].map(([k, ic, label]) =>
                `<button type="button" class="seg-btn${this.taskView === k ? ' active' : ''}" data-taskview="${k}" aria-pressed="${this.taskView === k}">${icon(ic)} ${label}</button>`).join('')}</div>
              ${this.taskView === 'board' ? `<div class="group-by"><span class="card-meta">Group by</span>
                <div class="seg" role="group">${b.groups.map(({ key, label }) =>
                  `<button type="button" class="seg-btn${g.key === key ? ' active' : ''}" data-group="${key}" aria-pressed="${g.key === key}">${label}</button>`).join('')}</div>
              </div>` : ''}
            </div>
            ${this.taskView === 'board' ? `<div class="board">${board}</div>` : taskCalendar()}
          </div>

          <div class="panel glass-panel">
            <div class="panel-head"><h3>${icon('fa-repeat')} Repeating</h3></div>
            <div class="stack">${recurring.map(repeatCard).join('') || emptyHtml('fa-repeat', 'Nothing repeats yet. Add a task and set Repeats.')}</div>
          </div>
        </div>`;

      const toast = (message, undo) => this.toast(message, undo && { label: 'Undo', run: undo });
      container.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => { this.taskGroup = b.dataset.group; this.remember('taskGroup', this.taskGroup); this.render(); }));
      container.querySelectorAll('[data-taskview]').forEach(b => b.addEventListener('click', () => { this.taskView = b.dataset.taskview; this.remember('taskView', this.taskView); this.render(); }));
      container.querySelectorAll('[data-month]').forEach(b => b.addEventListener('click', () => {
        const n = +b.dataset.month, t = new Date();
        this.taskMonth = n === 0 ? new Date(t.getFullYear(), t.getMonth(), 1) : new Date(this.taskMonth.getFullYear(), this.taskMonth.getMonth() + n, 1);
        this.render();
      }));
      container.querySelectorAll('[data-add-date]').forEach(b => b.addEventListener('click', () => this.openParentTaskModal(parentId, null, { dueDate: b.dataset.addDate })));
      container.querySelectorAll('.tc-chip').forEach(c => c.addEventListener('click', () => this.openParentTaskModal(parentId, tasks.find(c.dataset.taskId))));

      container.querySelector('#tactical-quick-add-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('tactical-quick-title').value.trim();
        if (!title) return;
        tasks.add({ title, memberId: parentId, frequency: 'none', notes: '', priority: 'medium', category: 'general', dueDate: '' });
        this.render();
      });

      container.querySelectorAll('[data-task-id]').forEach(el => {
        const id = el.dataset.taskId;
        el.querySelector('[data-edit-task]')?.addEventListener('click', () => this.openParentTaskModal(parentId, tasks.find(id)));
        el.querySelector('.check-box')?.addEventListener('click', () => {
          tasks.toggle(id);
          this.render();
          container.querySelector(`[data-task-id="${id}"] .check-box`)?.focus();
        });
        el.querySelector('[data-complete]')?.addEventListener('click', () => {
          const r = tasks.toggle(id);
          this.render();
          if (r) toast(`Done. Next due ${r.task.dueDate}.`, r.undo);
        });
        el.querySelector('[data-delete-task]')?.addEventListener('click', () => {
          const undo = tasks.remove(id);
          this.render();
          if (undo) toast('Task deleted', undo);
        });
      });

      container.querySelector('[data-clear-done]')?.addEventListener('click', () => {
        const { count, undo } = tasks.clearDone(parentId);
        if (undo) toast(`Cleared ${count} done`, undo);
      });

      // Drag a card to another column to change its priority / theme / urgency (mouse; touch uses the edit dialog).
      container.querySelectorAll('.task-card, .tc-chip').forEach(c => {
        c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.taskId); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
        c.addEventListener('dragend', () => c.classList.remove('dragging'));
      });
      const dropOn = (el, apply) => {
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop-over'); });
        el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-over'); });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          apply(e.dataTransfer.getData('text/plain'));
        });
      };
      container.querySelectorAll('.board-col:not([data-nodrop])').forEach(col => dropOn(col, (id) => tasks.dropOnColumn(id, g.key, col.dataset.col)));
      container.querySelectorAll('.tc-day').forEach(day => dropOn(day, (id) => tasks.schedule(id, day.dataset.date)));

      container.querySelector('#btn-parent-new-task')?.addEventListener('click', () => this.openParentTaskModal(parentId));
    }

    // Add a chore, or edit a chore/routine when `itemId` is given. `where` pre-fills { routine, freq }.
    openChoreModal(defaultKidId = null, itemId = null, where = {}) {
      const modal = document.getElementById('chore-modal');
      const select = document.getElementById('chore-member-select');
      if (!modal || !select) return;
      const found = itemId ? this.ledger.find(itemId) : null;
      const item = found?.item || null;
      const isRoutine = found?.kind === 'routine';
      this.editingChoreId = item ? item.id : null;

      const kids = this.ledger.kids();
      const selectedId = item ? item.memberId : (defaultKidId || (kids.some(k => k.id === this.activeTab) ? this.activeTab : kids[0]?.id));
      select.innerHTML = kids.map(m => `
        <option value="${m.id}" ${selectedId === m.id ? 'selected' : ''}>${esc(m.avatar)} ${esc(m.name)}</option>
      `).join('') + (isRoutine ? '' : `<option value="either" ${selectedId === 'either' ? 'selected' : ''}>⚡ Wildcard (any kid)</option>`)
        + (item ? '' : everyKidOption(kids.length));

      document.getElementById('chore-title-input').value = item ? item.title : '';
      document.getElementById('chore-points-select').value = String(item && !isRoutine ? item.points : 3);
      document.getElementById('chore-frequency-select').value = where.freq || item?.frequency || 'daily';
      document.getElementById('chore-routine-select').value = where.routine || item?.routineType || 'general';
      // Routines are always 1 star and daily, so those fields don't apply.
      ['chore-points-select', 'chore-frequency-select'].forEach(id => { document.getElementById(id).closest('.form-group').hidden = isRoutine; });
      document.getElementById('chore-modal-title').textContent = item ? 'Edit Chore' : 'Add Chore';
      document.getElementById('chore-modal-submit').textContent = item ? 'Save' : 'Add Chore';
      document.getElementById('chore-modal-delete').hidden = !item;
      modal.classList.add('active');
    }

    closeChoreModal() {
      document.getElementById('chore-modal')?.classList.remove('active');
      this.editingChoreId = null;
    }

    handleCreateChore() {
      const title = document.getElementById('chore-title-input').value.trim();
      if (!title) return;
      const memberId = document.getElementById('chore-member-select').value;
      const points = parseInt(document.getElementById('chore-points-select').value) || 3;
      const frequency = document.getElementById('chore-frequency-select')?.value || 'daily';
      const routineType = document.getElementById('chore-routine-select')?.value || 'general';

      const existing = this.editingChoreId && this.ledger.find(this.editingChoreId);
      if (existing) this.ledger.edit(this.editingChoreId, { title, memberId, points, routineType, frequency });
      else this.ledger.add({ title, kid: memberId, points, routineType, frequency });

      this.closeChoreModal();
      this.render();
      this.toast(`✓ Chore "${title}" ${existing ? 'saved' : 'added'}!`);
    }

    // Add a task, or edit one when `task` is given.
    openParentTaskModal(defaultMember = stateManager.data.members.find(m => m.role === 'parent')?.id, task = null, defaults = {}) {
      const modal = document.getElementById('parent-task-modal');
      const select = document.getElementById('parent-task-member-select');
      if (!modal || !select) return;
      const memberId = task ? task.memberId : defaultMember;

      const parents = stateManager.data.members.filter(m => m.role === 'parent');
      select.innerHTML = parents.map(p => `
        <option value="${p.id}" ${memberId === p.id ? 'selected' : ''}>${esc(p.avatar)} ${esc(p.name)}</option>
      `).join('') + `<option value="shared" ${memberId === 'shared' ? 'selected' : ''}>Shared / Both</option>`;

      const $ = (id) => document.getElementById(id);
      $('parent-task-id').value = task ? task.id : '';
      $('parent-task-modal-title').lastElementChild.textContent = task ? 'Edit task' : 'Add task';
      $('parent-task-submit').textContent = task ? 'Save' : 'Add task';
      $('parent-task-title-input').value = task ? task.title : '';
      $('parent-task-priority-select').value = task ? (task.priority || 'medium') : 'medium';
      $('parent-task-category-select').value = task ? (task.category || 'general') : 'general';
      $('parent-task-date-input').value = task ? (task.dueDate || '') : (defaults.dueDate || '');
      $('parent-task-frequency-select').value = task ? (task.frequency || 'none') : 'none';
      $('parent-task-notes-input').value = task ? (task.notes || '') : '';
      $('parent-task-calendar-check').checked = task ? !!task.showOnCalendar : false;
      modal.classList.add('active');
    }

    closeParentTaskModal() {
      document.getElementById('parent-task-modal')?.classList.remove('active');
    }

    handleCreateParentTask() {
      const $ = (id) => document.getElementById(id).value;
      const title = $('parent-task-title-input').trim();
      if (!title) return;
      const fields = {
        title,
        memberId: $('parent-task-member-select'),
        priority: $('parent-task-priority-select'),
        category: $('parent-task-category-select'),
        dueDate: $('parent-task-date-input'),
        frequency: $('parent-task-frequency-select'),
        notes: $('parent-task-notes-input').trim(),
        showOnCalendar: document.getElementById('parent-task-calendar-check').checked
      };
      const id = $('parent-task-id');
      const existing = id && this.tasks.find(id);
      if (existing) this.tasks.update(id, fields);
      else this.tasks.add(fields);

      this.closeParentTaskModal();
      this.render();
      this.toast(`✓ Task "${title}" ${existing ? 'saved' : 'added'}`);
    }
  }
