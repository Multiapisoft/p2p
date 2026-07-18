import { cn } from '@/shared/lib/utils';

export function LoadingScreen() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <span className="material-symbols-outlined animate-spin text-4xl text-secondary">
        progress_activity
      </span>
    </div>
  );
}

export function EmptyState({ message, icon = 'inbox' }: { message: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
      <span className="material-symbols-outlined mb-3 text-5xl opacity-40">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const copy = () => navigator.clipboard.writeText(value);

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-3">
        <code className="flex-1 overflow-x-auto text-sm break-all">{value}</code>
        <button
          type="button"
          onClick={copy}
          className="material-symbols-outlined shrink-0 rounded-lg p-1 text-secondary hover:bg-surface-container-high"
          title="Copy"
        >
          content_copy
        </button>
      </div>
    </div>
  );
}

export function SecretBanner({
  secret,
  apiKey,
  internalSecret,
  onDismiss,
}: {
  secret: string;
  apiKey?: string;
  internalSecret?: string;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-xl border-2 border-secondary bg-secondary-container/40 p-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-secondary">warning</span>
        <div className="flex-1 space-y-3">
          <p className="text-sm font-bold text-on-secondary-container">
            Copy your secrets now — they will not be shown again!
          </p>
          {apiKey && <CopyField label="API Key" value={apiKey} />}
          {secret && <CopyField label="API Secret" value={secret} />}
          {internalSecret && <CopyField label="Internal Secret" value={internalSecret} />}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-on-secondary hover:opacity-90"
          >
            I have saved my credentials
          </button>
        </div>
      </div>
    </div>
  );
}
