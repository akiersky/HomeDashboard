// Event look: tint by the one attendee; several attendees stay neutral and show a dot per person.
  const memberColor = (id) => stateManager.data.members.find(m => m.id === id)?.color;
  const evIds = (evt) => (evt.memberIds && evt.memberIds.length > 1 ? evt.memberIds : [evt.memberId]);
  // Tints use rgba() from an "r,g,b" variable: color-mix() isn't supported on older iPadOS, where the cards lost their fill.
  const hexRgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).join(',') : null; };
  function styleEvent(el, evt, ids = evIds(evt)) {
    const rgb = ids.length === 1 && hexRgb(memberColor(ids[0]));
    if (rgb) el.style.setProperty('--ev-rgb', rgb);
  }
  const evDots = (evt, ids = evIds(evt)) =>
    `<span class="ev-dots" aria-label="${esc(ids.map(id => stateManager.data.members.find(m => m.id === id)?.name || id).join(', '))}">${ids.map(id => `<i style="background:${memberColor(id) || 'var(--color-primary)'}"></i>`).join('')}</span>`;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
