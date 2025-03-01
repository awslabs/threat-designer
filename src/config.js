import "@aws-amplify/ui-react/styles.css"; // Don't forget to import the styles

let config = {
  controlPlaneAPI: import.meta.env.VITE_APP_ENDPOINT,
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
export { config, amplifyConfig };
