// Small touches only: the page works fully without JavaScript.
document.documentElement.classList.add("js");
document.getElementById("year").textContent = new Date().getFullYear();

// Fade sections in as they scroll into view
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add("shown");
      io.unobserve(e.target);
    }
  }
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
