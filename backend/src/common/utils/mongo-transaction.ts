import { Connection, ClientSession, Types } from 'mongoose';
import { Logger } from '@nestjs/common';

type TxnFn<T> = (session: ClientSession | null) => Promise<T>;

const logger = new Logger('MongoTransaction');

/** Cached: null = unknown, true/false after first probe. */
let transactionsSupported: boolean | null = null;

function isTransactionUnsupported(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number })?.code;
  const codeName = String((err as { codeName?: string })?.codeName || '');
  return (
    code === 20 ||
    codeName === 'IllegalOperation' ||
    msg.includes('Transaction numbers are only allowed') ||
    msg.includes('replica set member or mongos') ||
    msg.includes('as replica set') ||
    msg.includes('transaction numbers')
  );
}

async function safeAbort(session: ClientSession | null) {
  if (!session) return;
  try {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
  } catch (err) {
    logger.warn(`abortTransaction ignored: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function safeEnd(session: ClientSession | null) {
  if (!session) return;
  try {
    await session.endSession();
  } catch (err) {
    logger.warn(`endSession ignored: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Run work in a Mongo transaction when the deployment supports it (replica set / mongos).
 * Falls back to non-transactional execution on standalone MongoDB.
 * After the first unsupported error, skips transactions for the process lifetime.
 */
export async function withOptionalTransaction<T>(
  connection: Connection,
  fn: TxnFn<T>,
): Promise<T> {
  if (transactionsSupported === false) {
    return fn(null);
  }

  let session: ClientSession | null = null;
  try {
    session = await connection.startSession();
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    transactionsSupported = true;
    return result;
  } catch (err) {
    await safeAbort(session);

    if (isTransactionUnsupported(err)) {
      transactionsSupported = false;
      logger.warn(
        'Mongo transactions unavailable (standalone). Falling back without transactions.',
      );
      await safeEnd(session);
      session = null;
      return fn(null);
    }

    throw err;
  } finally {
    await safeEnd(session);
  }
}

/** Force non-transaction mode (tests / explicit standalone). */
export function disableMongoTransactions() {
  transactionsSupported = false;
}

/** Reset probe cache (tests). */
export function resetMongoTransactionProbe() {
  transactionsSupported = null;
}

export function sessionOpt(session: ClientSession | null | undefined) {
  return session || undefined;
}

export function asObjectId(id: string | Types.ObjectId) {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}
