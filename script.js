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
