// One-time script: reads the real Opportunities_Tracker.xlsx (place it at
// the repo root) and produces a normalized opportunities-historical-import.xlsx
// (same shape the app's own GET /api/opportunities/import-template produces,
// also at the repo root) ready to upload through the new Import modal. Not
// part of the app — a migration aid, run once via `node
// backend/scripts/build-opportunities-migration-template.mjs` from the repo root.
import ExcelJS from "exceljs";

const SERVICE_TYPE_MAP = [
  [/^accessibility$/i, ["Accessibility"]],
  [/^accessibility\/cscrf$/i, ["Accessibility", "CSCRF"]],
  [/^accesibility\/cscrf renewal$/i, ["Accessibility", "CSCRF Renewal"]],
  [/^accesibility\/cscrf$/i, ["Accessibility", "CSCRF"]],
  [/^cscrf$/i, ["CSCRF"]],
  [/^cscrf & accessibility$/i, ["CSCRF", "Accessibility"]],
  [/^cscrf&accessibility$/i, ["CSCRF", "Accessibility"]],
  [/^sebi cscrf$/i, ["CSCRF"]],
  [/^iso ?27001$/i, ["ISO 27001"]],
  [/^iso ?27001\/soc2 ?t2$/i, ["ISO 27001", "SOC 2"]],
  [/^vapt$/i, ["VAPT"]],
  [/^black box vapt$/i, ["VAPT"]],
  [/^dpdp$/i, ["DPDP"]],
  [/^posh training$/i, ["POSH Training"]],
  [/^audit$/i, ["Audit"]],
  [/^m ?365 assestment$/i, ["M365 Assessment"]],
  [/^security assestment$/i, ["Security Assessment"]],
];

function normalizeServiceTypes(raw) {
  const key = (raw || "").trim();
  if (!key) return [];
  for (const [re, types] of SERVICE_TYPE_MAP) {
    if (re.test(key)) return types;
  }
  return ["Other"]; // unrecognized free text (e.g. "KRED B" data-entry glitch) — flagged for manual review
}

function normalizeProductTypes(raw) {
  const text = (raw || "").toLowerCase();
  const tags = new Set();
  if (/firewall|fortinet|xgs/.test(text)) tags.add("Firewall");
  if (/switch|access point/.test(text)) tags.add("Network Switch/AP");
  if (/seqrite|antivirus|\beps\b|dlp|endpoint/.test(text)) tags.add("Endpoint Security");
  if (/\bnas\b|backup|veeam|storage|synology/.test(text)) tags.add("Backup/Storage");
  if (/laptop|desktop|hardware/.test(text)) tags.add("Hardware");
  if (/camera/.test(text)) tags.add("Physical Security");
  if (/o365|cloud|365/.test(text)) tags.add("Cloud/Software License");
  if (/service desk|manage engine|assessment/.test(text)) tags.add("IT Service");
  if (tags.size === 0) tags.add("Other");
  return [...tags];
}

function normalizeServiceStage(stageRaw, statusRaw, remarksRaw) {
  const stage = (stageRaw || "").trim().toLowerCase();
  const status = (statusRaw || "").trim().toLowerCase();
  const remarks = (remarksRaw || "").trim().toLowerCase();
  if (status.includes("closed (won)") || stage === "won") return "Won";
  if (status.includes("closed (lost)") || stage === "lost" || status === "lost" || status === "drop") return "Lost";
  if (status === "closed" && !status.includes("(")) return "Won"; // SEBI renewal list's bare "CLOSED" — renewal completed
  if (/proposal (has been )?(sent|shared)/.test(remarks) || /proposal (has been )?(sent|shared)/.test(status)) return "Proposal Sent";
  return "Open";
}

function normalizeProductStage(stageRaw, statusRaw) {
  const stage = (stageRaw || "").trim().toLowerCase();
  const status = (statusRaw || "").trim().toLowerCase();
  if (stage.includes("closed(won)") || stage.includes("closed (won)")) return "Won";
  if (stage === "drop") return "Lost";
  if (/quote|quotation|proposal/.test(status)) return "Proposal Sent";
  return "Open";
}

function cell(row, col) {
  return (row.getCell(col).text || "").trim();
}

