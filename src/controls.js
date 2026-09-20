// Entrées clavier + tactile (joystick virtuel et boutons)

export function createControls({ onAction, onEnter, onBuild }) {
  const state = {
    forward: 0,   // -1..1
    turn: 0,      // -1..1 (positif = droite)
  };

  const keys = new Set();
  const keyForward = ['ArrowUp', 'KeyW', 'KeyZ'];
  const keyBack = ['ArrowDown', 'KeyS'];
  const keyLeft = ['ArrowLeft', 'KeyA', 'KeyQ'];
  const keyRight = ['ArrowRight', 'KeyD'];

  let joyForward = 0, joyTurn = 0;

  function refresh() {
    const kf = (keyForward.some(k => keys.has(k)) ? 1 : 0) - (keyBack.some(k => keys.has(k)) ? 1 : 0);
    const kt = (keyRight.some(k => keys.has(k)) ? 1 : 0) - (keyLeft.some(k => keys.has(k)) ? 1 : 0);
    state.forward = Math.abs(joyForward) > Math.abs(kf) ? joyForward : kf;
    state.turn = Math.abs(joyTurn) > Math.abs(kt) ? joyTurn : kt;
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') { e.preventDefault(); onAction(); }
    if (e.code === 'KeyE') onEnter();
    if (e.code === 'KeyB') onBuild();
    refresh();
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); refresh(); });
  window.addEventListener('blur', () => { keys.clear(); refresh(); });

  // ---------- Joystick tactile ----------
  const zone = document.getElementById('joystick-zone');
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  let joyPointer = null;
  let center = { x: 0, y: 0 };
  const RADIUS = 45;

  function setKnob(dx, dy) {
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  zone.addEventListener('pointerdown', (e) => {
    joyPointer = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const r = base.getBoundingClientRect();
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    handleJoy(e);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === joyPointer) handleJoy(e);
  });
  function endJoy(e) {
    if (e.pointerId !== joyPointer) return;
    joyPointer = null;
    joyForward = 0; joyTurn = 0;
    setKnob(0, 0);
    refresh();
  }
  zone.addEventListener('pointerup', endJoy);
  zone.addEventListener('pointercancel', endJoy);

  function handleJoy(e) {
    let dx = e.clientX - center.x;
    let dy = e.clientY - center.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = dx / len * RADIUS; dy = dy / len * RADIUS; }
    setKnob(dx, dy);
    joyTurn = dx / RADIUS;
    joyForward = -dy / RADIUS;
    refresh();
  }

  // ---------- Boutons ----------
  function bindButton(id, handler) {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); handler(); });
  }
  bindButton('btn-action', onAction);
  bindButton('btn-enter', onEnter);
  bindButton('btn-build', onBuild);

  return state;
}
