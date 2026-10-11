// The game console: pet controls + games list, anchored next to the pet.
(function () {
  const COLORS = ['orange', 'claude', 'gray', 'black', 'white'];
  const GAMES = [{ id: '2048', name: '2048', blurb: 'Slide & merge tiles' }];

  class PetConsole {
    constructor(root, world, hooks) {
      this.world = world;
      this.hooks = hooks;
      this.el = document.createElement('div');
      this.el.className = 'console hidden';
      this.el.innerHTML = `
        <div class="console-head">
          <span class="title"><span class="pad">🎮</span> Claude Pets</span>
          <button class="icon" data-act="close" title="Close">✕</button>
        </div>
        <section>
          <h4>Pet</h4>
          <div class="row buttons">
            <button data-act="ball">🔴 Throw ball</button>
            <button data-act="hide">🙈 Hide pet</button>
          </div>
          <div class="row"><span class="label">Mode</span>
            <div class="seg" data-pref="mode">
              <button data-val="auto">Auto</button><button data-val="interactive">Follow me</button>
            </div>
          </div>
          <div class="row"><span class="label">Color</span>
            <div class="swatches" data-pref="color">
              ${COLORS.map((c) => `<button data-val="${c}" class="swatch" title="${c}"><i style="background:${window.PetSprites.PALETTES[c].b}"></i></button>`).join('')}
            </div>
          </div>
          <div class="row"><span class="label">Size</span>
            <div class="seg" data-pref="size">
              <button data-val="2">S</button><button data-val="3">M</button><button data-val="4">L</button>
            </div>
          </div>
          <div class="row"><span class="label">Speed</span>
            <div class="seg" data-pref="speed">
              <button data-val="0.6">Chill</button><button data-val="1">Normal</button><button data-val="1.6">Zoomy</button>
            </div>
          </div>
        </section>
        <section>
          <h4>Games</h4>
          ${GAMES.map((g) => `<button class="game" data-game="${g.id}"><b>${g.name}</b><small>${g.blurb}</small><em>copy link</em></button>`).join('')}
        </section>
        <footer>Ask Claude <q>open game</q> to open it in the side browser pane.</footer>`;
      root.appendChild(this.el);
      this.el.addEventListener('click', (e) => this.onClick(e));
      this.el.addEventListener('mousedown', (e) => e.stopPropagation());
      this.toast = document.createElement('div');
      this.toast.className = 'toast hidden';
      root.appendChild(this.toast);
    }

    get open() {
      return !this.el.classList.contains('hidden');
    }

    toggle() {
      if (this.open) this.close();
      else this.show();
    }

    show() {
      this.world.show();
      this.sync();
      this.el.classList.remove('hidden');
      this.position();
      this.hooks.onChange();
    }

    close() {
      if (!this.open) return;
      this.el.classList.add('hidden');
      this.hooks.onChange();
    }

    position() {
      const floor = this.world.floor;
      if (!floor) return;
      const { w, h } = this.world.size;
      const pet = this.world.pet;
      const box = this.el.getBoundingClientRect();
      const width = this.world.env.width;
      let left = pet.x + w / 2 - box.width / 2;
      left = Math.max(8, Math.min(width - box.width - 8, left));
      let top = pet.y - h - box.height - 10;
      if (top < 40) top = 40;
      this.el.style.left = `${Math.round(left)}px`;
      this.el.style.top = `${Math.round(top)}px`;
    }

    rect() {
      if (!this.open) return null;
      const r = this.el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height];
    }

    sync() {
      const prefs = this.world.prefs;
      this.el.querySelectorAll('[data-pref]').forEach((group) => {
        const value = String(prefs[group.dataset.pref]);
        group.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.val === value));
      });
    }

    onClick(event) {
      const button = event.target.closest('button');
      if (!button) return;
      const group = button.closest('[data-pref]');
      if (group) {
        const key = group.dataset.pref;
        const raw = button.dataset.val;
        this.world.updatePrefs({ [key]: key === 'size' || key === 'speed' ? Number(raw) : raw });
        this.sync();
        this.position();
        this.hooks.onChange();
        return;
      }
      if (button.dataset.game) return this.copyGame(button.dataset.game);
      switch (button.dataset.act) {
        case 'close':
          this.close();
          break;
        case 'ball':
          this.world.throwBall();
          this.close();
          break;
        case 'hide':
          this.world.hide();
          this.close();
          break;
        default:
          break;
      }
    }

    copyGame(id) {
      const base = (this.world.env && this.world.env.gameBase) || 'http://localhost:4747/';
      const url = `${base}${id}/`;
      this.hooks.onCopy(url);
      this.flash(`Copied ${url.replace('http://', '')}<br>Open the browser pane (🌐) and paste it.`);
    }

    flash(html) {
      this.toast.innerHTML = html;
      this.toast.classList.remove('hidden');
      const box = this.el.getBoundingClientRect();
      this.toast.style.left = `${box.left}px`;
      this.toast.style.top = `${Math.max(8, box.top - 64)}px`;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.toast.classList.add('hidden'), 3500);
    }
  }

  window.PetConsole = PetConsole;
})();
