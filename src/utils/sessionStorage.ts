// src/utils/sessionStorage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, TimelineEntry } from '../types';

export type { Session, TimelineEntry } from '../types';

const SESSIONS_KEY = '@edgeways:sessions';

export async function loadSessions(): Promise<Session[]> {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Session[];
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export async function createSession(name: string): Promise<Session> {
  const sessions = await loadSessions();
  const session: Session = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    createdAt: Date.now(),
    recordedTimeSec: 0,
    voiceProfiles: [],
    timeline: [],
  };
  sessions.push(session);
  await saveSessions(sessions);
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sessions = await loadSessions();
  const filtered = sessions.filter(s => s.id !== sessionId);
  await saveSessions(filtered);
}

export async function updateSession(updated: Session): Promise<void> {
  const sessions = await loadSessions();
  const idx = sessions.findIndex(s => s.id === updated.id);
  if (idx === -1) {
    sessions.push(updated);
  } else {
    sessions[idx] = updated;
  }
  await saveSessions(sessions);
}

/**
 * NOTE: Timeline tracking is a placeholder for future conversation tracking.
 * A timeline entry might include which profile spoke and when.
 */
export async function addTimelineEntry(
  sessionId: string,
  entry: TimelineEntry,
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  const updated = {
    ...session,
    timeline: [...session.timeline, entry],
  };
  await updateSession(updated);
}

export async function getSession(id: string): Promise<Session | null> {
  const sessions = await loadSessions();
  return sessions.find(s => s.id === id) || null;
}
