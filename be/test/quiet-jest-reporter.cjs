class QuietJestReporter {
  onRunComplete(_contexts, results) {
    const failedSuites = results.numFailedTestSuites + results.numRuntimeErrorTestSuites;
    const failedTests = results.numFailedTests;

    if (failedSuites === 0 && failedTests === 0) {
      console.log(
        `PASS ${results.numPassedTests} tests, ${results.numPassedTestSuites} suites`,
      );
      return;
    }

    for (const testResult of results.testResults) {
      if (testResult.failureMessage) {
        console.error(testResult.failureMessage.trim());
        continue;
      }

      for (const assertion of testResult.testResults ?? []) {
        if (assertion.status !== "failed") {
          continue;
        }

        console.error(`${testResult.testFilePath}`);
        console.error(`  ${assertion.fullName}`);
        for (const message of assertion.failureMessages) {
          console.error(message.trim());
        }
      }
    }

    console.error(
      `FAIL ${failedTests} failed tests, ${failedSuites} failed suites`,
    );
  }
}

module.exports = QuietJestReporter;
