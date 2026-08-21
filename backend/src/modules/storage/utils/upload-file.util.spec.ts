import {
  allowedExtensionsForPurpose,
  isAllowedExtension,
  isSupportPurpose,
  mimeForExtension,
  normalizeUploadContentType,
  SUPPORT_PURPOSE,
} from './upload-file.util';

describe('upload-file.util', () => {
  it('allows only images for payment proof', () => {
    expect(allowedExtensionsForPurpose('withdrawal-payment-proof')).toEqual([
      'jpg',
      'jpeg',
      'png',
      'webp',
    ]);
    expect(isAllowedExtension('withdrawal-payment-proof', 'pdf')).toBe(false);
    expect(isAllowedExtension('deposit-proof', 'png')).toBe(true);
  });

  it('allows images, pdf and office docs on support tickets', () => {
    expect(isSupportPurpose(SUPPORT_PURPOSE)).toBe(true);
    expect(isAllowedExtension(SUPPORT_PURPOSE, 'pdf')).toBe(true);
    expect(isAllowedExtension(SUPPORT_PURPOSE, 'docx')).toBe(true);
    expect(isAllowedExtension(SUPPORT_PURPOSE, 'png')).toBe(true);
    expect(isAllowedExtension(SUPPORT_PURPOSE, 'exe')).toBe(false);
    expect(isAllowedExtension(SUPPORT_PURPOSE, 'zip')).toBe(false);
  });

  it('maps content types for pdf and images', () => {
    expect(mimeForExtension('pdf')).toBe('application/pdf');
    expect(mimeForExtension('png')).toBe('image/png');
    expect(normalizeUploadContentType('image/jpg', 'x.jpg')).toBe('image/jpeg');
    expect(normalizeUploadContentType(undefined, 'note.docx')).toContain('wordprocessingml');
  });
});
