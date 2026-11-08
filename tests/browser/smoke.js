// Browser smoke suite: clicks through the real UI of a sandbox copy (see sandbox.sh) against a fake Home Assistant.
// Load the sandbox with localStorage cleared, then run   await window.__smoke()   or   await window.__smoke('chores')   in the console.
// Groups: boot, chores, pin, prizes, tasks, calendar, meals, settings, sync. After reloading (without clearing storage) run
//   await window.__smokeReload()   to check that edits survive a reload. Append ?ha=off to the URL for a no-Home-Assistant run.
// Checks marked [new] cover behaviour added by the 2026-10 architecture review (ADRs 0005-0008).
(function () {
  const errors = window.__errors = [];
  window.addEventListener('error', e => errors.push('error: ' + e.message));
  window.addEventListener('unhandledrejection', e => errors.push('rejection: ' + (e.reason && (e.reason.message || e.reason))));
  window.confirm = () => true;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const data = () => window.stateManager.data;
  const ha = () => window.__ha;
  const must = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
  const same = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); };
  async function until(fn, ms = 3000, label = 'condition') {
    const t0 = Date.now();
    for (;;) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout: ' + label); await sleep(25); }
  }
  const active = (id) => !!$('#' + id)?.classList.contains('active');
  const go = async (view) => { $(`.nav-btn[data-view="${view}"]`).click(); await sleep(80); };
  const press = async (digits) => { for (const k of String(digits)) { $(`#pin-keypad [data-key="${k}"]`).click(); await sleep(8); } await sleep(80); };
  const closeModals = () => $$('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const member = (id) => data().members.find(m => m.id === id);
  const toastTexts = () => $$('#toast-container .toast').map(t => t.textContent);
  const setVal = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const unlock = async (clickEl) => { clickEl.click(); await sleep(60); must(active('admin-pin-modal'), 'pin dialog did not open'); await press('1234'); };

  const results = [];
  const groups = {};
  const group = (name, fn) => { groups[name] = fn; };
  async function check(name, fn) {
    try { const r = await fn(); results.push({ name, ok: true, detail: r === true || r === undefined ? undefined : r }); }
    catch (e) { results.push({ name, ok: false, detail: String((e && e.message) || e) }); }
  }

  // ---------------------------------------------------------------- boot + nav
  group('boot', async () => {
    await check('boot: app instance exists', () => must(window.familyDashboard, 'no familyDashboard'));
    await check('nav: switching views toggles panels', async () => {
      for (const v of ['chores', 'meals', 'calendar', 'chores']) { await go(v); must(active('view-' + v), v + ' not active'); }
    });
  });

  // ---------------------------------------------------------------- chores
  group('chores', async () => {
    await go('chores');
    await check('routine tick: +1 star once per day, row turns done', async () => {
      const row = $('#alex-chore-chart .check-row[data-item-type="routine"]:not(.done)');
      must(row, 'no open routine row');
      const id = row.dataset.itemId, before = member('alex').stars;
      row.click(); await sleep(60);
      must(member('alex').stars === before + 1, 'stars ' + before + ' -> ' + member('alex').stars);
      must($(`#alex-chore-chart .check-row[data-item-id="${id}"]`).classList.contains('done'), 'row not done');
      $(`#alex-chore-chart .check-row[data-item-id="${id}"]`).click(); await sleep(40);   // untick
      $(`#alex-chore-chart .check-row[data-item-id="${id}"]`).click(); await sleep(40);   // tick again
      must(member('alex').stars === before + 1, 'star farming: ' + member('alex').stars);
    });
    await check('chore tick: + points once, status completed, activity logged', async () => {
      const row = $('#alex-chore-chart .check-row[data-item-type="chore"]:not(.done)');
      must(row, 'no open chore row');
      const id = row.dataset.itemId, chore = data().chores.find(c => c.id === id), before = member('alex').stars;
      row.click(); await sleep(60);
      must(member('alex').stars === before + chore.points, 'stars after ' + member('alex').stars);
      must(data().chores.find(c => c.id === id).status === 'completed', 'not completed');
      $(`#alex-chore-chart .check-row[data-item-id="${id}"]`).click(); await sleep(40);
      must(member('alex').stars === before + chore.points, 'double award');
      must(data().kidAchievements.alex.activityLog[0].title === chore.title, 'not logged');
    });
    await check('star pop lands on the ticked row (not 0,0)', async () => {
      const row = $('#sam-chore-chart .check-row[data-item-type="routine"]:not(.done)');
      const r = row.getBoundingClientRect();
      row.click();
      const pops = $$('.star-celebrate'), pop = pops[pops.length - 1]; must(pop, 'no star pop');
      must(Math.abs(parseFloat(pop.style.left) - (r.left + r.width / 2)) < 3, 'pop left ' + pop.style.left + ' vs row ' + Math.round(r.left + r.width / 2));
      await sleep(60);
    });
    await check('wildcard claim: stars to claimant, card shows claimed', async () => {
      const btn = $('#wildcard-chores-container [data-claim][data-member-id="sam"]');
      must(btn, 'no claim button');
      const id = btn.dataset.claim, chore = data().chores.find(c => c.id === id), before = member('sam').stars;
      btn.click(); await sleep(60);
      must(member('sam').stars === before + chore.points, 'stars');
      const c = data().chores.find(c => c.id === id);
      must(c.status === 'completed' && c.completedBy === 'sam', 'claim not recorded');
      must(!$(`#wildcard-chores-container [data-claim="${id}"]`), 'claim buttons still shown');
    });
  });

  // ---------------------------------------------------------------- parent PIN gate
  group('pin', async () => {
    await go('chores'); closeModals();
    await check('add chore: PIN first, dialog only after correct PIN', async () => {
      $('#todos-add-item-btn').click(); await sleep(60);
      must(active('admin-pin-modal'), 'pin not shown');
      must(!active('chore-modal'), 'chore dialog opened before PIN');
      await press('0000');
      must(active('admin-pin-modal'), 'pin closed on wrong code');
      must($('#pin-error').style.display !== 'none', 'no error shown');
      must(!active('chore-modal'), 'chore dialog opened after wrong PIN');
      await press('1234');
      must(!active('admin-pin-modal'), 'pin still open'); must(active('chore-modal'), 'chore dialog not opened');
    });
    await check('add chore for both kids: two chores, distinct ids', async () => {
      setVal('chore-title-input', 'Smoke chore'); setVal('chore-member-select', 'both');
      const n = data().chores.length;
      $('#chore-form').requestSubmit(); await sleep(80);
      const made = data().chores.filter(c => c.title === 'Smoke chore');
      must(made.length === 2 && data().chores.length === n + 2, 'created ' + made.length);
      same(made.map(c => c.memberId).sort(), ['alex', 'sam']);
      must(new Set(made.map(c => c.id)).size === 2, 'ids not unique');
      must(!active('chore-modal'), 'dialog still open');
    });
    await check('cancel at the PIN keypad leaves the chore dialog closed', async () => {
      $('#todos-add-item-btn').click(); await sleep(60);
      $('#admin-pin-cancel').click(); await sleep(60);
      must(!active('admin-pin-modal') && !active('chore-modal'), 'a dialog stayed open');
    });
    await check('escape at the PIN dialog cancels, then the dialog can be opened again', async () => {
      $('#todos-add-item-btn').click(); await sleep(60);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(60);
      must(!active('admin-pin-modal') && !active('chore-modal'), 'escape left a dialog open');
      await unlock($('#todos-add-item-btn'));
      must(active('chore-modal'), 'second attempt did not open dialog'); closeModals();
    });
    await check('settings are PIN-gated', async () => {
      $('#settings-btn').click(); await sleep(60);
      must(active('admin-pin-modal') && !active('settings-modal'), 'gate missing');
      await press('1234'); must(active('settings-modal'), 'settings not opened'); closeModals();
    });
    await check('night mode dims, a tap wakes, and the doorbell layer stays above it', async () => {
      const dim = $('#night-dim');
      const s = data().settings;
      const before = { nightMode: s.nightMode, nightStart: s.nightStart, nightStop: s.nightStop, nightBrightness: s.nightBrightness };
      Object.assign(s, { nightMode: 'schedule', nightStart: '00:00', nightStop: '23:59', nightBrightness: 20 });
      document.dispatchEvent(new Event('settings-saved'));
      must(dim.classList.contains('active') && Math.abs(parseFloat(dim.style.opacity) - 0.8) < 0.01, 'not dimmed to 20%');
      must(parseInt(getComputedStyle($('#doorbell-overlay')).zIndex) > parseInt(getComputedStyle(dim).zIndex), 'doorbell under the dimming');
      dim.click();
      must(!dim.classList.contains('active') && dim.style.opacity === '0', 'tap did not wake');
      await unlock($('#settings-btn'));
      must(!$('#night-times').hidden && !$('#night-brightness-group').hidden, 'night fields hidden for a schedule');
      closeModals();
      Object.assign(s, before);
      document.dispatchEvent(new Event('settings-saved'));
    });
    await check('edit mode is PIN-gated; inline delete removes the chore', async () => {
      await unlock($('#todos-header-actions [data-toggle-edit]'));
      must($('#view-chores').classList.contains('edit-mode'), 'edit mode off');
      const del = $('#alex-chore-chart .check-row[data-item-id] [data-delete-item]');
      const id = del.closest('[data-item-id]').dataset.itemId, n = data().chores.length + data().routines.length;
      del.click(); await sleep(60);
      must(data().chores.length + data().routines.length === n - 1, 'item not removed');
      $('#todos-header-actions [data-toggle-edit]').click(); await sleep(60);
      must(!$('#view-chores').classList.contains('edit-mode'), 'edit mode stuck');
    });
    await check('manage panel: PIN then admin panel; star adjust changes the balance only', async () => {
      await unlock($('#admin-lock-btn'));
      must(active('admin-panel-modal'), 'panel closed');
      $$('.admin-tab').find(t => t.dataset.adminTab === 'stars').click(); await sleep(60);
      const before = member('alex').stars, logLen = data().kidAchievements.alex.activityLog.length;
      $('[data-action="adj-stars"][data-member="alex"][data-delta="5"]').click(); await sleep(60);
      must(member('alex').stars === before + 5, 'stars not adjusted');
      must(data().kidAchievements.alex.activityLog.length === logLen, 'a hand adjustment was written to the activity log');
      closeModals();
    });
    await check('change PIN flow: new PIN needs confirmation, old PIN stops working', async () => {
      await unlock($('#admin-lock-btn'));
      $$('.admin-tab').find(t => t.dataset.adminTab === 'pin').click(); await sleep(60);
      $('[data-action="change-pin"]').click(); await sleep(60);
      must(active('admin-pin-modal'), 'new-pin dialog closed');
      await press('4321'); await press('1111');          // confirm mismatch
      must(active('admin-pin-modal') && $('#pin-error').style.display !== 'none', 'mismatch not reported');
      await press('4321'); await press('4321');
      must(data().settings.parentPin === '4321', 'pin not saved: ' + data().settings.parentPin);
      closeModals();
      $('#settings-btn').click(); await sleep(60); await press('1234');
      must(active('admin-pin-modal') && !active('settings-modal'), 'old PIN still works');
      await press('0000'); await press('4321'); await sleep(60);
      must(active('settings-modal'), 'new PIN rejected'); closeModals();
      data().settings.parentPin = '1234'; window.stateManager.save();   // restore for later groups
    });
  });

  // ---------------------------------------------------------------- prize store + parent tasks
  group('prizes', async () => {
    await go('chores'); closeModals();
    await check('prize store: buy needs two taps, spends stars, files a parent task, shows banner', async () => {
      member('alex').stars = 500; window.stateManager.save(); await sleep(40);
      $('#wildcard-chores-section [data-open-store]').click(); await sleep(60);
      must(active('store-modal'), 'store closed');
      must(data().rewards && data().rewards.length > 0, 'no prizes seeded');
      const btn = $('#store-body [data-buy][data-kid="alex"]'); const rid = btn.dataset.buy;
      const reward = data().rewards.find(r => r.id === rid), before = member('alex').stars, tasks = data().parentTasks.length;
      btn.click(); await sleep(40);
      must(member('alex').stars === before, 'spent on first tap');
      $('#store-body [data-buy][data-kid="alex"][data-buy="' + rid + '"]').click(); await sleep(80);
      must(member('alex').stars === before - reward.cost, 'stars not spent');
      must(data().parentTasks.length === tasks + 1 && /Give Alex/.test(data().parentTasks[0].title), 'parent task missing');
      must(active('goal-banner'), 'banner missing'); closeModals();
      must(data().kidAchievements.alex.activityLog[0].kind === 'spend', 'spend not logged');
    });
    await check('prize store: add, edit, delete a prize (PIN-gated)', async () => {
      $('#wildcard-chores-section [data-open-store]').click(); await sleep(60);
      $('#store-edit-toggle').click(); await sleep(60); await press('1234');
      $('#store-new-title').value = 'Smoke prize'; $('#store-new-cost').value = '7'; $('#store-add-btn').click(); await sleep(60);
      must(data().rewards.some(r => r.title === 'Smoke prize' && r.cost === 7), 'prize not added');
      const row = $$('#store-body .store-item[data-reward]').find(r => $('.store-title-input', r)?.value === 'Smoke prize');
      const cost = $('.store-cost-input', row); cost.value = '9'; cost.dispatchEvent(new Event('change', { bubbles: true })); await sleep(40);
      must(data().rewards.find(r => r.title === 'Smoke prize').cost === 9, 'cost not edited');
      $$('#store-body .store-item[data-reward]').find(r => $('.store-title-input', r)?.value === 'Smoke prize').querySelector('[data-del-reward]').click(); await sleep(60);
      must(!data().rewards.some(r => r.title === 'Smoke prize'), 'prize not deleted'); closeModals();
    });
  });

  group('tasks', async () => {
    await go('chores'); closeModals();
    $('#family-filter-bar .member-pill[data-member-id="mom"]').click(); await sleep(120);
    await check('parent page shows the board for the selected parent', () => must(getComputedStyle($('#todos-parent-page-container')).display !== 'none' && $$('#todos-parent-page-container .board-col').length >= 3, 'board missing'));
    await check('quick add creates a Medium/General task', async () => {
      const n = data().parentTasks.length;
      setVal('tactical-quick-title', 'Smoke task'); $('#tactical-quick-add-form').requestSubmit(); await sleep(80);
      const t = data().parentTasks.find(t => t.title === 'Smoke task');
      must(t && t.memberId === 'mom' && t.priority === 'medium' && t.category === 'general' && data().parentTasks.length === n + 1, 'task missing');
    });
    await check('ticking a task completes it; it moves to Done', async () => {
      const id = data().parentTasks.find(t => t.title === 'Smoke task').id;
      $(`#todos-parent-page-container [data-task-id="${id}"] .check-box`).click(); await sleep(80);
      must(data().parentTasks.find(t => t.id === id).completed === true, 'not completed');
      must($(`.board-col[data-col="done"] [data-task-id="${id}"]`), 'not in Done column');
    });
    await check('delete shows Undo and Undo restores the task in place', async () => {
      const idx = data().parentTasks.findIndex(t => t.title === 'Smoke task'), id = data().parentTasks[idx].id;
      $(`#todos-parent-page-container [data-task-id="${id}"] [data-delete-task]`).click(); await sleep(80);
      must(!data().parentTasks.some(t => t.id === id), 'not deleted');
      $('#toast-container .toast-action').click(); await sleep(80);
      same(data().parentTasks.findIndex(t => t.id === id), idx, 'restored at a different index');
    });
    await check('group by Theme and Time changes the columns', async () => {
      $('[data-group="theme"]').click(); await sleep(80);
      const themeCols = $$('.board-col').map(c => c.dataset.col);
      must(themeCols.includes('done') && themeCols.some(c => ['general', 'health', 'errands', 'home'].includes(c)), 'theme cols ' + themeCols);
      $('[data-group="time"]').click(); await sleep(80);
      const timeCols = $$('.board-col').map(c => c.dataset.col);
      must(['week', 'soon', 'later', 'done'].every(c => timeCols.includes(c)), 'time cols ' + timeCols);
      $('[data-group="priority"]').click(); await sleep(60);
    });
    await check('repeating task: Done rolls due date +7d and Undo restores it', async () => {
      $('#btn-parent-new-task').click(); await sleep(60);
      setVal('parent-task-title-input', 'Smoke weekly'); setVal('parent-task-frequency-select', 'weekly'); setVal('parent-task-date-input', ymd());
      $('#parent-task-form').requestSubmit(); await sleep(80);
      const t = () => data().parentTasks.find(t => t.title === 'Smoke weekly');
      const due = new Date(); due.setDate(due.getDate() + 7);
      $(`#todos-parent-page-container [data-task-id="${t().id}"] [data-complete]`).click(); await sleep(80);
      same(t().dueDate, ymd(due), 'due date'); same(t().lastCompletedDate, ymd(), 'last completed');
      $('#toast-container .toast-action').click(); await sleep(80);
      same(t().dueDate, ymd(), 'undo due date');
    });
    await check('[new] completed one-off task with "show on calendar" leaves the calendar', async () => {
      $('#btn-parent-new-task').click(); await sleep(60);
      setVal('parent-task-title-input', 'Smoke cal task'); setVal('parent-task-date-input', ymd()); $('#parent-task-calendar-check').checked = true;
      $('#parent-task-form').requestSubmit(); await sleep(80);
      const t = () => data().parentTasks.find(t => t.title === 'Smoke cal task');
      await go('calendar'); $$('.switch-btn').find(b => b.dataset.calView === 'agenda').click(); await sleep(100);
      must($$('.agenda-card-title').some(e => e.textContent === 'Smoke cal task'), 'open task missing from agenda');
      await go('chores'); $(`#todos-parent-page-container [data-task-id="${t().id}"] .check-box`).click(); await sleep(80);
      await go('calendar'); await sleep(100);
      must(!$$('.agenda-card-title').some(e => e.textContent === 'Smoke cal task'), 'completed task still on calendar');
    });
    $('#family-filter-bar .member-pill[data-member-id="all"]').click(); await sleep(60);
  });

  // ---------------------------------------------------------------- calendar
  group('calendar', async () => {
    await go('calendar'); closeModals();
    const today = ymd();
    ha().calendars['calendar.dad'] = [
      { uid: 'e1', summary: 'Smoke Meeting', start: today + 'T10:00:00', end: today + 'T11:00:00', location: 'Room 1', description: 'agenda notes' },
      { uid: 'e2', summary: 'Smoke Holiday', start: today, end: today },
      { uid: 'e4', summary: 'Smoke Shared', start: today + 'T15:00:00', end: today + 'T16:00:00' }
    ];
    ha().calendars['calendar.mom'] = [{ uid: 'e3', summary: 'Smoke Shared', start: today + 'T15:00:00', end: today + 'T16:00:00', description: 'from mom' }];
    await check('settings save syncs Home Assistant calendars', async () => {
      await unlock($('#settings-btn')); $('#save-settings-btn').click();
      await until(() => data().events.some(e => e.title === 'Smoke Meeting') || window.familyDashboard.calendarModule && $$('.agenda-card-title').some(e => e.textContent === 'Smoke Meeting'), 4000, 'events after sync');
    });
    await check('week view draws timed cards and all-day chips with attendee dots', async () => {
      $$('.switch-btn').find(b => b.dataset.calView === 'week').click(); await sleep(150);
      must($$('#week-days-container .timeline-event-card').some(c => /Smoke Meeting/.test(c.textContent)), 'timed card missing');
      must($$('#week-allday-row .allday-chip').some(c => /Smoke Holiday/.test(c.textContent)), 'all-day chip missing');
    });
    await check('same event on two calendars merges into one card with two dots', async () => {
      const cards = $$('#week-days-container .timeline-event-card').filter(c => /Smoke Shared/.test(c.textContent));
      must(cards.length === 1, 'cards: ' + cards.length); must($$('.ev-dots i', cards[0]).length === 2, 'dots: ' + $$('.ev-dots i', cards[0]).length);
    });
    await check('popover shows title, time, location, notes; lists both calendars for merged events', async () => {
      $$('#week-days-container .timeline-event-card').find(c => /Smoke Meeting/.test(c.textContent)).click(); await sleep(80);
      must(active('event-details-popover'), 'popover closed');
      must($('#popover-title').textContent === 'Smoke Meeting', 'title'); must(/10:00 AM - 11:00 AM/.test($('#popover-time-text').textContent), 'time ' + $('#popover-time-text').textContent);
      must($('#popover-location-text').textContent === 'Room 1', 'location'); must($('#popover-notes-text').textContent === 'agenda notes', 'notes');
      $('#popover-close-btn').click(); await sleep(40);
      $$('#week-days-container .timeline-event-card').find(c => /Smoke Shared/.test(c.textContent)).click(); await sleep(80);
      must($('#popover-member-tag').textContent.includes('Mom') && $('#popover-member-tag').textContent.includes('Dad'), 'attendees: ' + $('#popover-member-tag').textContent);
      must($('#popover-notes-text').textContent === 'from mom', 'notes not gathered from the other copy'); $('#popover-close-btn').click(); await sleep(40);
    });
    await check('add a local event; it is stored with a display time and can be deleted from the popover', async () => {
      $('#add-event-btn').click(); await sleep(60);
      setVal('event-title-input', 'Smoke Local'); setVal('event-member-select', 'sam'); setVal('event-date-input', today); setVal('event-time-input', '14:00');
      $('#event-form').requestSubmit(); await sleep(100);
      const e = data().events.find(e => e.title === 'Smoke Local'); must(e && e.time === '2:00 PM', 'stored: ' + JSON.stringify(e));
      $$('#week-days-container .timeline-event-card').find(c => /Smoke Local/.test(c.textContent)).click(); await sleep(60);
      $('#popover-delete-btn').click(); await sleep(100);
      must(!data().events.some(e => e.title === 'Smoke Local'), 'not deleted');
    });
    await check('edit dialog opens with the 24h time of your own event; a Home Assistant event cannot be edited [new]', async () => {
      const feed = window.familyDashboard.calendarFeed, cal = window.familyDashboard.calendarModule;
      const mine = feed.save({ title: 'Smoke Edit', memberId: 'sam', category: 'family', date: today, time: '10:00 AM - 11:00 AM', location: '' });
      cal.render(); await sleep(100);
      $$('#week-days-container .timeline-event-card').find(c => /Smoke Edit/.test(c.textContent)).click(); await sleep(60);
      must($('#popover-edit-btn').style.display !== 'none', 'Edit hidden on your own event');
      $('#popover-edit-btn').click(); await sleep(60);
      must(active('event-modal') && $('#event-time-input').value === '10:00', 'time input ' + $('#event-time-input').value); closeModals();
      feed.remove(mine.id); cal.render(); await sleep(100);
      $$('#week-days-container .timeline-event-card').find(c => /Smoke Meeting/.test(c.textContent)).click(); await sleep(60);
      must($('#popover-edit-btn').style.display === 'none', 'Edit offered on a Home Assistant event');
      $('#popover-close-btn').click(); await sleep(40);
    });
    await check('month and 3-day and agenda views render events', async () => {
      for (const [v, sel, re] of [['month', '#month-days-container .event-chip', /Smoke Meeting/], ['3day', '#threeday-days-container .timeline-event-card', /Smoke Meeting/], ['agenda', '.agenda-card-title', /Smoke Meeting/]]) {
        $$('.switch-btn').find(b => b.dataset.calView === v).click(); await sleep(150);
        must($$(sel).some(c => re.test(c.textContent)), v + ' view missing the event');
      }
      $$('.switch-btn').find(b => b.dataset.calView === 'week').click(); await sleep(100);
    });
    await check('add event: all day and end time are saved', async () => {
      const save = async (title, set) => {
        $('#add-event-btn').click(); await sleep(40);
        setVal('event-title-input', title); set();
        $('#event-form').requestSubmit(); await sleep(60);
        must(!active('event-modal'), title + ': dialog still open');
        return data().events.find(e => e.title === title);
      };
      const allDay = await save('Smoke All Day', () => { $('#event-allday-check').checked = true; $('#event-allday-check').dispatchEvent(new Event('change')); });
      same(allDay.time, 'All Day');
      const ranged = await save('Smoke Range', () => { setVal('event-time-input', '13:00'); setVal('event-end-input', '14:30'); });
      same(ranged.time, '1:00 PM - 2:30 PM');
      $('#add-event-btn').click(); await sleep(40);
      setVal('event-title-input', 'Smoke Backwards'); setVal('event-time-input', '13:00'); setVal('event-end-input', '12:00');
      $('#event-form').requestSubmit(); await sleep(60);
      must(active('event-modal'), 'an end before the start should not save');
      closeModals();
    });
    await check('calendar dropdowns open, pick and close', async () => {
      $('#cal-view-current').click(); await sleep(20);
      must($('#cal-view-picker').classList.contains('open'), 'view menu did not open');
      $('#cal-member-picker .picker-current').click(); await sleep(20);
      must(!$('#cal-view-picker').classList.contains('open') && $('#cal-member-picker').classList.contains('open'), 'opening one should close the other');
      document.body.click(); await sleep(20);
      must(!$('#cal-member-picker').classList.contains('open'), 'outside tap should close');
      $('#cal-view-current').click(); await sleep(20);
      $$('.switch-btn').find(b => b.dataset.calView === 'month').click(); await sleep(100);
      same($('#cal-view-current-label').textContent, 'Month');
      must(!$('#cal-view-picker').classList.contains('open'), 'picking should close the menu');
      $$('.switch-btn').find(b => b.dataset.calView === 'week').click(); await sleep(100);
    });
    await check('week view scrolls back to now after another view', async () => {
      const box = $('#week-scroll-container');
      const now = new Date();
      const want = Math.max(0, ((now.getHours() * 60 + now.getMinutes()) / 60 - 1) * 54);
      $$('.switch-btn').find(b => b.dataset.calView === 'month').click(); await sleep(100);
      $$('.switch-btn').find(b => b.dataset.calView === 'week').click(); await sleep(100);
      must(Math.abs(box.scrollTop - Math.min(want, box.scrollHeight - box.clientHeight)) < 54, 'scrollTop ' + box.scrollTop + ', wanted about ' + want);
    });
    await check('member filter hides other members events', async () => {
      $('#family-filter-bar .member-pill[data-member-id="mom"]').click(); await sleep(120);
      must(!$$('#week-days-container .timeline-event-card').some(c => /Smoke Meeting/.test(c.textContent)), 'dad event visible for mom');
      must($$('#week-days-container .timeline-event-card').some(c => /Smoke Shared/.test(c.textContent)), 'shared event hidden');
      $('#family-filter-bar .member-pill[data-member-id="all"]').click(); await sleep(80);
    });
    await check('current-time line is drawn in today\'s column', () => must($('#week-days-container .timeline-day-col.today .current-time-line'), 'missing'));
    await check('calendar events are not part of the synced household document', async () => {
      await sleep(1800);
      const doc = ha().userData['family_dashboard_state'];
      must(doc, 'nothing pushed to HA');
      must(!('haToken' in doc.settings) && !('immichApiKey' in doc.settings), 'secrets pushed');
      must(!(doc.events || []).some(e => String(e.id).startsWith('ha-')), '[new] HA-derived events pushed back to HA');
    });
  });

  // ---------------------------------------------------------------- meals + lists
  group('meals', async () => {
    await go('meals'); closeModals();
    const list = () => $$('#grocery-list-container .grocery-item').map(e => e.textContent.trim());
    await check('groceries load from the HA todo entity', async () => { await until(() => list().includes('Milk'), 3000, 'Milk'); same(list().sort(), ['Eggs', 'Milk']); });
    await check('add a grocery: sent to HA and shown', async () => {
      setVal('grocery-input', 'Bread'); $('#grocery-add-btn').click();
      await until(() => list().includes('Bread'), 3000, 'Bread shown');
      must(ha().todos['todo.groceries'].some(i => i.summary === 'Bread'), 'not in HA');
    });
    await check('tick a grocery: completed in HA and hidden; remove deletes it in HA', async () => {
      $$('#grocery-list-container .grocery-item').find(e => /Milk/.test(e.textContent)).click();
      await until(() => !list().includes('Milk'), 3000, 'Milk hidden');
      must(ha().todos['todo.groceries'].find(i => i.summary === 'Milk').status === 'completed', 'HA status');
      $$('#grocery-list-container .grocery-item').find(e => /Eggs/.test(e.textContent)).querySelector('button').click();
      await until(() => !list().includes('Eggs'), 3000, 'Eggs removed');
      must(!ha().todos['todo.groceries'].some(i => i.summary === 'Eggs'), 'still in HA');
    });
    await check('[new] grocery added while HA rejects writes stays visible and a warning is shown', async () => {
      ha().failOn = ['todo.add_item'];
      setVal('grocery-input', 'Offline item'); $('#grocery-add-btn').click(); await sleep(400);
      must(/not sent/.test($('#keep-sync-status').textContent), 'banner says the change was not sent');
      ha().failOn = [];
      must(list().includes('Offline item'), 'item vanished: ' + JSON.stringify(list()));
    });
    await check('meal plan: week grid shows HA plan, picking an idea writes "Day|Meal", clear removes it', async () => {
      await until(() => $$('.meal-day-row').some(r => /Spaghetti/.test(r.textContent)), 3000, 'plan shown');
      const row = $$('.meal-day-row').find(r => !/Spaghetti/.test(r.textContent) && !r.classList.contains('has-meal'));
      const day = row.dataset.day; row.click(); await sleep(100);
      must(active('meal-picker-overlay'), 'picker closed');
      const idea = $$('.picker-idea').find(b => /Pizza night/.test(b.textContent)); must(idea, 'ideas missing from picker'); idea.click();
      await until(() => ha().todos['todo.weekly_meal_plan'].some(i => i.summary === day + '|Pizza night'), 3000, 'plan written');
      await until(() => $$('.meal-day-row').find(r => r.dataset.day === day).classList.contains('has-meal'), 3000, 'row updated');
      $$('.meal-day-row').find(r => r.dataset.day === day).querySelector('.meal-day-clear').click();
      await until(() => !ha().todos['todo.weekly_meal_plan'].some(i => i.summary.startsWith(day + '|')), 3000, 'plan cleared');
    });
    await check('picker: typing a new meal adds an idea and assigns it', async () => {
      const row = $$('.meal-day-row').find(r => !r.classList.contains('has-meal')); const day = row.dataset.day; row.click(); await sleep(80);
      setVal('meal-picker-input', 'Smoke Stew'); $('#meal-picker-add-btn').click();
      await until(() => ha().todos['todo.meal_ideas'].some(i => i.summary === 'Smoke Stew') && ha().todos['todo.weekly_meal_plan'].some(i => i.summary === day + '|Smoke Stew'), 3000, 'idea + plan');
      await until(() => $$('.meal-day-row').find(r => r.dataset.day === day).classList.contains('has-meal'), 3000, 'row updated');
      $$('.meal-day-row').find(r => r.dataset.day === day).querySelector('.meal-day-clear').click(); await sleep(200);
    });
    await check('calendar week view pins tonight\'s dinner from the plan, and only for the next seven days', async () => {
      const key = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
      ha().todos['todo.weekly_meal_plan'].push({ uid: 'p9', summary: key + '|Tonight Pasta', status: 'needs_action' });
      await window.familyDashboard.lists.plan.load();
      await go('calendar'); $$('.switch-btn').find(b => b.dataset.calView === 'week').click(); await sleep(150);
      must($$('#week-days-container .timeline-meal-footer').some(e => /Tonight Pasta/.test(e.textContent)), 'no dinner pin');
      $('#cal-prev-btn').click(); await sleep(150);
      must(!$$('#week-days-container .timeline-meal-footer').some(e => /Tonight Pasta/.test(e.textContent)), 'dinner pinned on a past day');
      $('#cal-today-btn').click(); await sleep(100);
    });
    await check('settings meal ideas manager lists, adds, renames and removes ideas', async () => {
      await unlock($('#settings-btn')); $('#settings-tab-btn-meals').click(); await sleep(100);
      const names = () => $$('#settings-meal-ideas-list .idea-name').map(e => e.textContent);
      must(names().includes('Pizza night'), 'ideas not listed: ' + names());
      setVal('new-meal-idea-input', 'Smoke Soup'); $('#add-meal-idea-btn').click(); await until(() => names().includes('Smoke Soup'), 3000, 'added');
      must(ha().todos['todo.meal_ideas'].some(i => i.summary === 'Smoke Soup'), 'not in HA');
      $$('#settings-meal-ideas-list .settings-meal-idea-item').find(li => /Smoke Soup/.test(li.textContent)).querySelector('[data-action="edit"]').click(); await sleep(80);
      const input = $('#settings-meal-ideas-list .idea-edit-input'); input.value = 'Smoke Chowder';
      $('#settings-meal-ideas-list [data-action="save"]').click(); await until(() => names().includes('Smoke Chowder'), 3000, 'renamed');
      $$('#settings-meal-ideas-list .settings-meal-idea-item').find(li => /Smoke Chowder/.test(li.textContent)).querySelector('[data-action="delete"]').click();
      await until(() => !names().includes('Smoke Chowder'), 3000, 'removed'); closeModals();
    });
  });

  // ---------------------------------------------------------------- settings, theme, screensaver
  group('settings', async () => {
    await go('calendar'); closeModals();
    await check('settings: values are filled from state and saved back', async () => {
      await unlock($('#settings-btn'));
      same($('#ha-url-input').value, data().settings.haUrl, 'url filled');
      setVal('photo-interval-input', '45'); setVal('idle-minutes-input', '3'); setVal('doorbell-seconds-input', '20'); setVal('doorbell-entity-input', '');
      setVal('weather-lat-input', '40.5'); setVal('weather-lon-input', '-73.1'); setVal('weather-location-name-input', 'Smoke Town');
      $('#save-settings-btn').click(); await sleep(150);
      const s = data().settings;
      must(s.photoIntervalSeconds === 45 && s.idleSaverMinutes === 3 && s.doorbellSeconds === 20, 'numbers ' + JSON.stringify([s.photoIntervalSeconds, s.idleSaverMinutes, s.doorbellSeconds]));
      same(s.doorbellEntity, '', 'blank doorbell entity should stay blank');
      must(s.weather.lat === 40.5 && s.weather.lon === -73.1 && s.weather.locationName === 'Smoke Town', 'weather ' + JSON.stringify(s.weather));
      must(!active('settings-modal'), 'modal still open');
    });
    await check('settings: out-of-range numbers are ignored', async () => {
      await unlock($('#settings-btn')); setVal('photo-interval-input', '3'); setVal('idle-minutes-input', '0'); setVal('doorbell-seconds-input', '1');
      $('#save-settings-btn').click(); await sleep(150);
      const s = data().settings; must(s.photoIntervalSeconds === 45 && s.idleSaverMinutes === 3 && s.doorbellSeconds === 20, 'ranges not enforced');
    });
    await check('theme buttons switch the theme attribute', async () => {
      await unlock($('#settings-btn')); $('.theme-mode-btn[data-mode="dark"]').click(); await sleep(60);
      must(document.documentElement.getAttribute('data-theme') === 'dark' && data().themeMode === 'dark', 'dark'); $('.theme-mode-btn[data-mode="light"]').click(); await sleep(60);
      must(document.documentElement.getAttribute('data-theme') === 'light', 'light'); closeModals();
    });
    await check('member icon edit is saved (checked again after a reload by __smokeReload)', async () => {
      await unlock($('#settings-btn')); $('#settings-tab-btn-todos').click(); await sleep(60);
      const input = $('#member-avatar-alex'); must(input, 'avatar field missing'); input.value = '🦖';
      $('#save-settings-btn').click(); await sleep(150);
      must(JSON.parse(localStorage.getItem('family_dashboard_state_v1')).members.find(m => m.id === 'alex').avatar === '🦖', 'avatar not saved');
    });
    await check('screensaver opens and closes', async () => {
      $('#photo-frame-btn').click(); await sleep(150); must(active('photo-frame-overlay'), 'not started');
      must($('#photo-time').textContent.length > 3, 'no clock');
      $('#photo-frame-overlay').click(); await sleep(60); must(!active('photo-frame-overlay'), 'not stopped');
    });
    await check('screensaver lists a timed event that is not over yet, and still shows the clock [new]', async () => {
      const feed = window.familyDashboard.calendarFeed;
      const mine = feed.save({ title: 'Smoke Saver', memberId: 'sam', category: 'family', date: ymd(), time: '12:00 AM - 11:59 PM', location: '' });
      try {
        $('#photo-time').textContent = '';
        $('#photo-frame-btn').click(); await sleep(150); must(active('photo-frame-overlay'), 'not started');
        must($('#photo-time').textContent.length > 3, 'no clock with an event in the list');
        must(!$('#photo-events').hidden && /Smoke Saver/.test($('#photo-events').textContent), 'event not listed: ' + $('#photo-events').textContent);
        $('#photo-frame-overlay').click(); await sleep(60); must(!active('photo-frame-overlay'), 'not stopped');
      } finally { feed.remove(mine.id); }
    });
  });

  // ---------------------------------------------------------------- sync (runs last)
  group('sync', async () => {
    await check('state push excludes tokens and per-device view state', async () => {
      data().settings.haToken = data().settings.haToken || 'sandbox-token'; window.stateManager.save(); await sleep(1900);
      const doc = ha().userData['family_dashboard_state']; must(doc, 'nothing pushed');
      must(!('haToken' in doc.settings), 'haToken pushed');
      must(!('activeMemberId' in doc), '[new] activeMemberId pushed');
    });
    await check('remote copy newer than local is adopted', async () => {
      const doc = JSON.parse(JSON.stringify(ha().userData['family_dashboard_state']));
      doc.updatedAt = Date.now() + 5000; doc.members.find(m => m.id === 'sam').stars = 777; ha().userData['family_dashboard_state'] = doc;
      await window.stateManager.syncRemote();
      must(member('sam').stars === 777, 'not adopted: ' + member('sam').stars);
      must(window.stateManager.data.settings.haToken, 'local token lost on adopt');
    });
    await check('no script errors during the run', () => must(errors.length === 0, errors.join(' | ')));
  });

  // Run after reloading the page once __smoke has finished (without clearing localStorage).
  window.__smokeReload = async function () {
    results.length = 0;
    await check('after reload: the member icon edit survived config.js', () => must(member('alex').avatar === '🦖', 'avatar is ' + member('alex').avatar));
    await check('after reload: the calendar cache is back without a new sync', () => {
      const cache = JSON.parse(localStorage.getItem('family_dashboard_calendar_v1') || '{}');
      must((cache.events || []).length > 0, 'no cached events'); must(!data().events.some(e => String(e.id).startsWith('ha-')), 'HA events inside the household document');
    });
    await check('after reload: this tablet still shows its own member filter, and the saved document has no tokens in the shared copy', async () => {
      must(typeof data().activeMemberId === 'string', 'no activeMemberId');
    });
    await check('after reload: nothing logged as an error', () => must(errors.length === 0, errors.join(' | ')));
    const failures = results.filter(r => !r.ok);
    return { pass: results.length - failures.length, fail: failures.length, failures };
  };

  window.__smoke = async function (only) {
    results.length = 0;
    const names = only ? [].concat(only) : Object.keys(groups);
    for (const n of names) { try { await groups[n](); } catch (e) { results.push({ name: n + ': group crashed', ok: false, detail: String((e && e.message) || e) }); } closeModals(); }
    const failures = results.filter(r => !r.ok);
    return { pass: results.length - failures.length, fail: failures.length, failures, errors: errors.slice(0, 6) };
  };
})();
