import { expect, test } from "@playwright/test";

test("landing, login, dashboard, navigation, reload, and logout", async ({ page }) => {
  const password = process.env.E2E_DEMO_PASSWORD;
  if (!password) throw new Error("E2E_DEMO_PASSWORD is required");

  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /traffic has a second layer/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the dashboard" }).first()).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill("operator@flowsense.demo");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "City overview" })).toBeVisible();

  for (const route of ["/traffic", "/predictions", "/signals", "/accidents", "/incidents"]) {
    await page.goto(route);
    await expect(page.locator("body")).not.toContainText("Page not found");
  }

  await page.goto("/dashboard");
  await page.reload();
  await expect(page.getByRole("heading", { name: "City overview" })).toBeVisible();

  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "City overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  expect(consoleErrors.filter((m) => !m.includes("favicon"))).toEqual([]);
  expect(failedResponses).toEqual([]);
});
