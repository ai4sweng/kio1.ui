"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

/** @returns {object} Minimal DOM control for testing the existing UI handlers. */
function control() {
  return {
    disabled: false, dataset: {}, style: {}, value: "", listeners: {},
    classList: { toggle() {}, add() {} },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    querySelector() { return control(); },
    querySelectorAll() { return []; },
    replaceChildren() {},
    setAttribute() {}, focus() {},
  };
}

/** @returns {object} Isolated application handlers with no server or real agent calls. */
function loadUI(fetchOverride) {
  const elements = new Map();
  const requests = [];
  const controls = [];
  const messages = [];
  const timers = new Map();
  const catalog = { KIO7: { capabilities: ["generate_vitis_config", "review_config"] } };
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, control());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  document.getElementById("capability-catalog").textContent = JSON.stringify(catalog);
  document.getElementById("model-name").textContent = "";
  document.getElementById("messages").querySelectorAll = () => controls;
  const context = vm.createContext({
    document,
    recordedMessages: messages,
    window: {
      addEventListener() {}, confirm: () => true,
      matchMedia: () => ({ matches: false }),
      setInterval(callback) { const id = {}; timers.set(id, callback); return id; },
      clearInterval(id) { timers.delete(id); },
    },
    fetch: fetchOverride ?? (async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ status: "succeeded" }) };
    }),
  });
  const source = fs.readFileSync(path.join(__dirname, "../static/app.js"), "utf8");
  vm.runInContext(source.replace("  initializeUI();", `
    capabilityCatalog = ${JSON.stringify(catalog)};
    appendMessage = (role, content) => {
      const visual = { textContent: "" };
      const message = {
        role, content, visual, removed: false,
        classList: { add() {} },
        querySelector: () => visual,
        remove() { this.removed = true; },
      };
      recordedMessages.push(message);
      return message;
    };
    renderGenericJson = () => "";
    initializeConversationHistory = async () => { setInterfaceBusy(false); };
    globalThis.ui = { renderPlanStep, setInterfaceBusy, initializeUI, sendQuery, showProcessingMessage };
  `), context);
  return {
    ...context.ui, requests, controls, elements, messages, timers, window: context.window,
    input: elements.get("query-input"),
    click: elements.get("messages").listeners.click,
  };
}

/** @param {object} plan Workflow fixture. @returns {object} Editable card DOM adapter. */
function planCard(plan) {
  const card = control();
  card.dataset.plan = JSON.stringify(plan);
  const error = control();
  const dispatch = control();
  dispatch.closest = () => card;
  let steps;
  const list = {
    set innerHTML(value) {
      assert.equal((value.match(/class="plan-step"/g) ?? []).length,
        JSON.parse(card.dataset.plan).steps.length);
      rebuild();
    },
  };
  /** @returns {void} Rebuild controls using the updated plan after deletion. */
  function rebuild() {
    steps = JSON.parse(card.dataset.plan).steps.map((step, index) => {
      const element = control();
      element.dataset.stepIndex = String(index);
      const editor = control();
      editor.value = step.task;
      editor.scrollHeight = 56;
      const button = control();
      button.closest = (selector) => selector === ".plan-card" ? card : element;
      const selected = (step.capabilities ?? [step.capability]).map((value) => ({ value }));
      element.querySelector = () => editor;
      element.querySelectorAll = () => selected;
      return { element, editor, button };
    });
  }
  rebuild();
  card.querySelector = (selector) => ({
    ".plan-steps": list, ".plan-error": error, ".dispatch-plan": dispatch,
  })[selector];
  card.querySelectorAll = (selector) => steps.map((step) => ({
    ".plan-step": step.element, ".step-task": step.editor, ".delete-step": step.button,
  })[selector]);
  return { card, error, dispatch, get steps() { return steps; } };
}

/** @returns {object} Three-step plan with explicit dependencies and structured inputs. */
function samplePlan() {
  return {
    workflow_id: "wf-ui", execution_mode: "mixed",
    steps: ["s1", "s2", "s3"].map((step_id, index) => ({
      step_id, agent_id: "KIO7", capability: "generate_vitis_config",
      task: `Task ${index + 1}`, depends_on: index ? ["s1"] : [],
      data: { preserve: index },
    })),
  };
}

