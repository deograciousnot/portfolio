// Plays the story like a visitor would, and writes what happened into <pre id="autotest">.
// Only loaded with ?autotest in the URL. Used for testing in a headless browser.
export default async function autotest() {
  const out = document.createElement("pre");
  out.id = "autotest";
  document.body.appendChild(out);
  const t0 = performance.now();
  const log = (msg) => { out.textContent += `[${((performance.now() - t0) / 1000).toFixed(1)}s] ${msg}\n`; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (cond, ms = 120000) => { const s = performance.now(); while (!cond()) { if (performance.now() - s > ms) return false; await sleep(200); } return true; };
  const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code === "Space" ? " " : code, bubbles: true }));
  const $ = (id) => document.getElementById(id);

  const errors = [];
  addEventListener("error", (e) => errors.push(e.message));
  addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));
  const withSound = new URLSearchParams(location.search).get("autotest") === "sound";

  try { localStorage.removeItem("long-way-round"); } catch {}
  await sleep(1500);
  document.querySelector(withSound ? ".start .go:not(.quiet)" : ".start .go.quiet").click();
  log(withSound ? "clicked Begin, with sound" : "clicked Begin quietly");
  const startAt = parseInt(new URLSearchParams(location.search).get("chapter"), 10) || 1;
  const readLines = async () => {
    while (!$("narration").hidden) {
      await until(() => $("narration").classList.contains("ready"), 20000);
      log("line: " + $("line").textContent.split("\n")[0].slice(0, 50));
      key("keydown", "Space"); key("keyup", "Space"); await sleep(300);
    }
  };
  if (startAt <= 1) {
  log("cinema on: " + await until(() => document.body.classList.contains("cinema"), 5000));
  const cards = new Set();
  const cardWatch = setInterval(() => { const c = $("card"); if (c.classList.contains("show")) cards.add(c.textContent.trim()); }, 100);
  log("narration started: " + await until(() => !$("narration").hidden));
  clearInterval(cardWatch);
  log("title cards seen: " + JSON.stringify([...cards]));
  log("cinema off by now: " + !document.body.classList.contains("cinema"));

  let n = 0;
  while (!$("narration").hidden && n < 12) {
    await until(() => $("narration").classList.contains("ready"), 20000);
    log("line: " + $("line").textContent.split("\n")[0].slice(0, 50));
    key("keydown", "Space"); await sleep(300); n++;
  }
  log("prompt: " + $("prompt").textContent);
  key("keydown", "Space");
  // While walking, read any carved stone that starts glowing (press E)
  let stonesRead = 0;
  const stoneWatch = setInterval(() => {
    if ($("prompt").textContent.includes("carved stone")) { key("keydown", "KeyE"); stonesRead++; }
  }, 400);
  const cardsDuringWalk = new Set();
  const cardWatch2 = setInterval(() => { const c = $("card"); if (c.classList.contains("show")) cardsDuringWalk.add(c.textContent.trim().slice(0, 45)); }, 150);
  const walked = await until(() => $("prompt").textContent.startsWith("Tap"));
  clearInterval(stoneWatch); clearInterval(cardWatch2);
  key("keyup", "Space");
  log("walked to the end: " + walked + " · stone prompts answered: " + stonesRead);
  log("stone texts shown: " + JSON.stringify([...cardsDuringWalk]));
  key("keydown", "Enter");
  await until(() => !$("narration").hidden, 5000);
  log("fragment dots lit: " + document.querySelectorAll(".fragments li.got").length);
  await readLines();
  }

  // ---- Chapter 2: the heart ----
  if (startAt <= 2) {
  log("chapter 2 started: " + await until(() => $("chapter").textContent.startsWith("2"), 20000) + " · " + $("chapter").textContent);
  const cards2 = new Set();
  const cw3 = setInterval(() => { const c = $("card"); if (c.classList.contains("show")) cards2.add(c.textContent.trim()); }, 100);
  log("heart narration: " + await until(() => !$("narration").hidden, 40000));
  log("monitor visible: " + !!document.querySelector(".monitor:not([hidden])"));
  await readLines();
  log("quest prompt: " + $("prompt").textContent.slice(0, 60));
  // Tap once per beat, right on it (needs ?debug, which exposes the heart's clock); without it, the quest times out
  let lastK = null;
  const tapper = setInterval(() => {
    const h = window.story?.heart;
    if (!h) return;
    const { k, dt } = h.offsetFromBeat();
    if (k !== lastK && Math.abs(dt) < 0.08) { lastK = k; key("keydown", "Space"); key("keyup", "Space"); }
  }, 20);
  log("rhythm quest done: " + await until(() => !$("narration").hidden, 60000));
  clearInterval(tapper);
  await readLines();
  const guideWatch = setInterval(() => {
    const h = window.story?.heart, c = window.story?.rig;
    if (h?.guide.visible && c) log(`guide spark ${h.guide.position.distanceTo(c.position).toFixed(2)} ahead of the camera`);
  }, 3000);
  log("reached the apex: " + await until(() => $("prompt").textContent.startsWith("Tap the light"), 60000));
  clearInterval(cw3); clearInterval(guideWatch);
  log("cards in the flight: " + JSON.stringify([...cards2]));
  key("keydown", "Enter");
  await until(() => !$("narration").hidden, 5000);
  log("fragment dots lit: " + document.querySelectorAll(".fragments li.got").length);
  await readLines();
  }

  // ---- Chapter 3: the fields ----
  log("chapter 3 started: " + await until(() => $("chapter").textContent.startsWith("3"), 20000) + " · " + $("chapter").textContent);
  const cards3 = new Set();
  const cw4 = setInterval(() => { const c = $("card"); if (c.classList.contains("show")) cards3.add(c.textContent.trim().slice(0, 60)); }, 100);
  log("fields narration: " + await until(() => !$("narration").hidden, 40000));
  await readLines();
  log("quest prompt: " + $("prompt").textContent.slice(0, 60));
  const connector = setInterval(() => { if ($("prompt").textContent.includes("connect it")) key("keydown", "KeyE"); }, 1500);
  log("farms connected: " + await until(() => !$("narration").hidden, 60000) + " · " + $("line").textContent.split("\n")[0]);
  clearInterval(connector);
  await readLines();
  log("over the market: " + await until(() => $("prompt").textContent.startsWith("Tap the light"), 30000));
  clearInterval(cw4);
  log("cards: " + JSON.stringify([...cards3]));
  key("keydown", "Enter");
  await until(() => !$("narration").hidden, 5000);
  log("fragment dots lit: " + document.querySelectorAll(".fragments li.got").length);
  await readLines();
  log("end screen: " + await until(() => !$("end").hidden, 10000) + " · " + $("end-kicker").textContent);
  log("sound button: " + document.querySelector(".music").textContent);
  log("errors: " + (errors.length ? JSON.stringify(errors) : "none"));
  log("DONE");
}
