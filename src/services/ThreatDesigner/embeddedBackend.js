/**
 * Embedded Backend API Implementation
 * Conditionally imports from embedded-backend for Lightning Mode
 * In Remote Mode, this module is not used (apiAdapter.js routes to remoteBackend.js)
 */

import { BACKEND_MODE } from "../../config";

// Lazy load embedded backend module
let embeddedBackendPromise = null;

function getEmbeddedBackend() {
  if (BACKEND_MODE !== "lightning") {
    throw new Error("Embedded backend is only available in Lightning Mode");
  }

  if (!embeddedBackendPromise) {
    embeddedBackendPromise = import("../../../embedded-backend/src/index.js");
  }

  return embeddedBackendPromise;
}

// Wrapper functions that lazy load the embedded backend
export async function startThreatModeling(...args) {
  const backend = await getEmbeddedBackend();
  return backend.startThreatModeling(...args);
}

export async function updateTm(...args) {
  const backend = await getEmbeddedBackend();
  return backend.updateTm(...args);
}

export async function restoreTm(...args) {
  const backend = await getEmbeddedBackend();
  return backend.restoreTm(...args);
}

export async function generateUrl(...args) {
  const backend = await getEmbeddedBackend();
  return backend.generateUrl(...args);
}

export async function getDownloadUrl(...args) {
  const backend = await getEmbeddedBackend();
  return backend.getDownloadUrl(...args);
}

export async function getThreatModelingStatus(...args) {
  const backend = await getEmbeddedBackend();
  return backend.getThreatModelingStatus(...args);
}

export async function getThreatModelingTrail(...args) {
  const backend = await getEmbeddedBackend();
  return backend.getThreatModelingTrail(...args);
}

export async function getThreatModelingResults(...args) {
  const backend = await getEmbeddedBackend();
  return backend.getThreatModelingResults(...args);
}

export async function getThreatModelingAllResults(...args) {
  const backend = await getEmbeddedBackend();
  return backend.getThreatModelingAllResults(...args);
}

export async function deleteTm(...args) {
  const backend = await getEmbeddedBackend();
  return backend.deleteTm(...args);
}

export async function interruptJob(...args) {
  const backend = await getEmbeddedBackend();
  return backend.interruptJob(...args);
}

export async function getStateManager() {
  const backend = await getEmbeddedBackend();
  return backend.stateManager;
}
