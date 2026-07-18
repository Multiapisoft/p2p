'use client';

/** Common UTR patterns from payment screenshots (UPI/bank). */
export function extractUtrFromText(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ');

  const patterns = [
    /(?:UTR|UTR\s*No|Ref\.?\s*No|Reference|RRN|Txn\s*ID|Transaction\s*ID)[:\s#-]*([A-Za-z0-9]{8,22})/i,
    /\b([0-9]{12})\b/,
    /\b([A-Z0-9]{16,22})\b/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

export async function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
