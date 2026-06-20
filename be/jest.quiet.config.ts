import baseConfig from "./jest.config";

export default {
  ...baseConfig,
  reporters: ["./test/quiet-jest-reporter.cjs"],
};
