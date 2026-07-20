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

revealItems.forEach((item) => {
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
  const status = quoteForm.querySelector("[data-form-status]");
  const submitButton = quoteForm.querySelector('button[type="submit"]');
  const initialButtonText = submitButton ? submitButton.textContent : "";
  const isEnglish = document.documentElement.lang === "en";

  const setStatus = (type, message) => {
    if (!status) return;
    status.className = `form-status ${type ? `is-${type}` : ""}`.trim();
    status.textContent = message || "";
  };

  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("", "");

    if (!quoteForm.checkValidity()) {
      quoteForm.reportValidity();
      setStatus("error", isEnglish ? "Please complete all required fields before sending." : "Veuillez compléter tous les champs obligatoires avant l'envoi.");
      return;
    }

    const form = new FormData(quoteForm);
    if (form.get("website")) return;

    const payload = Object.fromEntries(form.entries());
    payload.consent = form.get("consent") === "on";

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = isEnglish ? "Sending..." : "Envoi en cours...";
    }

    try {
      const response = await fetch(quoteForm.dataset.endpoint || "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        const configMissing = result.code === "EMAIL_SERVICE_NOT_CONFIGURED";
        throw new Error(configMissing ? "config" : "send");
      }

      quoteForm.reset();
      setStatus("success", isEnglish ? "Thank you. Your inquiry has been sent to LILOTOP SARL." : "Merci. Votre demande a bien été envoyée à LILOTOP SARL.");
    } catch (error) {
      const message = error.message === "config"
        ? (isEnglish ? "The email service is not configured yet. Please contact us by email or WhatsApp." : "Le service d'envoi n'est pas encore configuré. Merci de nous contacter par e-mail ou WhatsApp.")
        : (isEnglish ? "The message could not be sent. Please try again or contact us by email." : "Le message n'a pas pu être envoyé. Merci de réessayer ou de nous contacter par e-mail.");
      setStatus("error", message);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = initialButtonText;
      }
    }
  });
}
