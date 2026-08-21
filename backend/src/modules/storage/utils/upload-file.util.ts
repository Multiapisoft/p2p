export const PROOF_PURPOSES = [
  'withdrawal-payment-proof',
  'deposit-proof',
  'withdrawal-approve-proof',
  'upi-qr',
] as const;
export const SUPPORT_PURPOSE = 'support-ticket';

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;
export const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'] as const;

export const PROOF_EXTENSIONS = IMAGE_EXTENSIONS.filter((e) => e !== 'gif');
export const SUPPORT_EXTENSIONS = [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS] as const;

export const MAX_SUPPORT_ATTACHMENTS = 5;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};

export type UploadPurpose =
  | (typeof PROOF_PURPOSES)[number]
  | typeof SUPPORT_PURPOSE
  | string;

export function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function isProofPurpose(purpose: string): boolean {
  return (PROOF_PURPOSES as readonly string[]).includes(purpose);
}

export function isSupportPurpose(purpose: string): boolean {
  return purpose === SUPPORT_PURPOSE;
}

export function allowedExtensionsForPurpose(purpose: string): readonly string[] {
  if (isSupportPurpose(purpose)) return SUPPORT_EXTENSIONS;
  return PROOF_EXTENSIONS;
}

export function isAllowedExtension(purpose: string, ext: string): boolean {
  return allowedExtensionsForPurpose(purpose).includes(ext.toLowerCase());
}

export function mimeForExtension(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] || 'application/octet-stream';
}

export function normalizeUploadContentType(
  mimetype: string | undefined,
  filename: string,
): string {
  const ext = extensionOf(filename);
  if (mimetype && mimetype !== 'application/octet-stream') {
    if (mimetype === 'image/jpg') return 'image/jpeg';
    return mimetype;
  }
  return mimeForExtension(ext);
}

export function supportAcceptAttribute(): string {
  return SUPPORT_EXTENSIONS.map((e) => `.${e}`).join(',');
}
