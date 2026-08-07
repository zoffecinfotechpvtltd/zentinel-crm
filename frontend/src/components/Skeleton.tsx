export function Skeleton({ width, height = 12, style }: { width: string | number; height?: number; style?: React.CSSProperties }) {
  return <div className="skeleton skeleton-text" style={{ width, height, ...style }} />;
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr className="skeleton-row" key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}><Skeleton width={c === 0 ? "70%" : "50%"} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="stat-card">
      <Skeleton width="60%" height={11} style={{ marginBottom: 10 }} />
      <Skeleton width="40%" height={25} />
    </div>
  );
}
