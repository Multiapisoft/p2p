'use client';

import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ClassicCdmRequestsPanel } from '@/features/deposits/components/ClassicCdmRequestsPanel';

export function CdmRequestsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <PageHeader
        title="CDM Requests"
        description="All cash CDM deposit requests from your users. Approve after you verify the deposit."
      />
      <ClassicCdmRequestsPanel />
    </div>
  );
}
