import type { Request } from "express";
import { badRequest } from "./errors";

/**
 * Reads a route parameter as a string. Express 5 types params as `string | string[] | undefined`,
 * but every route in this app uses single-segment params.
 */
export function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value === "") {
    throw badRequest(`Missing route parameter "${name}"`);
  }
  return value;
}
