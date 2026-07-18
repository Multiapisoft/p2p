'use client';

import { create } from 'zustand';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'secondary';
};

type ConfirmState = {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  close: (result: boolean) => void;
};

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      // Close any prior pending confirm as cancelled
      const prev = get().resolve;
      if (prev) prev(false);
      set({ open: true, options, resolve });
    }),
  close: (result) => {
    const { resolve } = get();
    resolve?.(result);
    set({ open: false, options: null, resolve: null });
  },
}));

export function confirmDialog(options: ConfirmOptions) {
  return useConfirmStore.getState().ask(options);
}
