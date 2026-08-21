import { Types } from 'mongoose';

/** Normalize ObjectId / populated ref / string for ownership checks. */
export function mongoRefId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value instanceof Types.ObjectId) return value.toHexString();

  if (typeof value === 'object') {
    const rec = value as { _id?: unknown; id?: unknown; toHexString?: () => string };
    if (rec._id != null && rec._id !== value) return mongoRefId(rec._id);
    if (typeof rec.toHexString === 'function') {
      try {
        return rec.toHexString();
      } catch {
        /* fall through */
      }
    }
    if (typeof rec.id === 'string' || rec.id instanceof Types.ObjectId) {
      return mongoRefId(rec.id);
    }
  }
  return '';
}

export function mongoRefEquals(value: unknown, expectedId: string): boolean {
  const left = mongoRefId(value);
  return !!left && !!expectedId && left === expectedId;
}
