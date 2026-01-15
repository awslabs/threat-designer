import { createContext, useContext, useReducer } from "react";

/**
 * ThreatModelContext - Provides shared state for ThreatModel components
 *
 * This context reduces prop drilling by centralizing state that needs to be
 * shared across multiple components in the ThreatModel hierarchy.
 */
const ThreatModelContext = createContext(null);

// Action types for the reducer
export const THREAT_MODEL_ACTIONS = {
  SET_RESPONSE: "SET_RESPONSE",
  SET_PROCESSING: "SET_PROCESSING",
  SET_RESULTS: "SET_RESULTS",
  SET_STOPPING: "SET_STOPPING",
  SET_READ_ONLY: "SET_READ_ONLY",
  SET_OWNER: "SET_OWNER",
  START_DASHBOARD_TRANSITION: "START_DASHBOARD_TRANSITION",
  FINISH_DASHBOARD_TRANSITION: "FINISH_DASHBOARD_TRANSITION",
  OPEN_MODAL: "OPEN_MODAL",
  CLOSE_MODAL: "CLOSE_MODAL",
  SET_CONFLICT: "SET_CONFLICT",
};

// Initial state for the context
const initialState = {
  response: null,
  isReadOnly: false,
  isOwner: false,
  processing: false,
  results: false,
  stopping: false,
  showDashboard: false,
  isTransitioning: false,
  modals: {
    replay: false,
    delete: false,
    sharing: false,
    conflict: false,
  },
  conflictData: null,
};

/**
 * Reducer function for managing ThreatModel state
 *
 * @param {Object} state - Current state
 * @param {Object} action - Action object with type and payload
 * @returns {Object} New state
 */
function threatModelReducer(state, action) {
  switch (action.type) {
    case THREAT_MODEL_ACTIONS.SET_RESPONSE:
      return { ...state, response: action.payload };

    case THREAT_MODEL_ACTIONS.SET_PROCESSING:
      return { ...state, processing: action.payload, results: !action.payload };

    case THREAT_MODEL_ACTIONS.SET_RESULTS:
      return { ...state, results: action.payload, processing: !action.payload };

    case THREAT_MODEL_ACTIONS.SET_STOPPING:
      return { ...state, stopping: action.payload };

    case THREAT_MODEL_ACTIONS.SET_READ_ONLY:
      return { ...state, isReadOnly: action.payload };

    case THREAT_MODEL_ACTIONS.SET_OWNER:
      return { ...state, isOwner: action.payload };

    case THREAT_MODEL_ACTIONS.START_DASHBOARD_TRANSITION:
      return { ...state, isTransitioning: true };

    case THREAT_MODEL_ACTIONS.FINISH_DASHBOARD_TRANSITION:
      return { ...state, showDashboard: action.payload, isTransitioning: false };

    case THREAT_MODEL_ACTIONS.OPEN_MODAL:
      return {
        ...state,
        modals: { ...state.modals, [action.modal]: true },
      };

    case THREAT_MODEL_ACTIONS.CLOSE_MODAL:
      return {
        ...state,
        modals: { ...state.modals, [action.modal]: false },
        ...(action.modal === "conflict" ? { conflictData: null } : {}),
      };

    case THREAT_MODEL_ACTIONS.SET_CONFLICT:
      return {
        ...state,
        conflictData: action.payload,
        modals: { ...state.modals, conflict: true },
      };

    default:
      return state;
  }
}

/**
 * ThreatModelProvider - Context provider component
 *
 * Wraps the ThreatModel component tree and provides shared state via context.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @param {Object} props.initialData - Optional initial state data
 * @returns {JSX.Element} Provider component
 */
export function ThreatModelProvider({ children, initialData = {} }) {
  const [state, dispatch] = useReducer(threatModelReducer, {
    ...initialState,
    ...initialData,
  });

  return (
    <ThreatModelContext.Provider value={{ state, dispatch }}>
      {children}
    </ThreatModelContext.Provider>
  );
}

/**
 * useThreatModelContext - Hook to access ThreatModel context
 *
 * Must be used within a ThreatModelProvider component.
 *
 * @returns {Object} Context value with state and dispatch
 * @throws {Error} If used outside of ThreatModelProvider
 */
export function useThreatModelContext() {
  const context = useContext(ThreatModelContext);
  if (!context) {
    throw new Error("useThreatModelContext must be used within ThreatModelProvider");
  }
  return context;
}
