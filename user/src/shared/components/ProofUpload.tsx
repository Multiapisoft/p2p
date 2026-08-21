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
  utrRequired?: boolean;
}

export function ProofUpload({
  utr,
  onUtrChange,
  onUploaded,
  proofPreview,
  disabled,
  referenceKind = 'utr',
  utrRequired = true,
}: ProofUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
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
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            loading={uploading}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <span className="material-symbols-outlined mr-1 text-lg">attach_file</span>
            From files
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={uploading}
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
          >
            <span className="material-symbols-outlined mr-1 text-lg">photo_camera</span>
            Camera
          </Button>
        </div>
      </div>

      {preview && (
        <div className="overflow-hidden rounded-xl border border-outline-variant">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Payment proof" className="max-h-56 w-full bg-black/5 object-contain" />
        </div>
      )}

      <Input
        label={
          isTxid
            ? utrRequired
              ? 'USDT / TRX TxID *'
              : 'USDT / TRX TxID (or upload slip)'
            : utrRequired
              ? 'UTR / Reference *'
              : 'UTR / Reference (or upload slip)'
        }
        value={utr}
        onChange={(e) =>
          onUtrChange(isTxid ? e.target.value.trim() : e.target.value.toUpperCase())
        }
        placeholder={
          isTxid
            ? '64-character hex TxID (TRC20 / optional 0x)'
            : '12-digit UTR / RRN'
        }
        required={utrRequired}
        disabled={disabled}
        maxLength={isTxid ? 66 : 22}
        spellCheck={false}
        autoComplete="off"
      />
      <p className="-mt-1 text-xs text-on-surface-variant">
        {isTxid
          ? 'Paste the blockchain transaction hash from your wallet / explorer.'
          : 'Use the UTR or IMPS RRN from your UPI/bank payment receipt.'}
      </p>

      {error && (
        <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </div>
      )}
    </div>
  );
}
