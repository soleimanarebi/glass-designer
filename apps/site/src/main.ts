// Small enhancements only: the page works without them.

/** Drag-to-rotate for the hero panel, with a slow idle sway unless reduced motion is preferred. */
function heroPanel() {
  const scene = document.getElementById("scene");
  const panel = document.getElementById("panel3d");
  if (!scene || !panel) return;
  let rx = -8;
  let ry = -32;
  let dragging = false;
  let last = { x: 0, y: 0 };
  const apply = () => {
    panel.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  };
  scene.addEventListener("pointerdown", (e) => {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    scene.setPointerCapture(e.pointerId);
  });
  scene.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    ry += (e.clientX - last.x) * 0.4;
    rx = Math.max(-60, Math.min(60, rx - (e.clientY - last.y) * 0.4));
    last = { x: e.clientX, y: e.clientY };
    apply();
  });
  const stop = () => {
    dragging = false;
  };
  scene.addEventListener("pointerup", stop);
  scene.addEventListener("pointercancel", stop);
  apply();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let t0 = performance.now();
  const sway = (t: number) => {
    if (!dragging) {
      ry += Math.sin((t - t0) / 2400) * 0.06;
      apply();
    } else {
      t0 = t;
    }
    requestAnimationFrame(sway);
  };
  requestAnimationFrame(sway);
}

/** Live character count under the message box. */
function messageCounter() {
  const box = document.querySelector<HTMLTextAreaElement>("#message");
  const out = document.getElementById("message-count");
  if (!box || !out) return;
  const update = () => {
    out.textContent = `${box.value.length} / ${box.maxLength}`;
  };
  box.addEventListener("input", update);
  update();
}

function year() {
  const el = document.getElementById("year");
  if (el) el.textContent = String(new Date().getFullYear());
}

heroPanel();
messageCounter();
year();
