const readUser = () =>
  typeof window !== "undefined" && window.__E2E_USER__ ? window.__E2E_USER__ : null;

const buildSession = () => {
  const user = readUser();
  return {
    tokens: {
      idToken: {
        toString: () => "e2e-mock-id-token",
        payload: {
          given_name: user?.given_name,
          family_name: user?.family_name,
          email: user?.email ?? `${user?.userId ?? "e2e"}@example.com`,
          sub: user?.userId ?? "e2e-user-1",
        },
      },
      accessToken: { toString: () => "e2e-mock-access-token" },
    },
    credentials: undefined,
    identityId: user?.userId ?? "e2e-user-1",
    userSub: user?.userId ?? "e2e-user-1",
  };
};

export const fetchAuthSession = () => Promise.resolve(buildSession());

export const getCurrentUser = () => {
  const user = readUser();
  if (!user) return Promise.reject(new Error("No signed-in user"));
  return Promise.resolve({
    userId: user.userId,
    username: user.userId,
    signInDetails: { loginId: user.email ?? `${user.userId}@example.com` },
  });
};

export const signOut = () => {
  if (typeof window !== "undefined") window.__E2E_USER__ = null;
  return Promise.resolve();
};

export const signInWithRedirect = () => {
  if (typeof window !== "undefined") {
    window.__E2E_USER__ = window.__E2E_USER__ ?? {
      userId: "e2e-user-1",
      given_name: "Test",
      family_name: "User",
    };
    window.dispatchEvent(new CustomEvent("e2e-auth-change"));
  }
  return Promise.resolve();
};

export const signIn = ({ username }) => {
  if (typeof window !== "undefined") {
    window.__E2E_USER__ = {
      userId: username || "e2e-user-1",
      given_name: "Test",
      family_name: "User",
      email: username?.includes("@") ? username : `${username || "e2e"}@example.com`,
    };
    window.dispatchEvent(new CustomEvent("e2e-auth-change"));
  }
  return Promise.resolve({ isSignedIn: true, nextStep: { signInStep: "DONE" } });
};

export const confirmSignIn = () =>
  Promise.resolve({ isSignedIn: true, nextStep: { signInStep: "DONE" } });

export const resetPassword = () =>
  Promise.resolve({ nextStep: { resetPasswordStep: "CONFIRM_RESET_PASSWORD_WITH_CODE" } });

export const confirmResetPassword = () => Promise.resolve();

// Stubs consumed by aws-amplify/initSingleton when the top-level `aws-amplify`
// module is loaded. These are never called under VITE_E2E_MOCK because we
// skip Amplify.configure(), but the ESM import graph still resolves them.
export const CognitoAWSCredentialsAndIdentityIdProvider = class {};
export const DefaultIdentityIdStore = class {};
export const cognitoCredentialsProvider = { clearCredentials: () => {}, getCredentialsAndIdentityId: () => Promise.resolve(null) };
export const cognitoUserPoolsTokenProvider = { setAuthConfig: () => {}, setKeyValueStorage: () => {}, getTokens: () => Promise.resolve(null) };

export default {
  fetchAuthSession,
  getCurrentUser,
  signOut,
  signInWithRedirect,
  signIn,
  confirmSignIn,
  resetPassword,
  confirmResetPassword,
};
