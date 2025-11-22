import { createContext, useContext, useState, useCallback } from "react";

const SplitPanelContext = createContext();

export function SplitPanelProvider({ children }) {
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [splitPanelContext, setSplitPanelContext] = useState(null);
  const [trail, setTrail] = useState({});

  const handleHelpButtonClick = useCallback(
    (panelContext, content = null, action = null, metadata = {}) => {
      const newSplitPanelContext = {
        context: panelContext,
        content: content,
        action: action,
        ...metadata, // Spread any additional metadata (like isAttackTree flag)
      };
      const currentContext = panelContext.context || panelContext.props?.context;
  const handleHelpButtonClick = useCallback(
    (panelContext, content = null, action = null, metadata = {}) => {
      const newSplitPanelContext = {
        context: panelContext,
        content: content,
        action: action,
        ...metadata, // Spread any additional metadata (like isAttackTree flag)
      };
      const currentContext = panelContext.context || panelContext.props?.context;

      if (splitPanelOpen) {
        if (currentContext !== panelContext || panelContext.content !== content) {
          setSplitPanelContext(newSplitPanelContext);
          setSplitPanelOpen(true);
        }
      } else {
        setSplitPanelContext(newSplitPanelContext);
        setSplitPanelOpen(true);
      }
    },
    [splitPanelOpen]
  );
      if (splitPanelOpen) {
        if (currentContext !== panelContext || panelContext.content !== content) {
          setSplitPanelContext(newSplitPanelContext);
          setSplitPanelOpen(true);
        }
      } else {
        setSplitPanelContext(newSplitPanelContext);
        setSplitPanelOpen(true);
      }
    },
    [splitPanelOpen]
  );

  return (
    <SplitPanelContext.Provider
      value={{
        splitPanelOpen,
        setSplitPanelOpen,
        splitPanelContext,
        setSplitPanelContext,
        handleHelpButtonClick,
        trail,
        setTrail,
      }}
    >
      {children}
    </SplitPanelContext.Provider>
  );
}

export const useSplitPanel = () => useContext(SplitPanelContext);
