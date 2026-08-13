"use strict";

const NOTICE_REFERENCE = "ITB/2026/62389";
const SELECTED_LOTS = Object.freeze([
  { number: 1, title: "Power Tools", supplier: "Hilti" },
  { number: 2, title: "Electrical Installation Components and consumables", supplier: "Schneider Electric" },
  { number: 10, title: "General Hardware", supplier: "Bossard Group" }
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
    country: "Afrique du Sud / distributeur autorise",
    website: "https://www.makita.co.za/",
    email: "procurement@toolcentre.co.za",
    phone: "+27 11 747 1400",
    recipient: "Tool Centre Benoni - Makita Authorized Retailer",
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
  "Schneider Electric": Object.freeze({
    country: "Afrique du Sud / couverture Malawi",
    website: "https://www.se.com/mw/en/",
    email: "za-ccc@schneider-electric.com",
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
    email: null,
    phone: null,
    recipient: "Marley Pipe Systems Sales",
    contactForm: "https://www.marleypipesystems.co.za/contact-us/",
    source: "https://www.marleypipesystems.co.za/contact-us/",
    catalogSource: "https://www.marleypipesystems.co.za/"
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
    { items: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 42, 43, 47], supplier: "Aberdare Cables", status: COVERAGE_PROBABLE, reason: "Aberdare fabrique et exporte des cables basse tension, flexibles, multiconducteurs et conducteurs cuivre; chaque section, couleur et tension doit etre confirmee." },
    { items: [16, 18, 44, 45, 46, 53, 54], supplier: "HellermannTyton", status: COVERAGE_PROBABLE, reason: "Le catalogue officiel couvre accessoires de fixation et gestion des cables; les cosses, clips, connecteurs, chevilles et rubans exacts doivent etre confirmes." },
    { items: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 52], supplier: "Legrand South Africa", status: COVERAGE_PROBABLE, reason: "Legrand Afrique du Sud couvre conduits, goulottes, boites, interrupteurs, prises et accessoires d'installation; les dimensions et standards du DAO doivent etre confirmes." },
    { items: [38, 39, 40], supplier: "Signify South Africa", status: COVERAGE_PROBABLE, reason: "Le catalogue professionnel Signify couvre lampes et tubes LED; les versions 12 V/220 V, puissances et culots exacts doivent etre confirmes." }
  ]),
  10: Object.freeze([
    { items: [1], supplier: "Fellowes", status: COVERAGE_PROBABLE, reason: "Fellowes fabrique des destructeurs de documents cross-cut; le modele 10 feuilles/20 litres doit etre confirme." },
    { items: [2], supplier: "Lasher Tools", status: COVERAGE_PROBABLE, reason: "Lasher fabrique officiellement des brouettes, y compris des versions poly et roues increvables; la configuration deux roues et la charge doivent etre confirmees." },
    { items: [3, 5, 6], supplier: "Werner Ladders", status: COVERAGE_PROBABLE, reason: "Werner est un fabricant specialise d'escabeaux et echelles; dimensions, materiau et disponibilite export doivent etre confirmes." },
    { items: [4], supplier: "African Helical Pile and Anchor Company", status: COVERAGE_PROBABLE, reason: "AHPAC concoit et fournit des pieux et ancrages helicoidaux; la charge, galvanisation et composition du kit doivent etre confirmees." },
    { items: [7], supplier: "GARDENA", status: COVERAGE_PROBABLE, reason: "GARDENA commercialise des arroseurs reglables; le debit et la plage requis doivent etre confirmes." },
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
  const lines = lotSection(text, definition.number).split(/\r?\n/).map((line) => clean(line)).filter(Boolean);
  const products = [];
  let current = null;
  for (const line of lines) {
    const start = line.match(/^(\d{1,3})([A-Za-z].+)$/);
    if (start) {
      if (current) products.push(current);
      current = {
        itemNumber: Number(start[1]),
        product: clean(start[2]),
        unit: null,
        quantity: null,
        specifications: []
      };
      continue;
    }
    if (!current) continue;
    const end = line.match(/^(Each|Set|Pair|Pairs|Roll|Meter|Pack|Kit|Kg|Litre|Lot)\s*(\d+(?:\.\d+)?)$/i);
    if (end) {
      current.unit = end[1];
      current.quantity = Number(end[2]);
      continue;
    }
    current.specifications.push(line);
  }
  if (current) products.push(current);
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
  const specificationItems = layoutLot.products.length
    ? layoutLot.products
    : parseCollapsedLot(scheduleText, definition);
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
        coverageSource: contact?.catalogSource || contact?.source || null
      };
    })
  };
}

