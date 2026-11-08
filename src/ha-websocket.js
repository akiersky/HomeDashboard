/* --------------------------------------------------------------------------
     2b. HOME ASSISTANT WEBSOCKET HELPER
     -------------------------------------------------------------------------- */
  class HAWebSocket {
    // connection() -> { url, token }, read each time it connects. timeout: how long a request may wait for its answer.
    constructor(connection, { timeout = 10000 } = {}) {
      this.connection = connection;
      this.timeout = timeout;
      this.ws = null;
      this.msgId = 1;
      this.pending = {}; // id -> { resolve, reject, timer }
      this.authenticated = false;
      this.connectPromise = null;
      this.subs = []; // { type, cb, id } — re-established after reconnect
      this.nativeConn = null;
    }

    isNative() {
      return !!this.nativeConn || inHA();
    }

    setNativeConnection(conn) {
      this.nativeConn = conn;
      this.authenticated = true;
    }

    async _getNative() {
      if (this.nativeConn) return this.nativeConn;
      if (typeof window !== 'undefined') {
        try {
          const hc = inHA() && (window.hassConnection || window.parent.hassConnection);
          if (hc && typeof hc.then === 'function') {
            const resolved = await hc;
            if (resolved && resolved.conn) {
              this.nativeConn = resolved.conn;
              this.authenticated = true;
              return this.nativeConn;
            }
          }
        } catch (_) {}
      }
      return null;
    }

    _wsUrl() {
      const url = this.connection().url || 'http://homeassistant.local:8123';
      return url.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/api/websocket';
    }

    async connect() {
      const native = await this._getNative();
      if (native) {
        this.authenticated = true;
        return;
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.authenticated) {
        return Promise.resolve();
      }
      if (this.connectPromise) return this.connectPromise;

      this.connectPromise = new Promise((resolve, reject) => {
        this.ws = new WebSocket(this._wsUrl());
        this.ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === 'auth_required') {
            this.ws?.send(JSON.stringify({ type: 'auth', access_token: this.connection().token }));
          } else if (msg.type === 'auth_ok') {
            this.authenticated = true;
            this.connectPromise = null;
            resolve();
            this.subs.forEach(sub => this._subscribe(sub));
          } else if (msg.type === 'auth_invalid') {
            this.connectPromise = null;
            reject(new Error('HA token invalid'));
          } else if (msg.type === 'event') {
            this.subs.find(sub => sub.id === msg.id)?.cb(msg.event);
          } else if (msg.id && this.pending[msg.id]) {
            const request = this.pending[msg.id];
            delete this.pending[msg.id];
            clearTimeout(request.timer);
            if (msg.success) request.resolve(msg.result); else request.reject(new Error(msg.error?.message));
          }
        };
        this.ws.onerror = () => { this.connectPromise = null; reject(new Error('WS error')); };
        this.ws.onclose = () => {
          this.authenticated = false; this.ws = null; this.connectPromise = null;
          reject(new Error('Home Assistant connection closed')); // no effect once connected
          Object.values(this.pending).forEach((request) => { clearTimeout(request.timer); request.reject(new Error('Home Assistant connection closed')); });
          this.pending = {};
          if (this.subs.length) setTimeout(() => this.connect().catch(() => {}), 5000);
        };
      });
      return this.connectPromise;
    }

    // Live event stream (e.g. 'state_changed'); survives reconnects.
    subscribe(eventType, cb) {
      this._getNative().then((native) => {
        if (native) {
          if (typeof native.subscribeEvents === 'function') {
            return native.subscribeEvents(cb, eventType);
          }
          if (typeof native.subscribeMessage === 'function') {
            return native.subscribeMessage(cb, { type: 'subscribe_events', event_type: eventType });
          }
        }
        const sub = { type: eventType, cb, id: null };
        this.subs.push(sub);
        this.connect()
          // Already-open socket: auth_ok won't fire again, so register this sub now (id is set if auth_ok got there first).
          .then(() => { if (sub.id === null) this._subscribe(sub); })
          .catch(() => { setTimeout(() => this.connect().catch(() => {}), 5000); });
      });
    }

    _subscribe(sub) {
      sub.id = this.msgId++;
      this.ws.send(JSON.stringify({ id: sub.id, type: 'subscribe_events', event_type: sub.type }));
    }

    async send(payload, timeout = this.timeout) {
      const native = await this._getNative();
      if (native) {
        if (typeof native.sendMessagePromise === 'function') {
          return native.sendMessagePromise(payload);
        }
      }
      await this.connect();
      const id = this.msgId++;
      payload.id = id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { delete this.pending[id]; reject(new Error('Home Assistant did not answer')); }, timeout);
        this.pending[id] = { resolve, reject, timer };
        this.ws.send(JSON.stringify(payload));
      });
    }

    async getEntityState(entityId) {
      const states = await this.send({ type: 'get_states' });
      return Array.isArray(states) ? states.find(s => s.entity_id === entityId) : null;
    }

    async updateEntity(entityId) {
      await this.send({
        type: 'call_service', domain: 'homeassistant', service: 'update_entity',
        service_data: { entity_id: entityId }
      });
    }

    async getTodoItems(entityId) {
      const result = await this.send({ type: 'todo/item/list', entity_id: entityId });
      return (result?.items || []).map(item => ({
        id: item.uid,
        name: item.summary,
        bought: item.status === 'completed'
      }));
    }

    async addTodoItem(entityId, name) {
      await this.send({ type: 'call_service', domain: 'todo', service: 'add_item',
        service_data: { entity_id: entityId, item: name } });
    }

    async updateTodoItem(entityId, uid, completed) {
      await this.send({ type: 'call_service', domain: 'todo', service: 'update_item',
        service_data: { entity_id: entityId, item: uid, status: completed ? 'completed' : 'needs_action' } });
    }

    async updateTodoItemName(entityId, uid, newName) {
      await this.send({ type: 'call_service', domain: 'todo', service: 'update_item',
        service_data: { entity_id: entityId, item: uid, rename: newName } });
    }

    async removeTodoItem(entityId, uid) {
      await this.send({ type: 'call_service', domain: 'todo', service: 'remove_item',
        service_data: { entity_id: entityId, item: uid } });
    }

    async getCalendarEvents(entityIds, startIso, endIso) {
      const ids = Array.isArray(entityIds) ? entityIds : [entityIds];
      // Several Google calendars over three months can be slow to answer, so this one waits three times as long.
      const result = await this.send({
        type: 'call_service',
        domain: 'calendar',
        service: 'get_events',
        service_data: { entity_id: ids, start_date_time: startIso, end_date_time: endIso },
        return_response: true
      }, this.timeout * 3);
      // result.response is keyed by entity_id, each has an `events` array
      // Events use flat string start/end rather than {dateTime:...} objects
      return result?.response || {};
    }
  }

  const haWS = new HAWebSocket(() => ({ url: stateManager.data.settings.haUrl, token: stateManager.data.settings.haToken }));
  window.haWS = haWS;
