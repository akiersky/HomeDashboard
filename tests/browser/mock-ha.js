// Fake Home Assistant for the sandbox. Replaces WebSocket; control and inspect it through window.__ha.
(function () {
  const ha = window.__ha = {
    token: 'sandbox-token',
    down: false,          // true: connections fail, open sockets close
    failOn: [],           // e.g. ['todo.add_item'] makes those calls answer success:false
    userData: {},
    todos: {
      'todo.groceries': [{ uid: 'k1', summary: 'Milk', status: 'needs_action' }, { uid: 'k2', summary: 'Eggs', status: 'needs_action' }],
      'todo.meal_ideas': [{ uid: 'i1', summary: 'Pizza night', status: 'needs_action' }, { uid: 'i2', summary: 'Tacos', status: 'needs_action' }],
      'todo.weekly_meal_plan': [{ uid: 'p1', summary: 'Mon|Spaghetti', status: 'needs_action' }]
    },
    calendars: {},        // entity -> [{ uid, summary, start, end, location, description }]
    states: [{ entity_id: 'sun.sun', state: 'above_horizon', attributes: {} }],
    log: [],              // every request (without id), for assertions
    sockets: [],
    drop() { ha.sockets.slice().forEach(s => s.close()); }
  };
  let seq = 100;
  class FakeWS {
    constructor(url) {
      this.url = url; this.readyState = 0; ha.sockets.push(this);
      setTimeout(() => {
        if (ha.down) { this.readyState = 3; this.onerror && this.onerror({}); this.onclose && this.onclose({}); return; }
        this.readyState = 1; this._push({ type: 'auth_required' });
      }, 5);
    }
    _push(msg) { setTimeout(() => this.readyState === 1 && this.onmessage && this.onmessage({ data: JSON.stringify(msg) }), 2); }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3; ha.sockets = ha.sockets.filter(s => s !== this);
      setTimeout(() => this.onclose && this.onclose({}), 0);
    }
    send(raw) {
      const msg = JSON.parse(raw);
      if (msg.type === 'auth') { this._push({ type: msg.access_token === ha.token ? 'auth_ok' : 'auth_invalid' }); return; }
      const { id, ...req } = msg; ha.log.push(req);
      const reply = (result) => this._push({ id, type: 'result', success: true, result });
      const fail = (message) => this._push({ id, type: 'result', success: false, error: { message } });
      const call = msg.type === 'call_service' ? `${msg.domain}.${msg.service}` : msg.type;
      if (ha.down || ha.failOn.includes(call)) return fail('sandbox: ' + (ha.down ? 'down' : 'failOn ' + call));
      const list = (e) => (ha.todos[e] = ha.todos[e] || []);
      const d = msg.service_data || {};
      switch (call) {
        case 'frontend/get_user_data': return reply({ value: ha.userData[msg.key] ?? null });
        case 'frontend/set_user_data': ha.userData[msg.key] = JSON.parse(JSON.stringify(msg.value)); return reply(null);
        case 'todo/item/list': return reply({ items: list(msg.entity_id).map(i => ({ ...i })) });
        case 'todo.add_item': list(d.entity_id).push({ uid: 'u' + (++seq), summary: d.item, status: 'needs_action' }); return reply(null);
        case 'todo.update_item': {
          const it = list(d.entity_id).find(i => i.uid === d.item); if (!it) return fail('no such item');
          if (d.rename) it.summary = d.rename; if (d.status) it.status = d.status; return reply(null);
        }
        case 'todo.remove_item': ha.todos[d.entity_id] = list(d.entity_id).filter(i => i.uid !== d.item); return reply(null);
        case 'calendar.get_events': {
          const out = {}; [].concat(d.entity_id).forEach(e => { out[e] = { events: (ha.calendars[e] || []).map(x => ({ ...x })) }; });
          return reply({ response: out });
        }
        case 'homeassistant.update_entity': return reply(null);
        case 'get_states': return reply(ha.states.map(s => ({ ...s })));
        case 'subscribe_events': return reply(null);
        default: return reply(null);
      }
    }
  }
  FakeWS.OPEN = 1; FakeWS.CONNECTING = 0; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
})();
