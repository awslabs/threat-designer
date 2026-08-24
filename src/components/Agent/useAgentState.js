import { useReducer, useCallback } from "react";

const STORAGE_KEYS = {
  THINKING_BUDGET: "thinkingBudget",
  TOOLS_CONFIG: "toolsConfig",
};

// Effort levels run 1-4; there is no "off" level. A persisted "0" from an
// earlier version (when thinking could be disabled) falls back to the minimum.
const VALID_BUDGETS = ["1", "2", "3", "4"];

const readStoredBudget = () => {
  const stored = localStorage.getItem(STORAGE_KEYS.THINKING_BUDGET);
  return VALID_BUDGETS.includes(stored) ? stored : "1";
};

const createInitialState = () => ({
  budget: readStoredBudget(),
  toolItems: [],
  toolsInitialized: false,
  isFirstMountComplete: false,
});

function agentReducer(state, action) {
  switch (action.type) {
    case "SET_BUDGET":
      localStorage.setItem(STORAGE_KEYS.THINKING_BUDGET, action.payload);
      return { ...state, budget: action.payload };
    case "SET_TOOL_ITEMS":
      return { ...state, toolItems: action.payload, toolsInitialized: true };
    case "SET_FIRST_MOUNT_COMPLETE":
      return { ...state, isFirstMountComplete: true };
    default:
      return state;
  }
}

export function useAgentState() {
  const [state, dispatch] = useReducer(agentReducer, undefined, createInitialState);

  const setBudget = useCallback((budget) => {
    dispatch({ type: "SET_BUDGET", payload: budget });
  }, []);

  const setToolItems = useCallback((items) => {
    dispatch({ type: "SET_TOOL_ITEMS", payload: items });
    const config = {};
    items.forEach((item) => {
      config[item.id] = item.enabled;
    });
    localStorage.setItem(STORAGE_KEYS.TOOLS_CONFIG, JSON.stringify(config));
  }, []);

  const setFirstMountComplete = useCallback(() => {
    dispatch({ type: "SET_FIRST_MOUNT_COMPLETE" });
  }, []);

  return {
    state,
    setBudget,
    setToolItems,
    setFirstMountComplete,
    dispatch,
  };
}
