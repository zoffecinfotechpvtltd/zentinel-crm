export function StatCard({
  label, value, color, change, changeUp,
}: {
  label: string;
  value: string;
  color: string;
  change?: string;
  changeUp?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {change && (
        <div className={`stat-change ${changeUp ? "stat-up" : "stat-down"}`}>{change}</div>
      )}
    </div>
  );
}
