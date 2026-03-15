import React, { createContext, useContext, useMemo, useState } from 'react';

type ScrollLockContextValue = {
  scrollEnabled: boolean;
  setScrollEnabled: (enabled: boolean) => void;
};

const ScrollLockContext = createContext<ScrollLockContextValue | null>(null);

export function ScrollLockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const value = useMemo(
    () => ({ scrollEnabled, setScrollEnabled }),
    [scrollEnabled],
  );

  return (
    <ScrollLockContext.Provider value={value}>
      {children}
    </ScrollLockContext.Provider>
  );
}

export function useScrollLock() {
  const ctx = useContext(ScrollLockContext);
  if (!ctx) {
    throw new Error('useScrollLock must be used within ScrollLockProvider');
  }
  return ctx;
}
