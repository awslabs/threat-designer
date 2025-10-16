export const BUFFER_DELAY_MS = 1;
export const MAX_SESSIONS = 50;

export const API_ENDPOINT = `https://bedrock-agentcore.${import.meta.env.VITE_COGNITO_REGION}.amazonaws.com/runtimes/${import.meta.env.VITE_APP_SENTRY}/invocations?qualifier=DEFAULT`;
export const TOOLS_ENDPOINT = `https://bedrock-agentcore.${import.meta.env.VITE_COGNITO_REGION}.amazonaws.com/runtimes/${import.meta.env.VITE_APP_SENTRY}/invocations?qualifier=DEFAULT`;
export const SESSION_HISTORY_ENDPOINT = `https://bedrock-agentcore.${import.meta.env.VITE_COGNITO_REGION}.amazonaws.com/runtimes/${import.meta.env.VITE_APP_SENTRY}/invocations?qualifier=DEFAULT`;
export const SESSION_PREPARE_ENDPOINT = `https://bedrock-agentcore.${import.meta.env.VITE_COGNITO_REGION}.amazonaws.com/runtimes/${import.meta.env.VITE_APP_SENTRY}/invocations?qualifier=DEFAULT`;
export const SESSION_CLEAR_ENDPOINT = `https://bedrock-agentcore.${import.meta.env.VITE_COGNITO_REGION}.amazonaws.com/runtimes/${import.meta.env.VITE_APP_SENTRY}/invocations?qualifier=DEFAULT`;
