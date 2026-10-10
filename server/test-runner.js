/**
 * HeritageVerse Test Runner
 * Starts server, executes test-suite.js, and exits with code 0 on success.
 */

const { fork } = require("child_process");
const path = require("path");

const serverProcess = fork(path.join(__dirname, "index.js"), {
  stdio: "inherit",
});

setTimeout(() => {
  const testProcess = fork(path.join(__dirname, "test-suite.js"), {
    stdio: "inherit",
  });

  testProcess.on("exit", (code) => {
    serverProcess.kill("SIGTERM");
    process.exit(code);
  });
}, 1500);
