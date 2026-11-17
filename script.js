// Deo's sketchbook. Everything here is an extra: the page reads fine without JavaScript.
const root = document.documentElement;
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- Day page / night page ---------- */
const lamp = document.querySelector(".lamp");
const isNight = () => root.dataset.page === "night";
const syncLamp = () => {
  lamp.setAttribute("aria-pressed", String(isNight()));
  lamp.querySelector(".type").textContent = isNight() ? "day page" : "night page";
};
syncLamp();
lamp.addEventListener("click", () => {
  root.dataset.page = isNight() ? "day" : "night";
  try { localStorage.setItem("page", root.dataset.page); } catch (e) {}
  syncLamp();
});

/* ---------- Drawings sketch themselves when they come into view ---------- */
document.querySelectorAll(".drawn").forEach((svg) => {
  svg.querySelectorAll("path, circle").forEach((p, k) => p.style.setProperty("--dl", Math.min(k * 0.1, 1.2).toFixed(2) + "s"));
});
const draw = (el) => el.classList.add("is-drawn");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const t = e.target;
      t.classList.add("shown");
      if (t.classList.contains("spread")) setTimeout(() => t.classList.add("open"), 600);
      if (t.matches(".drawn:not([data-wait])")) draw(t);
      t.querySelectorAll(".drawn:not([data-wait])").forEach(draw);
      io.unobserve(t);
    }
  }, { threshold: 0.2 });
  document.querySelectorAll(".reveal, .drawn").forEach((el) => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("shown", "open"));
  document.querySelectorAll(".drawn").forEach(draw);
}

/* ---------- The pencil: a graphite trail that fades ---------- */
(() => {
  const c = document.getElementById("graphite");
  if (!finePointer || calm || !c) return;
  const ctx = c.getContext("2d");
  const pts = [];
  const size = () => { const d = Math.min(devicePixelRatio || 1, 2); c.width = innerWidth * d; c.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener("resize", size);
  addEventListener("pointermove", (e) => { pts.push([e.clientX, e.clientY, performance.now()]); }, { passive: true });
  addEventListener("scroll", () => { pts.length = 0; }, { passive: true });
  (function frame(now) {
    requestAnimationFrame(frame);
    while (pts.length && now - pts[0][2] > 900) pts.shift();
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (pts.length < 2) return;
    ctx.lineCap = "round";
    const ink = css("--graphite");
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1, t] = pts[k];
      if (Math.hypot(x1 - x0, y1 - y0) > 80) continue;
      ctx.globalAlpha = 0.45 * (1 - (now - t) / 900);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  })(performance.now());
})();

/* ---------- Page 0: the welcome ---------- */
(() => {
  const w = document.getElementById("welcome");
  const rocketSvg = document.querySelector("#rocket .drawn");
  rocketSvg.setAttribute("data-wait", "");
  const awake = () => { rocketSvg.removeAttribute("data-wait"); setTimeout(() => draw(rocketSvg), 250); };
  let seen = false;
  try { seen = sessionStorage.getItem("welcomed") === "1"; } catch (e) {}
  if (seen || !w) { w && w.remove(); awake(); return; }

  root.style.overflow = "hidden";
  // scribbles stay on page 0 until you turn it
  const c = document.getElementById("scribble"), ctx = c.getContext("2d");
  const d = Math.min(devicePixelRatio || 1, 2);
  c.width = innerWidth * d; c.height = innerHeight * d; ctx.scale(d, d);
  let last = null;
  c.addEventListener("pointermove", (e) => {
    const p = [e.clientX, e.clientY];
    if (last && (e.pointerType === "mouse" || e.buttons)) {
      ctx.strokeStyle = css("--ink"); ctx.globalAlpha = 0.55; ctx.lineCap = "round";
      ctx.lineWidth = 1.1 + Math.random() * 0.9;
      ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0] + Math.random() - 0.5, p[1] + Math.random() - 0.5); ctx.stroke();
    }
    last = p;
  });
  c.addEventListener("pointerleave", () => { last = null; });
  c.addEventListener("pointerdown", (e) => { last = [e.clientX, e.clientY]; });

  let gone = false, stream = null;
  function go() {
    if (gone) return;
    gone = true;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    try { sessionStorage.setItem("welcomed", "1"); } catch (e) {}
    w.classList.add("turn");
    root.style.overflow = "";
    setTimeout(() => { w.remove(); }, 1000);
    awake();
  }
  document.getElementById("go").addEventListener("click", go);
  addEventListener("keydown", function k(e) {
    if (e.key === "Tab") return;
    removeEventListener("keydown", k);
    go();
  });
  // a clap: a sudden, loud, short peak. Only listens when asked, only until it hears one.
  const clap = document.getElementById("clap");
  clap.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia) { go(); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }); }
    catch (err) { clap.textContent = "no mic? just press go"; return; }
    clap.textContent = "listening… clap!";
    clap.classList.add("listening");
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const an = ac.createAnalyser(); an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let floor = 0.02;
    (function listen() {
      if (gone) { ac.close(); return; }
      an.getFloatTimeDomainData(buf);
      let peak = 0, sum = 0;
      for (const v of buf) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      if (peak > 0.35 && peak > floor * 8) { ac.close(); go(); return; }
      floor = floor * 0.95 + Math.sqrt(sum / buf.length) * 0.05;
      requestAnimationFrame(listen);
    })();
  });
})();

