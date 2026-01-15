import { useReducer, useCallback } from "react";

const STORAGE_KEYS = {
  THINKING_ENABLED: "thinkingEnabled",
  THINKING_BUDGET: "thinkingBudget",
  TOOLS_CONFIG: "toolsConfig",
};

const initialState = {
  budget: localStorage.getItem(STORAGE_KEYS.THINKING_BUDGET) || "1",
  thinkingEnabled: localStorage.getItem(STORAGE_KEYS.THINKING_ENABLED) !== "false",
  toolItems: [],
  toolsInitialized: false,
  isFirstMountComplete: false,
};

function agentReducer(state, action) {
  switch (action.type) {
    case "SET_BUDGET":
      localStorage.setItem(STORAGE_KEYS.THINKING_BUDGET, action.payload);
      return { ...state, budget: action.payload };
    case "SET_THINKING_ENABLED":
      localStorage.setItem(STORAGE_KEYS.THINKING_ENABLED, String(action.payload));
      return { ...state, thinkingEnabled: action.payload };
    case "SET_TOOL_ITEMS":
      return { ...state, toolItems: action.payload, toolsInitialized: true };
    case "SET_FIRST_MOUNT_COMPLETE":
      return { ...state, isFirstMountComplete: true };
    default:
      return state;
  }
}

export function useAgentState() {
  const [state, dispatch] = useReducer(agentReducer, initialState);

  const setBudget = useCallback((budget) => {
    dispatch({ type: "SET_BUDGET", payload: budget });
    if (budget !== "0") {
      dispatch({ type: "SET_THINKING_ENABLED", payload: true });
    }
  }, []);

  const setThinkingEnabled = useCallback((enabled) => {
    dispatch({ type: "SET_THINKING_ENABLED", payload: enabled });
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
    setThinkingEnabled,
    setToolItems,
    setFirstMountComplete,
    dispatch,
  };
}
