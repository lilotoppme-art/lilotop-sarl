"use strict";

const NOTICE_REFERENCE = "ITB/2026/62389";
const SUPPLIER_RESPONSE_DEADLINE = "2026-08-17T12:00:00.000Z";
const SUPPLIER_RESPONSE_DEADLINE_LABEL = "17 August 2026, 14:00 CAT (Malawi time)";
const UNOPS_BID_DEADLINE = "2026-08-21T00:00:00.000Z";
const UNOPS_BID_DEADLINE_LABEL = "21 August 2026 (heure exacte a confirmer dans UNOPS eSourcing)";
const HILTI_PILOT_ATTACHMENT = "RFQ_LILOTOP_HILTI_ITB-2026-62389_Lot1.pdf";
const HILTI_CONTACT_VERIFIED_AT = "2026-08-13T00:00:00.000Z";
const SELECTED_LOTS = Object.freeze([
  { number: 1, title: "Power Tools", supplier: "Hilti" },
  { number: 2, title: "Electrical Installation Components and consumables", supplier: "Schneider Electric" },
  { number: 10, title: "General Hardware", supplier: "Bossard Group" }
]);

const RFQ_PRIORITIES = Object.freeze({
  "Makita South Africa": "A",
  "Enerpac Africa": "A",
  "Ingersoll Rand / Rhino Lifting": "A",
  "Schneider Electric": "A",
  "Aberdare Cables": "A",
  HellermannTyton: "A",
  "RS South Africa": "A",
  "Legrand South Africa": "A",
  "Signify South Africa": "A",
  Fellowes: "B",
  "Lasher Tools": "B",
  "African Helical Pile and Anchor Company": "B",
  GARDENA: "B",
  "Marley / Aliaxis": "B",
  "PG Bison": "B",
  "Werner Ladders": "C"
});

const REPLACEMENT_RFQS = Object.freeze([
  Object.freeze({
    lotNumber: 1,
    items: Object.freeze([6]),
    supplier: "Enerpac Official Enquiry",
    replaces: "Enerpac Africa",
    reason: "Le canal sales-za@enerpac.com a rejete les expediteurs externes. Le canal global officiel Enerpac et le bureau Afrique du Sud sont retenus pour demander le routage vers un commercial autorise."
  }),
  Object.freeze({
    lotNumber: 1,
    items: Object.freeze([6]),
    supplier: "SAIVS Tools",
    replaces: "Enerpac Africa",
    reason: "Le fabricant publie une presse H-frame manuelle de 10 tonnes avec pompe P392; la conformite aux V-blocks, a la plaque d'extraction et a la garantie du DAO doit etre confirmee."
  }),
  Object.freeze({
    lotNumber: 1,
    items: Object.freeze([6]),
    supplier: "Walch Engineering",
    replaces: "Enerpac Africa",
    reason: "Le fabricant sud-africain construit des presses hydrauliques d'atelier a commande manuelle pour les marches local et international; la configuration exacte 10 tonnes doit etre confirmee."
  }),
  Object.freeze({
    lotNumber: 10,
    items: Object.freeze([3, 5, 6]),
    supplier: "Mundo Ladders",
    replaces: "Werner Ladders",
    reason: "Le fabricant sud-africain publie des echelles double-face aluminium et des echelles d'extension en fibre de verre pour le marche africain. Les dimensions exactes du DAO doivent etre confirmees."
  })
]);