/* ---------- Fig. 1: scroll pulls the rocket together, then it flies ---------- */
(() => {
  const fig = document.getElementById("rocket");
  if (!fig) return;
  let override = null, launchAt = null;
  function update(now) {
    requestAnimationFrame(update);
    const r = fig.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight) return;
    const p = calm ? 0 : Math.min(1, Math.max(0, (90 - r.top) / (r.height * 0.75)));
    let e = 1 - smooth(0.02, 0.4, p), lift = Math.pow(smooth(0.42, 1, p), 2) * 600;
    if (override !== null) e = override;
    if (launchAt !== null) {
      const t = (now - launchAt) / 1000;
      e = Math.min(e, 1 - smooth(0, 0.6, t));
      lift = Math.max(lift, Math.pow(Math.max(0, t - 0.7), 2) * 420);
      if (t > 3.2) { launchAt = null; }
    }
    fig.style.setProperty("--e", e.toFixed(3));
    fig.style.setProperty("--lab", smooth(0.5, 0.95, e).toFixed(3));
    fig.style.setProperty("--lift", lift.toFixed(1));
    fig.style.setProperty("--flame", (lift > 2 ? 0.6 + Math.random() * 0.4 : 0).toFixed(2));
  }
  requestAnimationFrame(update);
  addEventListener("sketch:rocket", (ev) => {
    if (ev.detail === "assemble") override = 0;
    if (ev.detail === "explode") override = null;
    if (ev.detail === "launch") launchAt = performance.now();
  });
})();

