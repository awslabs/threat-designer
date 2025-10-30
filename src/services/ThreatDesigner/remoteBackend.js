/**
 * Remote Backend API Implementation
 * Wraps existing HTTP-based API calls to Python backend
 */

import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config.js";

const baseUrl = config.controlPlaneAPI + "/threat-designer";

const instance = axios.create({
  baseURL: baseUrl,
});

instance.interceptors.request.use(async (config) => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens.idToken.toString();
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  } catch (error) {
    return Promise.reject(error);
  }
});

export async function deleteTm(id) {
  const statsPath = `/${id}`;
  return instance.delete(statsPath);
}

export async function startThreatModeling(
  key = null,
  iteration = null,
  reasoning = false,
  title = null,
  description = null,
  assumptions = null,
  replay = false,
  id = null,
  instructions = null
) {
  const statsPath = "";
  const postData = {
    s3_location: key,
    iteration,
    title,
    description,
    assumptions,
    replay,
    id,
    reasoning,
    instructions,
  };
  return instance.post(statsPath, postData);
}

export async function updateTm(id, payload) {
  const statsPath = `/${id}`;
  return instance.put(statsPath, payload);
}

export async function restoreTm(id) {
  const statsPath = `/restore/${id}`;
  return instance.put(statsPath);
}

export async function generateUrl(fileType) {
  const statsPath = "/upload";
  const postData = {
    file_type: fileType,
  };
  return instance.post(statsPath, postData);
}

export async function getDownloadUrl(fileName) {
  const downloadPath = "/download";
  const postData = {
    s3_location: fileName,
  };
  try {
    const response = await instance.post(downloadPath, postData);
    const presignedUrl = response.data;

    const fileResponse = await axios.get(presignedUrl, {
      responseType: "blob",
    });

    return fileResponse.data;
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function getThreatModelingStatus(id) {
  const statsPath = `/status/${id}`;
  return instance.get(statsPath);
}

export async function getThreatModelingTrail(id) {
  const statsPath = `/trail/${id}`;
  return instance.get(statsPath);
}

export async function getThreatModelingResults(id) {
  const statsPath = `/${id}`;
  return instance.get(statsPath);
}

export async function getThreatModelingAllResults() {
  const statsPath = `/all`;
  return instance.get(statsPath);
}
