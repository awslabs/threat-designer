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
      const groups = Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : [];
      return {
        ...user,
        given_name: payload.given_name,
        family_name: payload.family_name,
        groups,
      };
    }

    return user;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
};

export const isInGroup = (user, group) =>
  Array.isArray(user?.groups) && user.groups.includes(group);

export const getSession = () => {
  return fetchAuthSession();
};

export const validateUser = () => {
  return fetchAuthSession({ forceRefresh: true });
};