/* ---------- Live heart: one real heartbeat's electrical vector ---------- */
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
    requestAnimationFrame(frame);
  }).catch(() => {});

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", () => beat && resize());
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
    pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.01));
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  canvas.addEventListener("pointercancel", () => { drag = null; });

  function project(x, y, z, w, h, scale) {
    let X = x, Y = -y, Z = -z;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    [X, Z] = [X * cy + Z * sy, -X * sy + Z * cy];
    [Y, Z] = [Y * cp - Z * sp, Y * sp + Z * cp];
    const persp = 1 / (1 + Z * 0.25);
    return [w / 2 + X * scale * persp, h * 0.46 - Y * scale * persp, Z];
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (!visible) { last = t; return; }
    const dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
    last = t;
    if (!drag && !calm) yaw += dt * 0.35;
    const n = beat.phase.length;
    if (!calm) i = (i + dt * beat.fs * 0.5) % n;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const colors = [css("--faint"), css("--blue"), css("--red"), css("--green")];
    const [vx, vy, vz] = beat.vector;
    const peak = Math.max(...vx.map((_, k) => Math.hypot(vx[k], vy[k], vz[k])));
    const scale = Math.min(w, h) * 0.36 / peak;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1; ctx.strokeStyle = css("--faint"); ctx.setLineDash([6, 3, 2, 3]);
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(([a, b, c]) => {
      const p = project(-a * peak, -b * peak, -c * peak, w, h, scale), q = project(a * peak, b * peak, c * peak, w, h, scale);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    });
    ctx.setLineDash([]);
    const pts = vx.map((_, k) => project(vx[k], vy[k], vz[k], w, h, scale));
    ctx.lineWidth = 2.2; ctx.lineJoin = ctx.lineCap = "round";
    for (let k = 1; k < n; k++) {
      const ph = beat.phase[k];
      if (!ph) continue;
      ctx.strokeStyle = colors[ph]; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const k = Math.floor(i), o = project(0, 0, 0, w, h, scale), tip = pts[k];
    ctx.strokeStyle = ctx.fillStyle = colors[beat.phase[k]] || css("--ink");
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.beginPath(); ctx.arc(tip[0], tip[1], 4.5, 0, Math.PI * 2); ctx.fill();
    const strip = beat.leadII, sMax = Math.max(...strip.map(Math.abs)), sy0 = h - 26, sh = 18;
    ctx.lineWidth = 1.5; ctx.strokeStyle = css("--graphite");
    ctx.beginPath();
    strip.forEach((v, j) => { const x = 16 + (w - 32) * j / (n - 1), y = sy0 - v / sMax * sh; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    const cx = 16 + (w - 32) * k / (n - 1);
    ctx.fillStyle = colors[beat.phase[k]] || css("--ink");
    ctx.beginPath(); ctx.arc(cx, sy0 - strip[k] / sMax * sh, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = "16px Caveat, cursive"; ctx.fillStyle = css("--graphite");
    ctx.fillText("lead II · " + beat.bpm + " bpm", 16, h - 4);
  }
})();

/* ---------- The idea I killed: sketch-to-render wipe, and the film when it exists ---------- */
(() => {
  const fig = document.getElementById("compare");
  const range = document.getElementById("compare-range");
  if (fig && range) range.addEventListener("input", () => fig.style.setProperty("--x", range.value + "%"));
  const box = document.getElementById("killed-video"), film = document.getElementById("film"), btn = document.getElementById("play-film");
  if (!box) return;
  fetch(film.getAttribute("src"), { method: "HEAD" }).then((r) => { if (r.ok) box.hidden = false; }).catch(() => {});
  btn.addEventListener("click", () => {
    film.hidden = false;
    if (film.paused) { film.play(); btn.textContent = "▮▮ pause"; } else { film.pause(); btn.textContent = "▸ watch it come apart"; }
  });
})();

/* ---------- The essay: three switches ---------- */
(() => {
  const box = document.querySelector(".tree-box");
  if (!box) return;
  const tree = box.querySelector(".tree");
  const notes = [...box.querySelectorAll(".readout p")];
  const on = new Set();
  let lastK = "none";
  box.querySelectorAll(".switch").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.k;
    if (on.has(k)) { on.delete(k); lastK = on.size ? [...on].pop() : "none"; } else { on.add(k); lastK = k; }
    b.setAttribute("aria-pressed", String(on.has(k)));
    ["genes", "epi", "pattern"].forEach((x) => box.classList.toggle("on-" + x, on.has(x)));
    box.classList.toggle("on-all", on.size === 3);
    draw(tree);
    const show = on.size === 3 ? "all" : lastK;
    notes.forEach((p) => { p.hidden = p.dataset.k !== show; });
  }));
})();

/* ---------- Margin notes ---------- */
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

document.querySelectorAll(".card button").forEach((b) => {
  b.addEventListener("click", () => {
    const card = b.parentElement;
    card.classList.toggle("flipped");
    b.setAttribute("aria-pressed", String(card.classList.contains("flipped")));
  });
});

/* ---------- Mozart, drawn in chalk ---------- */
(() => {
  const btn = document.getElementById("play"), audio = document.getElementById("mozart"), canvas = document.getElementById("wave");
  if (!btn || !audio || !canvas) return;
  const ctx = canvas.getContext("2d");
  let ac = null, an = null, data = null, visible = false;
  btn.addEventListener("click", () => {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        an = ac.createAnalyser(); an.fftSize = 2048;
        ac.createMediaElementSource(audio).connect(an);
        an.connect(ac.destination);
        data = new Uint8Array(an.fftSize);
      } catch (e) { ac = null; }
    }
    if (audio.paused) { ac?.resume(); audio.volume = 0.6; audio.play().catch(() => {}); } else audio.pause();
  });
  audio.addEventListener("play", () => btn.setAttribute("aria-pressed", "true"));
  audio.addEventListener("pause", () => btn.setAttribute("aria-pressed", "false"));
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  (function frame(t) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const playing = an && !audio.paused;
    if (playing) an.getByteTimeDomainData(data);
    ctx.strokeStyle = playing ? "#f2c14e" : "rgba(236,230,214,.7)";
    ctx.lineWidth = 1.8; ctx.lineCap = "round"; ctx.beginPath();
    const N = 160;
    for (let k = 0; k <= N; k++) {
      const x = w * k / N;
      const v = playing ? (data[Math.floor(k / N * (data.length - 1))] - 128) / 128 * 1.6
        : Math.sin(k / 9 + (calm ? 0 : t / 900)) * 0.12 * Math.sin(k / N * Math.PI);
      const y = h / 2 + v * h * 0.45 + (Math.random() - 0.5) * 0.8;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  })(0);
})();