const SUPPLIER_CONTACTS = Object.freeze({
  Hilti: Object.freeze({
    country: "Afrique du Sud / Afrique australe",
    website: "https://www.hilti.co.za/",
    email: "Customercare.za@hilti.com",
    phone: "+27 11 237 3000",
    recipient: "Hilti South Africa Customer Care",
    source: "https://www.hilti.co.za/media-canonical/IBD_WWI-00000000000005998240_000_APC_RAW",
    catalogSource: "https://www.hilti.co.za/"
  }),
  "Makita South Africa": Object.freeze({
    country: "Afrique du Sud / fabricant et reseau officiel",
    website: "https://www.makita.co.za/",
    email: "info@rutherford.co.za",
    phone: "+27 11 878 2600",
    recipient: "Makita South Africa / Rutherford",
    source: "https://www.makita.co.za/buy-now/",
    catalogSource: "https://www.makita.co.za/MakitaCatalogue.pdf"
  }),
  "Ingersoll Rand / Rhino Lifting": Object.freeze({
    country: "Afrique du Sud / distributeur officiel",
    website: "https://distributors.powertools.ingersollrand.com/south-africa/johannesburg-rhino-lifting-maintenance-pty-ltd/",
    email: null,
    phone: "+27 11 452 4740",
    recipient: "Rhino Lifting Maintenance - Sales & Quotations",
    contactForm: "https://distributors.powertools.ingersollrand.com/south-africa/johannesburg-rhino-lifting-maintenance-pty-ltd/",
    source: "https://distributors.powertools.ingersollrand.com/south-africa/johannesburg-rhino-lifting-maintenance-pty-ltd/",
    catalogSource: "https://distributors.powertools.ingersollrand.com/south-africa/johannesburg-rhino-lifting-maintenance-pty-ltd/"
  }),
  "Enerpac Africa": Object.freeze({
    country: "Afrique du Sud / pays africains anglophones",
    website: "https://www.enerpac.com/",
    email: "sales-za@enerpac.com",
    phone: "+27 12 940 0656",
    recipient: "Enerpac Africa Sales",
    source: "https://literature.enerpac.com/pdf/L418_f.pdf",
    catalogSource: "https://literature.enerpac.com/viewModel.aspx?Id=25405&model=p392&regId=3&where=contains"
  }),
  "Enerpac Official Enquiry": Object.freeze({
    country: "Afrique du Sud / Afrique anglophone",
    website: "https://www.enerpac.com/",
    email: "info@enerpac.com",
    phone: "+27 12 940 0656",
    recipient: "Enerpac Global Enquiry - routing to Enerpac Africa Sales",
    contactForm: "https://www.enerpac.com/contact-us",
    source: "https://literature.enerpac.com/pdf/RPS63.109_1_c.pdf",
    catalogSource: "https://vault.enerpac.com/m/633ff0c42dd24838/original/Enerpac_Industrial_Tools_Catalog_E330_EN-US.pdf"
  }),
  "SAIVS Tools": Object.freeze({
    country: "Chine / export international a confirmer pour le Malawi",
    website: "https://www.saivstool.com/",
    email: "sales@saivstools.com",
    phone: "+86 139 0574 8980",
    recipient: "SAIVS Export Sales",
    source: "https://www.saivstool.com/products/hydraulic-press/list_46_2.html",
    catalogSource: "https://www.saivstool.com/products/iph1240-10-ton-h-frame-hydraulic-press-with-rc1010-single-acting-cylinder-and-p392-hand-pump.html"
  }),
  "Walch Engineering": Object.freeze({
    country: "Afrique du Sud / marche international",
    website: "https://www.bencor-walch.co.za/",
    email: null,
    phone: "+27 11 826 1412",
    recipient: "Walch Engineering Hydraulic Press Sales",
    contactForm: "https://www.bencor-walch.co.za/web/walch/contact-us.html",
    source: "https://www.bencor-walch.co.za/web/walch/walch-home.html",
    catalogSource: "https://www.bencor-walch.co.za/web/bencor/company-profile.html"
  }),
  "Mundo Ladders": Object.freeze({
    country: "Afrique du Sud / fourniture en Afrique",
    website: "https://mundoladders.co.za/",
    email: "info@mundoladders.co.za",
    phone: "+27 10 110 9180",
    recipient: "Mundo Ladders Sales and Quotations",
    source: "https://mundoladders.co.za/",
    catalogSource: "https://mundoladders.co.za/product-category/extension-ladders/"
  }),
  "Schneider Electric": Object.freeze({
    country: "Afrique du Sud / couverture Malawi",
    website: "https://www.se.com/mw/en/",
    email: "za-ccc@se.com",
    phone: "+27 11 230 5880",
    recipient: "Schneider Electric Customer Care - Malawi",
    source: "https://www.se.com/mw/en/",
    catalogSource: "https://www.se.com/au/en/product-category/1600-electrical-protection-and-control/"
  }),
  "Aberdare Cables": Object.freeze({
    country: "Afrique du Sud / Export Afrique australe",
    website: "https://www.aberdare.co.za/",
    email: "quotes@aberdare.co.za",
    phone: "+27 11 396 8000",
    recipient: "Aberdare Cables Export / Quotations",
    source: "https://www.aberdare.co.za/contact/",
    catalogSource: "https://www.aberdare.co.za/wp-content/uploads/railway-cable.pdf"
  }),
  "Legrand South Africa": Object.freeze({
    country: "Afrique du Sud / couverture Afrique australe",
    website: "https://www.legrand.co.za/",
    email: "legrand.south-africa@legrand.co.za",
    phone: "+27 11 444 7971",
    recipient: "Legrand South Africa Customer Care",
    source: "https://www.legrand.co.za/contactus.html",
    catalogSource: "https://www.legrand.co.za/download/legrand-improving-lives-newsletter-02.pdf"
  }),
  HellermannTyton: Object.freeze({
    country: "Afrique du Sud / Afrique australe",
    website: "https://www.hellermanntyton.co.za/",
    email: null,
    phone: "+27 11 879 6600",
    recipient: "HellermannTyton South Africa Sales",
    contactForm: "https://shop.hellermanntyton.co.za/contact-us",
    source: "https://shop.hellermanntyton.co.za/contact-us",
    catalogSource: "https://www.hellermanntyton.co.za/products/cable-and-wire-mounts"
  }),
  "Signify South Africa": Object.freeze({
    country: "Afrique du Sud / Afrique subsaharienne",
    website: "https://www.signify.com/en-za/prof",
    email: "projects-sa@signify.com",
    phone: "0800 744 54775",
    recipient: "Signify South Africa - Sales Team",
    source: "https://www.assets.signify.com/is/content/Signify/Assets/philips-lighting/south-africa/20210806-consumer-product-catalog.pdf",
    catalogSource: "https://www.signify.com/en-za/prof/led-lamps-and-tubes"
  }),
  Fellowes: Object.freeze({
    country: "Afrique / Export",
    website: "https://www.fellowes.com/row/en/",
    email: "cs-export@fellowes.com",
    phone: "+27 11 433 2686",
    recipient: "Fellowes Export Customer Service",
    source: "https://www.fellowes.com/row/en/contact",
    catalogSource: "https://m.fellowes.com/row/en/solutionscenter/shredders/Pages/is-your-paper-data-GDPR-compliant.aspx"
  }),
  "Lasher Tools": Object.freeze({
    country: "Afrique du Sud / Export",
    website: "https://lasher.co.za/",
    email: "exportsales@lasher.co.za",
    phone: "+27 11 825 1100",
    recipient: "Lasher Tools Export Sales",
    source: "https://lasher.co.za/contact-lasher/",
    catalogSource: "https://lasher.co.za/wheelbarrows/"
  }),
  "Werner Ladders": Object.freeze({
    country: "International / export a confirmer",
    website: "https://www.wernerco.com/",
    email: null,
    phone: "+1 888 523 3371",
    recipient: "Werner Customer Service / Export",
    contactForm: "https://www.wernerco.com/us/contact-us",
    source: "https://www.wernerco.com/us/contact-us",
    catalogSource: "https://www.wernerco.com/"
  }),
  "African Helical Pile and Anchor Company": Object.freeze({
    country: "Afrique du Sud",
    website: "https://ahpac.co.za/",
    email: "info@ahpac.co.za",
    phone: "+27 82 440 3315",
    recipient: "AHPAC Technical Sales",
    source: "https://ahpac.co.za/contact/",
    catalogSource: "https://ahpac.co.za/products/"
  }),
  GARDENA: Object.freeze({
    country: "Afrique du Sud",
    website: "https://www.gardena.com/za/",
    email: "service@gardena.co.za",
    phone: null,
    recipient: "GARDENA South Africa Customer Service",
    source: "https://www.gardena.com/za/c/support/contact",
    catalogSource: "https://www.gardena.com/za/products/watering/sprinklers"
  }),
  "Marley / Aliaxis": Object.freeze({
    country: "Afrique du Sud / Afrique australe",
    website: "https://www.marleypipesystems.co.za/",
    email: "export@marleyps.co.za",
    phone: "+27 11 739 8600",
    recipient: "Marley Pipe Systems Export Sales",
    contactForm: "https://marleypipesystems.co.za/contact-marley-plastic-pipes-and-fittings/",
    source: "https://marleypipesystems.co.za/contact-marley-plastic-pipes-and-fittings/",
    catalogSource: "https://marleypipesystems.co.za/marley-contractors-hose/"
  }),
  "RS South Africa": Object.freeze({
    country: "Afrique du Sud / Export Afrique australe",
    website: "https://za.rs-online.com/",
    email: "sales.za@rs.rsgroup.com",
    phone: "+27 11 691 9300",
    recipient: "RS South Africa Sales",
    contactForm: "https://za.rs-online.com/web/content/support/contact-us",
    source: "https://za.rs-online.com/web/content/support/all-articles/ordering",
    catalogSource: "https://za.rs-online.com/web/"
  }),
  "PG Bison": Object.freeze({
    country: "Afrique du Sud / Export Malawi",
    website: "https://pgbison.co.za/",
    email: "customerservice@pgbison.co.za",
    phone: "+27 11 897 5200",
    recipient: "PG Bison Export Panel Sales",
    source: "https://pgbison.co.za/",
    catalogSource: "https://pgbison.co.za/"
  }),
  "Bossard Group": Object.freeze({
    country: "International",
    website: "https://www.bossard.com/global-en/",
    email: null,
    phone: null,
    recipient: "Non retenu pour les lignes du lot 10",
    source: "https://www.bossard.com/-/media/bossard-group/website/documents/brochures/brochures-products-electro-all-languages/x103-electrical-engineering-en.pdf",
    catalogSource: "https://www.bossard.com/global-en/product-solutions/"
  })
});

