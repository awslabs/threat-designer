import axios from "axios";
import { config } from "../config";
import { validateUser } from "./Auth/auth";

/**
 * Generic function to make API calls and handle errors consistently.
 *
 * @param {string} method - The HTTP method (e.g., 'get', 'post').
 * @param {string} endpoint - The API endpoint.
 * @param {Object} [payload] - The request payload for methods like 'post'.
 * @param {Object} [axiosOptions] - Additional options for the Axios request.
 * @returns {Promise} - The result of the Axios call.
 */
export async function makeApiCall(
  method,
  endpoint,
  payload = {},
  axiosOptions = {},
  signal = null
) {
  const url = config.controlPlaneAPI + endpoint;
  const defaultOptions = {
    ...axiosOptions,
    ...(signal && { signal }),
  };

  try {
    switch (method.toLowerCase()) {
      case "get":
        return await axios.get(url, defaultOptions);
      case "post":
        return await axios.post(url, payload, defaultOptions);
      case "put":
        return await axios.put(url, payload, defaultOptions);
      case "delete":
        return await axios.delete(url, defaultOptions);
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  } catch (err) {
    if (axios.isCancel(err)) {
      throw err;
    }
    await validateUser();
    throw err;
  }
}
