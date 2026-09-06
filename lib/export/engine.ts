"use client";

import type { UMLModel } from "@/types/diagram";
import { modelToPlantUml } from "@/lib/mermaid/parser";
import { downloadFile } from "@/lib/utils";

export type ExportFormat = "svg" | "png" | "pdf" | "plantuml" | "mermaid" | "json" | "xmi" | "sql";

export interface ExportOptions {
  scale?: 1 | 2 | 4;
  filename?: string;
}

async function renderMermaidSvg(code: string): Promise<string> {
  const mermaidModule = await import("mermaid");
  mermaidModule.default.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    themeVariables: {
      primaryColor: "#2563EB",
      primaryTextColor: "#0F172A",
      primaryBorderColor: "#BFDBFE",
      lineColor: "#94A3B8",
      secondaryColor: "#F8FAFC",
      tertiaryColor: "#CCFBF1",
      clusterBkg: "#F8FAFC",
      clusterBorder: "#E2E8F0",
      edgeLabelBackground: "#FFFFFF",
      fontFamily: "Inter, -apple-system, sans-serif",
      fontSize: "13px",
    },
    flowchart: { htmlLabels: true, curve: "basis" },
  });
  const { svg } = await mermaidModule.default.render(`export-${Date.now()}`, code);
  return svg;
}

export function svgToFile(svg: string, filename: string): void {
  downloadFile(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${svg}`, filename, "image/svg+xml");
}

export function jsonToFile(model: UMLModel, filename: string): void {
  downloadFile(JSON.stringify(model, null, 2), filename, "application/json");
}

export function plantUmlToFile(model: UMLModel, filename: string): void {
  downloadFile(modelToPlantUml(model), filename, "text/plain");
}

export function mermaidToFile(code: string, filename: string): void {
  downloadFile(code, filename, "text/plain");
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Serialize the class model as XMI 2.5.1 (usable in StarUML / Eclipse Papyrus). */
export function modelToXmi(model: UMLModel, name = "model"): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001" xmi:version="2.5.1">`);
  lines.push(`  <uml:Model xmi:id="model-${name.replace(/\s+/g, "-").toLowerCase()}" name="${xmlEscape(name)}">`);

  const classId = (id: string): string => `uml-${id.replace(/\W+/g, "-")}`;
  for (const cls of model.classes) {
    const cid = classId(cls.id);
    lines.push(
      `    <packagedElement xmi:type="uml:Class" xmi:id="${cid}" name="${xmlEscape(cls.name)}" isAbstract="${cls.isAbstract || cls.isInterface}">`
    );
    if (cls.stereotype) {
      lines.push(
        `      <extension xmi:type="uml:Comment" xmi:id="${cid}-stereotype"><annotatedElement xmi:idref="${cid}"/><body>«${xmlEscape(cls.stereotype)}»</body></extension>`
      );
    }
    for (const attr of cls.attributes) {
      lines.push(
        `      <ownedAttribute xmi:id="${cid}-a-${attr.name}" name="${xmlEscape(attr.name)}" visibility="${attr.visibility}">`
      );
      if (attr.isStatic) lines.push(`        <isStatic>true</isStatic>`);
      if (attr.type) {
        lines.push(`        <type xmi:type="uml:PrimitiveType" href="http://www.omg.org/spec/UML/20131001/PrimitiveTypes.xmi#${xmlEscape(attr.type.replace(/^[A-Z]/, (c) => c.toUpperCase()))}"/>`);
      }
      lines.push(`      </ownedAttribute>`);
    }
    for (const method of cls.methods) {
      lines.push(
        `      <ownedOperation xmi:id="${cid}-o-${method.name}" name="${xmlEscape(method.name)}" visibility="${method.visibility}">`
      );
      for (const p of method.parameters) {
        lines.push(`        <ownedParameter xmi:id="${cid}-o-${method.name}-p-${p.name}" name="${xmlEscape(p.name)}" direction="in"/>`);
      }
      if (method.returnType && method.returnType !== "void") {
        lines.push(`        <ownedParameter xmi:id="${cid}-o-${method.name}-ret" direction="return"><type xmi:type="uml:PrimitiveType" href="http://www.omg.org/spec/UML/20131001/PrimitiveTypes.xmi#${xmlEscape(method.returnType.replace(/^[A-Z]/, (c) => c.toUpperCase()))}"/></ownedParameter>`);
      }
      lines.push(`      </ownedOperation>`);
    }
    lines.push(`    </packagedElement>`);
  }

  let assocCounter = 0;
  for (const link of model.links) {
    const from = model.classes.find((c) => c.id === link.from);
    const to = model.classes.find((c) => c.id === link.to);
    if (!from || !to) continue;
    if (link.type === "inheritance" || link.type === "implementation") {
      lines.push(
        `    <packagedElement xmi:type="uml:Generalization" xmi:id="${classId(link.id)}" general="${classId(link.to)}" specific="${classId(link.from)}"/>`
      );
      continue;
    }
    const aid = `assoc-${++assocCounter}`;
    const e1 = `${aid}-e1`;
    const e2 = `${aid}-e2`;
    lines.push(`    <packagedElement xmi:type="uml:Association" xmi:id="${aid}" visibility="public">`);
    lines.push(`      <memberEnd xmi:idref="${e1}"/>`);
    lines.push(`      <memberEnd xmi:idref="${e2}"/>`);
    lines.push(`      <ownedEnd xmi:id="${e1}" association="${aid}">`);
    lines.push(`        <type xmi:idref="${classId(from.id)}"/>`);
    if (link.fromMultiplicity) lines.push(`        <upperValue xmi:type="uml:LiteralUnlimitedNatural" value="${link.fromMultiplicity === "*" ? "*" : parseInt(link.fromMultiplicity, 10) || 1}"/>`);
    lines.push(`      </ownedEnd>`);
    lines.push(`      <ownedEnd xmi:id="${e2}" association="${aid}">`);
    lines.push(`        <type xmi:idref="${classId(to.id)}"/>`);
    if (link.toMultiplicity) lines.push(`        <upperValue xmi:type="uml:LiteralUnlimitedNatural" value="${link.toMultiplicity === "*" ? "*" : parseInt(link.toMultiplicity, 10) || 1}"/>`);
    lines.push(`      </ownedEnd>`);
    lines.push(`    </packagedElement>`);
  }

  lines.push(`  </uml:Model>`);
  lines.push(`</xmi:XMI>`);
  return lines.join("\n");
}