// Follow-up Date cells in the real sheet are inconsistent: some are clean
// dates, some are full JS Date.toString() text (e.g. "Tue Jan 27 2026
// 05:30:00 GMT+0530 (India Standard Time)") that Postgres's `date` column
// can't parse (rejects the "GMT+0530" zone abbreviation specifically).
// Normalize anything parseable to YYYY-MM-DD; anything else is dropped
// (not guessed) and the raw text is preserved in Remarks instead.
function normalizeDate(raw) {
  const text = (raw || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("Opportunities_Tracker.xlsx");

const outRows = [];

// Service sheet: Company(1) Client(2) Contact(3) Type(4) Description(5) PDF/PG&URL(6) Stage(7) Status(8) FollowUp(9) Remarks(10)
const serviceSheet = wb.getWorksheet("Opportunity tracker service");
for (let r = 2; r <= serviceSheet.rowCount; r++) {
  const row = serviceSheet.getRow(r);
  const company = cell(row, 1);
  if (!company) continue;
  const rawFollowUp = cell(row, 9);
  const followUp = normalizeDate(rawFollowUp);
  const remarks = followUp || !rawFollowUp ? cell(row, 10) : `${cell(row, 10)} (original follow-up text: "${rawFollowUp}")`.trim();
  const stage = normalizeServiceStage(cell(row, 7), cell(row, 8), remarks);
  outRows.push({
    kind: "service", company, clientName: cell(row, 2), contact: cell(row, 3),
    types: normalizeServiceTypes(cell(row, 4)), description: cell(row, 5), pdfPgUrl: cell(row, 6),
    stage, lostReason: stage === "Lost" ? remarks : "", followUp, remarks,
  });
}

// SEBI sheet: Company(1) Client(2) Contact(3) Type(4) Description(5) Stage(6) Status(7) Remarks(8) — no follow-up column
const sebiSheet = wb.getWorksheet("SEBI RENEWAL LIST");
for (let r = 2; r <= sebiSheet.rowCount; r++) {
  const row = sebiSheet.getRow(r);
  const company = cell(row, 1);
  if (!company) continue;
  const remarks = cell(row, 8);
  const stage = normalizeServiceStage(cell(row, 6), cell(row, 7), remarks);
  outRows.push({
    kind: "service", company, clientName: cell(row, 2), contact: cell(row, 3),
    types: [...normalizeServiceTypes(cell(row, 4)), "SEBI Renewal"], description: cell(row, 5), pdfPgUrl: "",
    stage, lostReason: stage === "Lost" ? (remarks || "Not specified") : "", followUp: "", remarks: remarks || "SEBI renewal list",
  });
}

// Product sheet: DateAdded(1) Company(2) Client(3) Contact(4) Type/Item(5) Description(6) Stage(7) Status(8) FollowUp(9) Remarks(10)
const productSheet = wb.getWorksheet("Opportunity tracker product");
for (let r = 2; r <= productSheet.rowCount; r++) {
  const row = productSheet.getRow(r);
  const company = cell(row, 2);
  if (!company) continue;
  const itemText = cell(row, 5);
  const statusNote = cell(row, 8);
  const rawFollowUp = cell(row, 9);
  const followUp = normalizeDate(rawFollowUp);
  const remarksParts = [statusNote, cell(row, 10)];
  if (rawFollowUp && !followUp) remarksParts.push(`(original follow-up text: "${rawFollowUp}")`);
  const combinedRemarks = remarksParts.filter(Boolean).join(" — ");
  const stage = normalizeProductStage(cell(row, 7), statusNote);
  outRows.push({
    kind: "product", company, clientName: cell(row, 3), contact: cell(row, 4),
    types: normalizeProductTypes(itemText), description: itemText || cell(row, 6), pdfPgUrl: "",
    stage, lostReason: stage === "Lost" ? (combinedRemarks || "Dropped") : "", followUp, remarks: combinedRemarks,
  });
}

console.log(`Normalized ${outRows.length} rows (service+SEBI: ${outRows.filter(r => r.kind === "service").length}, product: ${outRows.filter(r => r.kind === "product").length})`);
const stageCounts = {};
for (const r of outRows) stageCounts[r.stage] = (stageCounts[r.stage] || 0) + 1;
console.log("Stage distribution:", stageCounts);
const otherTypeRows = outRows.filter(r => r.types.includes("Other"));
console.log(`${otherTypeRows.length} row(s) got an unrecognized "Other" type tag — worth a manual look:`, otherTypeRows.map(r => r.company));

const outWb = new ExcelJS.Workbook();
const sheet = outWb.addWorksheet("Opportunities");
sheet.columns = [
  { header: "Kind (service/product)", width: 20 },
  { header: "Company", width: 30 },
  { header: "Client Name", width: 22 },
  { header: "Contact", width: 20 },
  { header: "Opportunity Types (comma-separated)", width: 30 },
  { header: "Description", width: 30 },
  { header: "PDF/PG & URL", width: 20 },
  { header: "Stage (Open/Proposal Sent/Won/Lost)", width: 20 },
  { header: "Follow-up Date (YYYY-MM-DD)", width: 20 },
  { header: "Remarks", width: 40 },
];
// The bulk-import endpoint doesn't have a lost_reason column (only the
// single-add/edit form enforces "lost_reason required when stage=Lost") —
// the original remark text already doubles as the reason in this data
// (e.g. "Price too high", "Not Replying on mail"), so it goes in Remarks
// as-is rather than being duplicated into a column the importer ignores.
for (const r of outRows) {
  sheet.addRow([
    r.kind, r.company, r.clientName, r.contact, r.types.join(", "), r.description, r.pdfPgUrl,
    r.stage, r.followUp, r.remarks,
  ]);
}
await outWb.xlsx.writeFile("opportunities-historical-import.xlsx");
console.log("Wrote opportunities-historical-import.xlsx");
