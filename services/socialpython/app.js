const state = {
  options: null,
  busy: false
};

const elements = {
  brandSelect: document.querySelector("#brand-select"),
  postTypeSelect: document.querySelector("#post-type-select"),
  projectField: document.querySelector("#project-field"),
  projectSelect: document.querySelector("#project-select"),
  festivalField: document.querySelector("#festival-field"),
  festivalSelect: document.querySelector("#festival-select"),
  channelSelect: document.querySelector("#channel-select"),
  formatSelect: document.querySelector("#format-select"),
  variationCountInput: document.querySelector("#variation-count-input"),
  goalInput: document.querySelector("#goal-input"),
  exactTextInput: document.querySelector("#exact-text-input"),
  audienceInput: document.querySelector("#audience-input"),
  offerInput: document.querySelector("#offer-input"),
  brandLogoToggle: document.querySelector("#brand-logo-toggle"),
  reraToggle: document.querySelector("#rera-toggle"),
  starterPrompt: document.querySelector("#starter-prompt"),
  useStarterButton: document.querySelector("#use-starter-button"),
  healthPill: document.querySelector("#health-pill"),
  runtimeStatus: document.querySelector("#runtime-status"),
  clearChatButton: document.querySelector("#clear-chat-button"),
  chatLog: document.querySelector("#chat-log"),
  composer: document.querySelector("#composer"),
  messageInput: document.querySelector("#message-input"),
  sendButton: document.querySelector("#send-button"),
  userTemplate: document.querySelector("#user-message-template"),
  assistantTemplate: document.querySelector("#assistant-message-template"),
  loadingTemplate: document.querySelector("#loading-template")
};

boot();

async function boot() {
  renderEmptyState();
  await Promise.all([loadOptions(), loadHealth()]);
  wireEvents();
}

async function loadOptions() {
  const response = await fetch("/api/options");
  const json = await response.json();
  state.options = json;
  hydrateControls(json);
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const json = await response.json();
    elements.healthPill.textContent = json.agentReady
      ? `Agno ready · ${json.openAiModel}`
      : "Missing OPENAI_API_KEY";
    renderRuntimeStatus(json.runtime);
  } catch (error) {
    elements.healthPill.textContent = "Health check failed";
    renderRuntimeStatus(null);
  }
}

function wireEvents() {
  elements.postTypeSelect.addEventListener("change", onPostTypeChange);
  elements.useStarterButton.addEventListener("click", () => {
    elements.messageInput.value = currentPostType().starterPrompt;
    elements.messageInput.focus();
  });
  elements.clearChatButton.addEventListener("click", () => {
    elements.chatLog.innerHTML = "";
    renderEmptyState();
  });
  elements.composer.addEventListener("submit", onSubmit);
  elements.chatLog.addEventListener("click", onCopyPrompt);
}

function hydrateControls(options) {
  fillSelect(elements.brandSelect, [options.brand], "name", "id");
  fillSelect(elements.postTypeSelect, options.postTypes, "name", "id");
  fillSelect(elements.projectSelect, options.projects, "name", "id");
  fillSelect(elements.festivalSelect, options.festivals, "name", "id");
  fillSelect(elements.channelSelect, options.channels, "label", "value");
  fillSelect(elements.formatSelect, options.formats, "label", "value");

  elements.brandSelect.value = options.brand.id;
  elements.projectSelect.value = options.projects[0]?.id ?? "";
  elements.postTypeSelect.value = options.postTypes[0]?.id ?? "";

  onPostTypeChange();
}

function onPostTypeChange() {
  const postType = currentPostType();
  const isFestive = postType.code === "festive-greeting";

  elements.projectField.classList.toggle("hidden", isFestive);
  elements.festivalField.classList.toggle("hidden", !isFestive);

  applyAllowedOptions(elements.channelSelect, state.options.channels, postType.config.defaultChannels);
  applyAllowedOptions(elements.formatSelect, state.options.formats, postType.config.allowedFormats);

  elements.goalInput.value = postType.defaultGoal;
  elements.exactTextInput.value = postType.defaultExactText;
  elements.offerInput.value = postType.code === "site-visit-invite" ? "Book a site visit" : "";
  elements.starterPrompt.textContent = postType.starterPrompt;
  elements.messageInput.placeholder = postType.starterPrompt;
}

function applyAllowedOptions(select, source, allowedValues) {
  fillSelect(
    select,
    source.filter((item) => allowedValues.includes(item.value)),
    "label",
    "value"
  );
  select.value = allowedValues[0] ?? source[0]?.value ?? "";
}

