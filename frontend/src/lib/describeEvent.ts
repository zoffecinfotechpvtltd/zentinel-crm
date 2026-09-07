// Shared by Activity, Audit Log, and the Clients detail timeline - previously
// each page had its own hand-copied describe() function, which is how the
// same event ended up reading "logged an interaction" on one page and
// "logged a note on a lead" on another for the exact same row.
export type ActivityEvent = {
  entity_type: string;
  action: string;
  detail: Record<string, unknown>;
  actor_name?: string | null;
};

function article(entityType: string): string {
  return /^[aeiou]/i.test(entityType) ? "an" : "a";
}

export function describeEvent(row: ActivityEvent, fallbackActor = "Someone"): string {
  const who = row.actor_name ?? fallbackActor;
  const a = article(row.entity_type);

  if (row.action === "status_changed") {
    const d = row.detail as { from?: string; to?: string; invoice_number?: string };
    return `${who} changed ${row.entity_type} status from "${d.from}" to "${d.to}"${d.invoice_number ? ` (${d.invoice_number})` : ""}`;
  }
  if (row.action === "created") return `${who} created ${a} new ${row.entity_type}`;
  if (row.action === "deleted") {
    const d = row.detail as { company?: string; invoice_number?: string; name?: string };
    const label = d.company ?? d.invoice_number ?? d.name;
    return `${who} deleted ${a} ${row.entity_type}${label ? ` ("${label}")` : ""}`;
  }
  if (row.action === "reassigned") return `${who} reassigned ${a} ${row.entity_type}`;
  if (row.action === "note_added") return `${who} logged a note on ${a} ${row.entity_type}`;
  if (row.action === "contact_added") return `${who} added a contact to ${a} ${row.entity_type}`;
  if (row.action === "contract_added") return `${who} added a contract to ${a} ${row.entity_type}`;
  if (row.action === "converted_to_client") return `${who} converted ${a} ${row.entity_type} to a client`;
  if (row.action === "merged") {
    const d = row.detail as { merged_company?: string };
    return `${who} merged a duplicate ${row.entity_type}${d.merged_company ? ` ("${d.merged_company}")` : ""} into this one`;
  }
  if (row.action === "message_sent") {
    const d = row.detail as { template_name?: string; channel?: string };
    return `${who} sent a "${d.template_name ?? "message"}" ${d.channel ?? ""} message`;
  }
  return `${who} - ${row.action} on ${row.entity_type}`;
}
