// Small touches only: the page works fully without JavaScript.
const root = document.documentElement;
root.classList.add("js");
document.getElementById("year").textContent = new Date().getFullYear();

// Light / dark toggle. Follows the system until the visitor picks one.
const toggle = document.querySelector(".theme");
const isDark = () =>
  root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
const label = () => toggle.setAttribute("aria-pressed", String(isDark()));
label();
toggle.addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) {}
  label();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", label);

// Fade sections in as they scroll into view
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("shown");
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.08 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("shown"));
}

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();

/* ---------- Hero monitor: a blip runs along the ECG trace; hover makes it race ---------- */
(() => {
  const monitor = document.querySelector(".monitor");
  const path = document.getElementById("trace-path");
  const blip = monitor && monitor.querySelector(".blip");
  if (!monitor || !path || calm) return;
  const bpmEl = document.getElementById("bpm");
  const length = path.getTotalLength();
  const svg = path.ownerSVGElement;
  let bpm = 64, target = 64, pos = 0, last = 0;
  monitor.classList.add("live");
  monitor.addEventListener("pointerenter", () => { target = 128; });
  monitor.addEventListener("pointerleave", () => { target = 64; });
  // The trace holds 3 beats across the screen; the blip crosses it at the current heart rate
  function frame(t) {
    const dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
    last = t;
    bpm += (target - bpm) * Math.min(dt * 2, 1);
    pos = (pos + length * (bpm / 60) / 3 * dt) % length;
    const p = path.getPointAtLength(pos);
    blip.setAttribute("cx", p.x);
    blip.setAttribute("cy", p.y);
    bpmEl.textContent = Math.round(bpm);
    monitor.style.setProperty("--beat", (60 / bpm).toFixed(2) + "s");
    requestAnimationFrame(frame);
  }
  // Start once the trace has finished drawing itself in
  setTimeout(() => requestAnimationFrame(frame), 2400);
  svg.setAttribute("aria-hidden", "true");
})();

