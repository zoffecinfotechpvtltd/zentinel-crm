import { motion } from "motion/react";

export function StatCard({
  label, value, color, change, changeUp, index = 0,
}: {
  label: string;
  value: string;
  color: string;
  change?: string;
  changeUp?: boolean;
  index?: number;
}) {
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {change && (
        <div className={`stat-change ${changeUp ? "stat-up" : "stat-down"}`}>{change}</div>
      )}
    </motion.div>
  );
}
