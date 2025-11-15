/**
 * API Adapter Layer
 * Provides unified interface for both Remote Backend and Lightning Mode
 * Routes calls to appropriate backend based on build-time configuration
 */

import { BACKEND_MODE } from "../../config.js";

// Lazy load backend implementation
let backendPromise = null;

function getBackend() {
  if (!backendPromise) {
    if (BACKEND_MODE === "lightning") {
      // Import embedded backend for Lightning Mode
      backendPromise = import("./embeddedBackend.js");
    } else {
      // Import remote backend for Remote Backend Mode (default)
      backendPromise = import("./remoteBackend.js");
    }
  }
  return backendPromise;
}

// Export unified interface - all functions maintain identical signatures
export async function startThreatModeling(...args) {
  const backend = await getBackend();
  return backend.startThreatModeling(...args);
}

export async function updateTm(...args) {
  const backend = await getBackend();
  return backend.updateTm(...args);
}

export async function restoreTm(...args) {
  const backend = await getBackend();
  return backend.restoreTm(...args);
}

export async function generateUrl(...args) {
  const backend = await getBackend();
  return backend.generateUrl(...args);
}

export async function getDownloadUrl(...args) {
  const backend = await getBackend();
  return backend.getDownloadUrl(...args);
}

export async function getThreatModelingStatus(...args) {
  const backend = await getBackend();
  return backend.getThreatModelingStatus(...args);
}

export async function getThreatModelingTrail(...args) {
  const backend = await getBackend();
  return backend.getThreatModelingTrail(...args);
}

export async function getThreatModelingResults(...args) {
  const backend = await getBackend();
  return backend.getThreatModelingResults(...args);
}

export async function getThreatModelingAllResults(...args) {
  const backend = await getBackend();
  return backend.getThreatModelingAllResults(...args);
}

export async function deleteTm(...args) {
  const backend = await getBackend();
  return backend.deleteTm(...args);
}
