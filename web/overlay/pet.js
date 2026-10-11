// Pet world: behaviour state machine, ball physics, input, and DOM rendering.
(function () {
  const { GRID_W, GRID_H, MOUTH, frame, frameCount, paw } = window.PetSprites;

  const GRAVITY = 1800;
  const CLICK_DELAY_MS = 260;
  const DRAG_THRESHOLD = 4;
  const BALL_ART = ['.oo.', 'oRRo', 'oRro', '.oo.'];
  const FAST_STATES = new Set(['walk', 'run', 'chase', 'carry', 'drag', 'fall']);

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const pickWeighted = (options) => {
    const total = options.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * total;
    for (const [value, weight] of options) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return options[options.length - 1][0];
  };

  class PetWorld {
    constructor(root, hooks) {
      this.root = root;
      this.hooks = hooks;
      this.env = null;
      this.prefs = { color: 'orange', size: 3, speed: 1, mode: 'auto', hidden: false };
      this.mouse = { x: 0, y: 0, inside: false, movedAt: 0 };

      this.pet = { x: 80, y: 0, vy: 0, dir: 1, state: 'sit', timer: 2, target: 0, anim: 0, frame: 0, awake: 0, placed: false, zTimer: 0 };
      this.ball = { x: 0, y: 0, vx: 0, vy: 0, active: false, held: false };
      this.press = null;
      this.clickTimer = null;
      this.lastHot = '';
      this.lastDraw = '';
      this.lastTransform = '';

      this.petCanvas = this.makeCanvas('pet');
      this.ballCanvas = this.makeCanvas('ball');
      this.pawCanvas = this.makeCanvas('paw');
      this.petCanvas.addEventListener('mousedown', (e) => this.onPress(e, 'pet'));
      this.pawCanvas.addEventListener('mousedown', (e) => this.onPress(e, 'paw'));
      window.addEventListener('mousemove', (e) => this.onMove(e));
      window.addEventListener('mouseup', (e) => this.onRelease(e));
    }

    makeCanvas(cls) {
      const canvas = document.createElement('canvas');
      canvas.className = cls;
      this.root.appendChild(canvas);
      return canvas;
    }

    get scale() {
      return Number(this.prefs.size) || 3;
    }

    get size() {
      return { w: GRID_W * this.scale, h: GRID_H * this.scale };
    }

    get floor() {
      return this.env && this.env.floor;
    }

    // ---- external inputs

    setEnv(env) {
      this.env = env;
      const floor = this.floor;
      if (!floor) return;
      const pet = this.pet;
      if (!pet.placed) {
        pet.x = floor.x1 - this.size.w - 40;
        pet.y = floor.y;
        pet.placed = true;
      } else if (pet.state !== 'drag' && pet.state !== 'fall') {
        if (floor.y > pet.y + 4) {
          this.setState('fall');
        } else {
          pet.y = floor.y;
        }
      }
    }

    setPrefs(prefs) {
      this.prefs = Object.assign({}, this.prefs, prefs);
      this.lastDraw = '';
      this.hooks.onMouseMode(this.prefs.mode === 'interactive' && !this.prefs.hidden);
    }

    updatePrefs(changes) {
      this.setPrefs(changes);
      this.hooks.onPrefs(this.prefs);
    }

    setMouse(mouse) {
      if (Math.abs(mouse.x - this.mouse.x) > 1 || Math.abs(mouse.y - this.mouse.y) > 1) this.mouse.movedAt = performance.now();
      Object.assign(this.mouse, mouse);
    }

    show() {
      if (this.prefs.hidden) this.updatePrefs({ hidden: false });
    }

    hide() {
      if (!this.prefs.hidden) this.updatePrefs({ hidden: true });
      this.ball.active = false;
    }

    throwBall() {
      if (this.prefs.hidden || !this.floor) return;
      const pet = this.pet;
      const dir = Math.random() < 0.5 ? -1 : 1;
      const mouth = this.mouthPoint();
      Object.assign(this.ball, {
        x: mouth.x,
        y: mouth.y,
        vx: dir * rand(220, 420),
        vy: -rand(380, 560),
        active: true,
        held: false,
      });
      pet.dir = dir;
      this.setState('chase');
    }

    // ---- state machine

    setState(state, duration) {
      const pet = this.pet;
      pet.state = state;
      pet.anim = 0;
      pet.frame = 0;
      const durations = { sit: [3, 7], happy: [1.4, 1.8], sleep: [15, 40], blink: [0.15, 0.15] };
      const range = durations[state];
      pet.timer = duration != null ? duration : range ? rand(range[0], range[1]) : 0;
      if (state === 'walk' || state === 'run') {
        const { x0, x1 } = this.floor;
        pet.target = rand(x0, x1 - this.size.w);
      }
      if (state === 'happy') this.particles('♥', 3);
      if (state === 'fall') pet.vy = 0;
      if (state === 'sleep') pet.zTimer = 0;
    }

    nextState() {
      const pet = this.pet;
      const sleepy = clamp(pet.awake / 150, 0, 1);
      const next = pickWeighted([
        ['sit', 3],
        ['walk', 4],
        ['run', 0.8],
        ['sleep', 0.3 + 3 * sleepy],
        ['play', 0.5],
      ]);
      if (next === 'play') return this.throwBall();
      if (next === 'sleep') pet.awake = 0;
      this.setState(next);
    }

    followMouse() {
      const pet = this.pet;
      const recent = performance.now() - this.mouse.movedAt < 6000;
      if (this.prefs.mode !== 'interactive' || !this.mouse.inside || !recent) return false;
      if (!['sit', 'walk', 'run', 'sleep', 'blink'].includes(pet.state)) return false;
      const { x0, x1 } = this.floor;
      const target = clamp(this.mouse.x - this.size.w / 2, x0, x1 - this.size.w);
      const distance = Math.abs(target - pet.x);
      if (distance > 80) {
        if (pet.state !== 'run') this.setState('run');
        pet.target = target;
      } else if (distance > 16) {
        if (pet.state !== 'walk' && pet.state !== 'run') this.setState('walk');
        pet.target = target;
      } else if (pet.state !== 'sit' && pet.state !== 'blink') {
        this.setState('sit');
        pet.dir = this.mouse.x >= pet.x + this.size.w / 2 ? 1 : -1;
      }
      return true;
    }

    step(dt) {
      const pet = this.pet;
      const floor = this.floor;
      if (!floor || this.prefs.hidden) return;
      const speed = Number(this.prefs.speed) || 1;
      const sizeFactor = this.scale / 3;
      pet.anim += dt;
      if (pet.state !== 'sleep') pet.awake += dt;

      this.followMouse();

      switch (pet.state) {
        case 'sit':
          if (pet.anim > 0.8) {
            pet.anim = 0;
            pet.frame++;
            if (Math.random() < 0.15) this.setState('blink');
          }
          break;
        case 'blink':
        case 'happy':
          if (pet.anim > 0.35) {
            pet.anim = 0;
            pet.frame++;
          }
          break;
        case 'sleep':
          if (pet.anim > 0.9) {
            pet.anim = 0;
            pet.frame++;
          }
          pet.zTimer += dt;
          if (pet.zTimer > 1.4) {
            pet.zTimer = 0;
            this.particles('z', 1);
          }
          break;
        case 'walk':
        case 'run':
        case 'carry': {
          const v = (pet.state === 'run' ? 120 : 40) * speed * sizeFactor;
          if (this.moveToward(pet.target, v, dt)) {
            if (pet.state === 'carry') {
              this.ball.held = false;
              this.ball.vx = 0;
              this.ball.vy = 0;
              this.setState('happy');
            } else {
              this.setState('sit');
            }
          }
          break;
        }
        case 'chase': {
          const v = 130 * speed * sizeFactor;
          const target = this.ball.x - this.size.w / 2;
          this.moveToward(target, v, dt);
          const mouth = this.mouthPoint();
          const grounded = this.ball.y >= floor.y - this.ballRadius() - 3;
          if (grounded && Math.abs(mouth.x - this.ball.x) < 10 * sizeFactor) {
            this.ball.held = true;
            this.setState('carry');
            pet.target = this.prefs.mode === 'interactive' && this.mouse.inside
              ? clamp(this.mouse.x - this.size.w / 2, floor.x0, floor.x1 - this.size.w)
              : rand(floor.x0, floor.x1 - this.size.w);
          }
          if (!this.ball.active) this.setState('sit');
          break;
        }
        case 'fall':
          pet.vy += GRAVITY * dt;
          pet.y += pet.vy * dt;
          if (pet.y >= floor.y) {
            pet.y = floor.y;
            this.setState('sit');
          }
          break;
        default:
          break;
      }

      if (pet.timer > 0 && ['sit', 'blink', 'happy', 'sleep'].includes(pet.state)) {
        pet.timer -= dt;
        if (pet.timer <= 0) {
          if (pet.state === 'blink') this.setState('sit');
          else if (!this.followMouse()) this.nextState();
        }
      }

      if (pet.state !== 'drag' && pet.state !== 'fall') {
        pet.x = clamp(pet.x, floor.x0, Math.max(floor.x0, floor.x1 - this.size.w));
        pet.y = floor.y;
      }
      this.stepBall(dt);
    }

    moveToward(target, v, dt) {
      const pet = this.pet;
      const delta = target - pet.x;
      if (Math.abs(delta) < 2) return true;
      pet.dir = delta > 0 ? 1 : -1;
      pet.x += Math.sign(delta) * Math.min(Math.abs(delta), v * dt);
      const fps = pet.state === 'walk' ? 6 : 12;
      if (pet.anim > 1 / fps) {
        pet.anim = 0;
        pet.frame++;
      }
      return false;
    }

    ballRadius() {
      return 2 * this.scale;
    }

    mouthPoint() {
      const pet = this.pet;
      const [mx, my] = MOUTH.walk;
      const s = this.scale;
      const x = pet.dir > 0 ? pet.x + mx * s : pet.x + (GRID_W - mx) * s;
      return { x, y: pet.y - (GRID_H - my) * s };
    }

    stepBall(dt) {
      const ball = this.ball;
      const floor = this.floor;
      if (!ball.active) return;
      if (ball.held) {
        const mouth = this.mouthPoint();
        ball.x = mouth.x;
        ball.y = mouth.y;
        return;
      }
      const r = this.ballRadius();
      ball.vy += GRAVITY * 0.75 * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.y > floor.y - r) {
        ball.y = floor.y - r;
        ball.vy = Math.abs(ball.vy) > 80 ? -ball.vy * 0.55 : 0;
        ball.vx *= 1 - Math.min(1, 2.5 * dt);
      }
      if (ball.x < floor.x0 + r || ball.x > floor.x1 - r) {
        ball.x = clamp(ball.x, floor.x0 + r, floor.x1 - r);
        ball.vx = -ball.vx * 0.6;
      }
      if (ball.vy === 0 && Math.abs(ball.vx) < 4) ball.vx = 0;
    }

    // ---- input

    onPress(event, target) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.press = { target, mx: event.clientX, my: event.clientY, px: this.pet.x, py: this.pet.y, dragging: false };
      this.reportHot(true);
    }

    onMove(event) {
      const press = this.press;
      if (!press || press.target !== 'pet') return;
      const dx = event.clientX - press.mx;
      const dy = event.clientY - press.my;
      if (!press.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        press.dragging = true;
        this.pet.state = 'drag';
        if (this.ball.held) this.ball.held = false;
      }
      if (press.dragging) {
        this.pet.x = press.px + dx;
        this.pet.y = press.py + dy;
      }
    }

    onRelease() {
      const press = this.press;
      if (!press) return;
      this.press = null;
      this.reportHot(false);
      if (press.dragging) {
        this.setState('fall');
        return;
      }
      if (this.clickTimer) {
        clearTimeout(this.clickTimer);
        this.clickTimer = null;
        this.onDoubleClick(press.target);
      } else {
        this.clickTimer = setTimeout(() => {
          this.clickTimer = null;
          this.onSingleClick(press.target);
        }, CLICK_DELAY_MS);
      }
    }

    onSingleClick(target) {
      if (target === 'paw') {
        this.pawCanvas.classList.remove('wiggle');
        void this.pawCanvas.offsetWidth;
        this.pawCanvas.classList.add('wiggle');
        return;
      }
      if (!['drag', 'fall', 'chase', 'carry'].includes(this.pet.state)) this.setState('happy');
    }

    onDoubleClick(target) {
      if (target === 'paw') {
        this.show();
        return;
      }
      this.hooks.onToggleConsole();
    }

    // ---- rendering

    particles(text, count) {
      const pet = this.pet;
      const { w, h } = this.size;
      for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = `particle ${text === 'z' ? 'zz' : 'heart'}`;
        el.textContent = text;
        el.style.left = `${pet.x + w * (pet.dir > 0 ? 0.7 : 0.3) + rand(-10, 10)}px`;
        el.style.top = `${pet.y - h * 0.9}px`;
        el.style.animationDelay = `${i * 0.15}s`;
        el.style.fontSize = `${4 * this.scale}px`;
        this.root.appendChild(el);
        setTimeout(() => el.remove(), 1800 + i * 150);
      }
    }

    pose() {
      switch (this.pet.state) {
        case 'walk':
        case 'run':
        case 'chase':
        case 'carry':
          return 'walk';
        case 'sleep':
          return 'sleep';
        case 'happy':
          return 'happy';
        case 'blink':
          return 'blink';
        case 'drag':
        case 'fall':
          return 'drag';
        default:
          return 'sit';
      }
    }

    draw() {
      const floor = this.floor;
      const hidden = this.prefs.hidden || !floor;
      this.petCanvas.style.display = hidden ? 'none' : 'block';
      this.ballCanvas.style.display = hidden || !this.ball.active ? 'none' : 'block';
      this.pawCanvas.style.display = this.prefs.hidden && floor ? 'block' : 'none';
      if (floor && this.prefs.hidden) this.drawPaw();
      if (hidden) return;

      const pet = this.pet;
      const { w, h } = this.size;
      const pose = this.pose();
      const index = pet.frame % frameCount(pose);
      const key = `${this.prefs.color}:${pose}:${index}:${this.scale}:${pet.dir}`;
      if (key !== this.lastDraw) {
        this.lastDraw = key;
        const canvas = this.petCanvas;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        if (pet.dir < 0) {
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(frame(this.prefs.color, pose, index), 0, 0, w, h);
        ctx.restore();
      }
      const transform = `translate(${Math.round(pet.x)}px, ${Math.round(pet.y - h)}px)`;
      if (transform !== this.lastTransform) {
        this.lastTransform = transform;
        this.petCanvas.style.transform = transform;
      }
      if (this.ball.active) this.drawBall();
    }

    drawBall() {
      const canvas = this.ballCanvas;
      const size = 4 * this.scale;
      if (canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const colors = { o: '#5a1410', R: '#e0483e', r: '#f7a59a' };
        BALL_ART.forEach((row, y) =>
          [...row].forEach((c, x) => {
            if (c === '.') return;
            ctx.fillStyle = colors[c];
            ctx.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
          }),
        );
      }
      canvas.style.transform = `translate(${Math.round(this.ball.x - size / 2)}px, ${Math.round(this.ball.y - size / 2)}px)`;
    }

    drawPaw() {
      const canvas = this.pawCanvas;
      const s = this.scale;
      const key = `${this.prefs.color}:${s}`;
      if (canvas.dataset.key !== key) {
        canvas.dataset.key = key;
        canvas.width = 5 * s;
        canvas.height = 6 * s;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(paw(this.prefs.color), 0, 0, 5 * s, 6 * s);
      }
      const { x1, y } = this.floor;
      canvas.style.left = `${x1 - 5 * s - 12}px`;
      canvas.style.top = `${y - 6 * s - 4}px`;
    }

    // Rects (window coords) where the overlay must receive clicks.
    hotRects(extra) {
      const rects = [];
      const floor = this.floor;
      if (floor && !this.prefs.hidden) {
        const { w, h } = this.size;
        rects.push([this.pet.x, this.pet.y - h, w, h]);
      }
      if (floor && this.prefs.hidden) {
        const s = this.scale;
        rects.push([floor.x1 - 5 * s - 16, floor.y - 6 * s - 8, 5 * s + 8, 6 * s + 8]);
      }
      return rects.concat(extra);
    }

    reportHot(capture) {
      const rects = this.hotRects(this.hooks.extraHotRects()).map((r) => r.map(Math.round));
      const capturing = capture != null ? capture : Boolean(this.press);
      const key = JSON.stringify([rects, capturing]);
      if (key === this.lastHot) return;
      this.lastHot = key;
      this.hooks.onHot(rects, capturing);
    }

    needsFastFrames() {
      return FAST_STATES.has(this.pet.state) || (this.ball.active && !this.ball.held && (this.ball.vx !== 0 || this.ball.vy !== 0));
    }
  }

  window.PetWorld = PetWorld;
})();
