const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const base = process.env.REIGN_QA_BASE || "http://127.0.0.1:5782";
const out = process.env.REIGN_QA_OUTPUT;
if (!out || !process.env.REIGN_QA_ACCOUNT_FILE)
  throw Error("Private QA output directory and account file required");
if (
  !/^(http:\/\/127\.0\.0\.1:\d+|https:\/\/reign-staging\.[a-z0-9.-]+)$/.test(
    base,
  )
)
  throw Error("QA is restricted to local or Reign staging");
fs.mkdirSync(out, { recursive: true, mode: 0o700 });
const accounts = JSON.parse(
  fs.readFileSync(process.env.REIGN_QA_ACCOUNT_FILE, "utf8"),
);
const admin =
    accounts.find((a) => a.role === "root") ||
    accounts.find((a) => a.role === "admin"),
  employee = accounts.find((a) => a.role === "editor");
assert.ok(
  admin && employee,
  "Separate admin and employee test accounts are required",
);
const stamp = Date.now(),
  name = "Synthetic CRM QA " + stamp,
  projectName = "QA Patio Build " + stamp,
  dealName = "QA Outdoor Opportunity " + stamp,
  estimateName = "QA Patio Estimate " + stamp;
const result = {
  base,
  stamp,
  synthetic: true,
  created: {},
  checks: [],
  pageErrors: [],
};
const save = () =>
  fs.writeFileSync(
    path.join(out, "browser-results.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      "/opt/txl-browser/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Chicago",
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => {
    result.pageErrors.push(e.message);
    save();
  });
  page.on("dialog", (d) => d.accept());
  const read = (url) => page.evaluate(async (url) => {const r=await fetch(url); if(!r.ok) throw Error("QA read failed: "+r.status); return r.json();}, url);
  const nav = (label) =>
    page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("button", { name: label, exact: true });
  async function login(p, a) {
    await p.goto(base + "/login");
    await p.getByTestId("input-login-email").fill(a.email);
    await p.getByTestId("input-login-password").fill(a.password);
    await p.getByTestId("button-login-submit").click();
    await p.waitForURL("**/admin");
  }
  try {
    await login(page, admin);
    await page
      .getByRole("heading", {
        name: "Good to see you. Let’s build.",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "The Dyno", exact: true }).count(),
      0,
    );
    result.checks.push("Construction overview replaces automotive gauges");
    await page
      .getByRole("button", { name: "Add contact", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name", { exact: true }).fill(name);
    await dialog
      .getByLabel("Contact type", { exact: true })
      .selectOption("client");
    await dialog
      .getByLabel("Email", { exact: true })
      .fill("qa-" + stamp + "@example.invalid");
    await dialog.getByLabel("Phone", { exact: true }).fill("555-0100");
    await dialog
      .getByLabel("Company", { exact: true })
      .fill("Synthetic QA only");
    await dialog
      .getByLabel("Project / service interest", { exact: true })
      .fill("Patio renovation");
    await dialog
      .getByLabel("Property address", { exact: true })
      .fill("Synthetic QA address — not a real site");
    await dialog
      .getByRole("button", { name: "Save contact", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name, exact: true }).first().waitFor();
    const contact = (
      await read(base + "/api/crm/contacts")
    ).find((c) => c.name === name);
    assert.ok(contact);
    result.created.contactId = contact.id;
    save();
    await page
      .getByRole("button", { name: "Log interaction", exact: true })
      .first()
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Activity type", { exact: true })
      .selectOption("call");
    await dialog
      .getByLabel("Subject", { exact: true })
      .fill("QA discovery call");
    await dialog
      .getByLabel("Notes", { exact: true })
      .fill("Synthetic QA interaction; no actual customer contacted.");
    await dialog
      .getByLabel("Outcome / next step", { exact: true })
      .fill("Arrange a site visit");
    await dialog
      .getByLabel("Set next follow-up", { exact: true })
      .fill("2026-11-03T09:00");
    await dialog
      .getByRole("button", { name: "Save interaction", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("heading", { name: "QA discovery call", exact: true })
      .waitFor();
    result.checks.push(
      "Manual client profile, interaction timeline and scheduled follow-up",
    );
    await nav("Deal pipeline").click();
    await page.getByRole("button", { name: "Add deal", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Opportunity name", { exact: true }).fill(dealName);
    await dialog
      .getByLabel("Opportunity value ($)", { exact: true })
      .fill("18000");
    await dialog.getByLabel("Stage", { exact: true }).selectOption("qualified");
    await dialog
      .getByRole("button", { name: "Save opportunity", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: dealName, exact: true }).waitFor();
    await page
      .getByLabel("Stage for " + dealName, { exact: true })
      .selectOption("assessment");
    await pause(250);
    result.created.dealId = (
      await read(base + "/api/crm/deals")
    ).find((d) => d.title === dealName).id;
    save();
    result.checks.push("Deal creation and persisted pipeline stage change");
    await nav("Projects & tasks").click();
    await page
      .getByRole("button", { name: "Add project", exact: true })
      .first().click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Project name", { exact: true }).fill(projectName);
    await dialog
      .getByLabel("Stage", { exact: true })
      .selectOption("in_progress");
    await dialog
      .getByLabel("Approved budget ($)", { exact: true })
      .fill("25000");
    await dialog.getByLabel("Recorded spend ($)", { exact: true }).fill("8000");
    await dialog.getByLabel("Start date", { exact: true }).fill("2026-11-01");
    await dialog
      .getByLabel("Target completion", { exact: true })
      .fill("2026-12-15");
    await dialog
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    const projectCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", { name: projectName, exact: true }),
      });
    await projectCard
      .getByRole("button", { name: /Open project tasks/ })
      .click();
    dialog = page.getByRole("dialog");
    for (const task of ["QA field assessment", "QA material preparation"]) {
      await dialog
        .getByRole("button", { name: "Add task", exact: true })
        .click();
      await dialog.getByLabel("Task name", { exact: true }).fill(task);
      await dialog.getByLabel("Due date", { exact: true }).fill("2026-12-01");
      await dialog
        .getByRole("button", { name: "Save task", exact: true })
        .click();
      await dialog.getByLabel("Status for " + task, { exact: true }).waitFor();
    }
    await dialog
      .getByLabel("Status for QA field assessment", { exact: true })
      .selectOption("complete");
    await pause(250);
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await projectCard.getByText("50%", { exact: true }).waitFor();
    result.created.projectId = (
      await read(base + "/api/crm/projects")
    ).find((p) => p.title === projectName).id;
    save();
    result.checks.push("Project budget and actual 1-of-2 task progress");
    await nav("Estimates & proposals").click();
    await page
      .getByRole("button", { name: "Create estimate", exact: true })
      .first()
      .click();
    dialog = page.getByRole("dialog");
    const context = await read(base + "/api/operations/context");
    const rate = context.rates.find((r) =>
      context.services.some((s) => s.id === r.serviceId && s.isActive),
    );
    assert.ok(rate, "Synthetic QA requires an approved service rate");
    await dialog
      .getByLabel("Estimate title", { exact: true })
      .fill(estimateName);
    await dialog
      .getByLabel("Scope of work & terms", { exact: true })
      .fill(
        "Synthetic QA proposal only. Demonstrate a two-line patio estimate with frozen approved pricing. No real work or payment commitment.",
      );
    await dialog
      .getByLabel("Service 1", { exact: true })
      .selectOption(String(rate.serviceId));
    await dialog.getByLabel("Quantity 1", { exact: false }).fill("20");
    await dialog.getByRole("button", { name: "Add line", exact: true }).click();
    await dialog
      .getByLabel("Service 2", { exact: true })
      .selectOption(String(rate.serviceId));
    await dialog.getByLabel("Quantity 2", { exact: false }).fill("10");
    await dialog
      .getByRole("button", { name: "Save draft estimate", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    const proposal = (
      await read(base + "/api/operations/proposals")
    ).find((p) => p.document.title === estimateName);
    assert.ok(proposal);
    assert.equal(proposal.document.lines.length, 2);
    result.created.proposalId = proposal.id;
    save();
    const proposalRow = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", { name: estimateName, exact: true }),
      });
    await proposalRow
      .getByRole("button", { name: "View", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByRole("heading", { name: estimateName, exact: true })
      .waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: "Print / save PDF", exact: true })
        .count(),
      1,
    );
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await proposalRow
      .getByRole("button", { name: "Issue proposal", exact: true })
      .click();
    await proposalRow.getByText("Issued", { exact: true }).waitFor();
    result.checks.push(
      "Multi-line estimate creation, document preview and explicit issue",
    );
    await nav("Contacts").click();
    await page.getByRole("heading", { name, exact: true }).first().waitFor();
    await page
      .getByRole("button", { name: "Create private invitation", exact: true })
      .click();
    const link = await page
      .getByRole("textbox", {
        name: "Private customer portal invitation",
        exact: true,
      })
      .inputValue();
    assert.ok(link.includes("/portal#"));
    const customerCtx = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      customer = await customerCtx.newPage();
    customer.on("dialog", (d) => d.accept());
    customer.on("pageerror", (e) => result.pageErrors.push(e.message));
    await customer.goto(link);
    await customer
      .getByRole("heading", { name: "Your Reign project", exact: true })
      .waitFor();
    await customer.getByText(estimateName, { exact: true }).waitFor();
    await customer
      .getByLabel("Your full name to record your decision", { exact: true })
      .fill("Synthetic QA Client");
    await customer
      .getByRole("button", { name: "Accept proposal", exact: true })
      .click();
    await pause(300);
    const decided = (
      await read(base + "/api/operations/proposals")
    ).find((p) => p.id === proposal.id);
    assert.equal(decided.status, "accepted");
    await customerCtx.close();
    result.checks.push("Private portal invitation and customer acceptance");
    await page.getByRole("button", {name:"Add contact",exact:true}).click();
    dialog=page.getByRole("dialog");
    const otherName="Synthetic other contact "+stamp;
    await dialog.getByLabel("Full name",{exact:true}).fill(otherName);
    await dialog.getByLabel("Phone",{exact:true}).fill("555-0199");
    await dialog.getByRole("button",{name:"Save contact",exact:true}).click();
    await dialog.waitFor({state:"hidden"});
    await page.getByRole("heading",{name:otherName,exact:true}).first().waitFor();
    result.created.otherContactId=(await read(base+"/api/crm/contacts")).find(c=>c.name===otherName).id;
    save();
    assert.equal(await page.getByRole("textbox",{name:"Private customer portal invitation",exact:true}).count(),0);
    result.checks.push("Private invitation state clears when switching to another contact");

    await nav("Overview").click();
    await page
      .getByRole("heading", { name: "Project delivery", exact: true })
      .waitFor();
    await page.getByText(projectName, { exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, "overview-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await pause(200);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Mobile overview overflow",
    );
    await page.screenshot({ path: path.join(out, "overview-mobile.png") });
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await nav("Contacts").click();
    await pause(100);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Mobile CRM overflow",
    );
    await page.screenshot({ path: path.join(out, "contacts-mobile.png") });
    await page
      .getByRole("button", { name: "Add contact", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Full name", { exact: true })
      .fill("Mobile form QA");
    assert.ok(
      await dialog.evaluate(
        (d) => d.getBoundingClientRect().width <= innerWidth,
      ),
      "Mobile dialog width",
    );
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    result.checks.push(
      "Mobile overview, navigation, contact list and accessible dialog",
    );
    const employeeCtx = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        timezoneId: "America/Chicago",
      }),
      ep = await employeeCtx.newPage();
    ep.on("pageerror", (e) => result.pageErrors.push(e.message));
    await login(ep, employee);
    assert.equal(
      await ep
        .getByRole("navigation")
        .getByRole("button", { name: "Integrations", exact: true })
        .count(),
      0,
    );
    await ep
      .getByRole("navigation")
      .getByRole("button", { name: "Reign assistant", exact: true })
      .click();
    await ep.getByRole("heading", { name: "Ask Reign", exact: true }).waitFor();
    await ep
      .getByLabel("Your message", { exact: true })
      .fill("Summarize my follow-ups");
    await ep.route("**/api/operations/agent", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Synthetic UI fixture: follow-up context received.",
          pending: [],
        }),
      }),
    );
    await ep.getByRole("button", { name: "Send message", exact: true }).click();
    await ep
      .getByText(/Synthetic UI fixture: follow-up context received/)
      .waitFor();
    await ep
      .getByRole("navigation")
      .getByRole("button", { name: "Measurements", exact: true })
      .click();
    await ep
      .getByRole("heading", { name: "Measurements & pricing", exact: true })
      .waitFor();
    await ep
      .getByRole("button", { name: "Service pricing", exact: true })
      .click();
    assert.equal(
      await ep
        .getByRole("button", { name: "Save approved rate", exact: true })
        .count(),
      0,
    );
    await employeeCtx.close();
    result.checks.push(
      "Employee CRM/assistant availability and hidden admin controls (UI inference fixture)",
    );
    const loginCtx = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      lp = await loginCtx.newPage();
    await lp.goto(base + "/contact");
    await lp.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await lp.goto(base + "/login");
    await lp.getByTestId("form-login").waitFor();
    await lp.getByTestId("login-platform-brand").waitFor();
    await lp.getByTestId("login-tenant-brand").waitFor();
    const platformBox = await lp.getByTestId("login-platform-brand").boundingBox();
    const tenantBox = await lp.getByTestId("login-tenant-brand").boundingBox();
    const formBox = await lp.getByTestId("form-login").boundingBox();
    const logoWidth = await lp.locator('img[alt^="LaunchWorks"]').evaluate((image) => image.naturalWidth);
    assert.ok(platformBox.y + platformBox.height <= tenantBox.y);
    assert.ok(tenantBox.y + tenantBox.height <= formBox.y);
    assert.ok(logoWidth > 0);
    const box = await lp.getByTestId("form-login").boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 844);
    await lp.getByTestId("input-login-email").focus();
    await lp.setViewportSize({ width: 390, height: 600 });
    await pause(200);
    const focused = await lp.getByTestId("input-login-email").boundingBox();
    assert.ok(focused.y >= 0 && focused.y + focused.height < 600);
    await loginCtx.close();
    result.checks.push("Login form recenters on entry and viewport change");
    assert.deepEqual(result.pageErrors, []);
    result.complete = true;
    save();
    console.log(
      JSON.stringify({
        complete: true,
        checks: result.checks,
        created: result.created,
        pageErrors: result.pageErrors,
      }),
    );
  } catch (e) {
    result.error = e.message;
    save();
    await page
      .screenshot({ path: path.join(out, "failure.png") })
      .catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
