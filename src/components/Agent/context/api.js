import { getAuthToken } from "./utils";
import {
  API_ENDPOINT,
  TOOLS_ENDPOINT,
  SESSION_HISTORY_ENDPOINT,
  SESSION_PREPARE_ENDPOINT,
  SESSION_CLEAR_ENDPOINT,
  SENTRY_ENABLED,
} from "./constants";

const checkSentryEnabled = () => {
  if (!SENTRY_ENABLED) {
    console.warn("Sentry feature is disabled. API call skipped.");
    throw new Error("Sentry feature is not enabled");
  }
};

export const fetchAvailableTools = async (sessionId) => {
  checkSentryEnabled();
  const token = await getAuthToken();

  const response = await fetch(TOOLS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
    },
    body: JSON.stringify({
      input: {
        type: "tools",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch tools: ${response.status}`);
  }

  const data = await response.json();
  return data.available_tools || [];
};

export const prepareSession = async (
  sessionId,
  toolPreferences = null,
  context = null,
  diagramPath = null,
  thinking = 0
) => {
  checkSentryEnabled();
  const token = await getAuthToken();

  const requestBody = {
    input: {
      type: "prepare",
      budget_level: thinking,
    },
  };

  if (toolPreferences) {
    requestBody.input.tool_preferences = toolPreferences;
  }
  if (context) {
    requestBody.input.context = context;
  }
  if (diagramPath) {
    requestBody.input.diagram = diagramPath;
  }

  const response = await fetch(SESSION_PREPARE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Failed to prepare session: ${response.status}`);
  }

  return await response.json();
};

export const clearSessionAPI = async (sessionId) => {
  checkSentryEnabled();
  const token = await getAuthToken();

  const response = await fetch(SESSION_CLEAR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
    },
    body: JSON.stringify({
      input: {
        type: "delete_history",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to clear session: ${response.status}`);
  }

  return await response.json();
};

export const fetchSessionHistory = async (sessionId) => {
  checkSentryEnabled();
  const token = await getAuthToken();

  const response = await fetch(SESSION_HISTORY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
    },
    body: JSON.stringify({
      input: {
        type: "history",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.status}`);
  }

  const data = await response.json();
  return data || [];
};

export const sendMessageAPI = async (
  sessionId,
  userMessage,
  interrupt = false,
  interruptResponse = null
) => {
  checkSentryEnabled();
  let requestBody;

  if (interrupt && interruptResponse) {
    requestBody = {
      input: {
        prompt: interruptResponse,
        type: "resume_interrupt",
      },
    };
  } else {
    requestBody = {
      input: {
        prompt: userMessage,
      },
    };
  }

  const token = await getAuthToken();

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request failed (${response.status}): ${errorText || "Unknown error"}`);
  }

  return response;
};

export const stopAPI = async (sessionId) => {
  checkSentryEnabled();
  const token = await getAuthToken();

  const response = await fetch(SESSION_CLEAR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
    },
    body: JSON.stringify({
      input: {
        type: "stop",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to stop execution: ${response.status}`);
  }

  return await response.json();
};
