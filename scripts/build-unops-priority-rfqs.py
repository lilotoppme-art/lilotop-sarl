import json
import os
import subprocess
import unicodedata
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "assets" / "rfq"


def clean_text(value):
    text = str(value or "")
    if any(marker in text for marker in ("Ã", "Â", "â")):
        try:
            text = text.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")
        except UnicodeError:
            pass
    text = text.replace("•", "; ").replace("→", " to ").replace("–", "-").replace("—", "-")
    return unicodedata.normalize("NFKD", text).encode("ascii", errors="ignore").decode("ascii")


def paragraph(text, style):
    safe = clean_text(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    return Paragraph(safe, style)


def load_rfqs():
    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "export-unops-rfq-data.js")],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        env=os.environ,
    )
    return json.loads(result.stdout)


def build_pdf(rfq):
    output = OUTPUT_DIR / rfq["pdfFilename"]
    styles = getSampleStyleSheet()
    title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=colors.HexColor("#0B1F33"), alignment=TA_CENTER)
    subtitle = ParagraphStyle("Subtitle", parent=styles["Normal"], fontSize=9.5, leading=13, textColor=colors.HexColor("#536273"), alignment=TA_CENTER)
    heading = ParagraphStyle("Heading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor("#0B1F33"))
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#1D2D3D"))
    small = ParagraphStyle("Small", parent=body, fontSize=7, leading=8.5)
    header = ParagraphStyle("Header", parent=small, textColor=colors.white, fontName="Helvetica-Bold")

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#5D6B78"))
        canvas.drawString(15 * mm, 9 * mm, f"LILOTOP SARL | {rfq['supplier']} | ITB/2026/62389 | Draft RFQ")
        canvas.drawRightString(282 * mm, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(str(output), pagesize=landscape(A4), rightMargin=14 * mm, leftMargin=14 * mm, topMargin=13 * mm, bottomMargin=15 * mm, title=rfq["subject"], author="LILOTOP SARL")
    story = [
        Paragraph("REQUEST FOR QUOTATION - DRAFT FOR DG APPROVAL", title),
        Paragraph(f"{rfq['supplier']} | LOT {rfq['lotNumber']} - {rfq['lotTitle']} | UNOPS ITB/2026/62389", subtitle),
        Spacer(1, 4 * mm),
    ]
    meta = [
        [paragraph("Recipient", body), paragraph(rfq["contact"]["recipient"], body), paragraph("Verified channel", body), paragraph(rfq["contact"].get("email") or rfq["contact"].get("contactForm"), body)],
        [paragraph("Destination", body), paragraph(rfq["destination"], body), paragraph("Quotation deadline", body), paragraph(rfq["responseDeadlineLabel"], body)],
        [paragraph("Delivery", body), paragraph(rfq["delivery"], body), paragraph("Delivery pricing basis", body), paragraph(rfq["incoterm"], body)],
        [paragraph("From / Reply-To", body), paragraph("contact@lilotopsarl.com", body), paragraph("Status", body), paragraph("NOT SENT - DG AUTHORIZATION REQUIRED", body)],
    ]
    mt = Table(meta, colWidths=[34 * mm, 94 * mm, 39 * mm, 102 * mm])
    mt.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#D7DEE5")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EDF2F5")), ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#EDF2F5")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 5)]))
    story.extend([mt, Spacer(1, 4 * mm), Paragraph("Official lines assigned to this supplier", heading)])

    rows = [[paragraph(value, header) for value in ["Line", "Product", "Qty", "Unit", "Official specification", "Supplier response"]]]
    for item in rfq["products"]:
        rows.append([
            paragraph(item["itemNumber"], small), paragraph(item["product"], small), paragraph(item["quantity"], small), paragraph(item["unit"], small),
            paragraph(item["specifications"], small), paragraph("COMPLY: YES / NO / ALTERNATIVE\nModel / Part No.:\nDeviation:", small),
        ])
    line_table = Table(rows, repeatRows=1, colWidths=[12 * mm, 38 * mm, 13 * mm, 16 * mm, 137 * mm, 53 * mm])
    line_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B1F33")), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C9D2DA")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F9FA")]), ("PADDING", (0, 0), (-1, -1), 4)]))
    story.extend([line_table, PageBreak(), Paragraph("Commercial response required", heading)])
    requirements = [
        "COMPLY status for every line", "Manufacturer, exact model and part number", "Unit and total price with currency",
        "DAP Lilongwe price", "FCA price and named FCA location", "Freight and insurance separately to DPU Lilongwe",
        "Availability and delivery lead time", "Minimum 12-month manufacturer warranty", "Country of origin",
        "Product datasheets and photos", "Payment terms", "Quotation validity",
    ]
    rt = Table([[paragraph(index + 1, small), paragraph(value, small), paragraph("Supplier response", small)] for index, value in enumerate(requirements)], colWidths=[12 * mm, 175 * mm, 82 * mm])
    rt.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#D7DEE5")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EDF2F5")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 4)]))
    story.extend([rt, Spacer(1, 6 * mm), Paragraph("Important", heading), paragraph("This draft RFQ is a request for quotation only. It is not an order or contractual commitment. It must not be sent without explicit DG authorization for this exact supplier.", body)])
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = [build_pdf(rfq) for rfq in load_rfqs()]
    print("\n".join(str(path) for path in outputs))


if __name__ == "__main__":
    main()
