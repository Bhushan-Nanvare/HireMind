import request from "supertest";
import { createApp } from "../../src/app";

/** The API under test. Rate limits are disabled while NODE_ENV is "test" (see shared/rateLimits.ts). */
export const api = request(createApp());

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
