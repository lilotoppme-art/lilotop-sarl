const header = document.querySelector("[data-header]");
const toggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");

if (header && toggle && nav) {
  const syncHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 16);
  };

  const closeMenu = () => {
    nav.classList.remove("is-open");
    header.classList.remove("menu-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    header.classList.toggle("menu-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.addEventListener("click", (event) => {
    if (event.target.matches("a")) closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!header.contains(event.target) && nav.classList.contains("is-open")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      closeMenu();
      toggle.focus();
    }
  });

  window.addEventListener("scroll", syncHeader, { passive: true });
  syncHeader();
}

const revealItems = document.querySelectorAll(".reveal");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

revealItems.forEach((item, index) => {
  const group = item.parentElement ? Array.from(item.parentElement.querySelectorAll(".reveal")) : [];
  const groupIndex = Math.max(group.indexOf(item), 0);
  item.style.setProperty("--reveal-delay", `${Math.min(groupIndex * 55, 220)}ms`);
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const counters = document.querySelectorAll("[data-counter]");
const animateCounter = (node) => {
  const label = node.textContent;
  const target = Number(node.dataset.counter);
  if (!target || label.includes("/")) return;
  let start = 0;
  const duration = 900;
  const started = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - started) / duration, 1);
    const value = Math.round(progress * target);
    node.textContent = label.includes("°") ? `${value}°` : String(value);
    if (progress < 1) requestAnimationFrame(tick);
    else node.textContent = label;
  };
  requestAnimationFrame(tick);
};

if ("IntersectionObserver" in window) {
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });
  counters.forEach((counter) => counterObserver.observe(counter));
}

const parallaxHero = document.querySelector("[data-parallax] .hero-media");
if (parallaxHero && !reduceMotion) {
  let ticking = false;
  const updateParallax = () => {
    const offset = Math.min(window.scrollY * 0.08, 42);
    parallaxHero.style.translate = `0 ${offset}px`;
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }, { passive: true });
  updateParallax();
}

const quoteForm = document.querySelector("[data-quote-form]");
if (quoteForm) {
  quoteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(quoteForm);
    const subject = encodeURIComponent(`Demande de devis - ${form.get("company") || form.get("name") || "LILOTOP"}`);
    const body = encodeURIComponent([
      `Nom: ${form.get("name") || ""}`,
      `Organisation: ${form.get("company") || ""}`,
      `Email: ${form.get("email") || ""}`,
      `Téléphone / WhatsApp: ${form.get("phone") || ""}`,
      `Type de besoin: ${form.get("need") || ""}`,
      "",
      "Message:",
      form.get("message") || "",
    ].join("\n"));
    window.location.href = `mailto:lilotoppme@gmail.com?subject=${subject}&body=${body}`;
  });
}