/* ---------- The typewriter: press ~ ---------- */
(() => {
  const term = document.getElementById("terminal"), out = document.getElementById("term-out");
  const form = document.getElementById("term-form"), input = document.getElementById("term-in");
  if (!term) return;
  const history = [];
  let hIndex = 0, opener = null;
  const go = (sel) => { close(); document.querySelector(sel)?.scrollIntoView({ behavior: calm ? "auto" : "smooth" }); return []; };
  const rocket = (cmd) => { dispatchEvent(new CustomEvent("sketch:rocket", { detail: cmd })); };
  const COMMANDS = {
    help: () => ["things you can type:", "  whoami, contents, open <page>", "  assemble, explode, launch", "  night, day, play, coffee, clear, exit"],
    whoami: () => ["Deogracious Kiprop · Nairobi, Kenya", "CS at the University of Nairobi. Draws first, builds second. Aiming for orbit."],
    contents: () => [...document.querySelectorAll(".toc a")].map((a, k) => `  ${k + 1}. ${a.querySelector(".hand").textContent}`),
    open: (arg) => {
      const map = { heart: "#heart3d", heart3d: "#heart3d", farm: "#farm", farmconnect: "#farm", gold: "#gold", bot: "#gold", flight: "#flight", server: "#server", magneto: "#killed", killed: "#killed", essay: "#curses", curses: "#curses", notes: "#deep" };
      const sel = map[(arg || "").toLowerCase()];
      return sel ? go(sel) : ["open what? try: heart, farm, gold, flight, server, magneto, essay, notes"];
    },
    assemble: () => { rocket("assemble"); return ["torque checked. it's in one piece."]; },
    explode: () => { rocket("explode"); return ["parts floating again."]; },
    launch: () => { close(); scrollTo({ top: 0, behavior: "auto" }); rocket("launch"); return []; },
    night: () => { if (!isNight()) lamp.click(); return ["lamp on."]; },
    day: () => { if (isNight()) lamp.click(); return ["morning."]; },
    play: () => { document.getElementById("play").click(); return ["♪ Mozart"]; },
    coffee: () => ["☕ the pencil is sharpened. the coffee is not optional."],
    sudo: () => ["nice try. gravity says no."],
    clear: () => { out.innerHTML = ""; return []; },
    exit: () => { close(); return []; },
  };
  const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function print(lines, cls) {
    for (const line of lines) { const div = document.createElement("div"); if (cls) div.className = cls; div.innerHTML = line; out.appendChild(div); }
    out.scrollTop = out.scrollHeight;
  }
  function open() {
    if (!term.hidden) return;
    opener = document.activeElement;
    term.hidden = false;
    if (!out.childElementCount) print(["a typewriter in the margin. type <span class=\"acc\">help</span>."]);
    input.focus();
  }
  function close() { term.hidden = true; if (opener && opener.focus) opener.focus(); }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    input.value = "";
    if (!raw) return;
    history.push(raw); hIndex = history.length;
    print([`<span class="prompt">&gt;</span> ${escape(raw)}`], "cmd");
    const [cmd, ...rest] = raw.split(/\s+/);
    const fn = COMMANDS[cmd.toLowerCase()];
    print(fn ? fn(rest.join(" ")) : [`${escape(cmd)}? not in this sketchbook. try <span class="acc">help</span>`]);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && hIndex > 0) { input.value = history[--hIndex]; e.preventDefault(); }
    if (e.key === "ArrowDown") { hIndex = Math.min(history.length, hIndex + 1); input.value = history[hIndex] || ""; }
  });
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("welcome")) return;
    const typing = /input|textarea|select/i.test(document.activeElement.tagName) && document.activeElement !== input;
    if ((e.key === "~" || e.key === "`") && term.hidden && !typing) { e.preventDefault(); open(); }
    else if (e.key === "Escape" && !term.hidden) close();
  });
  document.querySelector(".term-open").addEventListener("click", open);
  term.querySelector(".term-close").addEventListener("click", close);
})();
