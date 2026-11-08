/* --------------------------------------------------------------------------
     5a. PARENT PIN GATE
     -------------------------------------------------------------------------- */
  // Every parent-only action asks here. The gate owns the PIN check and the new-PIN flow and talks to its dialog
  // through a view. A refusal (cancel, close, Escape, backdrop, dialog missing) resolves false, so callers fail closed.
  class ParentGate {
    constructor(store, view) {
      this.store = store;
      this.view = view;
      this.pending = null; // { resolve, newPin: null | { first } }
      this.pin = '';
      view.onKey((key) => this.press(key));
      view.onDismiss(() => this.settle(false));
    }

    ask(title = 'Parent Verification', desc = 'Enter your 4-digit parent PIN to continue.') {
      return this.start({ title, desc, newPin: null });
    }

    // Set a new PIN: enter it, then confirm. Resolves true once it is saved.
    setNewPin() {
      return this.start({ title: 'New PIN', desc: 'Enter a new 4-digit PIN.', newPin: { first: null } });
    }

    start({ title, desc, newPin }) {
      this.settle(false); // a newer request replaces an unanswered one
      return new Promise((resolve) => {
        this.pin = '';
        this.pending = { resolve, newPin };
        if (!this.view.open({ title, desc })) this.settle(false);
      });
    }

    settle(ok) {
      const p = this.pending;
      if (!p) return;
      this.pending = null;
      this.pin = '';
      p.resolve(ok);
      this.view.close();
    }

    press(key) {
      if (!this.pending) return;
      if (key === 'back') this.pin = this.pin.slice(0, -1);
      else if (this.pin.length < 4) this.pin += key;
      this.view.setError(null);
      this.view.digits(this.pin.length);
      if (this.pin.length === 4) this.submit();
    }

    submit() {
      const { newPin } = this.pending;
      const digits = this.pin;
      this.pin = '';
      this.view.digits(0);
      if (newPin) {
        if (!newPin.first) {
          newPin.first = digits;
          this.view.setDesc('Enter it again to confirm.');
        } else if (newPin.first === digits) {
          this.store.data.settings.parentPin = digits;
          this.store.save();
          this.settle(true);
        } else {
          newPin.first = null;
          this.view.setDesc('Enter a new 4-digit PIN.');
          this.view.setError('PINs did not match — start again.');
        }
      } else if (digits === (this.store.data.settings.parentPin || '1234')) {
        this.settle(true);
      } else {
        this.view.setError('Incorrect PIN — try again.');
      }
    }
  }

  // The PIN dialog in index.html: title, description, four digit boxes, an error line and a keypad.
  function pinDialogView() {
    const modal = () => document.getElementById('admin-pin-modal');
    const view = {
      open({ title, desc }) {
        if (!modal()) return false;
        const titleEl = document.getElementById('admin-pin-title');
        if (titleEl) { titleEl.innerHTML = '<i class="fa-solid fa-key text-sky"></i> '; titleEl.append(title); }
        view.setDesc(desc);
        view.digits(0);
        view.setError(null);
        modal().classList.add('active');
        return true;
      },
      close() { modal()?.classList.remove('active'); },
      digits(n) {
        document.querySelectorAll('.pin-digit').forEach((el, i) => {
          el.value = i < n ? '•' : '';
          el.toggleAttribute('data-filled', i < n);
        });
      },
      setDesc(text) {
        const el = document.getElementById('admin-pin-desc');
        if (el) el.textContent = text;
      },
      setError(text) {
        const el = document.getElementById('pin-error');
        if (!el) return;
        el.style.display = text ? '' : 'none';
        if (text) document.getElementById('pin-error-text').textContent = text;
      },
      // On-screen keypad and physical keyboard feed the same keys: '0'-'9' and 'back'.
      onKey(fn) {
        document.getElementById('pin-keypad')?.addEventListener('click', (e) => {
          const key = e.target.closest('[data-key]')?.dataset.key;
          if (key) fn(key);
        });
        document.addEventListener('keydown', (e) => {
          if (!modal()?.classList.contains('active')) return;
          if (/^\d$/.test(e.key)) fn(e.key);
          else if (e.key === 'Backspace') fn('back');
        });
      },
      // The X and Cancel keys, and anything else that hides the dialog (Escape, backdrop, the screensaver).
      onDismiss(fn) {
        document.getElementById('admin-pin-cancel')?.addEventListener('click', () => { view.close(); fn(); });
        const m = modal();
        if (m) new MutationObserver(() => { if (!m.classList.contains('active')) fn(); }).observe(m, { attributes: true, attributeFilter: ['class'] });
      }
    };
    return view;
  }