test("static page preserves the chat interface without server template dependencies", () => {
  const html = fs.readFileSync(path.join(__dirname, "../templates/index.html"), "utf8");
  assert.match(html, /<html/);
  assert.match(html, /What can I help with\?/);
  assert.match(html, /aria-label="Conversation"/);
  assert.match(html, /data-workflow-enabled="false"/);
  assert.doesNotMatch(html, /\{\{|\{%/);
  for (const asset of ["app.js", "style.css", "image.png", "trash-2.svg"]) {
    assert.ok(fs.existsSync(path.join(__dirname, "../static", asset)));
  }
});

test("settings populate model text and custom capabilities without script injection", async () => {
  const malicious = "</script><script>alert(1)</script>";
  const settings = {
    model_name: malicious, workflow_enabled: true,
    capability_catalog: { KIO7: { capabilities: ["custom_review", malicious] } },
  };
  const ui = loadUI(async (url) => {
    assert.equal(url, "/api/settings");
    return { ok: true, json: async () => settings };
  });
  await ui.initializeUI();
  assert.equal(ui.elements.get("model-name").textContent, malicious);
  assert.equal(ui.elements.get("app-shell").dataset.workflowEnabled, "true");
  assert.equal(ui.input.disabled, false);
  const html = ui.renderPlanStep(samplePlan().steps[0], 0);
  assert.match(html, /custom_review/);
  assert.doesNotMatch(html, /generate_vitis_config/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

for (const failure of ["network", "http", "malformed"]) {
  test(`${failure} settings failure leaves input and workflow dispatch disabled`, async () => {
    const ui = loadUI(async () => {
      if (failure === "network") throw new Error("Network unavailable");
      return { ok: failure !== "http", status: 503, json: async () => ({}) };
    });
    await ui.initializeUI();
    assert.equal(ui.input.disabled, true);
    assert.equal(ui.elements.get("new-chat-button").disabled, true);
    assert.equal(ui.elements.get("app-shell").dataset.workflowEnabled, "false");
    assert.ok(ui.elements.get("history-status").textContent);
  });
}

test("each chat refreshes the configured model from uncached settings", async () => {
  let model = "first-model";
  const ui = loadUI(async (url, options) => {
    if (url === "/api/settings") {
      assert.equal(options.cache, "no-store");
      return { ok: true, json: async () => ({ model_name: model }) };
    }
    assert.equal(url, "/api/chat");
    return { ok: true, json: async () => ({ formatted: "{}" }) };
  });
  await ui.sendQuery("First query");
  assert.equal(ui.elements.get("model-name").textContent, "first-model");
  model = "replacement-model";
  await ui.sendQuery("Second query");
  assert.equal(ui.elements.get("model-name").textContent, "replacement-model");
});

for (const failure of ["network", "malformed"]) {
  test(`${failure} model refresh clears stale text without preventing chat`, async () => {
    const ui = loadUI(async (url) => {
      if (url === "/api/settings") {
        if (failure === "network") throw new Error("Unavailable");
        return { ok: true, json: async () => ({ model_name: " " }) };
      }
      return { ok: true, json: async () => ({ formatted: "{}" }) };
    });
    ui.elements.get("model-name").textContent = "stale-model";
    assert.equal((await ui.sendQuery("Query")).html, "");
    assert.equal(ui.elements.get("model-name").textContent, "Model unavailable");
  });
}

test("a slow model refresh does not delay the inference request", async () => {
  let releaseSettings;
  let chatStarted = false;
  const ui = loadUI(async (url) => {
    if (url === "/api/settings") {
      return new Promise((resolve) => { releaseSettings = resolve; });
    }
    chatStarted = true;
    return { ok: true, json: async () => ({ formatted: "{}" }) };
  });
  await ui.sendQuery("Query");
  assert.equal(chatStarted, true);
  releaseSettings({ ok: true, json: async () => ({ model_name: "current-model" }) });
});

test("processing text types the escaped query and cleans up its timer", () => {
  const ui = loadUI();
  const query = '<img src=x onerror="alert(1)"> \u{1f680}';
  const pending = ui.showProcessingMessage(query);
  const message = ui.messages[0];
  assert.doesNotMatch(message.content.html, /<img/);
  assert.match(message.content.html, /&lt;img/);
  assert.match(message.content.html, /role="status" aria-label="Processing/);
  assert.equal(message.visual.textContent, "");
  const tick = [...ui.timers.values()][0];
  tick();
  assert.ok(message.visual.textContent.length > 0);
  assert.ok(message.visual.textContent.length < `Processing ${query}`.length);
  for (let index = 0; index < 160; index += 1) tick();
  assert.equal(message.visual.textContent, `Processing ${query}`);
  assert.equal(ui.timers.size, 0);
  pending.stop();
  assert.equal(message.removed, true);
});

test("reduced motion displays the full processing query without a timer", () => {
  const ui = loadUI();
  ui.window.matchMedia = () => ({ matches: true });
  const pending = ui.showProcessingMessage("Inspect fleet");
  assert.equal(ui.messages[0].visual.textContent, "Processing Inspect fleet");
  assert.equal(ui.timers.size, 0);
  pending.stop();
  assert.equal(ui.messages[0].removed, true);
});

for (const outcome of ["success", "network", "http", "malformed"]) {
  test(`${outcome} chat completion removes pending text and stops animation`, async () => {
    let finishChat;
    const ui = loadUI(async (url) => {
      if (url === "/api/settings") {
        return { ok: true, json: async () => ({ model_name: "current-model" }) };
      }
      if (url === "/api/conversations") {
        return { ok: true, json: async () => ({ active_id: null, conversations: [] }) };
      }
      return new Promise((resolve, reject) => {
        finishChat = () => {
          if (outcome === "network") return reject(new Error("Offline"));
          resolve({
            ok: outcome === "success", status: outcome === "success" ? 200 : 503,
            json: async () => {
              if (outcome === "malformed") throw new Error("Invalid JSON");
              return outcome === "success" ? { formatted: "{}" } : { error: "Unavailable" };
            },
          });
        };
      });
    });
    ui.input.value = "Inspect fleet";
    const submitted = ui.elements.get("chat-form").listeners.submit({ preventDefault() {} });
    assert.equal(ui.input.disabled, true);
    assert.equal(ui.timers.size, 1);
    finishChat();
    await submitted;
    assert.equal(ui.messages[1].removed, true);
    assert.equal(ui.timers.size, 0);
    assert.equal(ui.input.disabled, false);
    assert.equal(Boolean(ui.messages[2].content.isError), outcome !== "success");
  });
}

test("capability labels are readable but checkbox values stay canonical and escaped", () => {
  const ui = loadUI();
  const html = ui.renderPlanStep(samplePlan().steps[0], 0);
  assert.match(html, /value="generate_vitis_config" checked/);
  assert.match(html, /<span>Generate vitis config<\/span>/);
  assert.match(html, /<span>Review config<\/span>/);
  assert.match(html, /class="delete-step"/);
  assert.match(html, /\/static\/trash-2.svg/);
});

for (const mode of ["mixed", "sequential", "parallel"]) {
  test(`deletion updates ${mode} dispatch, dependencies, numbering, and preserves edits`, async () => {
    const ui = loadUI();
    const plan = samplePlan();
    plan.execution_mode = mode;
    if (mode === "parallel") plan.steps.forEach((step) => { step.depends_on = []; });
    const fixture = planCard(plan);
    fixture.steps[1].editor.value = "Operator edited task";
    fixture.steps[0].button.focus = () => {
      assert.equal(JSON.parse(fixture.card.dataset.plan).steps.length, 3);
    };
    await ui.click({ target: { closest: () => fixture.steps[0].button } });
    assert.deepEqual(JSON.parse(fixture.card.dataset.plan).steps.map((step) => step.step_id), ["s2", "s3"]);
    assert.deepEqual(fixture.steps.map((step) => step.element.dataset.stepIndex), ["0", "1"]);
    assert.equal(ui.requests.length, 0);
    await ui.click({ target: { closest: (selector) => selector === ".dispatch-plan" ? fixture.dispatch : null } });
    assert.equal(ui.requests.length, 1);
    const sent = ui.requests[0].body;
    assert.equal(sent.approved, true);
    assert.equal(sent.plan.steps[0].task, "Operator edited task");
    assert.deepEqual(sent.plan.steps.map((step) => step.depends_on), [[], []]);
    assert.deepEqual(sent.plan.steps.map((step) => step.data), [{ preserve: 1 }, { preserve: 2 }]);
    assert.equal(sent.plan.steps[0].capability, "generate_vitis_config");
    assert.deepEqual(sent.plan.steps[0].capabilities, ["generate_vitis_config"]);
  });
}

test("unrelated dependencies survive deletion and repeated deletion cannot dispatch an empty plan", async () => {
  const ui = loadUI();
  const plan = samplePlan();
  plan.steps[2].depends_on.push("s2");
  const fixture = planCard(plan);
  await ui.click({ target: { closest: () => fixture.steps[0].button } });
  assert.deepEqual(JSON.parse(fixture.card.dataset.plan).steps[1].depends_on, ["s2"]);
  while (fixture.steps.length) {
    await ui.click({ target: { closest: () => fixture.steps[0].button } });
  }
  await ui.click({ target: { closest: (selector) => selector === ".dispatch-plan" ? fixture.dispatch : null } });
  assert.equal(ui.requests.length, 0);
  assert.equal(fixture.error.hidden, false);
  assert.match(fixture.error.textContent, /no entries/);
});

test("busy or disabled deletion controls cannot mutate a plan", async () => {
  const ui = loadUI();
  const fixture = planCard(samplePlan());
  const original = fixture.card.dataset.plan;
  ui.controls.push(fixture.steps[0].button);
  ui.setInterfaceBusy(true);
  assert.equal(fixture.steps[0].button.disabled, true);
  await ui.click({ target: { closest: () => fixture.steps[0].button } });
  assert.equal(fixture.card.dataset.plan, original);
  ui.setInterfaceBusy(false);
  assert.equal(fixture.steps[0].button.disabled, false);
  fixture.steps[0].button.disabled = true;
  await ui.click({ target: { closest: () => fixture.steps[0].button } });
  assert.equal(fixture.card.dataset.plan, original);
});