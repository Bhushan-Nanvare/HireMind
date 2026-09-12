import { isAxiosError } from "axios";
import api from "./axiosClient";

/** Downloads a file that requires the user's token. */
export async function getBlob(url: string): Promise<Blob> {
  try {
    const res = await api.get<Blob>(url, { responseType: "blob" });
    return res.data;
  } catch (err) {
    // With responseType "blob" the JSON error body also arrives as a Blob, so unpack its message
    const message = isAxiosError(err) ? await readErrorBlob(err.response?.data) : null;
    throw message ? new Error(message) : err;
  }
}

async function readErrorBlob(data: unknown): Promise<string | null> {
  if (!(data instanceof Blob)) return null;
  try {
    const parsed = JSON.parse(await data.text());
    return typeof parsed?.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}
