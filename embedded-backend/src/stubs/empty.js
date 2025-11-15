// stubs/empty.js
// Stub credential provider that does nothing
const emptyProvider = () => async () => {
  throw new Error(
    "Credential provider not available in browser. Please pass credentials directly."
  );
};

export const defaultProvider = emptyProvider;
export const fromEnv = emptyProvider;
export const fromIni = emptyProvider;
export const fromProcess = emptyProvider;
export const fromSSO = emptyProvider;
export const fromTokenFile = emptyProvider;
export const fromWebToken = emptyProvider;
export const fromCognitoIdentity = emptyProvider;
export const fromTemporaryCredentials = emptyProvider;
export const fromInstanceMetadata = emptyProvider;
export const fromContainerMetadata = emptyProvider;

export default {
  defaultProvider,
  fromEnv,
  fromIni,
  fromProcess,
  fromSSO,
  fromTokenFile,
  fromWebToken,
  fromCognitoIdentity,
  fromTemporaryCredentials,
  fromInstanceMetadata,
  fromContainerMetadata,
};
