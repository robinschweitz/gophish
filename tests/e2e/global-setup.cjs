const { execFileSync } = require("node:child_process")
const path = require("node:path")
const { startSmtpSink } = require("./smtp-sink.cjs")

const repoRoot = path.resolve(__dirname, "../..")
const containerName = "gophish-e2e-tests"
const imageName = "gophish-e2e-tests"
const initialPassword = "GophishE2EInitial123!"

async function waitForServer() {
    const timeout = Date.now() + 120000
    while (Date.now() < timeout) {
        try {
            const response = await fetch("http://127.0.0.1:3334/login")
            if (response.ok) return
        } catch (_) {
            // The container is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error("Timed out waiting for the isolated GoPhish E2E server")
}

module.exports = async () => {
    const closeSmtpSink = await startSmtpSink()
    try {
        try {
            execFileSync("docker", ["rm", "--force", containerName], { stdio: "ignore" })
        } catch (_) {
            // There is no previous E2E container on a clean run.
        }
        execFileSync("docker", ["build", "--quiet", "--tag", imageName, "."], { cwd: repoRoot, stdio: "inherit" })
        execFileSync("docker", [
            "run", "--detach", "--rm", "--name", containerName,
            "--publish", "127.0.0.1:3334:3333",
            "--publish", "127.0.0.1:8081:8081",
            "--add-host", "host.docker.internal:host-gateway",
            "--env", `GOPHISH_INITIAL_ADMIN_PASSWORD=${initialPassword}`,
            "--entrypoint", "/opt/gophish/gophish",
            imageName,
            "--config=tests/e2e/config.json",
        ], { stdio: "ignore" })
        await waitForServer()
    } catch (error) {
        try {
            execFileSync("docker", ["logs", containerName], { stdio: "inherit" })
            execFileSync("docker", ["stop", containerName], { stdio: "ignore" })
        } catch (_) {
            // The image or container may not have been created.
        }
        await closeSmtpSink()
        throw error
    }

    return async () => {
        try {
            execFileSync("docker", ["stop", containerName], { stdio: "ignore" })
        } catch (_) {
            // The container may already be gone after a startup failure.
        }
        await closeSmtpSink()
    }
}
