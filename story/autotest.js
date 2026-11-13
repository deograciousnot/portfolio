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
  while (!$("narration").hidden) {
    await until(() => $("narration").classList.contains("ready"), 20000);
    log("line: " + $("line").textContent.split("\n")[0].slice(0, 50));
    key("keydown", "Space"); await sleep(300);
  }
  log("end screen: " + await until(() => !$("end").hidden, 10000) + " · " + $("end-kicker").textContent);
  log("sound button: " + document.querySelector(".music").textContent);
  log("errors: " + (errors.length ? JSON.stringify(errors) : "none"));
  log("DONE");
}
