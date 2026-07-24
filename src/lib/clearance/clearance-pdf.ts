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

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
/** Leave room for letterhead header (logo + green rule). */
const CONTENT_TOP = 108;
const FIELD_ROW_GAP = 18;
const TABLE_CELL_PADDING = 6;

const CREST_GREEN = "#3d8b37";
const CREST_GREEN_DARK = "#2f6f2b";
const INK = "#2a2e33";
const MUTED = "#5a636c";
const RULE = "#b7c9b4";
const SOFT_BG = "#f3f8f2";
const WHITE = "#ffffff";

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
): void {
  doc
    .strokeColor(RULE)
    .lineWidth(0.75)
    .moveTo(x, y + 20)
    .lineTo(x + width, y + 20)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
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
): void {
  const labelWidth = Math.min(78, width * 0.36);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, {
    width: labelWidth,
    lineBreak: false,
  });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(INK)
    .text(value.trim() || "—", x + labelWidth, y - 1, {
      width: width - labelWidth,
      lineBreak: false,
    });
  doc
    .strokeColor(RULE)
    .lineWidth(0.6)
    .moveTo(x + labelWidth, y + 13)
    .lineTo(x + width, y + 13)
    .stroke();
}

function drawDepartmentTable(
  doc: PDFKit.PDFDocument,
  y: number,
  entries: ClearanceDepartmentEntry[],
): number {
  const colWidths = [CONTENT_WIDTH * 0.28, CONTENT_WIDTH * 0.44, CONTENT_WIDTH * 0.28];
  const headers = ["Department", "Remarks", "Signature"];
  const headerHeight = 24;
  const rowHeight = 40;
  let x = PAGE_MARGIN;

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, headerHeight, 2).fill(CREST_GREEN_DARK);
  doc.fillColor(CREST_GREEN).rect(PAGE_MARGIN, y, 3, headerHeight).fill();
  doc.restore();

  doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
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
      doc.rect(PAGE_MARGIN, currentY, CONTENT_WIDTH, rowHeight).fill(SOFT_BG);
      doc.restore();
    }

    const cells = [
      `${index + 1}. ${departmentLabel}`,
      entry.remarks.trim(),
      entry.signature.trim(),
    ];

    for (let i = 0; i < cells.length; i++) {
      doc
        .strokeColor(RULE)
        .lineWidth(0.5)
        .rect(x, currentY, colWidths[i] ?? 0, rowHeight)
        .stroke();

      doc
        .font(i === 0 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8)
        .fillColor(INK)
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

function drawCrestLetterhead(doc: PDFKit.PDFDocument, letterhead: Buffer | null): void {
  if (letterhead) {
    doc.image(letterhead, 0, 0, { width: PAGE_WIDTH, height: PAGE_HEIGHT });
    return;
  }

  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(WHITE);
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(CREST_GREEN)
    .text("Crest LED", PAGE_MARGIN, 36, { lineBreak: false });
  doc
    .strokeColor(CREST_GREEN)
    .lineWidth(1)
    .moveTo(PAGE_MARGIN, 72)
    .lineTo(PAGE_WIDTH - PAGE_MARGIN, 72)
    .stroke();
}

export function clearanceFormPdfFilename(data: ClearanceFormPdfData): string {
  const safeCode = data.employeeCode.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `clearance-crest-led-${safeCode}.pdf`;
}

export async function buildClearanceFormPdf(data: ClearanceFormPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      autoFirstPage: true,
    });
    const chunks: Buffer[] = [];
    const letterhead = loadPublicAsset("crest-led-letterhead.png");

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawCrestLetterhead(doc, letterhead);

    let y = CONTENT_TOP;
    const half = CONTENT_WIDTH / 2 - 10;

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor(CREST_GREEN_DARK)
      .text("EMPLOYEE CLEARANCE FORM", PAGE_MARGIN, y, {
        width: CONTENT_WIDTH,
        align: "center",
        lineBreak: false,
      });
    y += 28;

    drawLabeledValue(doc, "Emp ID", data.employeeCode, PAGE_MARGIN, y, half);
    drawLabeledValue(doc, "Name", data.employeeName, PAGE_MARGIN + half + 20, y, half);
    y += FIELD_ROW_GAP;

    drawLabeledValue(doc, "Department", data.department?.trim() || "—", PAGE_MARGIN, y, half);
    drawLabeledValue(
      doc,
      "Designation",
      data.designation?.trim() || "—",
      PAGE_MARGIN + half + 20,
      y,
      half,
    );
    y += 24;

    y = drawDepartmentTable(doc, y, data.departmentEntries);

    const sigWidth = CONTENT_WIDTH / CLEARANCE_FINAL_SIGNATURES.length - 12;
    for (let index = 0; index < CLEARANCE_FINAL_SIGNATURES.length; index++) {
      const label = CLEARANCE_FINAL_SIGNATURES[index] ?? "";
      drawSignatureLine(doc, label, PAGE_MARGIN + index * (sigWidth + 12), y, sigWidth);
    }

    doc.end();
  });
}
