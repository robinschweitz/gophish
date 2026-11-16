const { test, expect } = require("@playwright/test")

async function apiGet(page, apiKey, path) {
    const response = await page.request.get(`/api${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    })
    expect(response.ok(), `GET ${path} should succeed`).toBeTruthy()
    return response.json()
}

async function apiPost(page, apiKey, path, data) {
    const response = await page.request.post(`/api${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        data,
    })
    expect(response.ok(), `POST ${path} should succeed`).toBeTruthy()
    return response.json()
}

async function setSelect2Value(page, selectId, optionId, optionName) {
    await page.locator(`#${selectId}`).evaluate((element, option) => {
        const value = String(option.id)
        let selectOption = Array.from(element.options).find((item) => item.value === value)
        if (!selectOption) {
            selectOption = new Option(option.name, value, true, true)
            element.add(selectOption)
        }
        window.jQuery(element).val(element.multiple ? [value] : value).trigger("change")
    }, { id: optionId, name: optionName })
}

test("admin creates and runs a native GoPhish phishing campaign", async ({ page }) => {
    await page.goto("/login")
    await page.getByPlaceholder("Username").fill("admin")
    await page.getByPlaceholder("Password").fill("GophishE2EInitial123!")
    await page.getByRole("button", { name: "Sign in" }).click()

    await expect(page).toHaveURL(/\/reset_password(?:\?|$)/)
    await page.locator("#password").fill("GophishE2EUpdated123!")
    await page.getByPlaceholder("Confirm Password").fill("GophishE2EUpdated123!")
    await page.getByRole("button", { name: "Save Password" }).click()
    await expect(page).toHaveURL("http://127.0.0.1:3334/")

    await page.goto("/landing_pages")
    await page.getByRole("button", { name: "New Page" }).click()
    await page.locator("#modal #name").fill(`E2E landing page ${Date.now()}`)
    const pageName = await page.locator("#modal #name").inputValue()
    const pageHTML = "<!doctype html><html><body><h1>E2E native landing page</h1><form method=\"post\"><label>Username<input name=\"username\"></label><label>Password<input name=\"password\" type=\"password\"></label><button type=\"submit\">Submit</button></form></body></html>"
    await page.getByRole("button", { name: "HTML source" }).click()
    await expect(page.locator("#pageSourceEditorContainer")).toBeVisible()
    await page.evaluate((html) => window.ace.edit("page_html_source_editor").setValue(html, -1), pageHTML)
    await page.locator('label[for="capture_credentials_checkbox"]').click()
    await page.locator('label[for="capture_passwords_checkbox"]').click()
    await page.locator("#modal #modalSubmit").click()

    await expect(page.locator("#flashes")).toContainText("Page added successfully!")
    await expect(page.locator("#pagesTable tbody")).toContainText(pageName)

    await page.reload()
    await expect(page.locator("#pagesTable tbody")).toContainText(pageName)

    const apiKey = await page.evaluate(() => user.api_key)
    const pages = await apiGet(page, apiKey, "/pages/")
    const landingPage = pages.find((item) => item.name === pageName)
    expect(landingPage).toBeTruthy()
    expect(landingPage.capture_credentials).toBeTruthy()
    expect(landingPage.capture_passwords).toBeTruthy()
    expect(landingPage.html).toContain("E2E native landing page")

    const templateName = `E2E email template ${Date.now()}`
    const template = await apiPost(page, apiKey, "/templates/", {
        name: templateName,
        subject: "E2E campaign email",
        text: "Open this link: {{.URL}}",
        html: '<a href="{{.URL}}">Open the training page</a>',
    })
    const groupName = `E2E group ${Date.now()}`
    const group = await apiPost(page, apiKey, "/groups/", {
        name: groupName,
        targets: [{
            email: "qa-recipient@example.test",
            first_name: "E2E",
            last_name: "Recipient",
            position: "Test participant",
        }],
    })
    const smtpProfile = await apiPost(page, apiKey, "/smtp/", {
        interface_type: "SMTP",
        name: `E2E SMTP ${Date.now()}`,
        host: "host.docker.internal:1025",
        from_address: "e2e-sender@example.test",
    })
    const scenarioName = `E2E scenario ${Date.now()}`
    const scenario = await apiPost(page, apiKey, "/scenarios/", {
        name: scenarioName,
        description: "Created by the browser E2E test",
        page: { id: landingPage.id },
        templates: [{ id: template.id }],
        url: "http://127.0.0.1:8081/",
        variables: {},
    })

    await page.request.delete("http://127.0.0.1:8025/messages")
    await page.goto("/campaigns")
    await page.getByRole("button", { name: "New Campaign" }).click()
    const campaignName = `E2E campaign ${Date.now()}`
    await page.locator("#name").fill(campaignName)
    await setSelect2Value(page, "scenario", scenario.id, scenarioName)
    await setSelect2Value(page, "profile", smtpProfile.id, smtpProfile.name)
    await setSelect2Value(page, "users", group.id, groupName)
    await page.getByRole("button", { name: "Launch Campaign" }).click()
    await page.locator(".swal2-confirm").click()
    await expect(page.locator(".swal2-popup")).toContainText("Campaign Scheduled!")
    await page.locator(".swal2-confirm").click()

    const campaigns = await apiGet(page, apiKey, "/campaigns/")
    const campaign = campaigns.find((item) => item.name === campaignName)
    expect(campaign).toBeTruthy()
    const resultsPath = `/campaigns/${campaign.id}/results`
    await expect.poll(async () => {
        const results = await apiGet(page, apiKey, resultsPath)
        return results.results[0] && results.results[0].status
    }, { timeout: 30000 }).toBe("Email Sent")

    await expect.poll(async () => {
        const response = await page.request.get("http://127.0.0.1:8025/messages")
        return (await response.json()).length
    }, { timeout: 30000 }).toBeGreaterThan(0)
    const messagesResponse = await page.request.get("http://127.0.0.1:8025/messages")
    const messages = await messagesResponse.json()
    expect(messages[0]).toContain("qa-recipient@example.test")
    const result = (await apiGet(page, apiKey, resultsPath)).results[0]
    expect(messages[0]).toContain(result.id)

    await page.goto(`http://127.0.0.1:8081/?rid=${result.id}`)
    await expect(page.getByRole("heading", { name: "E2E native landing page" })).toBeVisible()
    await expect.poll(async () => {
        const results = await apiGet(page, apiKey, resultsPath)
        return results.results[0].status
    }).toBe("Clicked Link")

    await page.locator('input[name="username"]').fill("e2e-user")
    await page.locator('input[name="password"]').fill("e2e-password")
    await page.getByRole("button", { name: "Submit" }).click()
    await expect(page.getByRole("heading", { name: "E2E native landing page" })).toBeVisible()
    await expect.poll(async () => {
        const results = await apiGet(page, apiKey, resultsPath)
        return results.results[0].status
    }).toBe("Submitted Data")
})
