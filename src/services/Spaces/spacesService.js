import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config.js";

const BASE = "/spaces";

const instance = axios.create({
  baseURL: config.controlPlaneAPI,
});

instance.interceptors.request.use(async (axiosConfig) => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error("No authentication token available");
  axiosConfig.headers.Authorization = `Bearer ${token}`;
  return axiosConfig;
});

export async function listSpaces() {
  const res = await instance.get(BASE);
  return res.data.spaces;
}

export async function getSpace(spaceId) {
  const res = await instance.get(`${BASE}/${spaceId}`);
  return res.data;
}

export async function createSpace(name, description = "") {
  const res = await instance.post(BASE, { name, description });
  return res.data;
}

export async function updateSpace(spaceId, { name, description }) {
  const res = await instance.put(`${BASE}/${spaceId}`, { name, description });
  return res.data;
}

export async function deleteSpace(spaceId) {
  await instance.delete(`${BASE}/${spaceId}`);
}

export async function listDocuments(spaceId) {
  const res = await instance.get(`${BASE}/${spaceId}/documents`);
  return res.data.documents;
}

export async function uploadDocument(spaceId, file) {
  // Step 1: Request presigned URL
  const urlRes = await instance.post(`${BASE}/${spaceId}/documents/upload`, {
    filename: file.name,
    file_type: file.type || "application/octet-stream",
  });
  const { document_id, presigned_url, s3_key } = urlRes.data;

  // Step 2: Upload directly to S3
  await fetch(presigned_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });

  // Step 3: Confirm upload
  const confirmRes = await instance.post(`${BASE}/${spaceId}/documents/confirm`, {
    document_id,
    s3_key,
    filename: file.name,
  });
  return confirmRes.data;
}

export async function deleteDocument(spaceId, documentId) {
  await instance.delete(`${BASE}/${spaceId}/documents/${documentId}`);
}

export async function getSpaceSharing(spaceId) {
  const res = await instance.get(`${BASE}/${spaceId}/sharing`);
  return res.data.collaborators;
}

export async function shareSpace(spaceId, userIds) {
  const res = await instance.post(`${BASE}/${spaceId}/share`, { user_ids: userIds });
  return res.data.shared;
}

export async function removeSpaceSharing(spaceId, targetUserId) {
  await instance.delete(`${BASE}/${spaceId}/sharing/${targetUserId}`);
}
