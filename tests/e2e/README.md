# Browser end-to-end tests

These Playwright tests run GoPhish in a disposable Docker container with a fresh SQLite database and a local SMTP sink. They do not use the developer's existing database. The initial flow resets the first-run admin password, creates a native landing page, launches a campaign, verifies mail delivery, follows the phishing link, submits the test form, and checks the resulting campaign state.

```sh
npm ci --prefix tests/e2e
npm --prefix tests/e2e exec -- playwright install chromium
npm --prefix tests/e2e test
```

Docker must be running. The test server uses `http://127.0.0.1:3334` while the test is running.
