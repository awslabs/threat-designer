import { signInWithRedirect } from "@aws-amplify/auth/cognito";
import { getCurrentUser, fetchAuthSession, signOut } from "@aws-amplify/auth";
import { BACKEND_MODE } from "../../config";
import {
  getCredentials,
  clearCredentials,
  hasValidCredentials,
} from "../../../embedded-backend/src/config/credentials.js";

export const signIn = () => {
  return signInWithRedirect({ provider: "Cognito" });
};

export const logOut = () => {
  // In Lightning Mode, clear credentials from memory
  if (BACKEND_MODE === "lightning") {
    clearCredentials();
    return Promise.resolve(null);
  }

  return signOut().then(() => {
    return null;
  });
};

export const getUser = async () => {
  // In Lightning Mode, check if credentials are configured
  if (BACKEND_MODE === "lightning") {
    if (hasValidCredentials()) {
      // Return a mock user object for Lightning Mode
      return {
        username: "lightning-user",
        userId: "lightning-mode",
        given_name: "Lightning",
        family_name: "User",
      };
    }
    return null;
  }

  // Remote Mode - use Amplify Auth
  try {
    const user = await getCurrentUser();
    const session = await fetchAuthSession();

    if (session.tokens) {
      const payload = session.tokens.idToken.payload;
      return {
        ...user,
        given_name: payload.given_name,
        family_name: payload.family_name,
      };
    }

    return user;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
};

export const getSession = () => {
  // In Lightning Mode, return a mock session
  if (BACKEND_MODE === "lightning") {
    const credentials = getCredentials();
    if (credentials) {
      return Promise.resolve({
        tokens: null,
        credentials,
      });
    }
    return Promise.resolve(null);
  }

  return fetchAuthSession();
};
