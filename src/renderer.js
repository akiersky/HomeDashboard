/* --------------------------------------------------------------------------
     6a. RENDERER
     -------------------------------------------------------------------------- */
  // Re-rendering rebuilds the DOM, which drops an in-progress touch scroll and snaps scrollers back to the top.
  // Remember each scroller's offset (keyed by id, or class + index) and put it back afterwards.
  function keepScrollPositions(render) {
    const scrollers = [...document.querySelectorAll('.dashboard-main, .dashboard-main *, .modal-overlay.active *')].filter(e => e.scrollTop > 0);
    const saved = scrollers.map(e => [e.id || e.className.split(' ')[0], e.id ? 0 : [...document.getElementsByClassName(e.className.split(' ')[0])].indexOf(e), e.scrollTop]);
    const result = render();
    saved.forEach(([name, idx, top]) => {
      const el = document.getElementById(name) || document.getElementsByClassName(name)[idx];
      if (el) el.scrollTop = top;
    });
    return result;
  }

  // The one owner of when and what re-renders. A change invalidates views; those on screen render once, after the
  // current work; views that are not showing wait until they are shown; and every render keeps the scroll positions.
  class Renderer {
    constructor({ preserve = (render) => render(), schedule = (fn) => { Promise.resolve().then(fn); } } = {}) {
      this.preserve = preserve; // runs a render and restores scroll positions around it
      this.schedule = schedule;
      this.views = new Map();   // name -> { render, visible }
      this.dirty = new Set();
      this.queued = false;
    }

    // Registers owner[method] (render by default) as a view. Its render is wrapped, so direct calls keep scroll too
    // and count as the render a pending change was waiting for.
    add(name, owner, { method = 'render', visible = () => true } = {}) {
      const original = owner[method].bind(owner);
      const render = (...args) => {
        this.dirty.delete(name);
        return this.preserve(() => original(...args));
      };
      owner[method] = render;
      this.views.set(name, { render, visible });
    }

    // Marks views stale (all of them when none are named).
    invalidate(...names) {
      (names.length ? names : [...this.views.keys()]).forEach(name => this.dirty.add(name));
      if (this.queued) return;
      this.queued = true;
      this.schedule(() => { this.queued = false; this.flush(); });
    }

    flush() {
      this.views.forEach((view, name) => {
        if (!this.dirty.has(name) || !view.visible()) return;
        try { view.render(); } catch (e) { console.error(`Rendering ${name} failed:`, e); }
      });
    }

    show(name) { this.views.get(name)?.render(); }
  }
