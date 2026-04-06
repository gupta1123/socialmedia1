"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type TopbarMeta = {
  backHref?: string;
  backLabel?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
};

type TopbarActionsContextType = {
  actions: React.ReactNode;
  setActions: (node: React.ReactNode) => void;
  controls: React.ReactNode;
  setControls: (node: React.ReactNode) => void;
  meta: TopbarMeta | null;
  setMeta: (meta: TopbarMeta | null) => void;
};

const TopbarActionsContext = createContext<TopbarActionsContextType>({
  actions: null,
  setActions: () => {},
  controls: null,
  setControls: () => {},
  meta: null,
  setMeta: () => {}
});

export function TopbarActionsProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = useState<React.ReactNode>(null);
  const [controls, setControls] = useState<React.ReactNode>(null);
  const [meta, setMeta] = useState<TopbarMeta | null>(null);
  return (
    <TopbarActionsContext.Provider value={{ actions, setActions, controls, setControls, meta, setMeta }}>
      {children}
    </TopbarActionsContext.Provider>
  );
}

export function useTopbarActions() {
  return useContext(TopbarActionsContext);
}

/**
 * Hook for pages to register their own topbar action buttons.
 * Clears on unmount so no stale buttons bleed across pages.
 */
export function useRegisterTopbarActions(node: React.ReactNode) {
  const { setActions } = useTopbarActions();
  useEffect(() => {
    setActions(node);
  }, [node, setActions]);

  useEffect(() => {
    return () => setActions(null);
  }, [setActions]);
}

export function useRegisterTopbarControls(node: React.ReactNode) {
  const { setControls } = useTopbarActions();

  useEffect(() => {
    setControls(node);
  }, [node, setControls]);

  useEffect(() => {
    return () => setControls(null);
  }, [setControls]);
}

export function useRegisterTopbarMeta(meta: TopbarMeta | null) {
  const { setMeta } = useTopbarActions();

  useEffect(() => {
    setMeta(meta);
  }, [meta, setMeta]);

  useEffect(() => {
    return () => setMeta(null);
  }, [setMeta]);
}
