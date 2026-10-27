import { create } from 'zustand';
export type Destination = { lat: number; lng: number; label: string };
type TripDraft = { destination: Destination | null; setDestination: (d: Destination | null) => void };
export const useTripDraft = create<TripDraft>((set) => ({ destination: null, setDestination: (destination) => set({ destination }) }));
