import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import {
  CLEARANCE_DEPARTMENTS,
  CLEARANCE_FINAL_SIGNATURES,
  type ClearanceDepartmentEntry,
} from "./clearance-form-layout";

export type ClearanceFormPdfData = {
  companyName: string;
  companySlug: string;
  employeeCode: string;
  employeeName: string;
  department: string | null;
  designation: string | null;
  departmentEntries: ClearanceDepartmentEntry[];
};

type BrandTheme = {
  accent: string;
  headerFill: string;
  ink: string;
  muted: string;
  rule: string;
  softBg: string;
  white: string;
};

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const CREST_CONTENT_TOP = 108;
const FIELD_ROW_GAP = 18;
const TABLE_CELL_PADDING = 6;
/** Extra space above HR Manager / CEO signature lines */
const FINAL_SIGNATURE_TOP_PADDING = 50;

const XORORA: BrandTheme = {
  accent: "#f26b21",
  headerFill: "#010c28",
  ink: "#1a1f36",
  muted: "#5c6478",
  rule: "#c8cce0",
  softBg: "#f4f5f9",
  white: "#ffffff",
};

const CREST: BrandTheme = {
  accent: "#3d8b37",
  headerFill: "#2f6f2b",
  ink: "#2a2e33",
  muted: "#5a636c",
  rule: "#b7c9b4",
  softBg: "#f3f8f2",
  white: "#ffffff",
};

const INDIGO = "#464c9f";

function isCrestLed(slug: string): boolean {
  return slug === "crest-led";
}

function themeFor(slug: string): BrandTheme {
  return isCrestLed(slug) ? CREST : XORORA;
}

function loadPublicAsset(filename: string): Buffer | null {
  try {
    return readFileSync(join(process.cwd(), "public", filename));
  } catch {
    return null;
  }
}

function drawSignatureLine(
  doc: PDFKit.PDFDocument,
  label: string,
  x: number,
  y: number,
  width: number,
  theme: BrandTheme,
): void {
  doc
    .strokeColor(theme.rule)
    .lineWidth(0.75)
    .moveTo(x, y + 20)
    .lineTo(x + width, y + 20)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(theme.muted)
    .text(label, x, y + 24, {
      width,
      align: "center",
      lineBreak: false,
    });
}

function drawLabeledValue(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  theme: BrandTheme,
): void {
  const labelWidth = Math.min(78, width * 0.36);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(theme.muted).text(label.toUpperCase(), x, y, {
    width: labelWidth,
    lineBreak: false,
  });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(theme.ink)
    .text(value.trim() || "—", x + labelWidth, y - 1, {
      width: width - labelWidth,
      lineBreak: false,
    });
  doc
    .strokeColor(theme.rule)
    .lineWidth(0.6)
    .moveTo(x + labelWidth, y + 13)
    .lineTo(x + width, y + 13)
    .stroke();
}

function drawDepartmentTable(
  doc: PDFKit.PDFDocument,
  y: number,
  entries: ClearanceDepartmentEntry[],
  theme: BrandTheme,
): number {
  const colWidths = [CONTENT_WIDTH * 0.28, CONTENT_WIDTH * 0.44, CONTENT_WIDTH * 0.28];
  const headers = ["Department", "Remarks", "Signature"];
  const headerHeight = 24;
  const rowHeight = 40;
  let x = PAGE_MARGIN;

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, headerHeight, 2).fill(theme.headerFill);
  doc.fillColor(theme.accent).rect(PAGE_MARGIN, y, 3, headerHeight).fill();
  doc.restore();

  doc.font("Helvetica-Bold").fontSize(8).fillColor(theme.white);
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i] ?? "", x + TABLE_CELL_PADDING, y + 8, {
      width: (colWidths[i] ?? 0) - TABLE_CELL_PADDING * 2,
      align: "center",
      lineBreak: false,
    });
    x += colWidths[i] ?? 0;
  }

  let currentY = y + headerHeight;

  for (let index = 0; index < CLEARANCE_DEPARTMENTS.length; index++) {
    const departmentLabel = CLEARANCE_DEPARTMENTS[index] ?? "";
    const entry = entries[index] ?? { remarks: "", signature: "" };
    x = PAGE_MARGIN;

    if (index % 2 === 0) {
      doc.save();
      doc.rect(PAGE_MARGIN, currentY, CONTENT_WIDTH, rowHeight).fill(theme.softBg);
      doc.restore();
    }

    const cells = [
      `${index + 1}. ${departmentLabel}`,
      entry.remarks.trim(),
      entry.signature.trim(),
    ];

    for (let i = 0; i < cells.length; i++) {
      doc
        .strokeColor(theme.rule)
        .lineWidth(0.5)
        .rect(x, currentY, colWidths[i] ?? 0, rowHeight)
        .stroke();

      doc
        .font(i === 0 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8)
        .fillColor(theme.ink)
        .text(cells[i] || " ", x + TABLE_CELL_PADDING, currentY + TABLE_CELL_PADDING, {
          width: (colWidths[i] ?? 0) - TABLE_CELL_PADDING * 2,
          align: "left",
          lineGap: 1,
        });

      x += colWidths[i] ?? 0;
    }

    currentY += rowHeight;
  }

  return currentY + 18;
}