/* ---------- Mini heart: one real heartbeat's electrical vector, rotating in 3D ---------- */
(() => {
  const canvas = document.getElementById("heart");
  if (!canvas || !canvas.getContext) return;
  const figure = canvas.closest("figure");
  const ctx = canvas.getContext("2d");
  let beat = null, yaw = -0.6, pitch = 0.35, drag = null, visible = false, i = 0, last = 0;

  fetch("data/heartbeat.json").then((r) => r.json()).then((d) => {
    beat = d;
    figure.querySelector(".fallback").hidden = true;
    canvas.hidden = false;
    figure.querySelector(".legend").hidden = false;
    resize();
    requestAnimationFrame(draw);
  }).catch(() => {});  // keep the screenshot if anything goes wrong

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", () => beat && resize());
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  // Drag to rotate (mouse or finger); vertical swipes still scroll the page on phones
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
    pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.01));
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  canvas.addEventListener("pointercancel", () => { drag = null; });

  // Frank lead axes (x = left, y = feet, z = back) -> screen, as in heart3D
  function project(x, y, z, w, h, scale) {
    let X = x, Y = -y, Z = -z;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    [X, Z] = [X * cy + Z * sy, -X * sy + Z * cy];
    [Y, Z] = [Y * cp - Z * sp, Y * sp + Z * cp];
    const persp = 1 / (1 + Z * 0.25);
    return [w / 2 + X * scale * persp, h * 0.46 - Y * scale * persp, Z];
  }

  function draw(t) {
    requestAnimationFrame(draw);
    if (!visible) { last = t; return; }
    const dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
    last = t;
    if (!drag && !calm) yaw += dt * 0.35;
    const n = beat.phase.length;
    if (!calm) i = (i + dt * beat.fs * 0.5) % n;  // half speed so the loops are easy to follow

    const w = canvas.clientWidth, h = canvas.clientHeight;
    const colors = [css("--muted"), css("--wave-p"), css("--accent"), css("--wave-t")];
    const [vx, vy, vz] = beat.vector;
    const peak = Math.max(...vx.map((_, k) => Math.hypot(vx[k], vy[k], vz[k])));
    const scale = Math.min(w, h) * 0.36 / peak;
    ctx.clearRect(0, 0, w, h);

    // Faint axes for orientation
    ctx.lineWidth = 1; ctx.strokeStyle = css("--line");
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(([a, b, c]) => {
      const p = project(-a * peak, -b * peak, -c * peak, w, h, scale), q = project(a * peak, b * peak, c * peak, w, h, scale);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    });

    // The three loops, coloured by phase
    const pts = vx.map((_, k) => project(vx[k], vy[k], vz[k], w, h, scale));
    ctx.lineWidth = 2; ctx.lineJoin = "round";
    for (let k = 1; k < n; k++) {
      const ph = beat.phase[k];
      if (!ph) continue;
      ctx.strokeStyle = colors[ph];
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The live arrow: where the heart's electrical "push" points right now
    const k = Math.floor(i), o = project(0, 0, 0, w, h, scale), tip = pts[k];
    ctx.strokeStyle = colors[beat.phase[k]] || colors[0];
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.arc(tip[0], tip[1], 4.5, 0, Math.PI * 2); ctx.fill();

    // Lead II strip along the bottom, with a cursor in sync
    const strip = beat.leadII, sMax = Math.max(...strip.map(Math.abs)), sy0 = h - 26, sh = 18;
    ctx.lineWidth = 1.5; ctx.strokeStyle = css("--muted"); ctx.globalAlpha = 0.8;
    ctx.beginPath();
    strip.forEach((v, j) => { const x = 16 + (w - 32) * j / (n - 1), y = sy0 - v / sMax * sh; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.globalAlpha = 1;
    const cx = 16 + (w - 32) * k / (n - 1);
    ctx.fillStyle = ctx.strokeStyle = colors[beat.phase[k]] || colors[0];
    ctx.beginPath(); ctx.arc(cx, sy0 - strip[k] / sMax * sh, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = "11px " + css("--mono"); ctx.fillStyle = css("--muted");
    ctx.fillText("lead II · " + beat.bpm + " bpm", 16, h - 4);
  }
})();

/* ---------- Notebook: flip through the notes ---------- */
(() => {
  const book = document.querySelector(".notebook");
  if (!book) return;
  const pages = [...book.querySelectorAll(".page")];
  const count = book.querySelector(".page-count");
  let cur = 0;
  function show(n) {
    cur = (n + pages.length) % pages.length;
    pages.forEach((p, k) => {
      p.classList.toggle("current", k === cur);
      p.classList.toggle("gone", k < cur);
      p.setAttribute("aria-hidden", String(k !== cur));
    });
    count.textContent = `${cur + 1} / ${pages.length}`;
  }
  book.querySelector(".prev").addEventListener("click", () => show(cur - 1));
  book.querySelector(".next").addEventListener("click", () => show(cur + 1));
  // Swipe on phones
  let x0 = null;
  book.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  book.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  show(0);
})();

/* ---------- Interests: tap to flip (hover flips with a mouse) ---------- */
document.querySelectorAll(".card button").forEach((b) => {
  b.addEventListener("click", () => {
    const card = b.parentElement;
    card.classList.toggle("flipped");
    b.setAttribute("aria-pressed", String(card.classList.contains("flipped")));
  });
});

/* ---------- Hidden terminal: press ~ ---------- */
(() => {
  const term = document.getElementById("terminal");
  const out = document.getElementById("term-out");
  const form = document.getElementById("term-form");
  const input = document.getElementById("term-in");
  if (!term) return;
  const history = [];
  let hIndex = 0, opener = null;

  const PROJECTS = {
    heart3d: ["heart3D", "https://heart3d.ardesams.com", "A real 12-lead ECG rebuilt in 3D on a CT-scanned heart, with live mode and two AI models."],
    farmconnect: ["FarmConnect", "https://github.com/deograciousnot/Farm", "Marketplace + community app for Kenyan farmers. Expo, Node, MongoDB, M-Pesa."],
    goldbot: ["Gold trading bot", "https://github.com/deograciousnot/gold-bot", "33 strategies, 20 years, 8 markets. One survivor, unproven. Demo-only bot."],
    flightplan: ["Flight Plan", "https://github.com/deograciousnot/flightplan", "Self-study route from rusty maths to orbit. 72 tasks."],
    transformlab: ["Transform Lab", "#p-transform", "Practice for 2D geometric transformations."],
    homeserver: ["Home server", "#p-server", "Old hardware, Ubuntu, Docker, a dashboard. Now running on an HP laptop."],
  };
  const COMMANDS = {
    help: () => [
      "commands:",
      "  whoami           who's behind this notebook",
      "  projects         list my projects",
      "  open <project>   jump to one (e.g. open heart3d)",
      "  now              what I'm doing these days",
      "  interests        away from the keyboard",
      "  heartbeat        64 bpm, give or take",
      "  theme            flip light / dark",
      "  github           my code",
      "  coffee, sudo     try them",
      "  clear, exit",
    ],
    whoami: () => ["Deogracious Kiprop · Nairobi, Kenya", "CS student at the University of Nairobi. I build things that answer questions."],
    projects: () => Object.entries(PROJECTS).map(([k, [name, , d]]) => `  <span class="acc">${k.padEnd(14)}</span>${name}: ${d}`),
    open: (arg) => {
      const p = PROJECTS[(arg || "").toLowerCase()];
      if (!p) return [`open: which one? try: ${Object.keys(PROJECTS).join(", ")}`];
      if (p[1].startsWith("#")) { close(); document.querySelector(p[1])?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" }); return []; }
      window.open(p[1], "_blank", "noopener");
      return [`opening ${p[0]}…`];
    },
    now: () => [...document.querySelectorAll(".now li")].map((li) => "• " + li.textContent),
    interests: () => [...document.querySelectorAll(".card .back")].map((b) => "• " + b.querySelector("b").textContent + ": " + b.childNodes[1].textContent),
    heartbeat: () => ["        ♥", "  _/\\___/\\_  ___/\\_____/\\_  ___", "            \\/          \\/", "  64 bpm. Still running."],
    theme: () => { toggle.click(); return [`theme: ${isDark() ? "dark" : "light"}`]; },
    github: () => { window.open("https://github.com/deograciousnot", "_blank", "noopener"); return ["opening github.com/deograciousnot…"]; },
    coffee: () => ["☕ brewing… done. Built with curiosity and caffeine."],
    sudo: () => ["nice try. this incident will be reported (to nobody)."],
    ls: () => ["projects/  notes/  interests/  secrets.txt"],
    cat: (arg) => arg === "secrets.txt" ? ["there are no secrets. only unfinished projects."] : [`cat: ${arg || "?"}: no such file`],
    clear: () => { out.innerHTML = ""; return []; },
    exit: () => { close(); return []; },
  };

  function print(lines, cls) {
    for (const line of lines) {
      const div = document.createElement("div");
      if (cls) div.className = cls;
      div.innerHTML = line;
      out.appendChild(div);
    }
    out.scrollTop = out.scrollHeight;
  }
  const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function open() {
    if (!term.hidden) return;
    opener = document.activeElement;
    term.hidden = false;
    if (!out.childElementCount) print(["welcome to the notebook. type <span class=\"acc\">help</span> to look around."]);
    input.focus();
  }
  function close() {
    term.hidden = true;
    if (opener && opener.focus) opener.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    input.value = "";
    if (!raw) return;
    history.push(raw); hIndex = history.length;
    print([`<span class="prompt">$</span> ${escape(raw)}`], "cmd");
    const [cmd, ...rest] = raw.split(/\s+/);
    const fn = COMMANDS[cmd.toLowerCase()];
    print(fn ? fn(rest.join(" ")) : [`${escape(cmd)}: command not found. try <span class="acc">help</span>`]);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && hIndex > 0) { input.value = history[--hIndex]; e.preventDefault(); }
    if (e.key === "ArrowDown") { hIndex = Math.min(history.length, hIndex + 1); input.value = history[hIndex] || ""; }
  });
  document.addEventListener("keydown", (e) => {
    const typing = /input|textarea|select/i.test(document.activeElement.tagName) && document.activeElement !== input;
    if ((e.key === "~" || e.key === "`") && term.hidden && !typing) { e.preventDefault(); open(); }
    else if (e.key === "Escape" && !term.hidden) close();
  });
  document.querySelector(".term-open").addEventListener("click", open);
  term.querySelector(".term-close").addEventListener("click", close);
})();
