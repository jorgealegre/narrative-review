"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

interface FancyModeContextValue {
  fancy: boolean;
  toggle: () => void;
}

const FancyModeContext = createContext<FancyModeContextValue>({
  fancy: true,
  toggle: () => {},
});

const STORAGE_KEY = "narrative-review:fancy-mode";

export function FancyModeProvider({ children }: { children: ReactNode }) {
  const [fancy, setFancy] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "false") setFancy(false);
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setFancy((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // Prevent hydration mismatch — render children only after reading localStorage
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <FancyModeContext.Provider value={{ fancy, toggle }}>
      {children}
    </FancyModeContext.Provider>
  );
}

export function useFancyMode() {
  return useContext(FancyModeContext);
}
