from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "rfq" / "RFQ_LILOTOP_HILTI_ITB-2026-62389_Lot1.pdf"

LINES = [
    (1, "Drill machine", 10, "Each", "Portable Drill Machine; 18V; chuck 1.5 to 13 mm; keyless chuck; max 1900 rpm; 350W; 2 gears."),
    (12, "Angle Grinders", 5, "Each", "Angle Grinder; 7.5 AMP motor; 11,000 RPM; 115 mm wheel; slide switch; lock-on switch; body grip/slide; grinding wheel, wheel guard, lock nut and lock nut wrench included."),
    (13, "Circular Saws", 4, "Each", "Circular Saw; 1200W; 190 mm blade; 5000 RPM no-load speed; bevel 0 to 45 degrees; cutting depth 66 mm at 90 degrees and 46 mm at 45 degrees; heavy-duty aluminium base; comfortable grip; clear cutting-line visibility; 190 mm saw blade and wrench included."),
    (14, "Power Screwdrivers", 5, "Each", "Powered Screwdriver Set; two-speed gearbox; one-handed operation; torque tool; torque range 0.2 to 4.3 Nm; 2 Ah battery; 60-minute charge; screwdriver, charger and various bits included."),
    (15, "Electric Sanders", 4, "Each", "Electric Sander; 5-inch random orbit palm sander; source document states 'Current: 5' without a legible unit; compatible with various vacuum hose sizes; accepts both types of 5-inch sanding discs; enhanced comfort and control."),
    (16, "Grinder", 2, "Each", "Grinder; 4.5-inch wheel; 10,000 RPM; 7-9A motor; side handle; adjustable guard; spindle lock; grinding and cutting discs included; overload protection."),
]

COMMON = (
    "Minimum 12-month comprehensive manufacturer warranty valid for commercial/industrial "
    "operating conditions via an authorized national distributor. Product datasheet required."
)


def para(text, style):
    return Paragraph(text.replace("&", "&amp;"), style)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#5D6B78"))
    canvas.drawString(15 * mm, 9 * mm, "LILOTOP SARL | RFQ pilot | ITB/2026/62389 | No purchase commitment")
    canvas.drawRightString(282 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#0B1F33"), alignment=TA_CENTER, spaceAfter=6)
    subtitle = ParagraphStyle("Subtitle", parent=styles["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#536273"), alignment=TA_CENTER)
    heading = ParagraphStyle("Heading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=colors.HexColor("#0B1F33"), spaceBefore=8, spaceAfter=6)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=8.5, leading=11, textColor=colors.HexColor("#1D2D3D"))
    small = ParagraphStyle("Small", parent=body, fontSize=7.2, leading=9)
    table_head = ParagraphStyle("TableHead", parent=small, textColor=colors.white, fontName="Helvetica-Bold")

    doc = SimpleDocTemplate(str(OUTPUT), pagesize=landscape(A4), rightMargin=15 * mm, leftMargin=15 * mm, topMargin=14 * mm, bottomMargin=15 * mm, title="RFQ LILOTOP HILTI ITB-2026-62389 Lot 1", author="LILOTOP SARL")
    story = [
        Paragraph("REQUEST FOR QUOTATION - PILOT RFQ", title),
        Paragraph("HILTI | LOT 1 - POWER TOOLS | UNOPS ITB/2026/62389", subtitle),
        Spacer(1, 5 * mm),
    ]
    meta = [
        [para("Buyer preparing the bid", body), para("LILOTOP SARL", body), para("Requested destination", body), para("Lilongwe, Malawi", body)],
        [para("Tender", body), para("Supply and Delivery of Workshop Tools, General Hardware and Electricals to Mzuzu Technical College, Malawi", body), para("Delivery basis", body), para("DAP Lilongwe (Schedule of Requirements); FCA plus freight and insurance to DPU Lilongwe (Price Schedule) - Incoterms 2020", body)],
        [para("Reference", body), para("ITB/2026/62389 - Lot 1", body), para("Requested quotation deadline", body), para("17 August 2026, 14:00 CAT (Malawi time)", body)],
        [para("Requested delivery", body), para("60 to 90 calendar days after contract signature", body), para("Contact", body), para("contact@lilotopsarl.com", body)],
    ]
    mt = Table(meta, colWidths=[38 * mm, 85 * mm, 40 * mm, 94 * mm])
    mt.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D7DEE5")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EDF2F5")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#EDF2F5")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [mt, Spacer(1, 5 * mm), Paragraph("Official Lot 1 lines requested", heading)]

    table_data = [[para(x, table_head) for x in ["Line", "Product", "Qty", "Unit", "Official technical specification", "Supplier response"]]]
    for number, product, quantity, unit, specs in LINES:
        table_data.append([
            para(str(number), small), para(product, small), para(str(quantity), small), para(unit, small),
            para(f"{specs}<br/><b>Warranty / evidence:</b> {COMMON}", small),
            para("COMPLY: YES / NO / ALTERNATIVE<br/>Manufacturer:<br/>Model / Part No.:<br/>Deviation, if any:", small),
        ])
    def line_table(rows):
        result = Table([table_data[0], *rows], repeatRows=1, colWidths=[12 * mm, 31 * mm, 13 * mm, 15 * mm, 130 * mm, 56 * mm])
        result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B1F33")),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#C9D2DA")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F9FA")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return result

    story += [line_table(table_data[1:5]), PageBreak(), Paragraph("Official Lot 1 lines requested - continued", heading), line_table(table_data[5:]), Spacer(1, 5 * mm), Paragraph("Commercial response required for every line", heading)]
    requirements = [
        "COMPLY status: YES, NO or ALTERNATIVE", "Manufacturer, brand, exact model and part number",
        "Unit price, total price and currency", "DAP Lilongwe price; FCA price and named FCA location; freight and insurance separately to DPU Lilongwe",
        "Availability and delivery lead time", "Manufacturer warranty", "Country of origin",
        "Product datasheet and product photo", "Payment terms", "Quotation validity",
    ]
    req_table = Table([[para(str(i + 1), small), para(value, small), para("Supplier response", small)] for i, value in enumerate(requirements)], colWidths=[12 * mm, 150 * mm, 95 * mm])
    req_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D7DEE5")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EDF2F5")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story += [req_table, Spacer(1, 7 * mm), Paragraph("Important", heading), para("This RFQ is a request for information and quotation only. It does not constitute an order, award, representation agreement or contractual commitment. Any purchase remains subject to LILOTOP SARL management approval and the UNOPS procurement outcome.", body)]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    build()
