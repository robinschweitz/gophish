const { defineConfig } = require("@playwright/test")

module.exports = defineConfig({
    testDir: "./specs",
    fullyParallel: false,
    reporter: "list",
    globalSetup: "./global-setup.cjs",
    use: {
        baseURL: "http://127.0.0.1:3334",
        browserName: "chromium",
        headless: true,
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
})
