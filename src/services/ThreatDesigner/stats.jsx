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

async function deleteTm(id) {
  const statsPath = `/${id}`;
  return instance.delete(statsPath);
}

async function stopTm(id, sessionId) {
  const statsPath = `/${id}/session/${sessionId}`;
  return instance.delete(statsPath);
}

async function startThreatModeling(
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

async function updateTm(id, payload, clientTimestamp = null) {
  const statsPath = `/${id}`;
  const requestPayload = { ...payload };

  // Add client timestamp for conflict detection
  if (clientTimestamp) {
    requestPayload.client_last_modified_at = clientTimestamp;
  }

  return instance.put(statsPath, requestPayload);
}

async function restoreTm(id) {
  const statsPath = `/restore/${id}`;
  return instance.put(statsPath);
}

async function generateUrl(fileType) {
  const statsPath = "/upload";
  const postData = {
    file_type: fileType,
  };
  return instance.post(statsPath, postData);
}

async function getDownloadUrl(fileName) {
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

async function getThreatModelingStatus(id) {
  const statsPath = `/status/${id}`;
  return instance.get(statsPath);
}

async function getThreatModelingTrail(id) {
  const statsPath = `/trail/${id}`;
  return instance.get(statsPath);
}

async function getThreatModelingResults(id) {
  const statsPath = `/${id}`;
  return instance.get(statsPath);
}

async function getThreatModelingAllResults(limit = null, cursor = null, filter = null) {
  const params = new URLSearchParams();

  if (limit !== null) {
    params.append("limit", limit);
  }
  if (cursor !== null) {
    params.append("cursor", cursor);
  }
  if (filter !== null) {
    params.append("filter", filter);
  }

  const queryString = params.toString();
  const statsPath = queryString ? `/all?${queryString}` : `/all`;

  return instance.get(statsPath);
}

export {
  getThreatModelingStatus,
  getThreatModelingResults,
  startThreatModeling,
  generateUrl,
  updateTm,
  getDownloadUrl,
  deleteTm,
  getThreatModelingAllResults,
  getThreatModelingTrail,
  restoreTm,
  stopTm,
};
