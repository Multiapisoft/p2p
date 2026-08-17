import { resolveMaxUsers } from './user-limit.util';

describe('resolveMaxUsers', () => {
  it('uses business cap when set', () => {
    expect(resolveMaxUsers(50, 100)).toBe(50);
  });

  it('falls back to platform default when business is 0', () => {
    expect(resolveMaxUsers(0, 100)).toBe(100);
    expect(resolveMaxUsers(undefined, 100)).toBe(100);
  });

  it('is unlimited when both are 0', () => {
    expect(resolveMaxUsers(0, 0)).toBe(0);
    expect(resolveMaxUsers(undefined, undefined)).toBe(0);
  });
});
