import { create } from 'zustand';

type AppState = { pendingSos: number; setPendingSos: (n: number) => void };
export const useApp = create<AppState>((set) => ({ pendingSos: 0, setPendingSos: (pendingSos) => set({ pendingSos }) }));
