import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

type AppState = {
  session: Session | null; ready: boolean; activeSessionId: string | null; pendingSos: number;
  setSession: (s: Session | null) => void; setActive: (id: string | null) => void; setPendingSos: (n: number) => void;
};
export const useApp = create<AppState>((set) => ({
  session: null, ready: false, activeSessionId: null, pendingSos: 0,
  setSession: (session) => set({ session, ready: true }),
  setActive: (activeSessionId) => set({ activeSessionId }),
  setPendingSos: (pendingSos) => set({ pendingSos }),
}));
