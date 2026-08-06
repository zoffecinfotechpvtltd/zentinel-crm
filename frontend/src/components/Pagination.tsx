export function Pagination({
  page, perPage, total, onChange,
}: {
  page: number;
  perPage: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let p = start; p <= end; p++) pages.push(p);

  return (
    <div className="pagination">
      <button className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</button>
      {pages.map((p) => (
        <button key={p} className={`page-btn${p === page ? " active" : ""}`} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button className="page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}
