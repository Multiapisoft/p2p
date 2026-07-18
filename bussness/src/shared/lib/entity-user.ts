type PopulatedUser = {
  _id?: string;
  name?: string;
  email?: string;
  phone?: string;
  externalRef?: string;
};

export function resolveUser(userId: string | PopulatedUser | undefined | null) {
  if (!userId) return { id: '', name: '—', email: '', phone: '', externalRef: '' };
  if (typeof userId === 'string') {
    return { id: userId, name: userId.slice(-8), email: '', phone: '', externalRef: '' };
  }
  return {
    id: userId._id || '',
    name: userId.name || '—',
    email: userId.email || '',
    phone: userId.phone || '',
    externalRef: userId.externalRef || '',
  };
}
