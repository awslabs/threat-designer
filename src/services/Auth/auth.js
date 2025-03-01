import { signInWithRedirect } from "@aws-amplify/auth/cognito";
import { getCurrentUser, fetchAuthSession, signOut } from "@aws-amplify/auth";

export const signIn = () => {
  return signInWithRedirect({ provider: "Cognito" });
};

export const logOut = () => {
  return signOut().then(() => {
    return null;
  });
};

export const getUser = async () => {
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
  return fetchAuthSession();
};
