import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config.js";

/**
 * Build a spaces-style service bound to a base route.
 *
 * The governance system-space API is the same shape as the user-space API,
 * just under /governance/spaces with a governance-group-gated authorizer, so a
 * single implementation serves both. Governance has no single-space GET and no
 * sharing endpoints; those methods are still exported here but simply unused by
 * the governance caller (the parametrized components never invoke them).
 */
export function makeSpacesService(base) {
  const instance = axios.create({ baseURL: config.controlPlaneAPI });

  instance.interceptors.request.use(async (axiosConfig) => {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) throw new Error("No authentication token available");
    axiosConfig.headers.Authorization = `Bearer ${token}`;
    return axiosConfig;
  });

  return {
    async listSpaces() {
      const res = await instance.get(base);
      return res.data.spaces;
    },
    async getSpace(spaceId) {
      const res = await instance.get(`${base}/${spaceId}`);
      return res.data;
    },
    async createSpace(name, description = "") {
      const res = await instance.post(base, { name, description });
      return res.data;
    },
    async updateSpace(spaceId, { name, description }) {
      const res = await instance.put(`${base}/${spaceId}`, { name, description });
      return res.data;
    },
    async deleteSpace(spaceId) {
      await instance.delete(`${base}/${spaceId}`);
    },
    async listDocuments(spaceId) {
      const res = await instance.get(`${base}/${spaceId}/documents`);
      return res.data.documents;
    },
    async uploadDocument(spaceId, file) {
      const urlRes = await instance.post(`${base}/${spaceId}/documents/upload`, {
        filename: file.name,
        file_type: file.type || "application/octet-stream",
      });
      const { document_id, presigned_url, s3_key } = urlRes.data;

      await fetch(presigned_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      const confirmRes = await instance.post(`${base}/${spaceId}/documents/confirm`, {
        document_id,
        s3_key,
        filename: file.name,
      });
      return confirmRes.data;
    },
    async deleteDocument(spaceId, documentId) {
      await instance.delete(`${base}/${spaceId}/documents/${documentId}`);
    },
    async getSpaceSharing(spaceId) {
      const res = await instance.get(`${base}/${spaceId}/sharing`);
      return res.data.collaborators;
    },
    async shareSpace(spaceId, userIds) {
      const res = await instance.post(`${base}/${spaceId}/share`, { user_ids: userIds });
      return res.data.shared;
    },
    async removeSpaceSharing(spaceId, targetUserId) {
      await instance.delete(`${base}/${spaceId}/sharing/${targetUserId}`);
    },
  };
}
