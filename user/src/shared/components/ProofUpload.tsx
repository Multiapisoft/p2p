'use client';

import { useRef, useState } from 'react';
import { p2pPayApi } from '@/features/deposits/api/p2p-pay.api';
import { extractUtrFromText } from '@/shared/lib/utr-extract';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';

interface ProofUploadProps {
  utr: string;
  onUtrChange: (utr: string) => void;
  onUploaded: (key: string, publicUrl: string) => void;
  proofPreview?: string | null;
  disabled?: boolean;
  referenceKind?: 'utr' | 'txid';
}

export function ProofUpload({
  utr,
  onUtrChange,
  onUploaded,
  proofPreview,
  disabled,
  referenceKind = 'utr',
}: ProofUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(proofPreview ?? null);
  const [error, setError] = useState('');
  const isTxid = referenceKind === 'txid';

  const handleFile = async (file: File) => {
    setError('');
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setError('Only image files are allowed (JPG/PNG/WEBP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }

    setUploading(true);
    try {
      setPreview(URL.createObjectURL(file));
      const uploaded = await p2pPayApi.uploadProof(file);
      onUploaded(uploaded.key, uploaded.publicUrl);
      if (!utr) {
        const nameHint = extractUtrFromText(file.name);
        if (nameHint) onUtrChange(isTxid ? nameHint : nameHint.toUpperCase());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setPreview(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-sm font-semibold">Payment Screenshot *</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          loading={uploading}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <span className="material-symbols-outlined mr-1 text-lg">photo_camera</span>
          Upload Screenshot
        </Button>
      </div>

      {preview && (
        <div className="overflow-hidden rounded-xl border border-outline-variant">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Payment proof" className="max-h-56 w-full bg-black/5 object-contain" />
        </div>
      )}

      <Input
        label={isTxid ? 'TxID / TRX hash *' : 'UTR / Reference *'}
        value={utr}
        onChange={(e) =>
          onUtrChange(isTxid ? e.target.value.trim() : e.target.value.toUpperCase())
        }
        placeholder={isTxid ? 'Blockchain TxID' : '12-digit UTR'}
        required
        disabled={disabled}
      />

      {error && (
        <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </div>
      )}
    </div>
  );
}
