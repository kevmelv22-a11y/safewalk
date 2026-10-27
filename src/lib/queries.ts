import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export const useProfile = () => useQuery(api.profiles.me);
export const useContacts = () => useQuery(api.contacts.list);
export const useSessions = () => useQuery(api.sessions.overview);