function fillSelect(select, items, labelKey, valueKey) {
  select.innerHTML = "";
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item[valueKey];
    option.textContent = item[labelKey];
    select.append(option);
  }
}

function currentPostType() {
  return state.options.postTypes.find((item) => item.id === elements.postTypeSelect.value);
}

function currentProject() {
  return state.options.projects.find((item) => item.id === elements.projectSelect.value) ?? null;
}

function currentFestival() {
  return state.options.festivals.find((item) => item.id === elements.festivalSelect.value) ?? null;
}

function buildPayload() {
  const postType = currentPostType();
  return {
    brandId: elements.brandSelect.value,
    postTypeId: postType.id,
    projectId: postType.code === "festive-greeting" ? null : currentProject()?.id ?? null,
    festivalId: postType.code === "festive-greeting" ? currentFestival()?.id ?? null : null,
    channel: elements.channelSelect.value,
    format: elements.formatSelect.value,
    variationCount: Number(elements.variationCountInput.value || 3),
    goal: elements.goalInput.value.trim(),
    exactText: elements.exactTextInput.value.trim(),
    audience: elements.audienceInput.value.trim(),
    offer: elements.offerInput.value.trim(),
    includeBrandLogo: elements.brandLogoToggle.checked,
    includeReraQr: elements.reraToggle.checked,
    prompt: elements.messageInput.value.trim()
  };
}

async function onSubmit(event) {
  event.preventDefault();
  if (state.busy) return;

  const payload = buildPayload();
  if (!payload.prompt) {
    elements.messageInput.focus();
    return;
  }

  removeEmptyState();
  appendUserMessage(payload.prompt);
  const loadingNode = appendLoadingMessage();
  setBusy(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await response.json();
    loadingNode.remove();

    if (!response.ok) {
      appendAssistantError(json.error || "Request failed.");
      return;
    }

    appendAssistantMessage(json);
    elements.messageInput.value = "";
    elements.messageInput.focus();
  } catch (error) {
    loadingNode.remove();
    appendAssistantError(error instanceof Error ? error.message : "Something went wrong.");
  } finally {
    setBusy(false);
  }
}

function setBusy(next) {
  state.busy = next;
  elements.sendButton.disabled = next;
  elements.sendButton.textContent = next ? "Generating…" : "Generate prompts";
}

function appendUserMessage(text) {
  const node = elements.userTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".message-meta").textContent = "You";
  node.querySelector(".bubble").textContent = text;
  elements.chatLog.append(node);
  scrollChatToBottom();
}

function appendAssistantMessage(payload) {
  const node = elements.assistantTemplate.content.firstElementChild.cloneNode(true);
  const { result, context, runtime, trace } = payload;
  node.querySelector(".message-meta").textContent = "Agno compiler";
  node.querySelector(".assistant-title").textContent = context.project
    ? `${context.postType} · ${context.project}`
    : context.postType;
  node.querySelector(".assistant-subtitle").textContent = context.festival
    ? `Festival: ${context.festival}`
    : "Prompt package generated from current controls.";

  const metrics = [
    `Aspect ${result.aspectRatio}`,
    `Model ${result.chosenModel}`,
    `${Array.isArray(result.variations) ? result.variations.length : 0} variations`,
    `Seed ${result.seedPrompt.length} chars`,
    `Final ${result.finalPrompt.length} chars`
  ];
  const metricsNode = node.querySelector(".metrics");
  for (const value of metrics) {
    const pill = document.createElement("div");
    pill.className = "metric";
    pill.textContent = value;
    metricsNode.append(pill);
  }

  node.querySelector(".prompt-summary").textContent = result.promptSummary;
  node.querySelector(".prompt-seed").textContent = result.seedPrompt;
  node.querySelector(".prompt-final").textContent = result.finalPrompt;
  renderVariations(node, result.variations);
  node.querySelector('[data-copy="summary"]').dataset.value = result.promptSummary;
  node.querySelector('[data-copy="seed"]').dataset.value = result.seedPrompt;
  node.querySelector('[data-copy="final"]').dataset.value = result.finalPrompt;

  renderTrace(node, runtime, trace);

  elements.chatLog.append(node);
  scrollChatToBottom();
}