function exactEmailBody(rfq) {
  const lines = rfq.products.map((item) => (
    `- Lot ${rfq.lotNumber}, ligne ${item.itemNumber}: ${item.product} - ${item.quantity} ${item.unit}\n`
    + `  Specifications: ${clean(item.specifications)}`
  )).join("\n");
  return `Dear ${rfq.contact.recipient},

LILOTOP SARL is preparing a bid for UNOPS Malawi tender ${NOTICE_REFERENCE}. We kindly request your formal quotation for the items listed below:

${lines}

Please confirm for every line:
- manufacturer and exact model/reference;
- full technical compliance or documented deviations;
- unit and total prices with currency;
- Incoterm and named place;
- transport cost to Lilongwe, Malawi, if available;
- lead time and availability;
- manufacturer warranty;
- payment terms and quotation validity;
- product datasheets.

Requested delivery basis: ${rfq.incoterm}.
Requested quotation deadline: ${rfq.responseDeadline}.

This request does not constitute an order or contractual commitment. Any purchase remains subject to LILOTOP SARL management approval.

Kind regards,
LILOTOP SARL
contact@lilotopsarl.com
https://lilotopsarl.com`;
}

function buildRfq(lot, supplier, products, existing, preparedAt) {
  const contact = SUPPLIER_CONTACTS[supplier];
  const previous = existing || {};
  const responseDeadline = previous.responseDeadline || "2026-08-17T12:00:00.000Z";
  const rfq = {
    id: previous.id || `UNOPS-62389-L${lot.number}-${supplier.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
    reference: `${NOTICE_REFERENCE} / Lot ${lot.number}`,
    supplier,
    lotNumber: lot.number,
    lotTitle: lot.title,
    products,
    contact: { ...contact, verified: contactVerified(contact) },
    preparedAt: previous.preparedAt || preparedAt,
    status: previous.status || "EN ATTENTE D'AUTORISATION DG",
    responseDeadline,
    authorizedAt: previous.authorizedAt || null,
    sentAt: previous.sentAt || null,
    emailSent: false,
    subject: `RFQ LILOTOP SARL - ${NOTICE_REFERENCE} - Lot ${lot.number} - ${supplier}`,
    destination: "Lilongwe, Malawi",
    delivery: "60 à 90 jours calendaires après signature du contrat",
    incoterm: "DAP Lilongwe, Malawi - Incoterms 2020",
    paymentTerms: "À coter par le fournisseur",
    attachments: ["Schedule of Requirements officiel du lot", "Tableau technique du lot"],
    coverageStatus: products.every((item) => item.verificationStatus === COVERAGE_CONFIRMED)
      ? COVERAGE_CONFIRMED
      : COVERAGE_PROBABLE,
    readyForDgReview: contactVerified(contact) && products.length > 0,
    humanAuthorizationRequired: true,
    authorizationConfirmation: {
      recipient: contact.email || contact.contactForm,
      supplier,
      lotNumber: lot.number,
      lineCount: products.length,
      attachments: ["Schedule of Requirements officiel du lot", "Tableau technique du lot"],
      responseDeadline
    }
  };
  return { ...rfq, emailBody: exactEmailBody(rfq) };
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
  if (!target.readyForDgReview || !target.contact?.verified) {
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
    counts: {
      ...(current.counts || {}),
      sent: 0
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
  const rfqs = lots.flatMap((lot) => {
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
    responses,
    comparison,
    counts: {
      lots: lots.length,
      products: lots.reduce((total, lot) => total + lot.products.length, 0),
      prepared: rfqs.length,
      readyForDgReview: rfqs.filter((rfq) => rfq.readyForDgReview).length,
      sent: rfqs.filter((rfq) => rfq.sentAt).length,
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
    }],
    supplierResponseLifecycle: [
      "RFQ ENVOYEE",
      "EN ATTENTE DE REPONSE",
      "REPONSE RECUE",
      "COTATION EXTRAITE",
      "CONFORMITE TECHNIQUE",
      "COMPARAISON FOURNISSEURS",
      "CALCUL COUT RENDU",
      "MARGE LILOTOP",
      "OFFRE FINANCIERE UNOPS"
    ],
    automaticSending: false,
    automaticSubmission: false,
    updatedAt: preparedAt
  };
}

module.exports = {
  NOTICE_REFERENCE,
  SELECTED_LOTS,
  SUPPLIER_CONTACTS,
  COVERAGE_CONFIRMED,
  COVERAGE_PROBABLE,
  SUPPLIER_NOT_ADAPTED,
  authorizeSupplierRfq,
  buildSupplierCycle,
  calculateComparison,
  mergeOfficialLot,
  parseCollapsedLot,
  parsePriceLot,
  recordSupplierQuotation,
  parseLot
};
