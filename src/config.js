import "@aws-amplify/ui-react/styles.css";

// Backend mode configuration (build-time decision)
export const BACKEND_MODE = import.meta.env.VITE_BACKEND_MODE || "remote";

// Base path configuration for GitHub Pages deployment
export const BASE_PATH = import.meta.env.VITE_MODE === "production" ? "/threat-designer" : "";

// Feature flags - exported for direct use
export const SENTRY_ENABLED = import.meta.env.VITE_SENTRY_ENABLED === "true";
export const THREAT_CATALOG_ENABLED = import.meta.env.VITE_THREAT_CATALOG_ENABLED !== "false";

let config = {
  controlPlaneAPI: import.meta.env.VITE_APP_ENDPOINT,
  sentryEnabled: SENTRY_ENABLED,
  sentryArn: import.meta.env.VITE_APP_SENTRY || "",
  threatCatalogEnabled: THREAT_CATALOG_ENABLED,
};

const amplifyConfig = {
  Auth: {
    Cognito: {
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN,
          scopes: ["email", "openid", "profile"],
          redirectSignIn: ["http://localhost:5173", import.meta.env.VITE_REDIRECT_SIGN_IN],
          redirectSignOut: ["http://localhost:5173", import.meta.env.VITE_REDIRECT_SIGN_OUT],
          responseType: "code",
        },
      },
      region: import.meta.env.VITE_COGNITO_REGION,
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_APP_CLIENT_ID,
    },
  },
};
export const isSentryEnabled = () => config.sentryEnabled;
export const isThreatCatalogEnabled = () => config.threatCatalogEnabled;

export { config, amplifyConfig };
