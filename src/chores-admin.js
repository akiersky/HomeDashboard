/* --------------------------------------------------------------------------
     5b. CHORES ADMIN MODULE
     -------------------------------------------------------------------------- */
  class ChoresAdminModule {
    constructor({ gate, ledger, editChore }) {
      this.gate = gate;
      this.ledger = ledger;
      this.editChore = editChore; // opens the chore dialog for a chore id
      this.activeTab = 'chores';
      this.initUI();
    }

    initUI() {
      document.getElementById('admin-lock-btn')?.addEventListener('click', async () => {
        if (await this.gate.ask()) this.openAdminPanel('chores');
      });
      document.getElementById('admin-panel-close')?.addEventListener('click', () => this.closeAdminPanel());

      // Admin tab switching
      document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.activeTab = tab.dataset.adminTab;
          this.renderAdminBody();
        });
      });
    }

    openAdminPanel(tab = 'chores') {
      this.activeTab = tab;
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.adminTab === tab));
      this.renderAdminBody();
      document.getElementById('admin-panel-modal').classList.add('active');
    }

    closeAdminPanel() {
      document.getElementById('admin-panel-modal').classList.remove('active');
    }

    renderAdminBody() {
      const body = document.getElementById('admin-body');
      if (!body) return;
      if (this.activeTab === 'chores') body.innerHTML = this.buildChoresToHTML();
      else if (this.activeTab === 'wildcards') body.innerHTML = this.buildWildcardsHTML();
      else if (this.activeTab === 'stars') body.innerHTML = this.buildStarsHTML();
      else if (this.activeTab === 'pin') body.innerHTML = this.buildPinChangeHTML();
      this.bindAdminBodyEvents();
    }

    buildChoresToHTML() {
      const kids = this.ledger.kids();
      const chores = (stateManager.data.chores || []).filter(c => c.memberId !== 'either');
      const rows = chores.map(c => {
        const member = stateManager.data.members.find(m => m.id === c.memberId);
        const statusBadge = c.status === 'completed'
          ? `<span style="font-size:0.72rem;color:var(--color-success-text);font-weight:700;">Done</span>`
          : `<span style="font-size:0.72rem;color:var(--text-muted);">Pending</span>`;
        const freqLabel = c.frequency === 'weekly' ? 'Weekly' : c.frequency === 'monthly' ? 'Monthly' : 'Daily';
        const freqBadge = `<span style="font-size:0.68rem;padding:2px 8px;border-radius:100px;background:var(--card-bg);border:1px solid var(--panel-border);color:var(--text-muted);">${freqLabel}</span>`;
        return `
          <div class="admin-chore-row">
            <span style="font-size:1.1rem;">${esc(member?.avatar)}</span>
            <span class="admin-chore-title">${esc(c.title)}</span>
            <span class="admin-chore-pts">+${c.points} stars</span>
            ${freqBadge}
            ${statusBadge}
            ${c.status === 'completed'
              ? `<button class="btn-success-sm" data-action="reset-chore" data-id="${c.id}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Reset</button>`
              : ''}
            <button class="btn-secondary-sm" data-action="edit-chore" data-id="${c.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit</button>
            <button class="btn-danger-sm" data-action="delete-chore" data-id="${c.id}"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Remove</button>
          </div>
        `;
      }).join('') || `<div style="color:var(--text-muted);text-align:center;padding:16px;">No kid chores yet.</div>`;

      const assignOpts = kids.map(k => `<option value="${k.id}">${esc(k.avatar)} ${esc(k.name)}</option>`).join('') + everyKidOption(kids.length);
      return `
        <div class="admin-section-title">Kid Chores &amp; Routines</div>
        ${rows}
        <div class="admin-add-form" data-form="add-chore">
          <input type="text" id="admin-chore-title" placeholder="Chore name…" style="flex:2;" />
          <select id="admin-chore-member">${assignOpts}</select>
          <select id="admin-chore-pts">
            <option value="1">1 stars</option><option value="2">2 stars</option>
            <option value="3" selected>3 stars</option><option value="5">5 stars</option><option value="8">8 stars</option><option value="10">10 stars</option>
          </select>
          <select id="admin-chore-freq">
            <option value="daily" selected>Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <select id="admin-chore-type">
            <option value="general">General</option>
            <option value="morning">Morning</option>
            <option value="afterschool">After School</option>
            <option value="bedtime">Bedtime</option>
          </select>
          <button class="btn-primary" data-action="add-chore" style="flex-shrink:0;">+ Add</button>
        </div>
      `;
    }

    buildWildcardsHTML() {
      const wildcards = this.ledger.wildcards();
      const rows = wildcards.map(c => {
        const claimedBy = c.completedBy ? stateManager.data.members.find(m => m.id === c.completedBy) : null;
        return `
          <div class="admin-chore-row" id="admin-wc-row-${c.id}">
            <i class="fa-solid fa-bolt" aria-hidden="true"></i>
            <span class="admin-chore-title">${esc(c.title)}</span>
            <span class="admin-chore-pts">+${c.points} stars</span>
            ${c.status === 'completed'
              ? `<span style="font-size:0.72rem;color:var(--color-success-text);font-weight:700;">${claimedBy ? esc(claimedBy.name) : 'Done'}</span>
                 <button class="btn-success-sm" data-action="reset-chore" data-id="${c.id}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Reset</button>`
              : `<span style="font-size:0.72rem;color:var(--text-muted);">Available</span>`}
            <button class="btn-secondary-sm" data-action="edit-wildcard" data-id="${c.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit</button>
            <button class="btn-danger-sm" data-action="delete-chore" data-id="${c.id}"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Remove</button>
          </div>
        `;
      }).join('') || `<div style="color:var(--text-muted);text-align:center;padding:16px;">No wildcard chores yet.</div>`;

      return `
        <div class="admin-section-title">Wildcard Chores & Rewards</div>
        <p style="font-size:0.8rem;color:var(--text-secondary);margin:-6px 0 14px 0;">Only parents can create or edit wildcard rewards. Kids can claim available wildcards on their board.</p>
        ${rows}
        <div class="admin-add-form" data-form="add-wildcard" style="margin-top:14px;">
          <input type="text" id="admin-wc-title" placeholder="New wildcard chore name…" style="flex:2;" />
          <select id="admin-wc-pts">
            <option value="3">3 stars</option><option value="4">4 stars</option>
            <option value="5">5 stars</option><option value="6">6 stars</option>
            <option value="8" selected>8 stars</option><option value="10">10 stars</option>
            <option value="12">12 stars</option><option value="15">15 stars</option>
            <option value="20">20 stars</option>
          </select>
          <button class="btn-primary" data-action="add-wildcard" style="flex-shrink:0;">+ Add Wildcard</button>
        </div>
      `;
    }

    buildStarsHTML() {
      const kids = this.ledger.kids();
      return kids.map(k => `
        <div class="admin-star-row" style="border-left: 4px solid ${k.color};">
          <span class="admin-star-name" style="color:${k.color}">${esc(k.avatar)} ${esc(k.name)}</span>
          <span class="admin-star-count" id="star-count-${k.id}">${k.stars} stars</span>
          <div class="admin-star-btns">
            <button class="admin-adj-btn" data-action="adj-stars" data-member="${k.id}" data-delta="-5">−5</button>
            <button class="admin-adj-btn" data-action="adj-stars" data-member="${k.id}" data-delta="-1">−1</button>
            <button class="admin-adj-btn" data-action="adj-stars" data-member="${k.id}" data-delta="1">+1</button>
            <button class="admin-adj-btn" data-action="adj-stars" data-member="${k.id}" data-delta="5">+5</button>
            <button class="admin-adj-btn" data-action="adj-stars" data-member="${k.id}" data-delta="10">+10</button>
          </div>
        </div>
      `).join('');
    }

    buildPinChangeHTML() {
      return `
        <div class="admin-section-title">Change Parent PIN</div>
        <div style="display:flex;flex-direction:column;gap:12px;max-width:320px;">
          <div id="pin-change-msg" style="font-size:0.85rem;display:none;"></div>
          <button class="btn-primary" data-action="change-pin" style="align-self:flex-start;">Set New PIN</button>
        </div>
      `;
    }

    bindAdminBodyEvents() {
      const body = document.getElementById('admin-body');
      if (!body) return;

      // Delete / reset chores
      body.querySelectorAll('[data-action="delete-chore"]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.ledger.remove(btn.dataset.id);
          this.renderAdminBody();
        });
      });

      body.querySelectorAll('[data-action="edit-chore"]').forEach(btn => {
        btn.addEventListener('click', () => this.editChore(btn.dataset.id));
      });

      body.querySelectorAll('[data-action="reset-chore"]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.ledger.reset(btn.dataset.id);
          this.renderAdminBody();
        });
      });

      // Edit wildcard inline
      body.querySelectorAll('[data-action="edit-wildcard"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const chore = this.ledger.find(id)?.item;
          if (!chore) return;
          const rowEl = document.getElementById(`admin-wc-row-${id}`);
          if (!rowEl) return;

          const starOptions = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map(pt =>
            `<option value="${pt}" ${chore.points === pt ? 'selected' : ''}>${pt} stars</option>`
          ).join('');

          rowEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap;">
              <input type="text" id="edit-wc-title-${id}" value="${chore.title.replace(/"/g, '&quot;')}" style="flex:2;min-width:140px;padding:5px 8px;background:var(--input-bg);border:1px solid var(--panel-border);border-radius:6px;color:var(--text-primary);font-size:0.85rem;" />
              <select id="edit-wc-pts-${id}" style="padding:5px 8px;background:var(--input-bg);border:1px solid var(--panel-border);border-radius:6px;color:var(--text-primary);font-size:0.85rem;">
                ${starOptions}
              </select>
              <button class="btn-primary" data-action="save-wildcard" data-id="${id}" style="padding:5px 12px;font-size:0.8rem;">Save</button>
              <button class="btn-secondary-sm" data-action="cancel-wildcard" style="padding:5px 10px;">Cancel</button>
            </div>
          `;

          rowEl.querySelector('[data-action="save-wildcard"]')?.addEventListener('click', () => {
            const newTitle = document.getElementById(`edit-wc-title-${id}`)?.value.trim();
            const newPts = parseInt(document.getElementById(`edit-wc-pts-${id}`)?.value) || chore.points;
            if (!newTitle) return;
            this.ledger.edit(id, { title: newTitle, points: newPts });
            this.renderAdminBody();
          });

          rowEl.querySelector('[data-action="cancel-wildcard"]')?.addEventListener('click', () => {
            this.renderAdminBody();
          });
        });
      });

      // Add kid chore
      body.querySelector('[data-action="add-chore"]')?.addEventListener('click', () => {
        const title = document.getElementById('admin-chore-title')?.value.trim();
        const memberId = document.getElementById('admin-chore-member')?.value;
        const points = parseInt(document.getElementById('admin-chore-pts')?.value) || 3;
        const frequency = document.getElementById('admin-chore-freq')?.value || 'daily';
        const routineType = document.getElementById('admin-chore-type')?.value || 'general';
        if (!title) return;
        this.ledger.add({ title, kid: memberId, points, routineType, frequency });
        this.renderAdminBody();
      });

      // Add wildcard
      body.querySelector('[data-action="add-wildcard"]')?.addEventListener('click', () => {
        const title = document.getElementById('admin-wc-title')?.value.trim();
        const points = parseInt(document.getElementById('admin-wc-pts')?.value) || 8;
        if (!title) return;
        this.ledger.add({ title, kid: 'either', points, routineType: 'general', frequency: 'weekly' });
        this.renderAdminBody();
      });

      // Star adjustments
      body.querySelectorAll('[data-action="adj-stars"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const memberId = btn.dataset.member;
          const delta = parseInt(btn.dataset.delta);
          const balance = this.ledger.adjustStars(memberId, delta);
          const el = document.getElementById(`star-count-${memberId}`);
          if (balance !== null && el) el.textContent = `${balance} stars`;
        });
      });

      // Change PIN
      body.querySelector('[data-action="change-pin"]')?.addEventListener('click', async () => {
        if (!(await this.gate.setNewPin())) return;
        const msg = document.getElementById('pin-change-msg');
        msg.textContent = 'PIN updated successfully!';
        msg.style.color = 'var(--color-success)';
        msg.style.display = '';
      });
    }
  }