const SQL_TYPE_MAP: Record<string, string> = {
  string: "TEXT",
  text: "TEXT",
  str: "TEXT",
  varchar: "TEXT",
  int: "INTEGER",
  integer: "INTEGER",
  long: "BIGINT",
  bigint: "BIGINT",
  number: "NUMERIC",
  numeric: "NUMERIC",
  double: "NUMERIC",
  float: "NUMERIC",
  decimal: "NUMERIC",
  money: "MONEY",
  bool: "BOOLEAN",
  boolean: "BOOLEAN",
  date: "DATE",
  datetime: "TIMESTAMP",
  timestamp: "TIMESTAMP",
  time: "TIME",
  uuid: "UUID",
  id: "UUID",
  json: "JSONB",
  blob: "BYTEA",
  byte: "BYTEA",
  bytes: "BYTEA",
};

function sqlTypeFor(type: string | undefined): string {
  if (!type || type === "unknown" || type === "void") return "TEXT";
  const normalized = type.trim().toLowerCase();
  return SQL_TYPE_MAP[normalized] ?? "TEXT";
}

/** Generate DDL (PostgreSQL) from the model — tables for classes/entities, FK constraints for references. */
export function modelToSql(model: UMLModel): string {
  const statements: string[] = [];
  for (const cls of model.classes) {
    const isEntity = cls.stereotype === "entity" || cls.stereotype === "table" || cls.stereotype === "database";
    if (!isEntity && cls.attributes.length === 0) continue;
    const table = cls.name.replace(/\W+/g, "_").toLowerCase();
    const rows = cls.attributes.map((a) => {
      const type = sqlTypeFor(a.type);
      const isId = a.name.toLowerCase() === "id" || a.type?.toLowerCase() === "uuid";
      const primary = isId ? " PRIMARY KEY" : "";
      return `  "${a.name.replace(/\W+/g, "_").toLowerCase()}" ${type}${primary}`;
    });
    if (rows.length === 0) rows.push('  "id" UUID PRIMARY KEY');
    statements.push(`CREATE TABLE IF NOT EXISTS "${table}" (\n${rows.join(",\n")}\n);`);
  }
  let fkCounter = 0;
  for (const link of model.links) {
    const from = model.classes.find((c) => c.id === link.from);
    const to = model.classes.find((c) => c.id === link.to);
    if (!from || !to) continue;
    const child = from.name.replace(/\W+/g, "_").toLowerCase();
    const parent = to.name.replace(/\W+/g, "_").toLowerCase();
    const col = `${parent}_id`;
    const fk = `fk_${child}_${parent}_${++fkCounter}`;
    statements.push(
      `ALTER TABLE "${child}" ADD CONSTRAINT "${fk}" FOREIGN KEY ("${col}") REFERENCES "${parent}"("id")${link.toMultiplicity === "*" ? "" : " NOT VALID"};`
    );
    statements.push(`CREATE INDEX IF NOT EXISTS "idx_${child}_${col}" ON "${child}" ("${col}");`);
  }
  return statements.join("\n\n");
}

