import axios from "axios";

const inferredBackendUrl = typeof window === "undefined"
  ? "http://localhost:8000"
  : window.location.port === "3000"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin;
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || inferredBackendUrl;
const BASE_URL = `${BACKEND_URL}/api/ranking`;

const get = async (path) => (await axios.get(`${BASE_URL}${path}`)).data;

export const rankingApi = {
  getRanking: () => get(""),
  getStatus: () => get("/status"),
  getPrescreens: () => get("/prescreens"),
  getSettings: () => get("/settings"),
  getPermissions: () => get("/permissions"),
  process: async (payload) =>
    (await axios.post(`${BASE_URL}/process`, payload, { timeout: 900_000 })).data,
  overridePrescreen: async ({ ideaId, ...payload }) =>
    (await axios.post(`${BASE_URL}/prescreens/${encodeURIComponent(ideaId)}/override`, payload)).data,
  reevaluate: async ({ ideaId, comment }) =>
    (await axios.post(`${BASE_URL}/ideas/${encodeURIComponent(ideaId)}/reevaluate`, { comment })).data,
  saveOrder: async (payload) => (await axios.put(`${BASE_URL}/order`, payload)).data,
  saveSettings: async (payload) => (await axios.put(`${BASE_URL}/settings`, payload)).data,
  resetSettings: async (payload) => (await axios.post(`${BASE_URL}/settings/reset`, payload)).data,
  resetOrder: async (payload) => (await axios.post(`${BASE_URL}/order/reset`, payload)).data,
  resetAll: async (payload) =>
    (await axios.post(`${BASE_URL}/reset-all`, payload, { timeout: 120_000 })).data,
  rescoreAll: async (payload) =>
    (await axios.post(`${BASE_URL}/rescore-all`, payload, { timeout: 120_000 })).data,
  fullReevaluate: async (payload) =>
    (await axios.post(`${BASE_URL}/reevaluation/process`, payload, { timeout: 900_000 })).data,
};
