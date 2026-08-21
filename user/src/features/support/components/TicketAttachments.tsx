'use client';

import { useRef, useState } from 'react';

export type TicketFile = {
  key: string;
  publicUrl: string;
  filename: string;
  contentType?: string;
  size?: number;
};

const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt';
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

function isImage(file: TicketFile) {
  const name = file.filename || file.key;
  const type = file.contentType || '';
  return type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(name);
}

function fileIcon(file: TicketFile) {
  const name = (file.filename || file.key).toLowerCase();
  if (name.endsWith('.pdf')) return 'picture_as_pdf';
  if (/\.(doc|docx)$/.test(name)) return 'description';
  if (/\.(xls|xlsx)$/.test(name)) return 'table_chart';
  if (isImage(file)) return 'image';
  return 'attach_file';
}

export function TicketAttachmentList({ attachments }: { attachments?: TicketFile[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
        Attachments
      </p>
      <ul className="space-y-2">
        {attachments.map((f) => (
          <li
            key={f.key}
            className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest"
          >
            {isImage(f) ? (
              <a href={f.publicUrl} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.publicUrl}
                  alt={f.filename}
                  className="max-h-48 w-full object-contain bg-black/5"
                />
                <span className="block truncate px-3 py-2 text-xs font-medium text-secondary">
                  {f.filename}
                </span>
              </a>
            ) : (
              <a
                href={f.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-secondary"
              >
                <span className="material-symbols-outlined text-base">{fileIcon(f)}</span>
                <span className="min-w-0 truncate">{f.filename}</span>
                <span className="material-symbols-outlined ml-auto text-base">download</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TicketAttachmentPicker({
  files,
  onChange,
  upload,
  disabled,
}: {
  files: TicketFile[];
  onChange: (files: TicketFile[]) => void;
  upload: (file: File) => Promise<TicketFile>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setError('');
    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_FILES} files`);
      return;
    }
    const picked = Array.from(list).slice(0, remaining);
    setUploading(true);
    const next = [...files];
    try {
      for (const file of picked) {
        if (file.size > MAX_BYTES) {
          setError(`${file.name} is larger than 10 MB`);
          continue;
        }
        const uploaded = await upload(file);
        next.push({
          key: uploaded.key,
          publicUrl: uploaded.publicUrl,
          filename: uploaded.filename || file.name,
          contentType: uploaded.contentType || file.type,
          size: uploaded.size || file.size,
        });
      }
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => void addFiles(e.target.files)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => void addFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={disabled || uploading || files.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold hover:bg-surface-container-low disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-base">attach_file</span>
          {uploading ? 'Uploading…' : 'From files'}
        </button>
        <button
          type="button"
          disabled={disabled || uploading || files.length >= MAX_FILES}
          onClick={() => cameraRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold hover:bg-surface-container-low disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-base">photo_camera</span>
          Camera
        </button>
        <p className="text-[11px] text-on-surface-variant">
          Image, PDF, or document · max {MAX_FILES} files · 10 MB each
        </p>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {!!files.length && (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.key}
              className="flex items-center gap-2 rounded-lg border border-outline-variant px-2.5 py-1.5 text-sm"
            >
              <span className="material-symbols-outlined text-base text-secondary">
                {fileIcon(f)}
              </span>
              <span className="min-w-0 flex-1 truncate">{f.filename}</span>
              <button
                type="button"
                className="text-on-surface-variant hover:text-error"
                onClick={() => onChange(files.filter((x) => x.key !== f.key))}
                aria-label={`Remove ${f.filename}`}
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
