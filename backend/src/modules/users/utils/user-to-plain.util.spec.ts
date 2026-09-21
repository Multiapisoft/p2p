import { userToPlainRecord } from './user-to-plain.util';

describe('userToPlainRecord', () => {
  it('uses toObject when present (mongoose document)', () => {
    const doc = {
      toObject: () => ({ _id: '1', email: 'a@b.com', password: 'x' }),
    };
    expect(userToPlainRecord(doc)).toEqual({
      _id: '1',
      email: 'a@b.com',
      password: 'x',
    });
  });

  it('clones Redis-cached plain objects without toObject', () => {
    const cached = { _id: '1', email: 'a@b.com', name: 'Sagori' };
    const plain = userToPlainRecord(cached);
    expect(plain).toEqual(cached);
    expect(plain).not.toBe(cached);
    expect(() => userToPlainRecord(cached)).not.toThrow();
  });
});
