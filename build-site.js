const fs = require("fs");
const path = require("path");

const site = {
  domain: "https://lilotopsarl.com",
  phone: "+243 800 982 436",
  phoneHref: "+243800982436",
  email: "contact@lilotopsarl.com",
  whatsapp: "https://wa.me/243800982436?text=Bonjour%20LILOTOP%20SARL%2C%20je%20souhaite%20obtenir%20un%20devis.",
  address: "2266 Avenue des Aviateurs, quartier Tshangalele, Lubumbashi; Boulevard du 30 Juin, n°144, Immeuble Didi, 3ème niveau, Kinshasa/Gombe",
  brochureFile: "assets/documents/LILOTOP-SARL-Corporate-Profile.pdf",
  brochureAvailable: false,
};

let activeLang = "fr";

function currentLang() {
  return activeLang;
}

function assetPrefix() {
  return activeLang === "en" ? "../" : "";
}

const pages = [
  { slug: "index", file: "index.html", enFile: "en/index.html", fr: "Accueil", en: "Home" },
  { slug: "about", file: "a-propos.html", enFile: "en/about.html", fr: "Société", en: "Company" },
  { slug: "sectors", file: "secteurs.html", enFile: "en/sectors.html", fr: "Activités", en: "Markets" },
  { slug: "solutions", file: "solutions.html", enFile: "en/solutions.html", fr: "Solutions", en: "Solutions" },
  { slug: "products", file: "produits.html", enFile: "en/products.html", fr: "Produits", en: "Products", hidden: true },
  { slug: "partners", file: "partenaires.html", enFile: "en/partners.html", fr: "Partenariats", en: "Partnerships" },
  { slug: "projects", file: "projets.html", enFile: "en/projects.html", fr: "Projets", en: "Projects" },
  { slug: "news", file: "actualites.html", enFile: "en/news.html", fr: "Insights", en: "Insights" },
  { slug: "contact", file: "contact.html", enFile: "en/contact.html", fr: "Contact", en: "Contact" },
  { slug: "legal", file: "mentions-legales.html", enFile: "en/legal.html", fr: "Mentions légales", en: "Legal", hidden: true },
];

const icon = {
  supply: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z"/><path d="m3 7.5 9 4.5 9-4.5"/><path d="M12 12v9"/></svg>`,
  logistics: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>`,
  compliance: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m8.5 12 2.5 2.5 5-5"/></svg>`,
  digital: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M8 20h8"/><path d="M12 16v4"/><path d="M8 10h3M8 13h8M14 10h2"/></svg>`,
  infra: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16"/><path d="M6 20V9l6-4 6 4v11"/><path d="M9 20v-6h6v6"/><path d="M9 10h6"/></svg>`,
  finance: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/><path d="M3 18h18"/><path d="M12 4 4 8h16z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
};