function drawXororaHeader(
  doc: PDFKit.PDFDocument,
  data: ClearanceFormPdfData,
  logo: Buffer | null,
): number {
  const headerHeight = 86;

  doc.save();
  doc.rect(0, 0, PAGE_WIDTH, headerHeight).fill(XORORA.headerFill);
  doc
    .fillColor(INDIGO)
    .opacity(0.35)
    .circle(PAGE_WIDTH - 40, -10, 70)
    .fill();
  doc
    .fillColor(XORORA.accent)
    .opacity(0.2)
    .circle(80, headerHeight + 20, 55)
    .fill();
  doc.opacity(1);

  if (logo) {
    doc.image(logo, PAGE_MARGIN, 16, { height: 32 });
  } else {
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor(XORORA.white)
      .text("xorora", PAGE_MARGIN, 22, { lineBreak: false });
  }

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#a8b0c8")
    .text(`${data.companyName} · Head Office`, PAGE_MARGIN, 52, {
      width: CONTENT_WIDTH * 0.55,
      lineBreak: false,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(XORORA.white)
    .text("CLEARANCE FORM", PAGE_MARGIN, 22, {
      width: CONTENT_WIDTH,
      align: "right",
      lineBreak: false,
    });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(XORORA.accent)
    .text("Employee exit clearance", PAGE_MARGIN, 40, {
      width: CONTENT_WIDTH,
      align: "right",
      lineBreak: false,
    });

  doc.fillColor(XORORA.accent).rect(0, headerHeight - 3, PAGE_WIDTH, 3).fill();
  doc.restore();

  return headerHeight + 22;
}

function drawCrestLetterhead(doc: PDFKit.PDFDocument, letterhead: Buffer | null): void {
  if (letterhead) {
    doc.image(letterhead, 0, 0, { width: PAGE_WIDTH, height: PAGE_HEIGHT });
    return;
  }

  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(CREST.white);
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(CREST.accent)
    .text("Crest LED", PAGE_MARGIN, 36, { lineBreak: false });
  doc
    .strokeColor(CREST.accent)
    .lineWidth(1)
    .moveTo(PAGE_MARGIN, 72)
    .lineTo(PAGE_WIDTH - PAGE_MARGIN, 72)
    .stroke();
}

export function clearanceFormPdfFilename(data: ClearanceFormPdfData): string {
  const safeCode = data.employeeCode.replace(/[^a-zA-Z0-9_-]/g, "_");
  const prefix = isCrestLed(data.companySlug) ? "clearance-crest-led" : "clearance";
  return `${prefix}-${safeCode}.pdf`;
}

export async function buildClearanceFormPdf(data: ClearanceFormPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      autoFirstPage: true,
    });
    const chunks: Buffer[] = [];
    const theme = themeFor(data.companySlug);
    const crest = isCrestLed(data.companySlug);

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y: number;
    if (crest) {
      drawCrestLetterhead(doc, loadPublicAsset("crest-led-letterhead.png"));
      y = CREST_CONTENT_TOP;
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor(theme.headerFill)
        .text("EMPLOYEE CLEARANCE FORM", PAGE_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
          lineBreak: false,
        });
      y += 28;
    } else {
      y = drawXororaHeader(doc, data, loadPublicAsset("xorora-logo-white.png"));
    }

    const half = CONTENT_WIDTH / 2 - 10;

    drawLabeledValue(doc, "Emp ID", data.employeeCode, PAGE_MARGIN, y, half, theme);
    drawLabeledValue(doc, "Name", data.employeeName, PAGE_MARGIN + half + 20, y, half, theme);
    y += FIELD_ROW_GAP;

    drawLabeledValue(
      doc,
      "Department",
      data.department?.trim() || "—",
      PAGE_MARGIN,
      y,
      half,
      theme,
    );
    drawLabeledValue(
      doc,
      "Designation",
      data.designation?.trim() || "—",
      PAGE_MARGIN + half + 20,
      y,
      half,
      theme,
    );
    y += 24;

    y = drawDepartmentTable(doc, y, data.departmentEntries, theme);
    y += FINAL_SIGNATURE_TOP_PADDING;

    const sigWidth = CONTENT_WIDTH / CLEARANCE_FINAL_SIGNATURES.length - 12;
    for (let index = 0; index < CLEARANCE_FINAL_SIGNATURES.length; index++) {
      const label = CLEARANCE_FINAL_SIGNATURES[index] ?? "";
      drawSignatureLine(doc, label, PAGE_MARGIN + index * (sigWidth + 12), y, sigWidth, theme);
    }

    if (!crest) {
      y += 48;
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(theme.muted)
        .text("ams.xorora.com", PAGE_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
          lineBreak: false,
        });
    }

    doc.end();
  });
}
