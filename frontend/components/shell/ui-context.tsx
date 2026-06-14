"use client";
import * as React from "react";

interface UIContextValue {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  copilotOpen: boolean;
  setCopilotOpen: (v: boolean) => void;
  copilotPrompt: string | null;
  /** Open the copilot panel, optionally pre-filling a question. */
  askCopilot: (prompt?: string) => void;
  consumePrompt: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const UIContext = React.createContext<UIContextValue | null>(null);

export function useUI() {
  const ctx = React.useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [copilotOpen, setCopilotOpen] = React.useState(false);
  const [copilotPrompt, setCopilotPrompt] = React.useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  const askCopilot = React.useCallback((prompt?: string) => {
    if (prompt) setCopilotPrompt(prompt);
    setCopilotOpen(true);
  }, []);

  const consumePrompt = React.useCallback(() => setCopilotPrompt(null), []);
  const toggleSidebar = React.useCallback(() => setSidebarCollapsed((v) => !v), []);

  // Global keyboard shortcuts: ⌘K / Ctrl+K → command palette, ⌘J → copilot
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setCopilotOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <UIContext.Provider
      value={{
        commandOpen,
        setCommandOpen,
        copilotOpen,
        setCopilotOpen,
        copilotPrompt,
        askCopilot,
        consumePrompt,
        sidebarCollapsed,
        toggleSidebar,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}