const COVERAGE_CONFIRMED = "COUVERTURE CONFIRMÉE";
const COVERAGE_PROBABLE = "COUVERTURE PROBABLE À CONFIRMER";
const SUPPLIER_NOT_ADAPTED = "FOURNISSEUR NON ADAPTÉ";

const COVERAGE_RULES = Object.freeze({
  1: Object.freeze([
    { items: [1, 12, 13, 14, 15, 16], supplier: "Hilti", status: COVERAGE_PROBABLE, reason: "Hilti commercialise ces familles d'outillage professionnel; la conformite exacte au wattage, dimensions et accessoires du DAO doit etre confirmee par devis et fiche technique." },
    { items: [2, 3, 4, 5, 17, 18, 19, 20], supplier: "Makita South Africa", status: COVERAGE_PROBABLE, reason: "Le catalogue officiel Makita couvre les familles perceuses, scies, meuleuses, tronconneuses et tarieres; le modele exact conforme au DAO reste a confirmer." },
    { items: [6], supplier: "Enerpac Africa", status: COVERAGE_PROBABLE, reason: "Enerpac fabrique des presses hydrauliques et dessert les pays africains anglophones; une presse manuelle 10 tonnes conforme doit etre confirmee." },
    { items: [7, 8, 9, 10, 11], supplier: "Ingersoll Rand / Rhino Lifting", status: COVERAGE_CONFIRMED, reason: "Le distributeur officiel Ingersoll Rand liste explicitement meuleuses pneumatiques, marteaux, perceuses, cles a chocs et cles a cliquet pneumatiques." }
  ]),
  2: Object.freeze([
    { items: [1, 2, 3, 4, 41, 48, 49, 50, 51], supplier: "Schneider Electric", status: COVERAGE_PROBABLE, reason: "Le catalogue officiel Schneider couvre tableaux, disjoncteurs, RCD, isolateurs et commutation; les calibres et configurations exacts doivent etre valides." },
    { items: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 42, 43], supplier: "Aberdare Cables", status: COVERAGE_PROBABLE, reason: "Aberdare fabrique et exporte des cables basse tension, flexibles et multiconducteurs; chaque section, couleur et tension doit etre confirmee." },
    { items: [16, 18, 44, 45, 46, 54], supplier: "HellermannTyton", status: COVERAGE_CONFIRMED, reason: "Le catalogue officiel HellermannTyton Afrique du Sud reference cosses, colliers, clips, connecteurs, borniers et rubans isolants; le fournisseur doit confirmer chaque reference proposee.", source: "https://www.hellermanntyton.co.za/products" },
    { items: [17], supplier: "RS South Africa", status: COVERAGE_CONFIRMED, reason: "RS South Africa reference exactement un jeu de cables de demarrage 3,5 m, 150 A et 16 mm sous la reference RS PRO 196-8250.", source: "https://za.rs-online.com/web/p/products/1968250" },
    { items: [47], supplier: "RS South Africa", status: COVERAGE_CONFIRMED, reason: "RS South Africa reference une electrode de terre WJ Furse en cuivre de 1,2 m; la conformite du diametre et de la liaison doit etre confirmee.", source: "https://za.rs-online.com/web/c/fuses-circuit-breakers/earth-lightning-protection/lightning-earth-rods/" },
    { items: [53], supplier: "RS South Africa", status: COVERAGE_CONFIRMED, reason: "RS South Africa reference des chevilles nylon de 8 mm en conditionnement professionnel; la longueur exacte doit etre confirmee.", source: "https://za.rs-online.com/web/c/fasteners-fixings/wall-plugs-fixings-anchors/wall-plugs/?if=nylon-wall-plugs" },
    { items: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 52], supplier: "Legrand South Africa", status: COVERAGE_PROBABLE, reason: "Legrand Afrique du Sud couvre conduits, goulottes, boites, interrupteurs, prises et accessoires d'installation; les dimensions et standards du DAO doivent etre confirmes." },
    { items: [38, 39, 40], supplier: "Signify South Africa", status: COVERAGE_PROBABLE, reason: "Le catalogue professionnel Signify couvre lampes et tubes LED; les versions 12 V/220 V, puissances et culots exacts doivent etre confirmes." }
  ]),
  10: Object.freeze([
    { items: [1], supplier: "Fellowes", status: COVERAGE_CONFIRMED, reason: "Le catalogue officiel Fellowes couvre les destructeurs cross-cut; le modele 10 feuilles/20 litres doit etre confirme." },
    { items: [2], supplier: "Lasher Tools", status: COVERAGE_CONFIRMED, reason: "Le catalogue officiel Lasher couvre les brouettes; la configuration deux roues, le bac poly et la charge doivent etre confirmes." },
    { items: [3, 5, 6], supplier: "Werner Ladders", status: COVERAGE_CONFIRMED, reason: "Le catalogue officiel Werner couvre escabeaux aluminium et echelles d'extension fibre de verre; dimensions et disponibilite export doivent etre confirmees." },
    { items: [4], supplier: "African Helical Pile and Anchor Company", status: COVERAGE_CONFIRMED, reason: "Le catalogue officiel AHPAC couvre explicitement les pieux et ancrages helicoidaux; charge, galvanisation et composition du kit doivent etre confirmees." },
    { items: [7], supplier: "GARDENA", status: COVERAGE_CONFIRMED, reason: "Le catalogue officiel GARDENA couvre les arroseurs reglables; debit et plage doivent etre confirmes." },
    { items: [8], supplier: "Marley / Aliaxis", status: COVERAGE_PROBABLE, reason: "Marley fournit des systemes de tuyauterie PVC; le diametre IPS 20 mm et la vente au metre doivent etre confirmes." },
    { items: [9], supplier: "PG Bison", status: COVERAGE_PROBABLE, reason: "PG Bison fabrique des panneaux bois et dessert le Malawi; le block board 2200 x 1200 x 25,4 mm n'est pas confirme dans le catalogue public." }
  ])
});

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lotSection(text, lotNumber) {
  const source = String(text || "");
  const startPattern = new RegExp(`ITB\\/2026\\/62389[^\\n]*Lot ${lotNumber}:`, "i");
  const start = source.search(startPattern);
  if (start < 0) return "";
  const remaining = source.slice(start);
  const next = remaining.slice(1).search(/ITB\/2026\/62389[^\n]*Lot \d+:/i);
  return next < 0 ? remaining : remaining.slice(0, next + 1);
}

