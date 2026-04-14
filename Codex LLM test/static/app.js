const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("prompt-input");
const sendButtonEl = document.getElementById("send-button");
const clearButtonEl = document.getElementById("clear-button");
const statusBadgeEl = document.getElementById("status-badge");
const modelBadgeEl = document.getElementById("model-badge");

const initialAssistantMessage =
  "The chat UI is ready. Add your OpenAI API key, then ask anything you want.";

let conversation = [
  { role: "assistant", content: initialAssistantMessage, localOnly: true },
];
let busy = false;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatMessage(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderMessages() {
  messagesEl.innerHTML = conversation
    .map(
      (message) => `
        <article class="message message-${message.role}">
          <div class="message-role">${message.role}</div>
          <div class="message-body">${formatMessage(message.content)}</div>
        </article>
      `
    )
    .join("");

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(text, tone = "muted") {
  statusBadgeEl.textContent = text;
  statusBadgeEl.className = `pill pill-${tone}`;
}

function setBusy(nextBusy) {
  busy = nextBusy;
  sendButtonEl.disabled = nextBusy;
  inputEl.disabled = nextBusy;
  clearButtonEl.disabled = nextBusy;
  sendButtonEl.textContent = nextBusy ? "Thinking..." : "Send";
}

function resetConversation(extraAssistantMessage = initialAssistantMessage) {
  conversation = [
    { role: "assistant", content: extraAssistantMessage, localOnly: true },
  ];
  renderMessages();
}

function buildRequestMessages() {
  return conversation
    .filter((message) => !message.localOnly)
    .map(({ role, content }) => ({ role, content }));
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();

    modelBadgeEl.textContent = `Model: ${config.model || "unknown"}`;

    if (config.apiKeyConfigured) {
      setStatus("Ready", "ok");
    } else {
      setStatus("Missing OPENAI_API_KEY", "warn");
      resetConversation(
        "The UI is running, but OPENAI_API_KEY is not set yet. Add it in your terminal, restart the server, and the chatbox will work."
      );
    }
  } catch (error) {
    setStatus("Setup check failed", "warn");
    resetConversation(
      "I could not read the local server configuration. Make sure the Python server is running."
    );
  }
}

async function sendMessage(prompt) {
  conversation.push({ role: "user", content: prompt });
  renderMessages();
  setBusy(true);
  setStatus("Waiting for GPT-5.4...", "muted");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: buildRequestMessages() }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The server returned an error.");
    }

    conversation.push({
      role: "assistant",
      content: data.reply || "No text reply was returned.",
    });
    renderMessages();
    setStatus("Ready", "ok");
  } catch (error) {
    conversation.push({
      role: "assistant",
      content: `Error: ${error.message}`,
      localOnly: true,
    });
    renderMessages();
    setStatus("Request failed", "warn");
  } finally {
    setBusy(false);
    inputEl.focus();
  }
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) {
    return;
  }

  const prompt = inputEl.value.trim();
  if (!prompt) {
    return;
  }

  inputEl.value = "";
  await sendMessage(prompt);
});

inputEl.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    formEl.requestSubmit();
  }
});

clearButtonEl.addEventListener("click", () => {
  if (busy) {
    return;
  }
  resetConversation();
  inputEl.focus();
  setStatus("Checking setup...", "muted");
  loadConfig();
});

renderMessages();
loadConfig();
