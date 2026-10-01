import { useCallback, useState } from "react";
import type { EditorContext, RibbonTab } from "../types";

export function useRibbonState() {
  const [activeTab, setActiveTab] = useState<RibbonTab>("edit");
  const [context, setContextState] = useState<EditorContext>(null);
  const [expanded, setExpanded] = useState(false);

  const selectTab = useCallback(
    (tab: RibbonTab) => {
      setExpanded((current) => (tab === activeTab ? !current : true));
      setActiveTab(tab);
    },
    [activeTab]
  );

  const setContext = useCallback((next: EditorContext) => {
    setContextState(next);
    // Word contextual tabs only exist while their object is selected. If the
    // active contextual tab disappears (or changes kind), return to Edit.
    setActiveTab((current) =>
      current === "edit" || current === next ? current : "edit"
    );
  }, []);

  const activateContext = useCallback((next: Exclude<EditorContext, null>) => {
    setContextState(next);
    setActiveTab(next);
    setExpanded(true);
  }, []);

  return {
    activeTab,
    context,
    expanded,
    selectTab,
    setContext,
    activateContext,
    toggle: () => setExpanded((value) => !value),
  };
}