function itemStart(line) {
  const match = clean(line).match(/^(\d{1,3})\s+(.+?)\s+(Each|Set|Pair|Pairs|Roll|Meter|Pack|Kit|Kg|Litre|Lot)\s+(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  return {
    itemNumber: Number(match[1]),
    product: clean(match[2]),
    unit: match[3],
    quantity: Number(match[4])
  };
}

function parseLot(text, definition) {
  const section = lotSection(text, definition.number);
  const lines = section.split(/\r?\n/).map((line) => clean(line)).filter(Boolean);
  const products = [];
  let current = null;
  for (const line of lines) {
    const next = itemStart(line);
    if (next) {
      if (current) products.push(current);
      current = { ...next, specifications: [] };
      continue;
    }
    if (!current || /^ITB\/2026|^Equipment Description|^\(These are|^Equipment Name|^Picture /i.test(line)) continue;
    current.specifications.push(line);
  }
  if (current) products.push(current);
  return {
    number: definition.number,
    title: definition.title,
    supplier: definition.supplier,
    products: products.map((item) => ({
      ...item,
      reference: `Lot ${definition.number} - Item ${item.itemNumber}`,
      specifications: item.specifications.join("\n"),
      standards: item.specifications.filter((line) => /\b(?:DIN|IEC|ISO|EN|CAT\s+[IVX]+|IP\d{2})\b/i.test(line))
    }))
  };
}

function parseCollapsedLot(text, definition) {
  const lines = lotSection(text, definition.number).split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const products = [];
  let current = null;
  for (const line of lines) {
    const expectedItem = products.length + 1;
    const start = !current && (
      line.match(new RegExp(`^(${expectedItem})(?=[A-Za-z])(.+)$`))
      || line.match(new RegExp(`^(${expectedItem})\\s+(.+)$`))
    );
    if (start) {
      const columns = start[2].split(/\t|\s{3,}/).map(clean).filter(Boolean);
      current = {
        itemNumber: Number(start[1]),
        product: columns[0],
        unit: null,
        quantity: null,
        specifications: columns.slice(1)
      };
    }
    if (!current) continue;
    const end = line.match(/(?:^|\s)(Each|Set|Pair|Pairs|Roll|Meter|Pack|Kit|Kg|Litre|Lot)\s*(\d+(?:\.\d+)?)$/i);
    if (end) {
      current.unit = end[1];
      current.quantity = Number(end[2]);
      const beforeUnit = clean(line.slice(0, end.index));
      if (beforeUnit && !beforeUnit.startsWith(String(current.itemNumber))) {
        current.specifications.push(beforeUnit);
      }
      products.push(current);
      current = null;
      continue;
    }
    if (!start) current.specifications.push(clean(line));
  }
  return products.filter((item) => item.unit && item.quantity !== null).map((item) => ({
    ...item,
    reference: `Lot ${definition.number} - Item ${item.itemNumber}`,
    specifications: item.specifications.join("\n"),
    standards: item.specifications.filter((line) => /\b(?:DIN|IEC|ISO|EN|CAT\s+[IVX]+|IP\d{2})\b/i.test(line))
  }));
}

function parsePriceLot(text, definition) {
  return lotSection(text, definition.number).split(/\r?\n/).map((line) => clean(line)).map((line) => {
    const match = line.match(/^(\d{1,3})\s*\|\s*(.+?)\s*\|\s*(Each|Set|Pair|Pairs|Roll|Meter|Pack|Kit|Kg|Litre|Lot)\s*\|\s*(\d+(?:\.\d+)?)\s*\|/i);
    return match ? {
      itemNumber: Number(match[1]),
      product: clean(match[2]),
      unit: match[3],
      quantity: Number(match[4])
    } : null;
  }).filter(Boolean);
}

function mergeOfficialLot(scheduleText, priceText, definition) {
  const layoutLot = parseLot(scheduleText, definition);
  const collapsedItems = parseCollapsedLot(scheduleText, definition);
  const specificationItems = collapsedItems.length > layoutLot.products.length
    ? collapsedItems
    : layoutLot.products;
  const priceItems = parsePriceLot(priceText, definition);
  if (!priceItems.length) return { ...layoutLot, products: specificationItems };
  if (specificationItems.length >= priceItems.length) {
    const prices = new Map(priceItems.map((item) => [item.itemNumber, item]));
    return {
      ...layoutLot,
      products: specificationItems.map((item) => ({
        ...item,
        quantity: prices.get(item.itemNumber)?.quantity ?? item.quantity,
        unit: prices.get(item.itemNumber)?.unit ?? item.unit
      }))
    };
  }
  const specifications = new Map(specificationItems.map((item) => [item.itemNumber, item]));
  return {
    number: definition.number,
    title: definition.title,
    supplier: definition.supplier,
    products: priceItems.map((item) => {
      const detail = specifications.get(item.itemNumber);
      return {
        ...item,
        reference: `Lot ${definition.number} - Item ${item.itemNumber}`,
        specifications: detail?.specifications || "Specification detaillee dans le Schedule of Requirements officiel",
        standards: detail?.standards || []
      };
    })
  };
}

function contactVerified(contact) {
  return Boolean(
    contact
    && contact.source
    && contact.website
    && (contact.email || contact.contactForm)
    && (contact.phone || contact.email)
  );
}

function coverageFor(lotNumber, itemNumber) {
  const rule = (COVERAGE_RULES[lotNumber] || []).find((entry) => entry.items.includes(itemNumber));
  if (rule) return rule;
  return {
    supplier: lotNumber === 10 ? "Bossard Group" : null,
    status: SUPPLIER_NOT_ADAPTED,
    reason: lotNumber === 10
      ? "Bossard est specialise dans les solutions de fixation; cette ligne de materiel general ne correspond pas a son catalogue officiel."
      : "Aucun fournisseur officiel adapte n'a ete confirme pour cette ligne."
  };
}

function applyCoverage(lot) {
  return {
    ...lot,
    products: lot.products.map((product) => {
      const coverage = coverageFor(lot.number, product.itemNumber);
      const contact = SUPPLIER_CONTACTS[coverage.supplier];
      return {
        ...product,
        proposedSupplier: coverage.supplier || "A IDENTIFIER",
        supplierJustification: coverage.reason,
        verificationStatus: coverage.status,
        coverageSource: coverage.source || contact?.catalogSource || contact?.source || null
      };
    })
  };
}

function exactEmailBody(rfq) {
  const hiltiPilot = rfq.supplier === "Hilti" && rfq.lotNumber === 1;
  const lines = rfq.products.map((item) => (
    `- Lot ${rfq.lotNumber}, ligne ${item.itemNumber}: ${item.product} - ${item.quantity} ${item.unit}\n`
    + `  Specifications: ${clean(item.specifications)}\n`
    + "  Supplier response: COMPLY [YES / NO / ALTERNATIVE] | MANUFACTURER / MODEL / PART NUMBER: [TO COMPLETE]"
  )).join("\n");
  return `Dear ${rfq.contact.recipient},

${hiltiPilot
    ? `LILOTOP SARL is preparing a bid for UNOPS tender ${NOTICE_REFERENCE}, "Supply and Delivery of Workshop Tools, General Hardware and Electricals to Mzuzu Technical College, Malawi". We kindly request your formal quotation for the six Lot 1 items listed below:`
    : `LILOTOP SARL is preparing a bid for UNOPS Malawi tender ${NOTICE_REFERENCE}. We kindly request your formal quotation for the items listed below:`}

${lines}

Please confirm for every line:
- COMPLY: YES / NO / ALTERNATIVE;
- manufacturer, brand, exact model and part number;
- full technical compliance or documented deviations;
- unit price, total price and currency;
- country of origin;
- availability and delivery lead time;
- manufacturer warranty;
- DAP Lilongwe, Malawi - Incoterms 2020 price, as required by the Schedule of Requirements;
- FCA price and named FCA location, plus freight and insurance shown separately to DPU Lilongwe, Malawi, as required by the Price Schedule;
- payment terms proposed by your company and quotation validity;
- ${hiltiPilot ? "product datasheets and product photos" : "product datasheets"}.

Requested delivery basis: ${rfq.incoterm}.
Requested quotation deadline: ${rfq.responseDeadlineLabel}.

This request does not constitute an order or contractual commitment. Any purchase remains subject to LILOTOP SARL management approval.

Kind regards,
LILOTOP SARL
contact@lilotopsarl.com
https://lilotopsarl.com`;
}

function buildHiltiPilot(rfqs, env = process.env) {
  const rfq = (rfqs || []).find((item) => item.id === "UNOPS-62389-L1-HILTI");
  if (!rfq) return null;
  const lines = rfq.products.map((item) => ({
    ...item,
    extractionCompliance: item.quantity > 0 && item.unit && item.specifications
      ? "CONFORME AU DAO OFFICIEL"
      : "A CONTROLER",
    coverage: "COUVERTURE PROBABLE A CONFIRMER PAR HILTI",
    status: "EN ATTENTE DE COTATION ET DATASHEET",
    warranty: "Minimum 12-month comprehensive manufacturer warranty for commercial/industrial use via authorized national distributor",
    datasheetRequired: true,
    oemRequirement: "Manufacturer warranty via authorized national distributor",
    destination: "Lilongwe, Malawi",
    incoterm: "DAP Lilongwe (Schedule of Requirements); FCA plus freight and insurance to DPU Lilongwe (Price Schedule) - Incoterms 2020",
    delivery: "60 to 90 calendar days after contract signature"
  }));
  const fromConfigured = Boolean(env.RFQ_FROM);
  const oauthConfigured = Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET
    && env.GOOGLE_OAUTH_REDIRECT_URI && String(env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY || "").length >= 32
    && (env.GMAIL_INBOUND_MAILBOX || env.EMAIL_REPLY_TO)
  );
  return {
    rfqId: rfq.id,
    supplier: "Hilti",
    lotNumber: 1,
    lineCount: lines.length,
    lines,
    contact: {
      email: "customercare.za@hilti.com",
      source: SUPPLIER_CONTACTS.Hilti.source,
      sourceLabel: "Hilti South Africa - supplier details document",
      verified: true,
      verifiedAt: HILTI_CONTACT_VERIFIED_AT,
      channel: "EMAIL"
    },
    subject: rfq.subject,
    emailBody: rfq.emailBody,
    attachments: [{
      name: HILTI_PILOT_ATTACHMENT,
      url: `/assets/rfq/${HILTI_PILOT_ATTACHMENT}`,
      contentType: "application/pdf"
    }],
    supplierDeadline: SUPPLIER_RESPONSE_DEADLINE,
    supplierDeadlineLabel: SUPPLIER_RESPONSE_DEADLINE_LABEL,
    officialBidDeadline: UNOPS_BID_DEADLINE,
    officialBidDeadlineLabel: UNOPS_BID_DEADLINE_LABEL,
    deadlineAssessment: "Date conservee pour validation DG; elle precede de plus de trois jours la date officielle enregistree, mais l'heure UNOPS doit etre reconfirmee avant tout envoi.",
    dryRun: {
      mode: "NO_SEND",
      senderConfigured: fromConfigured,
      sender: fromConfigured ? String(env.RFQ_FROM) : "NON CONFIGURE DANS CET ENVIRONNEMENT",
      replyTo: env.RFQ_REPLY_TO || "NON CONFIGURE DANS CET ENVIRONNEMENT",
      recipient: "customercare.za@hilti.com",
      subjectReady: Boolean(rfq.subject),
      bodyReady: Boolean(rfq.emailBody),
      attachmentsReady: true,
      deliveryLoggingReady: true,
      messageIdCaptureReady: true,
      apiErrorHandlingReady: true,
      realSendPerformed: false
    },
    responseTracking: {
      operational: false,
      oauthConfigured,
      authorizationStatus: oauthConfigured ? "AUTORISATION GOOGLE REQUISE PAR LE DG" : "NON CONFIGURE",
      manualEvidenceIntakeReady: true,
      automaticEmailDetectionReady: false,
      archiveOriginalReady: oauthConfigured,
      archiveAttachmentsReady: oauthConfigured,
      quotationExtractionReady: true,
      missingDataPolicy: "NE JAMAIS INVENTER - conserver EN ATTENTE si absent",
      blocker: oauthConfigured
        ? "Le connecteur est prepare; le consentement Google en lecture seule doit etre accorde par le DG."
        : "Les variables Google OAuth Preview ne sont pas configurees."
    },
    authorization: {
      pilotOnly: true,
      doubleConfirmationRequired: true,
      warning: "Vous etes sur le point d'autoriser l'envoi reel d'une RFQ a Hilti pour 6 lignes du Lot 1 de ITB/2026/62389.",
      authorizationDoesNotSend: true
    }
  };
}

function buildRfq(lot, supplier, products, existing, preparedAt) {
  const contact = SUPPLIER_CONTACTS[supplier];
  const previous = existing || {};
  const responseDeadline = previous.responseDeadline || SUPPLIER_RESPONSE_DEADLINE;
  const coverageCounts = {
    confirmed: products.filter((item) => item.verificationStatus === COVERAGE_CONFIRMED).length,
    probable: products.filter((item) => item.verificationStatus === COVERAGE_PROBABLE).length,
    rejected: products.filter((item) => item.verificationStatus === SUPPLIER_NOT_ADAPTED).length
  };
  const hasInventedData = false;
  const generatedId = `UNOPS-62389-L${lot.number}-${supplier.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
  const id = previous.id || generatedId;
  const trackingId = previous.trackingId || `NEXUS-RFQ-ITB2026-62389-${supplier.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-L${lot.number}`;
  const priority = supplier === "Hilti" ? "SENT" : RFQ_PRIORITIES[supplier] || "C";
  const directEmailVerified = Boolean(contact?.email && contactVerified(contact));
  const pdfFilename = supplier === "Hilti"
    ? HILTI_PILOT_ATTACHMENT
    : `RFQ_LILOTOP_${supplier.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_ITB-2026-62389_Lot${lot.number}.pdf`;
  const rfq = {
    id,
    trackingId,
    reference: `${NOTICE_REFERENCE} / Lot ${lot.number}`,
    supplier,
    lotNumber: lot.number,
    lotTitle: lot.title,
    products,
    contact: { ...contact, verified: contactVerified(contact) },
    preparedAt: previous.preparedAt || preparedAt,
    status: previous.status || "EN ATTENTE D'AUTORISATION DG",
    responseDeadline,
    responseDeadlineLabel: SUPPLIER_RESPONSE_DEADLINE_LABEL,
    authorizedAt: previous.authorizedAt || null,
    sentAt: previous.sentAt || null,
    emailSent: Boolean(previous.emailSent),
    gmailMessageId: previous.gmailMessageId || null,
    gmailThreadId: previous.gmailThreadId || null,
    messageIdHeader: previous.messageIdHeader || null,
    deliveryStatus: previous.deliveryStatus || null,
    deliveryFailure: previous.deliveryFailure || null,
    subject: `RFQ LILOTOP SARL - ${NOTICE_REFERENCE} - Lot ${lot.number} - ${supplier} - ${trackingId}`,
    destination: "Lilongwe, Malawi",
    delivery: "60 à 90 jours calendaires après signature du contrat",
    incoterm: "DAP Lilongwe (Schedule of Requirements); FCA plus freight and insurance to DPU Lilongwe (Price Schedule) - Incoterms 2020",
    paymentTerms: "À coter par le fournisseur",
    attachments: [pdfFilename],
    pdfFilename,
    rfqPdfReady: contactVerified(contact) || supplier === "Hilti",
    priority,
    directEmailVerified,
    sendRecommendation: supplier === "Hilti" ? "DEJA ENVOYEE" : directEmailVerified && priority !== "C" ? "OUI" : "NON",
    prioritizationReason: priority === "A"
      ? "Couverture indispensable des lignes des Lots 1 ou 2; cotation requise rapidement pour completer l'offre."
      : priority === "B"
        ? "Couverture specialisee du Lot 10; consulter apres le groupe critique des Lots 1 et 2."
        : "Canal commercial regional ou adresse e-mail directe non confirme; conserver en reserve jusqu'a verification.",
    coverageCounts,
    hasInventedData,
    coverageStatus: products.every((item) => item.verificationStatus === COVERAGE_CONFIRMED)
      ? COVERAGE_CONFIRMED
      : COVERAGE_PROBABLE,
    readyForDgReview: contactVerified(contact)
      && products.length > 0
      && coverageCounts.rejected === 0
      && !hasInventedData,
    humanAuthorizationRequired: true,
    authorizationConfirmation: {
      recipient: contact.email || contact.contactForm,
      supplier,
      lotNumber: lot.number,
      lineCount: products.length,
      attachments: [pdfFilename],
      responseDeadline
    }
  };
  return { ...rfq, emailBody: exactEmailBody(rfq) };
}

function buildReplacementRfq(lot, definition, products, existing, preparedAt) {
  const base = buildRfq(lot, definition.supplier, products, existing, preparedAt);
  return {
    ...base,
    priority: "REMPLACEMENT",
    status: existing?.status || "PREPAREE - NON AUTORISEE - VALIDATION DG REQUISE",
    sendRecommendation: "NON - NOUVELLE AUTORISATION DG REQUISE",
    readyForDgReview: base.readyForDgReview,
    replacementFor: definition.replaces,
    replacementReason: definition.reason,
    prioritizationReason: definition.reason,
    humanAuthorizationRequired: true,
    authorizationConfirmation: {
      ...base.authorizationConfirmation,
      blockedUntilNewDgAuthorization: true
    }
  };
}

function normalizeQuotation(input) {
  if (!input || !input.rfqId || !input.supplier || !input.receivedAt) return null;
  const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  return {
    id: clean(input.id || `${input.rfqId}-${input.receivedAt}`),
    rfqId: clean(input.rfqId),
    supplier: clean(input.supplier),
    lotNumber: Number(input.lotNumber) || null,
    receivedAt: input.receivedAt,
    sourceMessageId: clean(input.sourceMessageId) || null,
    currency: clean(input.currency) || null,
    unitPrice: amount(input.unitPrice),
    totalPrice: amount(input.totalPrice),
    transport: amount(input.transport),
    insurance: amount(input.insurance),
    dutiesAndTaxes: amount(input.dutiesAndTaxes),
    localLogistics: amount(input.localLogistics),
    otherDocumentedCosts: amount(input.otherDocumentedCosts),
    incoterm: clean(input.incoterm) || null,
    deliveryLeadTime: clean(input.deliveryLeadTime) || null,
    availability: clean(input.availability) || null,
    warranty: clean(input.warranty) || null,
    paymentTerms: clean(input.paymentTerms) || null,
    validity: clean(input.validity) || null,
    technicalCompliance: clean(input.technicalCompliance) || "À vérifier",
    evidenceDocumentId: clean(input.evidenceDocumentId) || null
  };
}

function calculateComparison(responses) {
  return (responses || []).map(normalizeQuotation).filter(Boolean).map((quote) => {
    const base = quote.totalPrice;
    const documentedCosts = [quote.transport, quote.insurance, quote.dutiesAndTaxes, quote.localLogistics, quote.otherDocumentedCosts];
    const landedCost = base !== null && documentedCosts.every((value) => value !== null)
      ? documentedCosts.reduce((total, value) => total + value, base)
      : null;
    return { ...quote, landedCost, supplierScore: null };
  });
}

function recordSupplierQuotation(cycle, input, now = new Date()) {
  const current = cycle || {};
  const rfq = (current.rfqs || []).find((item) => item.id === clean(input?.rfqId));
  if (!rfq) throw Object.assign(new Error("RFQ fournisseur introuvable"), { code: "VALIDATION_ERROR" });
  if (!clean(input?.sourceMessageId) && !clean(input?.evidenceDocumentId)) {
    throw Object.assign(new Error("Une cotation reelle doit etre rattachee a un message ou document source"), { code: "VALIDATION_ERROR" });
  }
  if (!clean(input?.currency) || !Number.isFinite(Number(input?.totalPrice)) || Number(input.totalPrice) <= 0) {
    throw Object.assign(new Error("La devise et le prix total documente sont obligatoires"), { code: "VALIDATION_ERROR" });
  }
  const quotation = normalizeQuotation({
    ...input,
    id: input.id || `${rfq.id}-${new Date(now).toISOString()}`,
    supplier: rfq.supplier,
    lotNumber: rfq.lotNumber,
    receivedAt: input.receivedAt || new Date(now).toISOString()
  });
  const responses = [
    ...(current.responses || []).filter((item) => item.id !== quotation.id),
    quotation
  ];
  const comparison = calculateComparison(responses);
  const rfqs = (current.rfqs || []).map((item) => item.id === rfq.id
    ? { ...item, status: "COTATION RECUE", respondedAt: quotation.receivedAt }
    : item);
  return {
    ...current,
    rfqs,
    pilot: buildHiltiPilot(rfqs),
    responses,
    comparison,
    counts: {
      ...(current.counts || {}),
      sent: rfqs.filter((item) => item.sentAt).length,
      received: responses.length,
      missing: rfqs.filter((item) => !responses.some((response) => response.rfqId === item.id)).length
    },
    pricing: {
      ...(current.pricing || {}),
      purchaseCost: null,
      landedCost: comparison.length && comparison.every((item) => item.landedCost !== null)
        ? comparison.reduce((total, item) => total + item.landedCost, 0)
        : null,
      marginScenarios: [],
      financialOfferStatus: "INCOMPLETE - DONNEES A VALIDER"
    },
    updatedAt: new Date(now).toISOString()
  };
}

function authorizeSupplierRfq(cycle, rfqId, actorEmail, now = new Date()) {
  const current = cycle || {};
  const target = (current.rfqs || []).find((item) => item.id === clean(rfqId));
  if (!target) throw Object.assign(new Error("RFQ fournisseur introuvable"), { code: "VALIDATION_ERROR" });
  if (target.sentAt || target.emailSent) {
    throw Object.assign(new Error("Cette RFQ a deja ete envoyee et ne peut pas etre autorisee une seconde fois"), { code: "VALIDATION_ERROR" });
  }
  if (!target.readyForDgReview || !target.contact?.verified || !target.directEmailVerified || !target.rfqPdfReady || target.sendRecommendation !== "OUI") {
    throw Object.assign(new Error("Les coordonnees et la couverture doivent etre verifiees avant autorisation"), { code: "VALIDATION_ERROR" });
  }
  const authorizedAt = new Date(now).toISOString();
  const rfqs = current.rfqs.map((item) => item.id === target.id ? {
    ...item,
    status: "AUTORISEE PAR LE DG - ENVOI NON DECLENCHE",
    authorizedAt,
    authorizedBy: clean(actorEmail),
    sentAt: null,
    emailSent: false
  } : item);
  return {
    ...current,
    rfqs,
    pilot: buildHiltiPilot(rfqs),
    counts: {
      ...(current.counts || {}),
      sent: rfqs.filter((item) => item.sentAt).length
    },
    automaticSending: false,
    updatedAt: authorizedAt
  };
}

function buildSupplierCycle(scheduleText, previous = {}, now = new Date(), priceText = "") {
  const preparedAt = new Date(now).toISOString();
  const lots = SELECTED_LOTS.map((definition) => applyCoverage(
    mergeOfficialLot(scheduleText, priceText, definition)
  ));
  const previousRfqs = new Map((previous.rfqs || []).map((rfq) => [rfq.id, rfq]));
  const primaryRfqs = lots.flatMap((lot) => {
    const groups = new Map();
    for (const product of lot.products) {
      if (product.verificationStatus === SUPPLIER_NOT_ADAPTED || !SUPPLIER_CONTACTS[product.proposedSupplier]) continue;
      const items = groups.get(product.proposedSupplier) || [];
      items.push(product);
      groups.set(product.proposedSupplier, items);
    }
    return Array.from(groups, ([supplier, products]) => {
      const id = `UNOPS-62389-L${lot.number}-${supplier.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
      return buildRfq(lot, supplier, products, previousRfqs.get(id), preparedAt);
    });
  });
  const replacementRfqs = REPLACEMENT_RFQS.map((definition) => {
    const lot = lots.find((item) => item.number === definition.lotNumber);
    const products = (lot?.products || [])
      .filter((product) => definition.items.includes(product.itemNumber))
      .map((product) => ({
        ...product,
        proposedSupplier: definition.supplier,
        supplierJustification: definition.reason,
        verificationStatus: COVERAGE_PROBABLE,
        coverageSource: SUPPLIER_CONTACTS[definition.supplier]?.catalogSource || SUPPLIER_CONTACTS[definition.supplier]?.source
      }));
    const id = `UNOPS-62389-L${definition.lotNumber}-${definition.supplier.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
    return buildReplacementRfq(lot, definition, products, previousRfqs.get(id), preparedAt);
  }).filter((rfq) => rfq.products.length);
  const rfqs = [...primaryRfqs, ...replacementRfqs];
  const responses = (previous.responses || []).map(normalizeQuotation).filter(Boolean);
  const comparison = calculateComparison(responses);
  const coverageAudit = lots.flatMap((lot) => lot.products.map((product) => ({
    lotNumber: lot.number,
    lotTitle: lot.title,
    ...product
  })));
  return {
    reference: NOTICE_REFERENCE,
    status: "RFQ PREPAREES - VALIDATION DG REQUISE",
    lots,
    coverageAudit,
    rfqs,
    pilot: buildHiltiPilot(rfqs),
    responses,
    comparison,
    counts: {
      lots: lots.length,
      products: lots.reduce((total, lot) => total + lot.products.length, 0),
      prepared: rfqs.length,
      readyForDgReview: rfqs.filter((rfq) => rfq.readyForDgReview).length,
      priorityA: rfqs.filter((rfq) => rfq.priority === "A").length,
      priorityB: rfqs.filter((rfq) => rfq.priority === "B").length,
      priorityC: rfqs.filter((rfq) => rfq.priority === "C").length,
      recommended: rfqs.filter((rfq) => rfq.sendRecommendation === "OUI").length,
      sent: rfqs.filter((rfq) => rfq.sentAt).length,
      delivered: rfqs.filter((rfq) => rfq.sentAt && rfq.deliveryStatus !== "FAILED").length,
      deliveryFailed: rfqs.filter((rfq) => rfq.deliveryStatus === "FAILED").length,
      received: responses.length,
      missing: rfqs.filter((rfq) => !responses.some((response) => response.rfqId === rfq.id)).length
    },
    pricing: {
      purchaseCost: null,
      landedCost: comparison.length && comparison.every((item) => item.landedCost !== null)
        ? comparison.reduce((total, item) => total + item.landedCost, 0)
        : null,
      marginScenarios: [],
      financialOfferStatus: responses.length ? "INCOMPLETE - DONNEES A VALIDER" : "EN ATTENTE DE COTATIONS FOURNISSEURS"
    },
    technicalOfferStatus: "BROUILLON PREPARE - VALIDATION TECHNIQUE ET FOURNISSEURS REQUISE",
    supplierCorrections: [{
      supplier: "Bossard Group",
      previousLot: 10,
      status: SUPPLIER_NOT_ADAPTED,
      reason: "Bossard est specialise dans les fixations. Les neuf lignes du lot 10 ont ete reaffectees a des fournisseurs specialises; aucune RFQ Bossard n'est conservee."
    }, {
      supplier: "Enerpac Africa",
      previousLot: 1,
      status: "DELIVERY FAILED / CONTACT A REMPLACER",
      reason: "Le canal sales-za@enerpac.com refuse les expediteurs externes (550 5.7.133). Il ne doit pas etre reutilise."
    }],
    replacementSourcing: replacementRfqs.map((rfq) => ({
      rfqId: rfq.id,
      supplier: rfq.supplier,
      lotNumber: rfq.lotNumber,
      lineNumbers: rfq.products.map((product) => product.itemNumber),
      contact: rfq.contact,
      coverageStatus: rfq.coverageStatus,
      rfqReady: rfq.rfqPdfReady,
      authorizationStatus: "NON AUTORISEE",
      replacementFor: rfq.replacementFor,
      reason: rfq.replacementReason
    })),
    supplierResponseLifecycle: [
      "RFQ ENVOYEE",
      "EN ATTENTE",
      "REPONSE FOURNISSEUR RECUE",
      "PIECE JOINTE ARCHIVEE",
      "PRIX EXTRAITS",
      "CONFORMITE TECHNIQUE ANALYSEE",
      "COMPARAISON FOURNISSEURS",
      "COUT LOGISTIQUE",
      "COUT RENDU",
      "MARGE LILOTOP",
      "PRIX DE VENTE",
      "OFFRE FINANCIERE UNOPS",
      "VALIDATION DG",
      "SOUMISSION HUMAINE"
    ],
    automaticSending: false,
    automaticSubmission: false,
    updatedAt: preparedAt
  };
}

module.exports = {
  NOTICE_REFERENCE,
  SUPPLIER_RESPONSE_DEADLINE,
  SELECTED_LOTS,
  SUPPLIER_CONTACTS,
  REPLACEMENT_RFQS,
  COVERAGE_CONFIRMED,
  COVERAGE_PROBABLE,
  SUPPLIER_NOT_ADAPTED,
  authorizeSupplierRfq,
  buildSupplierCycle,
  buildHiltiPilot,
  calculateComparison,
  mergeOfficialLot,
  parseCollapsedLot,
  parsePriceLot,
  recordSupplierQuotation,
  parseLot
};
