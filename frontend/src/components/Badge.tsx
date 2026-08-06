const STATUS_CLASS: Record<string, string> = {
  New: "badge-new", Contacted: "badge-contacted", Qualified: "badge-qualified",
  "Proposal Sent": "badge-proposal", Negotiation: "badge-negotiation", Won: "badge-won", Lost: "badge-lost",
  Active: "badge-active", Inactive: "badge-inactive",
  Draft: "badge-draft", Final: "badge-final", Sent: "badge-sent",
  Pending: "badge-pending", Paid: "badge-paid", Overdue: "badge-overdue", Cancelled: "badge-cancelled", Partial: "badge-partial",
  "In Progress": "badge-inprogress", "Not Started": "badge-notstarted", Completed: "badge-completed",
  "On Hold": "badge-onhold", "Awaiting Client": "badge-awaiting",
  not_synced: "badge-notsynced", pending: "badge-syncpending", synced: "badge-synced", failed: "badge-syncfailed",
};

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? "badge-notstarted"}`}>{status}</span>;
}
