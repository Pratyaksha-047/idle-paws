// The game console: pet controls + games list, anchored next to the pet.
(function () {
  const { SPECIES, palette } = window.PetSprites;

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
          <div class="row"><span class="label">Pet</span>
            <div class="seg species" data-pref="species">
              ${Object.entries(SPECIES).map(([id, s]) => `<button data-val="${id}" title="${s.label.split(' ')[1]}">${s.label.split(' ')[0]}</button>`).join('')}
            </div>
          </div>
          <div class="row"><span class="label">Mode</span>
            <div class="seg" data-pref="mode">
              <button data-val="auto">Auto</button><button data-val="interactive">Follow me</button>
            </div>
          </div>
          <div class="row"><span class="label">Color</span>
            <div class="swatches" data-pref="color"></div>
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
        <button class="play" data-act="play">▶ Play games</button>
        <footer>Opens in the side browser pane.</footer>`;
      root.appendChild(this.el);
      this.el.addEventListener('click', (e) => this.onClick(e));
      this.el.addEventListener('mousedown', (e) => e.stopPropagation());
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

    // Swatches depend on the species; switching species picks its first colour if needed.
    renderSwatches() {
      const { species, color } = this.world.prefs;
      const palettes = (SPECIES[species] || SPECIES.cat).palettes;
      if (!palettes[color]) this.world.updatePrefs({ color: Object.keys(palettes)[0] });
      const group = this.el.querySelector('.swatches');
      if (group.dataset.species === species) return;
      group.dataset.species = species;
      group.innerHTML = Object.keys(palettes)
        .map((c) => {
          const colors = palette(species, c);
          const second = colors.h !== colors.b ? colors.h : colors.b;
          const fill = `linear-gradient(135deg, ${second} 50%, ${colors.b} 50%)`;
          return `<button data-val="${c}" class="swatch" title="${c}"><i style="background:${fill}"></i></button>`;
        })
        .join('');
    }

    sync() {
      this.renderSwatches();
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
      switch (button.dataset.act) {
        case 'close':
          this.close();
          break;
        case 'play':
          this.hooks.onPlay();
          this.close();
          break;
        case 'ball':
          this.close();
          this.world.throwBall();
          break;
        case 'hide':
          this.world.hide();
          this.close();
          break;
        default:
          break;
      }
    }
  }

  window.PetConsole = PetConsole;
})();
