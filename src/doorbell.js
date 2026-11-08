// Pops up the doorbell camera when settings.doorbellEntity fires (settings read live, no reload needed).
  class DoorbellModule {
    constructor() {
      this.overlay = document.getElementById('doorbell-overlay');
      this.img = document.getElementById('doorbell-img');
      this.timer = null;
      this.overlay.addEventListener('click', () => this.hide());
      // A header button shows the camera on demand whenever one is set (a doorbell press is only detected with Home Assistant).
      const button = document.getElementById('doorbell-btn');
      const syncButton = () => { if (button) button.hidden = !stateManager.data.settings.doorbellCamera; };
      button?.addEventListener('click', () => this.show({ ring: false }));
      document.addEventListener('settings-saved', syncButton);
      syncButton();
      // Browsers only allow sound after a touch; unlock the audio context on the first one.
      const unlock = () => { this.audio().resume?.(); };
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      haWS.subscribe('state_changed', ev => {
        const { entity_id, old_state, new_state } = ev.data;
        if (entity_id !== stateManager.data.settings.doorbellEntity || !old_state || !new_state) return;
        if (old_state.state === new_state.state) return;
        if (['off', 'unavailable', 'unknown'].includes(new_state.state)) return;
        this.show();
      });
    }

    audio() {
      const AC = window.AudioContext || window.webkitAudioContext;
      return this.ctx || (this.ctx = AC ? new AC() : {});
    }

    // Two-note "ding-dong", played twice. Synthesized, so there is no sound file to host.
    chime() {
      const ctx = this.audio();
      if (!ctx.createOscillator) return;
      ctx.resume?.();
      [[0, 784], [0.55, 622], [1.5, 784], [2.05, 622]].forEach(([at, freq]) => {
        const t = ctx.currentTime + at;
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 1.3);
      });
    }

    async show({ ring = true } = {}) {
      if (ring) this.chime(); // ring even if the camera feed fails
      const cam = stateManager.data.settings.doorbellCamera;
      if (!cam) return;
      const state = await haWS.getEntityState(cam);
      const token = state?.attributes?.access_token;
      if (!token) return;
      // MJPEG proxy stream: plain <img>, no auth header; token rotates so fetch fresh each ring
      this.img.src = `${haBase()}/api/camera_proxy_stream/${cam}?token=${token}`;
      this.overlay.classList.add('active');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.hide(), (stateManager.data.settings.doorbellSeconds || 30) * 1000);
    }

    hide() {
      clearTimeout(this.timer);
      this.overlay.classList.remove('active');
      this.img.removeAttribute('src'); // closes the stream
    }
  }