const data = {
  fr: {
    langName: "FR",
    altLangName: "EN",
    nav: pages.filter((p) => !p.hidden).map((p) => ({ slug: p.slug, label: p.fr, href: p.file })),
    cta: "Demander un devis",
    quoteCta: "Soumettre une demande",
    whatsapp: "WhatsApp",
    backHome: "Retour en haut",
    metaDefault: "LILOTOP SARL est une société congolaise spécialisée en approvisionnement minier, logistique, infrastructures, import-export et solutions digitales pour la RDC et l'Afrique centrale.",
    home: {
      title: "LILOTOP SARL | Mining Supply, Logistics & Digital Solutions in DRC",
      description: "Partenaire stratégique en approvisionnement minier, logistique, infrastructures, import-export, Odoo et solutions digitales en République Démocratique du Congo.",
      kicker: "Mining supply • Logistics • Infrastructure • Digital solutions",
      h1: "Un partenaire congolais pour les opérations industrielles exigeantes.",
      lead: "LILOTOP SARL connecte les fournisseurs internationaux aux besoins réels du marché congolais dans les mines, l'énergie, les infrastructures et la digitalisation des entreprises.",
      commandTitle: "Plateforme opérationnelle",
      commandStrong: "RDC • Afrique centrale • Partenariats internationaux",
      stats: [
        ["24/7", "Coordination rapide des demandes critiques"],
        ["ARSP", "Contenu local et conformité documentaire"],
        ["360°", "Sourcing, logistique, digitalisation et suivi"],
      ],
      impactStats: [
        ["7", "domaines stratégiques"],
        ["6", "marchés cibles"],
        ["13", "familles de produits"],
        ["24", "coordination réactive"],
      ],
      proof: ["Sourcing international", "Approvisionnement minier", "Infrastructures & énergie", "Odoo, IA & digitalisation"],
      introTitle: "Bâtir des ponts fiables entre les standards internationaux et le terrain congolais.",
      introText: "Société à capitaux congolais, LILOTOP SARL accompagne les sociétés minières, sous-traitants, institutions, banques, PME et partenaires internationaux dans la fourniture de biens, la recherche de fournisseurs fiables, la coordination logistique et la mise en relation commerciale.",
      vision: "Devenir une plateforme congolaise de référence pour l'approvisionnement minier, les services logistiques, les partenariats techniques et la digitalisation des entreprises en Afrique centrale.",
      capabilityTitle: "Des capacités intégrées pour réduire les délais, les risques et les ruptures.",
      capabilityLead: "Notre méthode part du besoin terrain: comprendre les spécifications, identifier les partenaires fiables, sécuriser les documents et suivre l'exécution jusqu'à la livraison ou au service rendu.",
    },
    strategicDomains: [
      ["Mining Supply", "Réactifs, EPI, pièces, consommables et équipements critiques pour les opérations minières.", icon.supply],
      ["Industrial Procurement", "Recherche de fournisseurs, comparaison technique, documents et conditions commerciales.", icon.compliance],
      ["Logistics & Supply Chain", "Importation, transit, incoterms, transport local et livraison vers sites ou zones industrielles.", icon.logistics],
      ["Infrastructure", "Matériaux, chantiers, bases-vie, maintenance et services généraux de projets.", icon.infra],
      ["Energy", "Appui aux projets énergétiques par sourcing, partenaires techniques et coordination terrain.", icon.infra],
      ["Import-Export", "Pont commercial entre fournisseurs internationaux et marché congolais.", icon.logistics],
      ["Odoo & Digital Solutions", "Systèmes de gestion, tableaux de bord, IA, automatisation documentaire et processus OHADA.", icon.digital],
    ],
    sectors: [
      ["Mines cuivre-cobalt", "Réactifs, équipements, pièces, EPI, supply chain et appui aux sites miniers.", icon.supply],
      ["Mines d'or", "Approvisionnement industriel, consommables de traitement, sécurité et logistique.", icon.supply],
      ["Énergie", "Solutions d'approvisionnement et partenaires techniques pour projets énergétiques.", icon.infra],
      ["Routes & infrastructures", "Matériaux, logistique de chantier, bases-vie et services généraux.", icon.infra],
      ["Banques & institutions", "Dossiers documentés, transparence commerciale, conformité et appui aux projets.", icon.finance],
      ["PME & digitalisation", "Odoo, tableaux de bord, IA, structuration OHADA et processus internes.", icon.digital],
    ],
    products: [
      "Réactifs chimiques de production",
      "Acide sulfurique",
      "Chaux vive et chaux hydratée",
      "Floculants et coagulants",
      "Charbon actif",
      "Extractants SX / LIX",
      "Sulfate de sodium et produits industriels",
      "Billes de broyage",
      "Lubrifiants industriels, huiles et graisses",
      "Équipements de protection individuelle",
      "Pièces de rechange mécaniques et électriques",
      "Pompes, vannes, tuyauteries et équipements industriels",
      "Consommables pour usines de traitement",
    ],
    values: [
      ["Intégrité", "Relations commerciales transparentes, durables et conformes."],
      ["Réactivité", "Coordination rapide lorsque les délais miniers et industriels sont critiques."],
      ["Conformité", "Exigences administratives, fiscales, réglementaires, minières, HSE et contenu local."],
      ["Qualité", "Produits et services alignés avec les standards techniques et sécuritaires des clients industriels."],
      ["Engagement local", "Participation renforcée des entreprises congolaises dans les chaînes de valeur."],
    ],
    method: [
      ["Analyse du besoin", "Spécifications techniques, délais, contraintes logistiques et exigences documentaires."],
      ["Recherche de solutions", "Identification de fournisseurs, partenaires ou prestataires adaptés."],
      ["Comparaison et sélection", "Évaluation du prix, de la qualité, du délai, des certificats, de l'incoterm et du risque."],
      ["Proposition commerciale", "Offre claire avec conditions, délais, documents disponibles et responsabilités."],
      ["Suivi opérationnel", "Commande, expédition, transit, livraison ou exécution du service."],
      ["Service après livraison", "Suivi qualité, réclamations, documentation et besoins complémentaires."],
    ],
    advantages: [
      ["Connaissance du terrain", "Logistique, douane, accès aux sites, administration et fournisseurs locaux."],
      ["Positionnement local", "Société congolaise engagée dans le contenu local et les partenariats solides."],
      ["Réseau fournisseurs", "Construction d'un réseau régional et international dans les produits miniers, industriels, énergétiques et logistiques."],
      ["Approche intégrée", "Analyse du besoin, meilleure solution, coordination des partenaires et suivi d'exécution."],
      ["Conformité & transparence", "Relations documentées et alignées avec les exigences des mines, banques, bailleurs et institutions."],
      ["Capacité de partenariat", "Représentant local, partenaire commercial, facilitateur, coordinateur logistique ou membre d'un groupement."],
    ],
    documents: ["RCCM", "Identification nationale", "Numéro d'impôt", "Documents fiscaux", "Statuts de la société", "Attestation ARSP", "Identité bancaire", "Profil société", "États financiers", "CV et profils d'experts ou partenaires", "Politique HSE", "Politique anticorruption", "Documents commerciaux et techniques selon les projets"],
    credibility: [
      ["Discipline documentaire", "Chaque demande est structurée avec les éléments techniques, commerciaux et logistiques nécessaires à une décision claire."],
      ["Conformité opérationnelle", "Les dossiers sont préparés avec une attention particulière aux exigences ARSP, HSE, fiscales et administratives."],
      ["Coordination terrain", "LILOTOP relie les besoins des opérations aux fournisseurs, transporteurs et partenaires capables d'exécuter en RDC."],
    ],
    news: [
      ["Approvisionnement minier", "Comment réduire le risque de rupture sur les réactifs et consommables critiques."],
      ["Conformité locale", "Pourquoi les dossiers documentés rassurent les mines, banques et institutions."],
      ["Digitalisation", "Odoo, tableaux de bord et IA: vers une gestion plus lisible des PME congolaises."],
    ],
    form: {
      title: "Demande de devis",
      intro: "Envoyez vos spécifications, votre délai souhaité et les documents disponibles. L'équipe LILOTOP vous recontacte pour qualifier le besoin.",
      name: "Nom complet",
      company: "Organisation",
      email: "Email professionnel",
      phone: "Téléphone / WhatsApp",
      country: "Pays",
      subject: "Objet de la demande",
      sector: "Secteur d'intérêt",
      message: "Votre demande",
      consent: "J'accepte que LILOTOP SARL utilise ces informations pour traiter ma demande conformément à la politique de confidentialité.",
      submit: "Envoyer la demande",
    },
  },
  en: {
    langName: "EN",
    altLangName: "FR",
    nav: pages.filter((p) => !p.hidden).map((p) => ({ slug: p.slug, label: p.en, href: p.enFile.replace("en/", "") })),
    cta: "Request a quote",
    quoteCta: "Submit inquiry",
    whatsapp: "WhatsApp",
    backHome: "Back to top",
    metaDefault: "LILOTOP SARL is a Congolese company focused on mining supply, logistics, infrastructure, import-export and digital solutions for DRC and Central Africa.",
    home: {
      title: "LILOTOP SARL | Mining Supply, Logistics & Digital Solutions in DRC",
      description: "Strategic partner for mining supply, logistics, infrastructure, import-export, Odoo and digital solutions in the Democratic Republic of Congo.",
      kicker: "Mining supply • Logistics • Infrastructure • Digital solutions",
      h1: "A Congolese partner for demanding industrial operations.",
      lead: "LILOTOP SARL connects international suppliers with real market needs in DRC across mining, energy, infrastructure and business digitalization.",
      commandTitle: "Operating platform",
      commandStrong: "DRC • Central Africa • International partnerships",
      stats: [
        ["24/7", "Fast coordination for critical requests"],
        ["ARSP", "Local content and documented compliance"],
        ["360°", "Sourcing, logistics, digitalization and follow-up"],
      ],
      impactStats: [
        ["7", "strategic domains"],
        ["6", "target markets"],
        ["13", "product families"],
        ["24", "responsive coordination"],
      ],
      proof: ["International sourcing", "Mining supply", "Infrastructure & energy", "Odoo, AI & digitalization"],
      introTitle: "Building reliable bridges between international standards and Congolese field realities.",
      introText: "LILOTOP SARL is a Congolese-owned company supporting mining companies, contractors, institutions, banks, SMEs and international partners with goods supply, reliable supplier search, logistics coordination and commercial facilitation.",
      vision: "To become a leading Congolese platform for mining supply, logistics services, technical partnerships and business digitalization in Central Africa.",
      capabilityTitle: "Integrated capabilities to reduce delays, risks and supply disruption.",
      capabilityLead: "Our method starts with the field requirement: understand specifications, identify reliable partners, secure documentation and monitor execution through delivery or service completion.",
    },
    strategicDomains: [
      ["Mining Supply", "Reagents, PPE, parts, consumables and critical equipment for mining operations.", icon.supply],
      ["Industrial Procurement", "Supplier search, technical comparison, documents and commercial terms.", icon.compliance],
      ["Logistics & Supply Chain", "Importation, transit, incoterms, local transport and delivery to sites or industrial zones.", icon.logistics],
      ["Infrastructure", "Materials, sites, camps, maintenance and general project services.", icon.infra],
      ["Energy", "Support for energy projects through sourcing, technical partners and field coordination.", icon.infra],
      ["Import-Export", "Commercial bridge between international suppliers and the Congolese market.", icon.logistics],
      ["Odoo & Digital Solutions", "Management systems, dashboards, AI, document automation and OHADA processes.", icon.digital],
    ],
    sectors: [
      ["Copper-cobalt mining", "Reagents, equipment, parts, PPE, supply chain and site support.", icon.supply],
      ["Gold mining", "Industrial procurement, processing consumables, safety and logistics.", icon.supply],
      ["Energy", "Supply solutions and technical partners for energy projects.", icon.infra],
      ["Roads & infrastructure", "Materials, site logistics, camps and general services.", icon.infra],
      ["Banks & institutions", "Documented files, commercial transparency, compliance and project support.", icon.finance],
      ["SMEs & digitalization", "Odoo, dashboards, AI, OHADA structuring and internal processes.", icon.digital],
    ],
    products: [
      "Production chemical reagents",
      "Sulfuric acid",
      "Quicklime and hydrated lime",
      "Flocculants and coagulants",
      "Activated carbon",
      "SX / LIX extractants",
      "Sodium sulfate and industrial products",
      "Grinding media",
      "Industrial lubricants, oils and greases",
      "Personal protective equipment",
      "Mechanical and electrical spare parts",
      "Pumps, valves, piping and industrial equipment",
      "Processing plant consumables",
    ],
    values: [
      ["Integrity", "Transparent, sustainable and compliant business relationships."],
      ["Responsiveness", "Fast coordination when mining and industrial timelines are critical."],
      ["Compliance", "Administrative, fiscal, regulatory, mining, HSE and local content requirements."],
      ["Quality", "Products and services aligned with industrial clients' technical and safety standards."],
      ["Local commitment", "Stronger participation of Congolese companies in value chains."],
    ],
    method: [
      ["Needs analysis", "Technical specifications, timelines, logistics constraints and documentation requirements."],
      ["Solution search", "Identification of suitable suppliers, partners or service providers."],
      ["Comparison and selection", "Evaluation of price, quality, lead time, certificates, incoterm and risk level."],
      ["Commercial proposal", "Clear offer with conditions, timing, available documents and responsibilities."],
      ["Operational follow-up", "Order, shipment, transit, delivery or service execution."],
      ["After-delivery support", "Quality follow-up, claims, documentation and additional needs."],
    ],
    advantages: [
      ["Field knowledge", "Logistics, customs, site access, administration and local suppliers."],
      ["Local positioning", "A Congolese company committed to local content and solid partnerships."],
      ["Supplier network", "Development of a regional and international network in mining, industrial, energy and logistics products."],
      ["Integrated approach", "Needs analysis, best solution, partner coordination and execution follow-up."],
      ["Compliance & transparency", "Documented relationships aligned with mining companies, banks, lenders and institutions."],
      ["Partnership capacity", "Local representative, commercial partner, facilitator, logistics coordinator or consortium member."],
    ],
    documents: ["RCCM", "National identification", "Tax number", "Tax documents", "Company statutes", "ARSP certificate", "Bank identity", "Company profile", "Financial statements", "Expert or partner profiles", "HSE policy", "Anti-corruption policy", "Commercial and technical documents by project"],
    credibility: [
      ["Document discipline", "Each request is structured with the technical, commercial and logistics inputs required for a clear decision."],
      ["Operational compliance", "Files are prepared with close attention to ARSP, HSE, tax and administrative requirements."],
      ["Field coordination", "LILOTOP connects operational needs with suppliers, transporters and partners able to execute in DRC."],
    ],
    news: [
      ["Mining procurement", "How to reduce disruption risk on critical reagents and consumables."],
      ["Local compliance", "Why documented files reassure mining companies, banks and institutions."],
      ["Digitalization", "Odoo, dashboards and AI: toward clearer management for Congolese SMEs."],
    ],
    form: {
      title: "Request a quote",
      intro: "Send your specifications, expected timeline and available documents. The LILOTOP team will contact you to qualify the requirement.",
      name: "Full name",
      company: "Organization",
      email: "Business email",
      phone: "Phone / WhatsApp",
      country: "Country",
      subject: "Request subject",
      sector: "Sector of interest",
      message: "Your request",
      consent: "I agree that LILOTOP SARL may use this information to process my request in accordance with the privacy policy.",
      submit: "Send inquiry",
    },
  },
};

function hrefFor(lang, slug) {
  const p = pages.find((page) => page.slug === slug);
  if (lang === "fr") return p.file;
  return p.enFile.replace("en/", "");
}

function urlFor(lang, slug) {
  const p = pages.find((page) => page.slug === slug);
  return `${site.domain}/${lang === "en" ? p.enFile : p.file === "index.html" ? "" : p.file}`;
}

function asset(lang, src) {
  return lang === "en" ? `../${src}` : src;
}

