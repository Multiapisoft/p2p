import { create } from 'zustand';

import { persist } from 'zustand/middleware';

import type { AuthUser } from '@/shared/types/api.types';



interface AuthState {

  token: string | null;

  user: AuthUser | null;

  pendingApiKey: string | null;

  pendingApiSecret: string | null;

  pendingInternalSecret: string | null;

  setAuth: (token: string, user: AuthUser) => void;

  setPendingApiCredentials: (

    apiKey: string | null,

    apiSecret: string | null,

    internalSecret?: string | null,

  ) => void;

  setPendingApiSecret: (secret: string | null) => void;

  logout: () => void;

  isAuthenticated: () => boolean;

  isBusiness: () => boolean;

}



export const useAuthStore = create<AuthState>()(

  persist(

    (set, get) => ({

      token: null,

      user: null,

      pendingApiKey: null,

      pendingApiSecret: null,

      pendingInternalSecret: null,

      setAuth: (token, user) => set({ token, user }),

      setPendingApiCredentials: (apiKey, apiSecret, internalSecret = null) =>

        set({ pendingApiKey: apiKey, pendingApiSecret: apiSecret, pendingInternalSecret: internalSecret }),

      setPendingApiSecret: (secret) => set({ pendingApiSecret: secret }),

      logout: () =>

        set({

          token: null,

          user: null,

          pendingApiKey: null,

          pendingApiSecret: null,

          pendingInternalSecret: null,

        }),

      isAuthenticated: () => !!get().token,

      isBusiness: () => get().user?.role === 'business',

    }),

    { name: 'finguard-business-auth' },

  ),

);