export function xmiToFile(model: UMLModel, filename: string): void {
  downloadFile(modelToXmi(model), filename, "application/xml");
}

export function sqlToFile(model: UMLModel, filename: string): void {
  downloadFile(modelToSql(model), filename, "application/sql");
}

export async function pngFromElement(element: HTMLElement, filename: string, scale: 1 | 2 | 4 = 2): Promise<void> {
  const html2canvasModule = await import("html2canvas");
  const canvas = await html2canvasModule.default(
    element,
    { scale, backgroundColor: "#FFFFFF", useCORS: true, logging: false } as unknown as Parameters<typeof html2canvasModule.default>[1]
  );
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encoding failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function pdfFromElement(element: HTMLElement, filename: string): Promise<void> {
  const html2canvasModule = await import("html2canvas");
  const { jsPDF } = await import("jspdf");
  const canvas = await html2canvasModule.default(
    element,
    { scale: 2, backgroundColor: "#FFFFFF", useCORS: true, logging: false } as unknown as Parameters<typeof html2canvasModule.default>[1]
  );
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(filename);
}

export async function exportDiagram(
  format: ExportFormat,
  element: HTMLElement,
  model: UMLModel,
  options: ExportOptions
): Promise<void> {
  const base = options.filename ?? "diagram";
  switch (format) {
    case "svg": {
      const svg = await renderMermaidSvg(element.dataset.mermaidCode ?? "");
      svgToFile(svg, `${base}.svg`);
      break;
    }
    case "png":
      await pngFromElement(element, `${base}.png`, options.scale ?? 2);
      break;
    case "pdf":
      await pdfFromElement(element, `${base}.pdf`);
      break;
    case "plantuml":
      plantUmlToFile(model, `${base}.puml`);
      break;
    case "mermaid":
      mermaidToFile(element.dataset.mermaidCode ?? "", `${base}.mmd`);
      break;
    case "json":
      jsonToFile(model, `${base}.json`);
      break;
    case "xmi":
      xmiToFile(model, `${base}.xmi`);
      break;
    case "sql":
      sqlToFile(model, `${base}.sql`);
      break;
  }
}

export { renderMermaidSvg };