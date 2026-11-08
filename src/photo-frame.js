/* --------------------------------------------------------------------------
     7. AMBIENT PHOTO FRAME SAVER MODULE
     -------------------------------------------------------------------------- */
  class PhotoFrameModule {
    constructor({ feed, beforeStart }) {
      this.feed = feed;
      this.beforeStart = beforeStart; // clears anything that should not linger over the screensaver
      this.overlay = document.getElementById('photo-frame-overlay');
      this.bgEl = document.getElementById('photo-slide-bg');
      this.timeEl = document.getElementById('photo-time');
      this.dateEl = document.getElementById('photo-date');
      this.captionEl = document.getElementById('photo-caption');
      this.eventsEl = document.getElementById('photo-events');

      this.photos = [
        {
          url: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1600&q=80',
          caption: 'Summer vacation'
        },
        {
          url: 'https://images.unsplash.com/photo-1542037104857-ffbb0b915767?auto=format&fit=crop&w=1600&q=80',
          caption: 'Family hike'
        },
        {
          url: 'https://images.unsplash.com/photo-1475503572774-15a45e5d60b9?auto=format&fit=crop&w=1600&q=80',
          caption: 'Golden hour at the park'
        },
        {
          url: 'https://images.unsplash.com/photo-1536640712-4d4c36ff0e4e?auto=format&fit=crop&w=1600&q=80',
          caption: 'Weekend picnic'
        }
      ];

      this.currentIndex = 0;
      this.intervalId = null;
      this.init();
    }

    init() {
      document.getElementById('photo-frame-btn')?.addEventListener('click', () => {
        this.start();
      });

      if (this.overlay) {
        this.overlay.addEventListener('click', () => {
          this.stop();
        });
      }

      let idleTimer;
      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (this.overlay && !this.overlay.classList.contains('active')) {
            this.start();
          }
        }, (stateManager.data.settings.idleSaverMinutes || 3) * 60 * 1000);
      };

      ['pointerdown', 'mousemove', 'keydown', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, resetIdleTimer, { passive: true });
      });
      resetIdleTimer();
    }

    async start() {
      if (!this.overlay) return;
      clearInterval(this.intervalId);
      // Nothing should linger over the screensaver: event popover and any open dialogs.
      this.beforeStart?.();
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      this.overlay.classList.add('active');
      this.updateClock();

      try {
        await this.fetchImmichPhotos();
      } catch (e) {
        console.warn('Error fetching Immich photos:', e);
      }

      // Woken during the fetch: don't start a timer nothing will ever clear.
      if (!this.overlay.classList.contains('active')) return;
      this.showSlide(0);

      this.intervalId = setInterval(async () => {
        await this.advanceSlide();
        this.updateClock();
      }, (stateManager.data.settings.photoIntervalSeconds || 30) * 1000);
    }

    _immichCaption(state) {
      const exif = state.attributes?.media_exif || {};
      if (exif.city && exif.dateTimeOriginal) {
        const d = new Date(exif.dateTimeOriginal);
        const dateStr = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return `${exif.city}${exif.state ? ', ' + exif.state : ''} · ${dateStr}`;
      }
      if (exif.dateTimeOriginal) {
        return new Date(exif.dateTimeOriginal).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
      const fname = state.attributes?.media_filename;
      return fname ? fname.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ') : 'Family memory';
    }

    async fetchImmichPhotos() {
      try {
        const haUrl = haBase();
        const state = await haWS.getEntityState(stateManager.data.settings.photoEntity);
        if (state?.attributes?.entity_picture) {
          this.photos = [{ url: `${haUrl}${state.attributes.entity_picture}`, caption: this._immichCaption(state) }];
          return;
        }
      } catch (e) {
        console.warn('Could not fetch Immich photo via WebSocket:', e);
      }
      // Fallback: keep the built-in Unsplash photos
    }

    async advanceSlide() {
      try {
        const haUrl = haBase();
        const entity = stateManager.data.settings.photoEntity;
        const before = (await haWS.getEntityState(entity))?.state;
        await haWS.updateEntity(entity);
        // Poll until HA reports the new image (state = last-updated stamp) instead of a blind sleep.
        let state;
        for (let i = 0; i < 10; i++) {
          state = await haWS.getEntityState(entity);
          if (state?.state !== before) break;
          await new Promise(r => setTimeout(r, 500));
        }
        if (state?.attributes?.entity_picture) {
          this.photos[0] = { url: `${haUrl}${state.attributes.entity_picture}`, caption: this._immichCaption(state) };
          this.currentIndex = 0;
          this.showSlide(0);
          return;
        }
      } catch (e) {
        console.warn('Could not refresh Immich photo:', e);
      }
      this.currentIndex = (this.currentIndex + 1) % this.photos.length;
      this.showSlide(this.currentIndex);
    }

    stop() {
      if (!this.overlay) return;
      this.overlay.classList.remove('active');
      clearInterval(this.intervalId);
    }

    // Preload so the photo and its caption change together (caption used to lead the image).
    showSlide(index) {
      const photo = this.photos[index];
      if (!photo) return;
      const token = this.slideToken = (this.slideToken || 0) + 1;
      const apply = () => {
        if (token !== this.slideToken) return; // a newer slide superseded this one
        if (this.bgEl) this.bgEl.style.setProperty('--photo', `url('${photo.url}')`);
        if (this.captionEl) this.captionEl.textContent = photo.caption;
      };
      const img = new Image();
      img.onload = img.onerror = apply;
      img.src = photo.url;
    }

    // Timed events still to come (or in progress) today, as small title + time cards.
    renderEvents(now) {
      if (!this.eventsEl) return;
      const left = this.feed.remaining(now);
      const MAX = 4;
      this.eventsEl.hidden = !left.length;
      this.eventsEl.innerHTML = left.slice(0, MAX).map((e) =>
        `<div class="photo-event"><span class="photo-event-title">${esc(e.title)}</span><span class="photo-event-time">${esc(e.time)}</span></div>`
      ).join('') + (left.length > MAX ? `<div class="photo-event photo-event-more">+${left.length - MAX} more</div>` : '');
    }

    updateClock() {
      const now = new Date();
      // The clock and the slideshow matter more than the list of events beside them.
      try { this.renderEvents(now); } catch (e) { console.warn('Screensaver events failed:', e); }
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;

      if (this.timeEl) this.timeEl.textContent = `${hours}:${minutes} ${ampm}`;
      if (this.dateEl) {
        this.dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      }
    }
  }
