export const BUFFER_DELAY_MS = 1;
export const MAX_SESSIONS = 50;

export const SENTRY_ENABLED = import.meta.env.VITE_SENTRY_ENABLED === "true";

const buildEndpoint = (path) => {
  if (!SENTRY_ENABLED || !import.meta.env.VITE_APP_SENTRY) {
    return null;
  }
  return `https://bedrock-agentcore.${import.meta.env.VITE_COGNITO_REGION}.amazonaws.com/runtimes/${import.meta.env.VITE_APP_SENTRY}/${path}?qualifier=DEFAULT`;
};

export const API_ENDPOINT = buildEndpoint("invocations");
export const TOOLS_ENDPOINT = buildEndpoint("invocations");
export const SESSION_HISTORY_ENDPOINT = buildEndpoint("invocations");
export const SESSION_PREPARE_ENDPOINT = buildEndpoint("invocations");
export const SESSION_CLEAR_ENDPOINT = buildEndpoint("invocations");
