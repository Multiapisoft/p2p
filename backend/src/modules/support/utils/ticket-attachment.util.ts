import { BadRequestException } from '@nestjs/common';
import {
  MAX_SUPPORT_ATTACHMENTS,
  SUPPORT_PURPOSE,
  isAllowedExtension,
  extensionOf,
} from '../../storage/utils/upload-file.util';

export type TicketAttachmentInput = {
  key: string;
  publicUrl: string;
  filename?: string;
  contentType?: string;
  size?: number;
};

export type SanitizedTicketAttachment = {
  key: string;
  publicUrl: string;
  filename: string;
  contentType: string;
  size: number;
};

export function supportKeyPrefix(userId: string): string {
  return `p2p/${SUPPORT_PURPOSE}/${userId}/`;
}

export function isSupportKeyForUser(key: string, userId: string): boolean {
  return typeof key === 'string' && key.startsWith(supportKeyPrefix(userId));
}

export function sanitizeTicketAttachments(
  attachments: TicketAttachmentInput[] | undefined,
  userId: string,
): SanitizedTicketAttachment[] {
  if (!attachments?.length) return [];
  if (attachments.length > MAX_SUPPORT_ATTACHMENTS) {
    throw new BadRequestException(
      `Maximum ${MAX_SUPPORT_ATTACHMENTS} attachments allowed`,
    );
  }

  const seen = new Set<string>();
  const out: SanitizedTicketAttachment[] = [];

  for (const item of attachments) {
    const key = (item.key || '').trim();
    const publicUrl = (item.publicUrl || '').trim();
    if (!key || !publicUrl) {
      throw new BadRequestException('Attachment key and publicUrl are required');
    }
    if (!isSupportKeyForUser(key, userId)) {
      throw new BadRequestException('Invalid attachment key');
    }
    const ext = extensionOf(item.filename || key);
    if (!isAllowedExtension(SUPPORT_PURPOSE, ext)) {
      throw new BadRequestException(
        'Only images, PDF, and Office documents are allowed on tickets',
      );
    }
    if (seen.has(key)) continue;
    seen.add(key);

    const filename = (item.filename || key.split('/').pop() || `file.${ext}`).slice(0, 180);
    out.push({
      key,
      publicUrl,
      filename,
      contentType: item.contentType || '',
      size: Number.isFinite(item.size) ? Math.max(0, Number(item.size)) : 0,
    });
  }

  return out;
}
