'use client';

import { asPerson, type PersonLike } from '@/shared/lib/csv';

export function PersonDetails({
  title,
  person,
  compact,
  hidePhone,
}: {
  title: string;
  person: PersonLike;
  compact?: boolean;
  hidePhone?: boolean;
}) {
  const p = asPerson(person);
  if (!p || (!p.name && !p.email && !p._id)) {
    return (
      <div className="rounded-lg border border-outline-variant p-3">
        <p className="mb-1 text-xs font-semibold uppercase text-on-surface-variant">{title}</p>
        <p className="text-on-surface-variant">Not available</p>
      </div>
    );
  }
  const rows = [
    ['Name', p.name],
    ['Role', p.role],
    ['Email', p.email],
    hidePhone ? null : ['Phone', p.phone],
    ['Status', p.status],
    ['User code', p.businessUserCode],
    ['External ref', p.externalRef],
    compact ? null : ['User ID', p._id],
  ].filter((row): row is [string, string] => !!row && !!row[1]);

  return (
    <div className="rounded-lg border border-outline-variant p-3">
      <p className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">{title}</p>
      <dl className={`grid gap-1.5 ${compact ? '' : 'sm:grid-cols-2'}`}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</dt>
            <dd
              className={`break-all font-medium ${
                label === 'Role' || label === 'Status' ? 'capitalize' : ''
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