function appendAssistantError(message) {
  const node = elements.assistantTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".message-meta").textContent = "Agno compiler";
  node.querySelector(".assistant-title").textContent = "Request failed";
  node.querySelector(".assistant-subtitle").textContent = "The local prompt lab could not compile a prompt package.";
  node.querySelector(".metrics").remove();
  node.querySelector(".prompt-summary").textContent = message;
  node.querySelector(".prompt-seed").textContent = "No seed prompt returned.";
  node.querySelector(".prompt-final").textContent = "No final prompt returned.";
  node.querySelector(".prompt-variations-card")?.remove();
  node.querySelector(".trace-card").remove();
  elements.chatLog.append(node);
  scrollChatToBottom();
}

function renderVariations(node, variations) {
  const container = node.querySelector(".prompt-variations");
  container.innerHTML = "";
  if (!Array.isArray(variations) || variations.length === 0) {
    container.textContent = "No variation routes returned.";
    return;
  }

  for (const variation of variations) {
    const block = document.createElement("div");
    block.className = "variation-block";
    block.innerHTML = `
      <div class="variation-top">
        <strong>${escapeHtml(variation.title || variation.id || "Variation")}</strong>
        <button class="copy-button" data-value="${escapeHtml(variation.seedPrompt || "")}" type="button">Copy seed</button>
      </div>
      <div class="variation-strategy">${escapeHtml(variation.strategy || "Distinct creative route")}</div>
      <pre class="prompt-output">${escapeHtml(variation.seedPrompt || "No seed prompt.")}</pre>
      <pre class="prompt-output">${escapeHtml(variation.finalPrompt || "No final prompt.")}</pre>
    `;
    container.append(block);
  }
}

function appendLoadingMessage() {
  const node = elements.loadingTemplate.content.firstElementChild.cloneNode(true);
  elements.chatLog.append(node);
  scrollChatToBottom();
  return node;
}

function renderEmptyState() {
  if (elements.chatLog.querySelector(".empty-state")) return;
  const node = document.createElement("div");
  node.className = "empty-state";
  node.innerHTML = `
    <strong>Start a prompt conversation.</strong>
    <div style="margin-top:8px">Pick a post type, tune the context, and send a brief. The lab will return a summary, a seed prompt, and a final prompt only.</div>
  `;
  elements.chatLog.append(node);
}

function removeEmptyState() {
  elements.chatLog.querySelector(".empty-state")?.remove();
}

function scrollChatToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

async function onCopyPrompt(event) {
  const button = event.target.closest(".copy-button");
  if (!button) return;
  const value = button.dataset.value ?? "";
  if (!value) return;
  await navigator.clipboard.writeText(value);
  const previous = button.textContent;
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = previous;
  }, 1000);
}

function renderRuntimeStatus(runtime) {
  elements.runtimeStatus.innerHTML = "";
  if (!runtime) {
    elements.runtimeStatus.innerHTML = `
      <div class="runtime-item">
        <div class="runtime-label">Status</div>
        <div class="runtime-value">Runtime diagnostics unavailable.</div>
      </div>
    `;
    return;
  }

  const items = [
    {
      label: "Skills runtime",
      value: runtime.skillsRuntimeAvailable ? "Available in this Python environment" : "Not available in this Python environment"
    },
    {
      label: "Loaded skills",
      value: runtime.loadedSkillCount > 0 ? runtime.loadedSkillNames.join(", ") : "None loaded"
    },
    {
      label: "Skill tools",
      value: runtime.loadedToolCount > 0 ? runtime.loadedToolNames.join(", ") : "None loaded"
    },
    {
      label: "Python runtime",
      value: runtime.pythonExecutable ?? "Unknown"
    },
    {
      label: "Skills directory",
      value: runtime.skillsDirectory
    }
  ];

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "runtime-item";
    row.innerHTML = `
      <div class="runtime-label">${item.label}</div>
      <div class="runtime-value">${item.value}</div>
    `;
    elements.runtimeStatus.append(row);
  }
}

