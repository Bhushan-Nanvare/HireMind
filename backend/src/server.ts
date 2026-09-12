import dotenv from "dotenv";
dotenv.config({ override: true });

import { createApp } from "./app";
import { loadEnv } from "./shared/env";
import { logger } from "./shared/logger";

// Exits with a list of problems if anything required is missing or malformed
const env = loadEnv();

createApp().listen(env.PORT, () => {
  logger.info("Server started", {
    url: `http://localhost:${env.PORT}`,
    environment: env.NODE_ENV,
    storage: env.STORAGE_DRIVER,
  });
});
