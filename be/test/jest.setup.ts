import { Logger } from "@nestjs/common";

if (process.env.TEST_LOG_VERBOSE !== "1") {
  Logger.overrideLogger(false);
}