function renderTrace(node, runtime, trace) {
  const metricsNode = node.querySelector(".trace-metrics");
  const statusNode = node.querySelector(".trace-status");
  const eventsNode = node.querySelector(".trace-events");
  const loadedSkillNames = trace?.loadedSkillNames?.length ? trace.loadedSkillNames : runtime?.loadedSkillNames ?? [];
  const toolCalls = trace?.toolCalls ?? [];
  const skillToolCalls = trace?.skillToolCalls ?? [];

  const traceMetrics = [
    runtime?.skillsRuntimeAvailable ? "Skills runtime available" : "No runtime skills support",
    loadedSkillNames.length ? `${loadedSkillNames.length} loaded skills` : "0 loaded skills",
    skillToolCalls.length ? `${skillToolCalls.length} skill tool calls` : "0 skill tool calls",
    toolCalls.length ? `${toolCalls.length} context tool calls` : "0 context tool calls",
    trace?.eventCount ? `${trace.eventCount} events` : "0 events"
  ];

  for (const value of traceMetrics) {
    const pill = document.createElement("div");
    pill.className = "metric";
    pill.textContent = value;
    metricsNode.append(pill);
  }

  if (!runtime?.skillsRuntimeAvailable) {
    statusNode.textContent =
      "The current Python environment does not expose agno.skills, so this agent is running from instructions and structured manifests only. If tool calls appear later, they will show here.";
  } else if (!runtime?.loadedSkillCount) {
    statusNode.textContent =
      "Agno skills support exists, but no validated prompt skills were loaded from disk.";
  } else if (!toolCalls.length && !skillToolCalls.length) {
    statusNode.textContent =
      "Skills are loaded, but this run did not expose tool events. If the compiler uses context tools, they will appear below.";
  } else {
    statusNode.textContent =
      "The notebook V2 run exposed its context tool calls and loaded prompt skills below.";
  }

  if (loadedSkillNames.length) {
    const block = document.createElement("div");
    block.className = "trace-event trace-event-skills";
    block.innerHTML = `
      <div class="trace-event-top">
        <div class="trace-event-name">Loaded prompt skills</div>
        <div class="trace-event-tool">${loadedSkillNames.length}</div>
      </div>
      <div class="trace-event-body">${loadedSkillNames.join(", ")}</div>
    `;
    eventsNode.append(block);
  }

  if (toolCalls.length) {
    for (const event of toolCalls) {
      const block = document.createElement("div");
      block.className = "trace-event trace-event-tool-call";
      block.innerHTML = `
        <div class="trace-event-top">
          <div class="trace-event-name">Context tool call</div>
          <div class="trace-event-tool">${event.toolName ?? "tool"}</div>
        </div>
        <div class="trace-event-body">${formatTraceBody(event.toolResult || event.content || "No result payload.")}</div>
      `;
      eventsNode.append(block);
    }
  }

  if (skillToolCalls.length) {
    for (const event of skillToolCalls) {
      const block = document.createElement("div");
      block.className = "trace-event trace-event-skill-call";
      block.innerHTML = `
        <div class="trace-event-top">
          <div class="trace-event-name">Skill tool call</div>
          <div class="trace-event-tool">${event.toolName ?? "skill"}</div>
        </div>
        <div class="trace-event-body">${formatTraceBody(event.toolResult || event.content || "No result payload.")}</div>
      `;
      eventsNode.append(block);
    }
  }

  const interestingEvents = (trace?.events ?? []).filter((event) =>
    !toolCalls.includes(event) &&
    !skillToolCalls.includes(event) &&
    ["RunStarted", "ReasoningStarted", "ReasoningStep", "ReasoningCompleted", "ToolCallStarted", "ToolCallCompleted", "RunCompleted", "RunError"].includes(event.event)
  );

  if (interestingEvents.length === 0 && !toolCalls.length && !skillToolCalls.length && !loadedSkillNames.length) {
    const empty = document.createElement("div");
    empty.className = "trace-event";
    empty.innerHTML = `
      <div class="trace-event-top">
        <div class="trace-event-name">No notable runtime events</div>
      </div>
      <div class="trace-event-body">This run produced no streamed tool or reasoning events beyond the normal model response.</div>
    `;
    eventsNode.append(empty);
    return;
  }

  for (const event of interestingEvents) {
    const block = document.createElement("div");
    block.className = "trace-event";
    const bodyParts = [];
    if (event.reasoning) bodyParts.push(event.reasoning);
    if (event.content && event.event !== "RunCompleted") bodyParts.push(event.content);
    if (event.toolArgs) bodyParts.push(JSON.stringify(event.toolArgs, null, 2));
    if (event.toolError) bodyParts.push(`Error: ${event.toolError}`);
    block.innerHTML = `
      <div class="trace-event-top">
        <div class="trace-event-name">${event.event}</div>
        <div class="trace-event-tool">${event.toolName ?? ""}</div>
      </div>
      <div class="trace-event-body">${formatTraceBody(bodyParts.join("\n\n") || "No extra payload.")}</div>
    `;
    eventsNode.append(block);
  }
}

function formatTraceBody(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return escapeHtml(text.length > 2200 ? `${text.slice(0, 2200)}\n…` : text);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
