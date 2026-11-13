// The Long Way Round: story engine.
// Owns the renderer, the first-person camera, the HUD and the chapter sequence.
// Each chapter (story/chapters/*.js) builds its own world and plays itself using the helpers in `ctx`.
import * as THREE from "three";
import forest from "./chapters/forest.js";
import { createSound } from "./sound.js";

const CHAPTERS = [forest];   // more worlds are added here, in order
const TOTAL_FRAGMENTS = 8;   // one per world in the finished story
const SAVE_KEY = "long-way-round";
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

// ---------- Saved progress (per visitor, in this browser only) ----------
const save = {
  read() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { fragments: [] }; } catch { return { fragments: [] }; } },
  write(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch {} },
};
let progress = save.read();

// ---------- No WebGL? Show the original intro instead ----------
function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
if (!webglOK()) {
  $("start").hidden = true;
  $("classic").hidden = false;
  const text = "“Two roads diverged in a wood, and I—\nI took the one less traveled by,\nand that has made all the difference.”\n\nBut not every path is taken out of boldness.\nSome are taken because silence pulled us there.\nBecause questions echoed louder than answers.\n\nThis is the story behind the story.\nThis is Deogracious.";
  let i = 0;
  (function type() { if (i < text.length) { $("quote").textContent += text[i++]; setTimeout(type, 30); } })();
  throw new Error("WebGL not available: showing the classic intro");
}

// ---------- Renderer, scene, camera ----------
const canvas = $("world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600);
let scene = new THREE.Scene();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 82 : 70;   // wider view on phones held upright
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// First person: the chapter moves a "rig"; the visitor can look around a little on top of it
const rig = { position: new THREE.Vector3(), target: new THREE.Vector3(0, 0, -1) };
const look = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  look.tx = (e.clientX / innerWidth - 0.5) * 0.5;
  look.ty = (e.clientY / innerHeight - 0.5) * 0.3;
});
addEventListener("deviceorientation", (e) => {
  if (e.gamma == null) return;
  look.tx = Math.max(-0.4, Math.min(0.4, e.gamma / 90));
  look.ty = Math.max(-0.25, Math.min(0.25, (e.beta - 45) / 120));
});

// ---------- Frame loop ----------
const frameFns = new Set();
const clock = new THREE.Clock();
const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  for (const fn of frameFns) fn(t, dt);
  look.x += (look.tx - look.x) * Math.min(dt * 3, 1);
  look.y += (look.ty - look.y) * Math.min(dt * 3, 1);
  camera.position.copy(rig.position);
  camera.lookAt(rig.target);
  if (!calm) {
    camera.rotateY(-look.x);
    camera.rotateX(-look.y);
  }
  renderer.render(scene, camera);
});

// ---------- HUD helpers ----------
function renderFragments() {
  $("fragments").innerHTML = "";
  for (let k = 0; k < TOTAL_FRAGMENTS; k++) {
    const li = document.createElement("li");
    if (k < progress.fragments.length) { li.className = "got"; li.title = progress.fragments[k]; }
    $("fragments").appendChild(li);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, calm ? Math.min(ms, 400) : ms));

// Wait for a tap, click, space or enter anywhere
function nextInput() {
  return new Promise((resolve) => {
    const done = (e) => {
      if (e.type === "keydown" && !["Space", "Enter", "ArrowRight"].includes(e.code)) return;
      if (e.target.closest && e.target.closest(".corner")) return;
      e.preventDefault?.();
      removeEventListener("keydown", done); removeEventListener("pointerup", done);
      resolve();
    };
    setTimeout(() => { addEventListener("keydown", done); addEventListener("pointerup", done); }, 150);
  });
}

// Typewriter narration; tap once to finish the line, again to continue
async function say(lines) {
  const box = $("narration"), p = $("line");
  box.hidden = false;
  for (const line of [].concat(lines)) {
    box.classList.remove("ready");
    p.textContent = "";
    let skip = false;
    const hurry = nextInput().then(() => { skip = true; });
    for (let i = 0; i < line.length && !skip; i++) {
      p.textContent += line[i];
      await new Promise((r) => setTimeout(r, calm ? 0 : 28));
    }
    p.textContent = line;
    if (!skip) await Promise.race([hurry, wait(150)]);
    box.classList.add("ready");
    await nextInput();
  }
  box.hidden = true;
}

// Big cinematic title words
async function card(html, ms = 2600) {
  const c = $("card");
  c.innerHTML = `<div>${html}</div>`;   // one block, so the lines stay together
  c.classList.add("show");
  await wait(ms);
  c.classList.remove("show");
  await wait(1200);
}

function cinema(on) { document.body.classList.toggle("cinema", on); }

function prompt(html) {
  const el = $("prompt");
  el.hidden = !html;
  if (html) el.innerHTML = html;
  return el;
}

// Move the camera rig along a curve over `seconds` (eased), looking slightly ahead.
// Driven by the clock, not by frame count, so it takes the same time on a slow phone;
// a timer finishes it even if the browser stops sending frames (e.g. a background tab).
function fly(curve, seconds, { lookAhead = 0.02, lookAt = null } = {}) {
  const duration = (calm ? Math.min(seconds, 1.5) : seconds) * 1000;
  const start = performance.now();
  return new Promise((resolve) => {
    const place = () => {
      const u = Math.min(1, (performance.now() - start) / duration);
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      rig.position.copy(curve.getPointAt(e));
      rig.target.copy(lookAt || curve.getPointAt(Math.min(1, e + lookAhead)));
      return u >= 1;
    };
    frameFns.add(place);
    const timer = setInterval(() => {
      if (place()) { clearInterval(timer); frameFns.delete(place); resolve(); }
    }, 100);
  });
}

