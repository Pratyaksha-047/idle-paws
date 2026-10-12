// Wires the pet world, console and native bridge together and runs the frame loop.
(function () {
  const root = document.getElementById('stage');
  let petConsole = null;

  const world = new window.PetWorld(root, {
    onHot: (rects, capture) => window.PetBus.post('hot', { rects, capture }),
    onPrefs: (prefs) => window.PetBus.post('prefs', { prefs }),
    onMouseMode: (on) => window.PetBus.post('mouseMode', { on }),
    onToggleConsole: () => petConsole.toggle(),
    extraHotRects: () => {
      const rect = petConsole && petConsole.rect();
      return rect ? [rect] : [];
    },
  });

  petConsole = new window.PetConsole(root, world, {
    onChange: () => {
      world.setFrozen(petConsole.open);
      world.reportHot();
    },
    onPlay: () => window.PetBus.post('openGame'),
  });

  window.PetBus.on('env', (env) => {
    world.setEnv(env);
    if (!env.floor) petConsole.close();
  });
  window.PetBus.on('prefs', (prefs) => world.setPrefs(prefs));
  window.PetBus.on('mouse', (mouse) => world.setMouse(mouse));
  window.PetBus.on('outsideClick', () => petConsole.close());
  window.PetBus.on('notice', ({ text }) => world.say(text));
  window.PetBus.on('react', ({ kind, project }) => world.react(kind, project));
  window.PetBus.on('command', ({ name }) => {
    if (name === 'show') world.show();
    if (name === 'hide') {
      petConsole.close();
      world.hide();
    }
    if (name === 'console') petConsole.show();
  });

  // Outside the native overlay (plain browser), fake an environment for previewing.
  if (!window.PetBus.native) {
    document.body.classList.add('demo');
    const fakeEnv = () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      gameBase: 'http://localhost:4747/',
      floor: { y: window.innerHeight - 120, x0: 40, x1: window.innerWidth - 40, source: 'demo' },
    });
    world.setEnv(fakeEnv());
    window.addEventListener('resize', () => world.setEnv(fakeEnv()));
    window.addEventListener('mousemove', (e) => world.setMouse({ x: e.clientX, y: e.clientY, inside: true }));
    window.addEventListener('dblclick', () => {});
  }

  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    world.step(dt);
    world.draw();
    world.reportHot();
    if (petConsole.open) petConsole.position();
    setTimeout(loop, world.needsFastFrames() ? 33 : 100);
  };
  loop();

  window.PetBus.post('ready');
})();