function pagePath(lang, slug) {
  const p = pages.find((page) => page.slug === slug);
  return lang === "en" ? p.enFile : p.file;
}

function layout(lang, slug, title, description, body, options = {}) {
  const t = data[lang];
  const other = lang === "fr" ? "en" : "fr";
  const page = pages.find((p) => p.slug === slug);
  const nav = t.nav.map((item) => `<a href="${item.href}"${item.slug === slug ? ' aria-current="page"' : ""}>${item.label}</a>`).join("");
  const otherHref = lang === "fr" ? page.enFile : `../${page.file}`;
  const prefix = lang === "en" ? "../" : "";
  const canonical = urlFor(lang, slug);
  const alternate = urlFor(other, slug);
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="theme-color" content="#071426">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${prefix}assets/hero-industrial-drc.png">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="${canonical}">
    <link rel="alternate" hreflang="${lang}" href="${canonical}">
    <link rel="alternate" hreflang="${other}" href="${alternate}">
    <link rel="alternate" hreflang="x-default" href="${site.domain}/">
    <link rel="preload" href="${prefix}assets/hero-industrial-drc.webp" as="image" type="image/webp">
    <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="${prefix}styles.css">
    <script type="application/ld+json">${JSON.stringify(schema(lang, title, description))}</script>
  </head>
  <body class="page-${slug}">
    <a class="skip-link" href="#contenu">${lang === "fr" ? "Aller au contenu" : "Skip to content"}</a>
    <header class="site-header${options.solidHeader ? " is-scrolled" : ""}" data-header>
      <a class="brand" href="${hrefFor(lang, "index")}" aria-label="LILOTOP SARL">
        <img class="brand-logo" src="${prefix}assets/logo-lilotop.svg" alt="" width="152" height="42">
        <span><strong>LILOTOP</strong><small>SARL</small></span>
      </a>
      <button class="menu-toggle" type="button" aria-label="${lang === "fr" ? "Ouvrir le menu" : "Open menu"}" aria-expanded="false" data-menu-toggle>
        <span></span><span></span><span></span>
      </button>
      <nav class="nav" data-nav>
        ${nav}
        <a class="nav-cta" href="${hrefFor(lang, "contact")}">${t.quoteCta}</a>
        <a class="lang-switch" href="${otherHref}" hreflang="${other}">${t.altLangName}</a>
      </nav>
    </header>
    <main id="contenu">${body}</main>
    ${whatsappFloat(lang)}
    ${footer(lang)}
    <script src="${prefix}script.js"></script>
  </body>
</html>
`;
}

function schema(lang, title, description) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "LILOTOP SARL",
    url: lang === "fr" ? site.domain : `${site.domain}/en/`,
    logo: `${site.domain}/assets/logo-lilotop.svg`,
    description,
    telephone: site.phone,
    email: site.email,
    address: {
      "@type": "PostalAddress",
      addressCountry: "CD",
      addressLocality: "Lubumbashi / Kinshasa",
      streetAddress: site.address,
    },
    areaServed: ["Democratic Republic of Congo", "Central Africa"],
    knowsAbout: ["Mining supply", "Logistics", "Infrastructure", "Import-export", "Odoo", "Digital solutions"],
  };
}

function whatsappFloat(lang) {
  const label = lang === "fr" ? "Contacter LILOTOP SARL sur WhatsApp" : "Contact LILOTOP SARL on WhatsApp";
  return `<a class="whatsapp-float" href="${site.whatsapp}" target="_blank" rel="noopener" aria-label="${label}"><span>WA</span><strong>WhatsApp</strong></a>`;
}

function footer(lang) {
  const t = data[lang];
  const prefix = lang === "en" ? "../" : "";
  const nav = pages.filter((p) => !p.hidden).map((p) => `<a href="${hrefFor(lang, p.slug)}">${lang === "fr" ? p.fr : p.en}</a>`).join("");
  return `<footer class="footer premium-footer">
    <div class="container footer-grid">
      <div>
        <img class="footer-logo" src="${prefix}assets/logo-lilotop.svg" alt="LILOTOP SARL" width="160" height="44">
        <p>${lang === "fr" ? "Partenaire stratégique en approvisionnement minier, logistique, infrastructures et solutions digitales." : "Strategic partner in mining supply, logistics, infrastructure and digital solutions."}</p>
      </div>
      <div><h2>${lang === "fr" ? "Navigation" : "Navigation"}</h2>${nav}</div>
      <div><h2>${lang === "fr" ? "Domaines" : "Capabilities"}</h2><span>Mining Supply</span><span>Logistics</span><span>Infrastructure</span><span>Odoo & AI</span></div>
      <div><h2>Contact</h2><a href="tel:${site.phoneHref}">${site.phone}</a><a href="mailto:${site.email}">${site.email}</a><span>RDC • Lubumbashi • Kinshasa</span></div>
    </div>
    <div class="container footer-bottom"><span>© 2026 LILOTOP SARL</span><a href="${hrefFor(lang, "legal")}">${lang === "fr" ? "Mentions légales" : "Legal"}</a><a href="${hrefFor(lang, "contact")}">${t.quoteCta}</a></div>
  </footer>`;
}

function hero(lang) {
  const t = data[lang];
  const h = t.home;
  const proof = h.proof.map((item) => `<span>${item}</span>`).join("");
  const stats = h.stats.map(([n, label]) => `<span><strong data-counter="${n.replace(/\D/g, "") || "1"}">${n}</strong>${label}</span>`).join("");
  return `<section class="hero world-hero" id="accueil" data-parallax>
    <div class="hero-media" aria-hidden="true"></div>
    <div class="hero-gridline" aria-hidden="true"></div>
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <div class="hero-copy reveal">
        <p class="eyebrow">${h.kicker}</p>
        <h1>${h.h1}</h1>
        <p class="hero-lead">${h.lead}</p>
        <div class="hero-actions">
          <a class="button primary" href="${hrefFor(lang, "contact")}">${t.cta}${icon.arrow}</a>
          <a class="button whatsapp-inline" href="${site.whatsapp}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="button secondary" href="${hrefFor(lang, "sectors")}">${lang === "fr" ? "Explorer nos secteurs" : "Explore sectors"}</a>
        </div>
      </div>
      <div class="hero-command reveal" aria-label="${lang === "fr" ? "Résumé opérationnel" : "Operational summary"}">
        <p>${h.commandTitle}</p>
        <strong>${h.commandStrong}</strong>
        <dl>
          <div><dt>${lang === "fr" ? "Mission" : "Mission"}</dt><dd>${lang === "fr" ? "Gagner du temps, réduire les risques, sécuriser les opérations" : "Save time, reduce risk, secure operations"}</dd></div>
          <div><dt>${lang === "fr" ? "Marchés" : "Markets"}</dt><dd>${lang === "fr" ? "Mines, énergie, infrastructures, PME, institutions" : "Mining, energy, infrastructure, SMEs, institutions"}</dd></div>
          <div><dt>${lang === "fr" ? "Conformité" : "Compliance"}</dt><dd>${lang === "fr" ? "ARSP, HSE, fiscalité, documentation" : "ARSP, HSE, tax, documentation"}</dd></div>
        </dl>
      </div>
      <div class="hero-stats">${stats}</div>
    </div>
  </section>
  <section class="proof-strip" aria-label="${lang === "fr" ? "Engagements opérationnels" : "Operational commitments"}"><div class="container proof-grid">${proof}</div></section>`;
}

function homePage(lang) {
  const t = data[lang];
  const h = t.home;
  const body = `${hero(lang)}
  ${brandTrustSection(lang)}
  <section class="intro section-band">
    <div class="container intro-grid">
      <div class="reveal"><p class="section-kicker">${lang === "fr" ? "Profil officiel" : "Official profile"}</p><h2>${h.introTitle}</h2></div>
      <div class="intro-copy reveal"><p>${h.introText}</p><p class="quote">${h.vision}</p></div>
    </div>
  </section>
  ${strategicDomainsSection(lang)}
  ${impactStatsSection(lang)}
  ${whyChooseSection(lang)}
  ${gallerySection(lang)}
  ${illustratedSectorsSection(lang)}
  ${complianceHseSection(lang)}
  <section class="section">
    <div class="container">
      <div class="section-heading split-heading reveal"><div><p class="section-kicker">${lang === "fr" ? "Capacités" : "Capabilities"}</p><h2>${h.capabilityTitle}</h2></div><p>${h.capabilityLead}</p></div>
      ${cardGrid(t.sectors.slice(0, 4), "service-grid icon-grid")}
      <div class="section-link"><a class="button dark" href="${hrefFor(lang, "sectors")}">${lang === "fr" ? "Voir les secteurs" : "View sectors"}${icon.arrow}</a></div>
    </div>
  </section>
  ${methodSection(lang, true)}
  ${internationalPartnersSection(lang)}
  ${testimonials(lang)}
  ${quoteBand(lang)}`;
  return layout(lang, "index", h.title, h.description, body);
}

function brandTrustSection(lang) {
  const items = lang === "fr"
    ? ["ARSP", "RCCM", "HSE", "OHADA", "Odoo", "Import-Export"]
    : ["ARSP", "RCCM", "HSE", "OHADA", "Odoo", "Import-Export"];
  const label = lang === "fr" ? "Références et cadres de travail" : "References and operating frameworks";
  return `<section class="brand-trust" aria-label="${label}">
    <div class="container trust-rail">
      <span>${label}</span>
      <div>${items.map((item) => `<b>${item}</b>`).join("")}</div>
    </div>
  </section>`;
}

function impactStatsSection(lang) {
  const h = data[lang].home;
  return `<section class="impact-strip">
    <div class="container impact-grid">${h.impactStats.map(([value, label]) => `<div class="impact-item reveal"><strong data-counter="${value}">${value}</strong><span>${label}</span></div>`).join("")}</div>
  </section>`;
}

function whyChooseSection(lang) {
  const t = data[lang];
  const title = lang === "fr" ? "Pourquoi choisir LILOTOP ?" : "Why choose LILOTOP?";
  const lead = lang === "fr"
    ? "Une présence locale, une discipline documentaire et une capacité à coordonner les partenaires autour d'un même objectif opérationnel."
    : "Local presence, documentation discipline and the ability to coordinate partners around one operational objective.";
  return `<section class="section why-premium">
    <div class="container">
      <div class="section-heading split-heading reveal"><div><p class="section-kicker">${lang === "fr" ? "Pourquoi LILOTOP" : "Why LILOTOP"}</p><h2>${title}</h2></div><p>${lead}</p></div>
      <div class="premium-reasons">${t.advantages.slice(0, 4).map(([name, text], index) => `<article class="premium-reason reveal"><span>${String(index + 1).padStart(2, "0")}</span><h3>${name}</h3><p>${text}</p></article>`).join("")}</div>
    </div>
  </section>`;
}

function illustratedSectorsSection(lang) {
  const prefix = lang === "en" ? "../" : "";
  const t = data[lang];
  const images = ["mining-supply-premium", "logistics-supply-chain", "energy-industrial"];
  const alts = lang === "fr"
    ? ["Approvisionnement minier premium avec EPI, pompes, vannes, pièces industrielles et consommables", "Logistique industrielle avec camions, conteneurs, entrepôt et corridor de livraison", "Infrastructure énergétique industrielle avec poste électrique, lignes haute tension et maintenance"]
    : ["Premium mining supply with PPE, pumps, valves, industrial parts and consumables", "Industrial logistics with trucks, containers, warehouse and delivery corridor", "Industrial energy infrastructure with substation, high voltage lines and maintenance"];
  return `<section class="section illustrated-sectors">
    <div class="container">
      <div class="section-heading split-heading reveal"><div><p class="section-kicker">${lang === "fr" ? "Secteurs stratégiques" : "Strategic sectors"}</p><h2>${lang === "fr" ? "Des cartes visuelles pour comprendre rapidement les priorités." : "Visual cards to quickly understand priorities."}</h2></div><p>${lang === "fr" ? "Une lecture plus immersive des domaines où LILOTOP peut structurer une réponse opérationnelle." : "A more immersive view of the domains where LILOTOP can structure an operational response."}</p></div>
      <div class="sector-visual-grid">${t.sectors.slice(0, 3).map(([name, text], index) => `<article class="sector-visual-card reveal"><picture><source srcset="${prefix}assets/${images[index]}.webp" type="image/webp"><img src="${prefix}assets/${images[index]}.png" alt="${alts[index]}" loading="lazy"></picture><div><span>0${index + 1}</span><h3>${name}</h3><p>${text}</p></div></article>`).join("")}</div>
    </div>
  </section>`;
}

function complianceHseSection(lang) {
  const title = lang === "fr" ? "Conformit&eacute; & HSE int&eacute;gr&eacute;es &agrave; chaque dossier." : "Compliance & HSE embedded in every file.";
  const lead = lang === "fr"
    ? "LILOTOP structure ses interventions avec une attention particuli&egrave;re &agrave; la tra&ccedil;abilit&eacute;, aux documents techniques, &agrave; la s&eacute;curit&eacute; des produits sensibles et aux cadres r&eacute;glementaires applicables."
    : "LILOTOP structures its assignments with close attention to traceability, technical documents, safety for sensitive products and applicable regulatory frameworks.";
  const pillars = lang === "fr" ? [
    ["Documentation", "Fiches techniques, certificats, conditions de stockage et preuves de conformit&eacute; selon le besoin."],
    ["S&eacute;curit&eacute; op&eacute;rationnelle", "Coordination transport, manutention et livraison avec une logique de pr&eacute;vention des risques."],
    ["Tra&ccedil;abilit&eacute;", "Suivi des demandes, fournisseurs, exp&eacute;ditions et dossiers critiques jusqu'&agrave; la livraison."],
    ["Cadre local", "Lecture des exigences ARSP, fiscales, administratives et HSE pour s&eacute;curiser l'ex&eacute;cution."]
  ] : [
    ["Documentation", "Technical sheets, certificates, storage conditions and compliance evidence according to the requirement."],
    ["Operational safety", "Transport, handling and delivery coordination through a risk-prevention lens."],
    ["Traceability", "Tracking of requests, suppliers, shipments and critical files through to delivery."],
    ["Local framework", "Reading of ARSP, tax, administrative and HSE requirements to secure execution."]
  ];
  return `<section class="section compliance-hse">
    <div class="container hse-grid">
      <div class="hse-panel reveal">
        <p class="section-kicker">${lang === "fr" ? "Conformit&eacute; & HSE" : "Compliance & HSE"}</p>
        <h2>${title}</h2>
        <p>${lead}</p>
      </div>
      <div class="hse-checklist">${pillars.map(([name, text]) => `<article class="reveal"><span>${icon.check}</span><div><h3>${name}</h3><p>${text}</p></div></article>`).join("")}</div>
    </div>
  </section>`;
}

function strategicDomainsSection(lang) {
  const t = data[lang];
  const prefix = lang === "en" ? "../" : "";
  const title = lang === "fr"
    ? "Sept domaines, une plateforme opérationnelle unique."
    : "Seven domains, one operating platform.";
  const lead = lang === "fr"
    ? "LILOTOP ne se limite pas à l'achat ou à la livraison. L'entreprise structure des réponses complètes pour les organisations qui doivent travailler vite, légalement et efficacement en RDC."
    : "LILOTOP is not limited to buying or delivering. The company structures complete responses for organizations that need to operate quickly, legally and efficiently in DRC.";
  return `<section class="section strategic-section">
    <div class="container">
      <div class="section-heading split-heading reveal">
        <div><p class="section-kicker">${lang === "fr" ? "Positionnement stratégique" : "Strategic positioning"}</p><h2>${title}</h2></div>
        <p>${lead}</p>
      </div>
      <div class="strategic-grid">${t.strategicDomains.map(([name, text, svg], index) => {
        const visual = visualAssetFor(name, index, "strategic");
        return `<article class="strategic-card reveal"><picture class="strategic-media"><source srcset="${prefix}assets/${visual}.webp" type="image/webp"><img src="${prefix}assets/${visual}.png" alt="${visualAltFor(name, lang)}" loading="lazy"></picture><span class="strategic-index">${String(index + 1).padStart(2, "0")}</span><i>${svg}</i><h3>${name}</h3><p>${text}</p></article>`;
      }).join("")}</div>
    </div>
  </section>`;
}

function gallerySection(lang) {
  const prefix = lang === "en" ? "../" : "";
  const items = lang === "fr" ? [
    ["Mining supply & EPI", "Approvisionnement industriel, sécurité et continuité opérationnelle.", "mining-supply-premium", "Équipements miniers, EPI, pompes, vannes, billes de broyage et consommables industriels"],
    ["Import-export & logistique", "Coordination fournisseurs, expédition, transit et livraison terrain.", "logistics-supply-chain", "Camions, conteneurs, entrepôt industriel et corridor logistique pour opérations minières"],
    ["Produits chimiques & HSE", "Documentation, sécurité, traçabilité et conformité des produits sensibles.", "chemical-reactives-lab", "Laboratoire industriel, contrôle qualité et stockage sécurisé de réactifs chimiques"],
  ] : [
    ["Mining supply & PPE", "Industrial procurement, safety and operational continuity.", "mining-supply-premium", "Mining equipment, PPE, pumps, valves, grinding media and industrial consumables"],
    ["Import-export & logistics", "Supplier coordination, shipment, transit and field delivery.", "logistics-supply-chain", "Trucks, containers, industrial warehouse and logistics corridor for mining operations"],
    ["Chemicals & HSE", "Documentation, safety, traceability and compliance for sensitive products.", "chemical-reactives-lab", "Industrial laboratory, quality control and secure storage for chemical reagents"],
  ];
  return `<section class="section visual-section">
    <div class="container">
      <div class="section-heading split-heading reveal"><div><p class="section-kicker">${lang === "fr" ? "Présence opérationnelle" : "Operational presence"}</p><h2>${lang === "fr" ? "Des visuels industriels au service d'une promesse concrète." : "Industrial visuals supporting a concrete promise."}</h2></div><p>${lang === "fr" ? "Les images illustrent les familles d'intervention actuelles de LILOTOP et peuvent être remplacées par des photos officielles de projets lorsque disponibles." : "Images illustrate LILOTOP's current work families and can be replaced by official project photography when available."}</p></div>
      <div class="visual-grid">${items.map(([title, text, img, alt]) => `<figure class="reveal"><picture><source srcset="${prefix}assets/${img}.webp" type="image/webp"><img src="${prefix}assets/${img}.png" alt="${alt}" loading="lazy"></picture><figcaption><strong>${title}</strong><span>${text}</span></figcaption></figure>`).join("")}</div>
    </div>
  </section>`;
}

function visualAssetFor(title, index = 0, context = "") {
  const key = `${title} ${context}`.toLowerCase();
  if (key.includes("mining supply")) return "mining-supply-premium";
  if (key.includes("gold") || key.includes("d'or")) return "underground-mining";
  if (key.includes("cuivre") || key.includes("cobalt") || key.includes("copper")) return "hero-industrial-drc";
  if (key.includes("logistics") || key.includes("logistique") || key.includes("supply chain") || key.includes("transport") || key.includes("coordinator")) return "heavy-transport";
  if (key.includes("reagent") || key.includes("reactif") || key.includes("réactif") || key.includes("chemical") || key.includes("chimique") || key.includes("sensitive") || key.includes("acid") || key.includes("acide") || key.includes("chaux") || key.includes("flocul") || key.includes("coagul") || key.includes("charbon") || key.includes("extract") || key.includes("sulfate")) return "chemical-reactives-lab";
  if (key.includes("billes") || key.includes("grinding") || key.includes("pump") || key.includes("pompe") || key.includes("valve") || key.includes("vanne") || key.includes("piping") || key.includes("tuyaut") || key.includes("spare") || key.includes("rechange") || key.includes("ppe") || key.includes("epi") || key.includes("protection")) return "mining-supply-premium";
  if (key.includes("processing") || key.includes("traitement") || key.includes("consommables")) return "mineral-processing-plant";
  if (key.includes("documentation") || key.includes("traceability") || key.includes("tracabilit") || key.includes("traçabilit") || key.includes("quality") || key.includes("qualit") || key.includes("compliance") || key.includes("conformit")) return "quality-inspection";
  if (key.includes("warehouse") || key.includes("procurement") || key.includes("approvisionnement") || key.includes("supply") || key.includes("fournisseur")) return "industrial-warehouse";
  if (key.includes("import") || key.includes("export") || key.includes("transit")) return "ports-containers";
  if (key.includes("infrastructure") || key.includes("routes") || key.includes("chantier") || key.includes("site") || key.includes("camp")) return "infrastructure-projects";
  if (key.includes("energy") || key.includes("énergie") || key.includes("energie")) return "energy-industrial";
  if (key.includes("odoo") || key.includes("digital") || key.includes("pme") || key.includes("sme") || key.includes("dashboard")) return "digital-operations";
  if (key.includes("partner") || key.includes("partenaire") || key.includes("banks") || key.includes("banques") || key.includes("institution") || key.includes("represent") || key.includes("commercial") || key.includes("groupement") || key.includes("consortium")) return "international-partnerships";
  if (key.includes("terrain") || key.includes("local") || key.includes("engagement")) return "field-engineering-team";
  const fallback = ["mineral-processing-plant", "industrial-warehouse", "logistics-supply-chain", "field-engineering-team", "quality-inspection", "digital-operations"];
  return fallback[index % fallback.length];
}

function visualAltFor(title, lang) {
  return lang === "fr"
    ? `Visuel industriel premium illustrant ${title}`
    : `Premium industrial visual illustrating ${title}`;
}

function cardGrid(items, klass = "service-grid") {
  return `<div class="${klass}">${items.map(([title, text, svg], i) => {
    const visual = visualAssetFor(title, i, klass);
    return `<article class="service-card reveal has-card-media"><picture class="card-media"><source srcset="${assetPrefix()}assets/${visual}.webp" type="image/webp"><img src="${assetPrefix()}assets/${visual}.png" alt="${visualAltFor(title, currentLang())}" loading="lazy"></picture><div class="card-body"><span class="card-icon">${svg || String(i + 1).padStart(2, "0")}</span><h3>${title}</h3><p>${text}</p></div></article>`;
  }).join("")}</div>`;
}

function brochureButton(lang, extraClass = "secondary") {
  if (site.brochureAvailable) {
    const href = asset(lang, site.brochureFile);
    return `<a class="button ${extraClass}" href="${href}" download data-track="brochure-download">${lang === "fr" ? "Télécharger la brochure" : "Download brochure"}</a>`;
  }
  return `<span class="button ${extraClass} is-disabled" aria-disabled="true" title="${lang === "fr" ? "La brochure officielle sera ajoutée après validation." : "The official brochure will be added after validation."}">${lang === "fr" ? "Brochure en préparation" : "Brochure in preparation"}</span>`;
}

function methodSection(lang, compact = false) {
  const t = data[lang];
  return `<section class="section process" id="processus">
    <div class="container process-grid">
      <div class="reveal"><p class="section-kicker">${lang === "fr" ? "Méthode de travail" : "Working method"}</p><h2>${lang === "fr" ? "Une gouvernance claire de l'analyse du besoin au service après livraison." : "Clear governance from needs analysis to after-delivery support."}</h2><p class="process-note">${lang === "fr" ? "Chaque dossier est traité avec une logique de risque, de conformité et d'exécution." : "Each file is handled through a risk, compliance and execution lens."}</p></div>
      <ol class="steps ${compact ? "steps-compact" : ""}">${t.method.map(([title, text]) => `<li class="reveal"><strong>${title}</strong><span>${text}</span></li>`).join("")}</ol>
    </div>
  </section>`;
}

function internationalPartnersSection(lang) {
  const items = lang === "fr"
    ? ["Fabricants internationaux", "Fournisseurs r&eacute;gionaux", "Partenaires techniques", "Institutions publiques", "Banques & finance", "&Eacute;cosyst&egrave;me Odoo"]
    : ["International manufacturers", "Regional suppliers", "Technical partners", "Public institutions", "Banks & finance", "Odoo ecosystem"];
  const lead = lang === "fr"
    ? "Une pr&eacute;sentation sobre des familles de partenaires avec lesquelles LILOTOP peut structurer des r&eacute;ponses fiables, document&eacute;es et adapt&eacute;es aux environnements exigeants."
    : "A restrained presentation of partner families through which LILOTOP can structure reliable, documented responses for demanding environments.";
  return `<section class="section partner-showcase">
    <div class="container">
      <div class="section-heading split-heading reveal"><div><p class="section-kicker">${lang === "fr" ? "Partenaires internationaux" : "International partners"}</p><h2>${lang === "fr" ? "Un pont professionnel entre fournisseurs, institutions et op&eacute;rations terrain." : "A professional bridge between suppliers, institutions and field operations."}</h2></div><p>${lead}</p></div>
      <div class="partner-logo-grid">${items.map((item) => `<div class="partner-mark reveal"><span>${item.replace(/&[^;]+;/g, "").split(" ").map((word) => word[0]).join("").slice(0, 3)}</span><strong>${item}</strong></div>`).join("")}</div>
    </div>
  </section>`;
}

function testimonials(lang) {
  const t = data[lang];
  return `<section class="section testimonials">
    <div class="container">
      <div class="section-heading split-heading reveal"><div><p class="section-kicker">${lang === "fr" ? "Crédibilité" : "Credibility"}</p><h2>${lang === "fr" ? "Un positionnement pensé pour les mines, banques, institutions et partenaires internationaux." : "A positioning built for mining companies, banks, institutions and international partners."}</h2></div><p>${lang === "fr" ? "Des engagements concrets pour travailler avec des environnements industriels, financiers et institutionnels exigeants." : "Concrete commitments for working with demanding industrial, financial and institutional environments."}</p></div>
      <div class="testimonial-grid">${t.credibility.map(([name, text], i) => `<article class="credibility-card reveal"><span>${String(i + 1).padStart(2, "0")}</span><h3>${name}</h3><p>${text}</p></article>`).join("")}</div>
    </div>
  </section>`;
}

function quoteBand(lang) {
  const t = data[lang];
  const points = lang === "fr"
    ? ["Analyse du besoin", "Documentation fournisseur", "Coordination logistique", "Suivi jusqu'&agrave; livraison"]
    : ["Needs analysis", "Supplier documentation", "Logistics coordination", "Follow-up through delivery"];
  return `<section class="quote-band">
    <div class="container quote-band-inner reveal">
      <div><p class="section-kicker">${lang === "fr" ? "Appels d'offres & partenariats" : "Tenders & partnerships"}</p><h2>${lang === "fr" ? "Soumettez un besoin, un dossier fournisseur ou un projet à structurer en RDC." : "Submit a requirement, supplier file or project to structure in DRC."}</h2></div>
      <div class="quote-action-panel">
        <ul>${points.map((point) => `<li>${icon.check}<span>${point}</span></li>`).join("")}</ul>
        <a class="button primary" href="${hrefFor(lang, "contact")}">${t.quoteCta}${icon.arrow}</a>
        ${brochureButton(lang)}
      </div>
    </div>
  </section>`;
}

function aboutPage(lang) {
  const t = data[lang];
  const title = lang === "fr" ? "À propos | LILOTOP SARL" : "About | LILOTOP SARL";
  const desc = lang === "fr" ? "Découvrez la vision, la mission, les valeurs et le positionnement officiel de LILOTOP SARL." : "Discover LILOTOP SARL's vision, mission, values and official positioning.";
  const body = `${subHero(lang, lang === "fr" ? "À propos" : "About", lang === "fr" ? "Une société congolaise orientée solutions, conformité et partenariats." : "A Congolese company focused on solutions, compliance and partnerships.", desc)}
  <section class="section"><div class="container intro-grid"><div class="reveal"><p class="section-kicker">${lang === "fr" ? "Présentation" : "Overview"}</p><h2>${data[lang].home.introTitle}</h2></div><div class="intro-copy reveal"><p>${data[lang].home.introText}</p><p>${lang === "fr" ? "LILOTOP sert de pont opérationnel entre les fournisseurs internationaux et les besoins réels du marché congolais." : "LILOTOP serves as an operational bridge between international suppliers and real market needs in DRC."}</p></div></div></section>
  <section class="section section-band"><div class="container"><div class="section-heading reveal"><p class="section-kicker">${lang === "fr" ? "Valeurs" : "Values"}</p><h2>${lang === "fr" ? "Des principes adaptés aux environnements exigeants." : "Principles suited to demanding environments."}</h2></div>${cardGrid(t.values, "why-grid")}</div></section>
  <section class="section"><div class="container"><div class="section-heading reveal"><p class="section-kicker">${lang === "fr" ? "Avantages" : "Advantages"}</p><h2>${lang === "fr" ? "Pourquoi travailler avec LILOTOP SARL." : "Why work with LILOTOP SARL."}</h2></div>${cardGrid(t.advantages, "why-grid")}</div></section>
  ${quoteBand(lang)}`;
  return layout(lang, "about", title, desc, body, { solidHeader: true });
}

function solutionsPage(lang) {
  const title = lang === "fr" ? "Solutions intégrées | LILOTOP SARL" : "Integrated Solutions | LILOTOP SARL";
  const desc = lang === "fr"
    ? "Solutions intégrées pour approvisionnement minier, réactifs chimiques, consommables, lubrifiants, infrastructures et conseil stratégique en RDC."
    : "Integrated solutions for mining procurement, chemical reagents, consumables, lubricants, infrastructure and strategic advisory in DRC.";
  const intro = lang === "fr"
    ? "LILOTOP combine approvisionnement, connaissance du terrain congolais, coordination logistique et accompagnement stratégique pour structurer des réponses adaptées aux opérations industrielles, minières et infrastructurelles."
    : "LILOTOP combines procurement, knowledge of Congolese field realities, logistics coordination and strategic support to structure responses suited to industrial, mining and infrastructure operations.";
  const solutions = lang === "fr" ? [
    ["Approvisionnement minier et industriel", ["Identification des besoins", "Sourcing international", "Négociation fournisseurs", "Coordination logistique", "Livraison et suivi"]],
    ["Réactifs chimiques pour les opérations minières", ["Acide sulfurique", "Chaux vive", "Floculants", "Charbon actif", "Extractants SX", "Sulfate de sodium", "Autres produits selon cahier des charges"]],
    ["Billes de broyage et consommables d'usine", ["Sélection selon les équipements", "Optimisation de la consommation", "Contrôle de qualité", "Coordination avec les fabricants"]],
    ["Lubrifiants, carburants et fluides industriels", ["Huiles hydrauliques", "Graisses industrielles", "Lubrifiants moteurs", "Diesel et autres produits selon disponibilité et réglementation"]],
    ["Infrastructures et solutions routières", ["Produits et technologies routières", "Accompagnement de projets", "Coordination avec partenaires techniques", "Solutions adaptées aux matériaux et conditions locales"]],
    ["Conseil stratégique et développement d'affaires", ["Structuration de partenariats", "Accès au marché", "Préparation d'offres", "Développement de projets", "Mise en relation institutionnelle et commerciale"]],
    ["Transformation industrielle et projets", ["Études préliminaires", "Recherche de partenaires", "Structuration technique et financière", "Accompagnement jusqu'à la mise en œuvre"]],
  ] : [
    ["Mining and industrial procurement", ["Needs identification", "International sourcing", "Supplier negotiation", "Logistics coordination", "Delivery and follow-up"]],
    ["Chemical reagents for mining operations", ["Sulfuric acid", "Quicklime", "Flocculants", "Activated carbon", "SX extractants", "Sodium sulfate", "Other products according to specifications"]],
    ["Grinding media and plant consumables", ["Selection according to equipment", "Consumption optimization", "Quality control", "Coordination with manufacturers"]],
    ["Lubricants, fuels and industrial fluids", ["Hydraulic oils", "Industrial greases", "Engine lubricants", "Diesel and other products according to availability and regulation"]],
    ["Infrastructure and road solutions", ["Road products and technologies", "Project support", "Coordination with technical partners", "Solutions adapted to local materials and conditions"]],
    ["Strategic advisory and business development", ["Partnership structuring", "Market access", "Offer preparation", "Project development", "Institutional and commercial connection"]],
    ["Industrial transformation and projects", ["Preliminary studies", "Partner search", "Technical and financial structuring", "Support through implementation"]],
  ];
  const method = lang === "fr"
    ? ["Analyse du besoin", "Sélection de la solution", "Consultation des partenaires", "Proposition technique et commerciale", "Livraison et suivi"]
    : ["Needs analysis", "Solution selection", "Partner consultation", "Technical and commercial proposal", "Delivery and follow-up"];
  const body = `${subHero(lang, lang === "fr" ? "Solutions" : "Solutions", lang === "fr" ? "Des solutions intégrées pour les opérations industrielles, minières et infrastructurelles" : "Integrated solutions for industrial, mining and infrastructure operations", desc)}
  <section class="section"><div class="container intro-grid"><div class="reveal"><p class="section-kicker">${lang === "fr" ? "Approche intégrée" : "Integrated approach"}</p><h2>${lang === "fr" ? "Une réponse structurée, du besoin terrain au suivi opérationnel." : "A structured response from field requirement to operational follow-up."}</h2></div><div class="intro-copy reveal"><p>${intro}</p><p>${lang === "fr" ? "Chaque solution est présentée sans promesse non vérifiée: la faisabilité, les fournisseurs et les conditions sont confirmés dossier par dossier." : "Each solution is presented without unverified claims: feasibility, suppliers and conditions are confirmed file by file."}</p></div></div></section>
  <section class="section section-band"><div class="container"><div class="section-heading split-heading reveal"><div><p class="section-kicker">${lang === "fr" ? "Solutions principales" : "Core solutions"}</p><h2>${lang === "fr" ? "Des blocs d'intervention adaptés aux besoins industriels." : "Work blocks tailored to industrial requirements."}</h2></div><p>${lang === "fr" ? "Ces domaines structurent les échanges avec les clients, fournisseurs, banques, partenaires techniques et institutions." : "These domains structure discussions with clients, suppliers, banks, technical partners and institutions."}</p></div><div class="solutions-grid">${solutions.map(([name, points], i) => { const visual = visualAssetFor(name, i, "solutions"); return `<article class="solution-card reveal"><picture><source srcset="${assetPrefix()}assets/${visual}.webp" type="image/webp"><img src="${assetPrefix()}assets/${visual}.png" alt="${visualAltFor(name, lang)}" loading="lazy"></picture><div><span>${String(i + 1).padStart(2, "0")}</span><h3>${name}</h3><ul>${points.map((point) => `<li>${icon.check}<span>${point}</span></li>`).join("")}</ul></div></article>`; }).join("")}</div></div></section>
  <section class="section process"><div class="container process-grid"><div class="reveal"><p class="section-kicker">${lang === "fr" ? "Méthode de travail" : "Working method"}</p><h2>${lang === "fr" ? "Cinq étapes pour passer d'un besoin à une réponse exploitable." : "Five steps from requirement to actionable response."}</h2><p class="process-note">${lang === "fr" ? "La méthode reste volontairement simple pour faciliter les appels d'offres, propositions et échanges techniques." : "The method remains deliberately simple to support tenders, proposals and technical exchanges."}</p></div><ol class="steps steps-compact">${method.map((step) => `<li class="reveal"><strong>${step}</strong><span>${lang === "fr" ? "Validation progressive selon les informations disponibles et les contraintes du dossier." : "Progressive validation according to available information and file constraints."}</span></li>`).join("")}</ol></div></section>
  <section class="quote-band"><div class="container quote-band-inner reveal"><div><p class="section-kicker">${lang === "fr" ? "Passer à l'action" : "Next step"}</p><h2>${lang === "fr" ? "Demandez une proposition ou échangez avec notre équipe." : "Request a proposal or speak with our team."}</h2></div><div class="quote-action-panel"><ul><li>${icon.check}<span>${lang === "fr" ? "Demande structurée" : "Structured inquiry"}</span></li><li>${icon.check}<span>${lang === "fr" ? "Réponse orientée solution" : "Solution-oriented response"}</span></li><li>${icon.check}<span>${lang === "fr" ? "Brochure prête à intégrer dès validation" : "Brochure ready to integrate after validation"}</span></li></ul><a class="button primary" href="${hrefFor(lang, "contact")}">${lang === "fr" ? "Demander une proposition" : "Request a proposal"}${icon.arrow}</a><a class="button secondary" href="${site.whatsapp}" target="_blank" rel="noopener">${lang === "fr" ? "Parler à notre équipe" : "Speak with our team"}</a>${brochureButton(lang, "dark")}</div></div></section>`;
  return layout(lang, "solutions", title, desc, body, { solidHeader: true });
}

function sectorsPage(lang) {
  const t = data[lang];
  const title = lang === "fr" ? "Secteurs d'activité | LILOTOP SARL" : "Sectors | LILOTOP SARL";
  const desc = lang === "fr" ? "Mines cuivre-cobalt, or, énergie, infrastructures, logistique, banques, institutions et digitalisation." : "Copper-cobalt mining, gold, energy, infrastructure, logistics, banks, institutions and digitalization.";
  const body = `${subHero(lang, lang === "fr" ? "Secteurs d'activité" : "Sectors", lang === "fr" ? "Une couverture prioritaire des industries stratégiques en RDC." : "Priority coverage of strategic industries in DRC.", desc)}
  <section class="section"><div class="container">${cardGrid(t.sectors, "sector-grid icon-grid")}</div></section>
  <section class="section section-band"><div class="container"><div class="section-heading split-heading reveal"><div><p class="section-kicker">${lang === "fr" ? "Marchés cibles" : "Target markets"}</p><h2>${lang === "fr" ? "Des interlocuteurs variés, une même exigence de conformité." : "Diverse stakeholders, one compliance standard."}</h2></div><p>${lang === "fr" ? "Sociétés minières, sous-traitants, transporteurs, fournisseurs internationaux, entreprises industrielles, projets d'infrastructures, banques, PME et partenaires étrangers." : "Mining companies, contractors, transporters, international suppliers, industrial companies, infrastructure projects, banks, SMEs and foreign partners."}</p></div></div></section>
  ${quoteBand(lang)}`;
  return layout(lang, "sectors", title, desc, body, { solidHeader: true });
}

function productsPage(lang) {
  const t = data[lang];
  const prefix = lang === "en" ? "../" : "";
  const title = lang === "fr" ? "Produits & solutions | LILOTOP SARL" : "Products & Solutions | LILOTOP SARL";
  const desc = lang === "fr" ? "Produits miniers, réactifs chimiques, EPI, pièces, pompes, vannes, lubrifiants, Odoo et solutions digitales." : "Mining products, chemical reagents, PPE, parts, pumps, valves, lubricants, Odoo and digital solutions.";
  const body = `${subHero(lang, lang === "fr" ? "Produits & solutions" : "Products & solutions", lang === "fr" ? "Des familles de produits critiques pour les opérations minières et industrielles." : "Critical product families for mining and industrial operations.", desc)}
  <section class="section"><div class="container product-layout"><div class="product-panel reveal"><picture class="product-panel-media"><source srcset="${prefix}assets/mineral-processing-plant.webp" type="image/webp"><img src="${prefix}assets/mineral-processing-plant.png" alt="${lang === "fr" ? "Usine de traitement des minerais avec convoyeurs et circuits industriels" : "Mineral processing plant with conveyors and industrial circuits"}" loading="lazy"></picture><p class="section-kicker">Mining supply</p><h2>${lang === "fr" ? "Approvisionnement industriel et minier." : "Industrial and mining procurement."}</h2><p>${lang === "fr" ? "LILOTOP identifie les fournisseurs, compare les conditions, vérifie les documents techniques et facilite la livraison vers les zones industrielles ou les sites." : "LILOTOP identifies suppliers, compares terms, verifies technical documents and facilitates delivery to industrial zones or sites."}</p></div><div class="product-list">${t.products.map((p, i) => { const visual = visualAssetFor(p, i, "products"); return `<span class="reveal has-product-media"><picture><source srcset="${prefix}assets/${visual}.webp" type="image/webp"><img src="${prefix}assets/${visual}.png" alt="${visualAltFor(p, lang)}" loading="lazy"></picture><b>${p}</b></span>`; }).join("")}</div></div></section>
  <section class="section feature"><div class="container feature-grid"><div class="feature-copy reveal"><p class="section-kicker">${lang === "fr" ? "Produits sensibles" : "Sensitive products"}</p><h2>${lang === "fr" ? "Qualité, fiches techniques, certificats et traçabilité." : "Quality, datasheets, certificates and traceability."}</h2><p>${lang === "fr" ? "Pour les produits chimiques et réactifs, LILOTOP privilégie une approche prudente avec partenaires qualifiés, fiches de données de sécurité, certificats d'analyse, stockage adapté, transport sécurisé et conformité HSE." : "For chemicals and reagents, LILOTOP applies a cautious approach with qualified partners, safety data sheets, analysis certificates, suitable storage, secure transport and HSE compliance."}</p></div>${cardGrid([[lang === "fr" ? "Documentation" : "Documentation", lang === "fr" ? "Fiches techniques, FDS/MSDS, certificats, documents d'expédition." : "Datasheets, SDS/MSDS, certificates, shipment documents.", icon.compliance],[lang === "fr" ? "Traçabilité" : "Traceability", lang === "fr" ? "Suivi des lots, conformité et visibilité client." : "Batch tracking, compliance and client visibility.", icon.logistics]], "capability-list icon-grid")}</div></section>
  ${quoteBand(lang)}`;
  return layout(lang, "products", title, desc, body, { solidHeader: true });
}

function partnersPage(lang) {
  const t = data[lang];
  const title = lang === "fr" ? "Partenaires | LILOTOP SARL" : "Partners | LILOTOP SARL";
  const desc = lang === "fr" ? "LILOTOP SARL agit comme représentant local, partenaire commercial, facilitateur ou coordinateur logistique en RDC." : "LILOTOP SARL acts as local representative, commercial partner, facilitator or logistics coordinator in DRC.";
  const roles = lang === "fr" ? [
    ["Représentant local", "Accompagnement des partenaires étrangers souhaitant opérer en RDC."],
    ["Partenaire commercial", "Développement d'opportunités et structuration de présence commerciale."],
    ["Coordinateur logistique", "Suivi fournisseurs, documents, transit, transport local et livraison."],
    ["Membre de groupement", "Participation à des offres conjointes selon la nature des projets."],
  ] : [
    ["Local representative", "Support for foreign partners seeking to operate in DRC."],
    ["Commercial partner", "Opportunity development and commercial presence structuring."],
    ["Logistics coordinator", "Supplier follow-up, documents, transit, local transport and delivery."],
    ["Consortium member", "Participation in joint bids depending on project nature."],
  ];
  const body = `${subHero(lang, lang === "fr" ? "Partenaires" : "Partners", lang === "fr" ? "Un point d'appui local pour les fournisseurs, investisseurs et institutions." : "A local operating anchor for suppliers, investors and institutions.", desc)}
  <section class="section"><div class="container"><div class="section-heading split-heading reveal"><div><p class="section-kicker">${lang === "fr" ? "Partenariats" : "Partnerships"}</p><h2>${lang === "fr" ? "Travailler efficacement et légalement en RDC." : "Working efficiently and legally in DRC."}</h2></div><p>${lang === "fr" ? "LILOTOP accompagne les partenaires internationaux dans la compréhension du contexte local, l'identification d'opportunités et la structuration de leur présence." : "LILOTOP supports international partners in understanding the local context, identifying opportunities and structuring their presence."}</p></div>${cardGrid(roles, "why-grid")}</div></section>
  <section class="section section-band"><div class="container"><div class="section-heading reveal"><p class="section-kicker">${lang === "fr" ? "Documents disponibles" : "Available documents"}</p><h2>${lang === "fr" ? "Un dossier prêt pour appels d'offres, banques et partenaires." : "A file prepared for tenders, banks and partners."}</h2></div><div class="document-grid">${t.documents.map((d) => `<span class="reveal">${d}</span>`).join("")}</div></div></section>
  ${quoteBand(lang)}`;
  return layout(lang, "partners", title, desc, body, { solidHeader: true });
}

function projectsPage(lang) {
  const title = lang === "fr" ? "Projets | LILOTOP SARL" : "Projects | LILOTOP SARL";
  const desc = lang === "fr" ? "Types de projets accompagnés par LILOTOP SARL en mining supply, logistique, infrastructures et digitalisation." : "Project types supported by LILOTOP SARL in mining supply, logistics, infrastructure and digitalization.";
  const projects = lang === "fr" ? [
    ["Approvisionnement de réactifs miniers", "Qualification fournisseurs, documents techniques, transport sécurisé et suivi de lots."],
    ["Logistique de chantier et bases-vie", "Fourniture de matériaux, équipements de sécurité, services généraux et coordination terrain."],
    ["Implantation de partenaire étranger", "Analyse du contexte local, mise en relation et structuration commerciale."],
    ["Digitalisation d'entreprise", "Odoo, tableaux de bord, suivi achats-stocks-paiements et automatisation documentaire."],
  ] : [
    ["Mining reagent procurement", "Supplier qualification, technical documents, secure transport and batch follow-up."],
    ["Site logistics and camps", "Materials supply, safety equipment, general services and field coordination."],
    ["Foreign partner setup", "Local context analysis, introductions and commercial structuring."],
    ["Business digitalization", "Odoo, dashboards, purchase-stock-payment tracking and document automation."],
  ];
  const body = `${subHero(lang, lang === "fr" ? "Projets" : "Projects", lang === "fr" ? "Des formats de mission adaptés aux dossiers industriels, financiers et institutionnels." : "Mission formats suited to industrial, financial and institutional files.", desc)}
  <section class="section"><div class="container project-grid">${projects.map(([name, text], i) => { const visual = visualAssetFor(name, i, "projects"); return `<article class="project-card reveal has-card-media"><picture class="card-media"><source srcset="${assetPrefix()}assets/${visual}.webp" type="image/webp"><img src="${assetPrefix()}assets/${visual}.png" alt="${visualAltFor(name, currentLang())}" loading="lazy"></picture><div class="card-body"><span>0${i + 1}</span><h2>${name}</h2><p>${text}</p></div></article>`; }).join("")}</div></section>
  ${methodSection(lang)}
  ${quoteBand(lang)}`;
  return layout(lang, "projects", title, desc, body, { solidHeader: true });
}

function newsPage(lang) {
  const t = data[lang];
  const title = lang === "fr" ? "Actualités | LILOTOP SARL" : "News | LILOTOP SARL";
  const desc = lang === "fr" ? "Analyses et perspectives LILOTOP sur l'approvisionnement minier, la conformité locale et la digitalisation." : "LILOTOP insights on mining procurement, local compliance and digitalization.";
  const body = `${subHero(lang, lang === "fr" ? "Actualités" : "News", lang === "fr" ? "Analyses, tendances et notes pratiques pour les partenaires de LILOTOP." : "Insights, trends and practical notes for LILOTOP partners.", desc)}
  <section class="section"><div class="container news-grid">${t.news.map(([name, text], i) => { const visual = visualAssetFor(name, i, "news"); return `<article class="news-card reveal has-card-media"><picture class="card-media"><source srcset="${assetPrefix()}assets/${visual}.webp" type="image/webp"><img src="${assetPrefix()}assets/${visual}.png" alt="${visualAltFor(name, currentLang())}" loading="lazy"></picture><div class="card-body"><p class="section-kicker">${lang === "fr" ? "Note" : "Insight"}</p><h2>${name}</h2><p>${text}</p><a href="${hrefFor(lang, "contact")}">${lang === "fr" ? "En discuter" : "Discuss this"}${icon.arrow}</a></div></article>`; }).join("")}</div></section>
  ${quoteBand(lang)}`;
  return layout(lang, "news", title, desc, body, { solidHeader: true });
}

function contactPage(lang) {
  const t = data[lang];
  const title = lang === "fr" ? "Contact & demande de devis | LILOTOP SARL" : "Contact & Quote Request | LILOTOP SARL";
  const desc = lang === "fr" ? "Contactez LILOTOP SARL pour un devis, un appel d'offres, un dossier fournisseur, un partenariat ou une demande logistique en RDC." : "Contact LILOTOP SARL for quotes, tenders, supplier files, partnerships or logistics requests in DRC.";
  const body = `${subHero(lang, lang === "fr" ? "Contact" : "Contact", lang === "fr" ? "Demande de devis, appel d'offres, partenariat ou dossier fournisseur." : "Quote request, tender, partnership or supplier file.", desc)}
  <section class="section contact-page"><div class="container contact-layout">
    <div class="quote-form reveal">${quoteForm(lang)}</div>
    <div class="contact-side reveal">
      <address class="contact-card premium-card">
        <span><strong>${lang === "fr" ? "Directeur Général" : "Managing Director"}</strong>Joël Kongolo</span>
        <span><strong>${lang === "fr" ? "Téléphone" : "Phone"}</strong><a href="tel:${site.phoneHref}">${site.phone}</a></span>
        <span><strong>WhatsApp</strong><a href="${site.whatsapp}" target="_blank" rel="noopener">${lang === "fr" ? "Écrire sur WhatsApp" : "Message on WhatsApp"}</a></span>
        <span><strong>Email</strong><a href="mailto:${site.email}">${site.email}</a></span>
        <span><strong>${lang === "fr" ? "Présence" : "Presence"}</strong>RDC • Lubumbashi • Kinshasa</span>
      </address>
      <div class="map-card"><iframe title="Google Maps - LILOTOP SARL" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=Lubumbashi%20RDC&output=embed"></iframe></div>
    </div>
  </div></section>`;
  return layout(lang, "contact", title, desc, body, { solidHeader: true });
}

function legalPage(lang) {
  const title = lang === "fr" ? "Mentions légales | LILOTOP SARL" : "Legal Notice | LILOTOP SARL";
  const desc = lang === "fr" ? "Informations légales, édition du site, données personnelles et contact de LILOTOP SARL." : "Legal information, publisher details, privacy and contact for LILOTOP SARL.";
  const cards = lang === "fr" ? [
    ["Éditeur du site", "LILOTOP SARL, société de droit congolais spécialisée dans l'import-export, l'approvisionnement minier, la logistique, les infrastructures et les solutions digitales."],
    ["Responsable de publication", "Joël Kongolo, Directeur Général."],
    ["Contact", `${site.phone} • ${site.email}`],
    ["Données personnelles", "Les informations transmises par formulaire, téléphone, email ou WhatsApp sont utilisées uniquement pour répondre aux demandes commerciales, devis, appels d'offres et partenariats adressés à LILOTOP SARL."],
    ["Cookies", "Le site ne dépose pas de cookies publicitaires. Les services tiers intégrés, notamment Google Maps, peuvent appliquer leurs propres règles de confidentialité."],
    ["Propriété intellectuelle", "Les textes, visuels, éléments graphiques et contenus du site sont destinés à la communication de LILOTOP SARL."],
    ["Hébergement", "Site hébergé sur Vercel. Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States."],
  ] : [
    ["Publisher", "LILOTOP SARL, a Congolese company specialized in import-export, mining supply, logistics, infrastructure and digital solutions."],
    ["Publication manager", "Joël Kongolo, Managing Director."],
    ["Contact", `${site.phone} • ${site.email}`],
    ["Personal data", "Information submitted through forms, phone, email or WhatsApp is used only to respond to commercial requests, quotes, tenders and partnerships addressed to LILOTOP SARL."],
    ["Cookies", "The website does not set advertising cookies. Embedded third-party services, including Google Maps, may apply their own privacy rules."],
    ["Intellectual property", "Texts, visuals, graphic elements and website content are intended for LILOTOP SARL communication."],
    ["Hosting", "Website hosted by Vercel. Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States."],
  ];
  const body = `${subHero(lang, lang === "fr" ? "Informations légales" : "Legal information", lang === "fr" ? "Mentions légales" : "Legal notice", desc)}
  <section class="section"><div class="container">${cardGrid(cards, "why-grid")}</div></section>`;
  return layout(lang, "legal", title, desc, body, { solidHeader: true });
}

function quoteForm(lang) {
  const f = data[lang].form;
  const sectors = [
    ["Produits chimiques et réactifs miniers", lang === "fr" ? "Produits chimiques et réactifs miniers" : "Chemical products and mining reagents"],
    ["Billes de broyage", lang === "fr" ? "Billes de broyage" : "Grinding media"],
    ["Lubrifiants et carburants", lang === "fr" ? "Lubrifiants et carburants" : "Lubricants and fuels"],
    ["Fournitures industrielles", lang === "fr" ? "Fournitures industrielles" : "Industrial supplies"],
    ["Infrastructures", lang === "fr" ? "Infrastructures" : "Infrastructure"],
    ["Conseil stratégique", lang === "fr" ? "Conseil stratégique" : "Strategic advisory"],
    ["Partenariat", lang === "fr" ? "Partenariat" : "Partnership"],
    ["Appel d'offres", lang === "fr" ? "Appel d'offres" : "Tender"],
    ["Autre", lang === "fr" ? "Autre" : "Other"],
  ];
  return `<form class="form" data-quote-form data-endpoint="/api/contact" novalidate>
    <div><p class="section-kicker">${f.title}</p><h2>${f.title}</h2><p>${f.intro}</p></div>
    <label>${f.name}<input name="name" autocomplete="name" required></label>
    <label>${f.company}<input name="company" autocomplete="organization" required></label>
    <label>${f.email}<input type="email" name="email" autocomplete="email" required></label>
    <label>${f.phone}<input name="phone" autocomplete="tel" required></label>
    <label>${f.country}<input name="country" autocomplete="country-name" required></label>
    <label>${f.subject}<input name="subject" required></label>
    <label>${f.sector}<select name="sector" required><option value="">${lang === "fr" ? "Sélectionner un secteur" : "Select a sector"}</option>${sectors.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
    <label>${f.message}<textarea name="message" rows="6" minlength="10" required></textarea></label>
    <label class="form-hp" aria-hidden="true" tabindex="-1">Website<input name="website" autocomplete="off" tabindex="-1"></label>
    <label class="consent-field"><input type="checkbox" name="consent" required><span>${f.consent}</span></label>
    <p class="form-note">${lang === "fr" ? `Votre demande sera envoyée à ${site.email}. LILOTOP utilise ces informations uniquement pour traiter votre demande.` : `Your request will be sent to ${site.email}. LILOTOP uses this information only to process your request.`}</p>
    <div class="form-status" data-form-status role="status" aria-live="polite"></div>
    <button class="button primary" type="submit">${f.submit}${icon.arrow}</button>
  </form>`;
}

function subHero(lang, kicker, title, lead) {
  return `<section class="page-hero corporate-hero"><div class="container reveal"><p class="section-kicker">${kicker}</p><h1>${title}</h1><p>${lead}</p></div></section>`;
}

const generators = { index: homePage, about: aboutPage, sectors: sectorsPage, solutions: solutionsPage, products: productsPage, partners: partnersPage, projects: projectsPage, news: newsPage, contact: contactPage, legal: legalPage };

fs.mkdirSync("en", { recursive: true });
for (const lang of ["fr", "en"]) {
  for (const page of pages) {
    activeLang = lang;
    const html = generators[page.slug](lang);
    fs.writeFileSync(pagePath(lang, page.slug), html, "utf8");
  }
}

fs.writeFileSync("services.html", layout("fr", "solutions", "Services | LILOTOP SARL", data.fr.metaDefault, `<script>location.replace("solutions.html")</script><noscript><a href="solutions.html">Solutions</a></noscript>`, { solidHeader: true }), "utf8");

const sitemap = [`<?xml version="1.0" encoding="UTF-8"?>`, `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`];
for (const lang of ["fr", "en"]) {
  for (const page of pages) {
    sitemap.push(`  <url><loc>${urlFor(lang, page.slug)}</loc></url>`);
  }
}
sitemap.push(`</urlset>`);
fs.writeFileSync("sitemap.xml", sitemap.join("\n"), "utf8");

console.log(`Generated ${pages.length * 2} pages plus sitemap.`);
