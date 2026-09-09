import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config.js";

const BASE = "/governance/spaces";

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

export async function listSystemSpaces() {
  const res = await instance.get(BASE);
  return res.data.spaces;
}

export async function createSystemSpace(name, description = "") {
  const res = await instance.post(BASE, { name, description });
  return res.data;
}

export async function updateSystemSpace(spaceId, { name, description }) {
  const res = await instance.put(`${BASE}/${spaceId}`, { name, description });
  return res.data;
}

export async function deleteSystemSpace(spaceId) {
  await instance.delete(`${BASE}/${spaceId}`);
}

export async function listSystemDocuments(spaceId) {
  const res = await instance.get(`${BASE}/${spaceId}/documents`);
  return res.data.documents;
}

export async function uploadSystemDocument(spaceId, file) {
  const urlRes = await instance.post(`${BASE}/${spaceId}/documents/upload`, {
    filename: file.name,
    file_type: file.type || "application/octet-stream",
  });
  const { document_id, presigned_url, s3_key } = urlRes.data;

  await fetch(presigned_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });

  const confirmRes = await instance.post(`${BASE}/${spaceId}/documents/confirm`, {
    document_id,
    s3_key,
    filename: file.name,
  });
  return confirmRes.data;
}

export async function deleteSystemDocument(spaceId, documentId) {
  await instance.delete(`${BASE}/${spaceId}/documents/${documentId}`);
}
