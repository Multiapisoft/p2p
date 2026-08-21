import { Types } from 'mongoose';
import { mongoRefEquals, mongoRefId } from './mongo-ref-id.util';

describe('mongoRefId', () => {
  const hex = '64b8f0c2a1b2c3d4e5f60789';

  it('reads string and ObjectId', () => {
    expect(mongoRefId(hex)).toBe(hex);
    expect(mongoRefId(new Types.ObjectId(hex))).toBe(hex);
  });

  it('reads populated user document', () => {
    expect(mongoRefId({ _id: new Types.ObjectId(hex), name: 'Asha', email: 'a@x.com' })).toBe(hex);
    expect(mongoRefId({ _id: hex, name: 'Asha' })).toBe(hex);
  });

  it('does not treat populated toString as a match', () => {
    const populated = { _id: new Types.ObjectId(hex), name: 'Asha' };
    expect(String(populated)).not.toBe(hex);
    expect(mongoRefEquals(populated, hex)).toBe(true);
    expect(mongoRefEquals(populated, 'nope')).toBe(false);
  });
});
