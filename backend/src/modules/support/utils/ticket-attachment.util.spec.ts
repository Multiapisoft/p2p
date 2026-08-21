import { BadRequestException } from '@nestjs/common';
import { sanitizeTicketAttachments } from './ticket-attachment.util';

const uid = '507f1f77bcf86cd799439011';

function att(over: Partial<{ key: string; publicUrl: string; filename: string }> = {}) {
  return {
    key: over.key ?? `p2p/support-ticket/${uid}/1.pdf`,
    publicUrl: over.publicUrl ?? 'https://cdn.example/1.pdf',
    filename: over.filename ?? 'proof.pdf',
  };
}

describe('sanitizeTicketAttachments', () => {
  it('returns empty for missing list', () => {
    expect(sanitizeTicketAttachments(undefined, uid)).toEqual([]);
    expect(sanitizeTicketAttachments([], uid)).toEqual([]);
  });

  it('accepts a pdf uploaded by the same user', () => {
    const out = sanitizeTicketAttachments([att()], uid);
    expect(out).toHaveLength(1);
    expect(out[0].filename).toBe('proof.pdf');
    expect(out[0].key).toContain(`support-ticket/${uid}/`);
  });

  it('rejects keys from another user or purpose', () => {
    expect(() =>
      sanitizeTicketAttachments(
        [att({ key: 'p2p/support-ticket/other/1.pdf' })],
        uid,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      sanitizeTicketAttachments(
        [att({ key: `p2p/withdrawal-payment-proof/${uid}/1.jpg` })],
        uid,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects exe and more than 5 files', () => {
    expect(() =>
      sanitizeTicketAttachments([att({ filename: 'virus.exe', key: `p2p/support-ticket/${uid}/x.exe` })], uid),
    ).toThrow(BadRequestException);

    const many = Array.from({ length: 6 }, (_, i) =>
      att({ key: `p2p/support-ticket/${uid}/${i}.pdf`, filename: `${i}.pdf` }),
    );
    expect(() => sanitizeTicketAttachments(many, uid)).toThrow(BadRequestException);
  });

  it('dedupes the same key', () => {
    const out = sanitizeTicketAttachments([att(), att()], uid);
    expect(out).toHaveLength(1);
  });
});
