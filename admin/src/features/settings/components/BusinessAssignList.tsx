'use client';

type Biz = { _id: string; name: string; referralCode?: string | null };

export function BusinessAssignList({
  businesses,
  loading,
  error,
  selected,
  onChange,
}: {
  businesses: Biz[];
  loading?: boolean;
  error?: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (loading) {
    return <p className="text-xs text-on-surface-variant">Loading businesses…</p>;
  }
  if (error) {
    return (
      <p className="text-xs text-error">Could not load businesses. Refresh and try again.</p>
    );
  }
  if (!businesses.length) {
    return <p className="text-xs text-on-surface-variant">No businesses yet.</p>;
  }

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-1.5">
      {businesses.map((b) => (
        <label
          key={b._id}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-container-low"
        >
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-secondary)]"
            checked={selected.includes(b._id)}
            onChange={() => toggle(b._id)}
          />
          <span className="min-w-0 truncate">
            {b.name}
            {b.referralCode ? (
              <span className="text-on-surface-variant"> · {b.referralCode}</span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}