// Quest helper: hold (pointer down, or space) to walk forward along a curve. onProgress(0..1) each frame.
function holdToWalk(curve, { speed = 0.045, eye = 1.7, onProgress } = {}) {
  return new Promise((resolve) => {
    let held = false, u = 0;
    const down = (e) => { if (e.target.closest && e.target.closest(".corner, .narration")) return; held = true; };
    const up = () => { held = false; };
    const key = (e) => { if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); held = e.type === "keydown"; } };
    const wheel = (e) => { u = Math.min(1, u + Math.max(0, e.deltaY) * 0.0004); };
    addEventListener("pointerdown", down); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    addEventListener("keydown", key); addEventListener("keyup", key); addEventListener("wheel", wheel, { passive: true });
    // Progress follows real elapsed time (frames and a timer both call this; whichever comes first)
    let last = performance.now();
    const step = () => {
      const now = performance.now(), dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      if (held) u = Math.min(1, u + dt * speed);
      const p = curve.getPointAt(u);
      const bob = held && !calm ? Math.sin(now / 1000 * 9) * 0.04 : 0;
      rig.position.set(p.x, p.y + eye + bob, p.z);
      const a = curve.getPointAt(Math.min(1, u + 0.03));
      rig.target.set(a.x, a.y + eye, a.z);
      onProgress?.(u);
      const m = $("prompt").querySelector(".meter i");
      if (m) m.style.width = (u * 100).toFixed(1) + "%";
      if (u >= 1) {
        frameFns.delete(step); clearInterval(timer);
        removeEventListener("pointerdown", down); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
        removeEventListener("keydown", key); removeEventListener("keyup", key); removeEventListener("wheel", wheel);
        resolve();
      }
    };
    frameFns.add(step);
    const timer = setInterval(step, 100);
  });
}

// Quest helper: wait until the visitor taps a specific 3D object
function tapObject(object) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  return new Promise((resolve) => {
    const onUp = (e) => {
      if (e.target !== canvas) return;
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.intersectObject(object, true).length) {
        removeEventListener("pointerup", onUp); removeEventListener("keydown", onKey);
        resolve();
      }
    };
    const onKey = (e) => { if (e.code === "Enter" || e.code === "Space") { removeEventListener("pointerup", onUp); removeEventListener("keydown", onKey); resolve(); } };
    addEventListener("pointerup", onUp); addEventListener("keydown", onKey);
  });
}

function collect(name) {
  if (!progress.fragments.includes(name)) progress.fragments.push(name);
  save.write(progress);
  renderFragments();
}

// Fade the whole view to black and back, for moving between worlds
async function fade(toBlack) {
  canvas.style.transition = "opacity 1.2s ease";
  canvas.style.opacity = toBlack ? "0" : "1";
  await wait(1200);
}

// ---------- Running the story ----------
const sound = createSound();
const ctx = { THREE, renderer, camera, rig, frameFns, say, card, cinema, prompt, fly, holdToWalk, tapObject, collect, wait, calm, fade, nextInput, sound };
const params = new URLSearchParams(location.search);
if (params.has("debug")) window.story = ctx;   // for testing: story.rig etc.
if (params.has("autotest")) import("./autotest.js").then((m) => m.default());

async function play(from) {
  $("hud").hidden = false;
  renderFragments();
  for (let k = from; k < CHAPTERS.length; k++) {
    const ch = CHAPTERS[k];
    progress.chapter = k; save.write(progress);
    frameFns.clear();                      // stop the previous world (or the title backdrop)
    scene = new THREE.Scene();
    ctx.scene = scene;
    $("chapter").textContent = `${k + 1} · ${ch.title}`;
    sound.scene(ch.id);
    canvas.style.opacity = "0";
    const world = ch.build(ctx);           // build the world first, then fade in
    await fade(false);
    await ch.play(ctx, world);
    await fade(true);
    frameFns.clear();
    world?.dispose?.();
  }
  showEnd();
}

function showEnd() {
  cinema(false);
  $("hud").hidden = true;
  const n = progress.fragments.length;
  $("end-kicker").textContent = `${n} of ${TOTAL_FRAGMENTS} fragments`;
  $("end-title").textContent = "To be continued…";
  $("end-text").textContent = "The other worlds (the heartbeat, the fields, the gold vault, the launch pad, the server room, the drop and the deep end) are still being built. Come back soon.";
  $("end").hidden = false;
}

// ---------- Title screen ----------
const musicBtn = document.querySelector(".music");
function setMusic(on) {
  sound.setEnabled(on);
  musicBtn.setAttribute("aria-pressed", String(on));
  musicBtn.textContent = on ? "♪ Sound: on" : "♪ Sound: off";
}
musicBtn.addEventListener("click", (e) => { e.stopPropagation(); setMusic(!sound.enabled); });

$("loading").hidden = true;
if (progress.fragments.length) {
  document.querySelector(".resume").hidden = false;
  document.querySelector(".start .go").textContent = "Continue, with sound";
}
$("restart").addEventListener("click", () => { progress = { fragments: [] }; save.write(progress); location.reload(); });
document.querySelectorAll(".start .go").forEach((b) => b.addEventListener("click", async () => {
  setMusic(b.dataset.music === "on");
  $("start").classList.add("gone");
  setTimeout(() => { $("start").hidden = true; }, 1200);
  const from = Math.min(progress.chapter || 0, CHAPTERS.length - 1);
  play(progress.fragments.length >= CHAPTERS.length ? 0 : from);
}));
$("again").addEventListener("click", () => { progress = { fragments: [] }; save.write(progress); location.reload(); });

// While on the title screen, slowly drift through the first world as a backdrop
{
  ctx.scene = scene;
  const preview = CHAPTERS[0].build(ctx);
  CHAPTERS[0].backdrop?.(ctx, preview);
}
