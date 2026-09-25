const API_BASE_URL = "https://backend-production-e517.up.railway.app";

const btnCode = document.getElementById("btn-code");
const phoneInput = document.getElementById("phone");
const result = document.getElementById("result");
const spinner = document.getElementById("spinner");
const codeDisplay = document.getElementById("code-display");
const statusText = document.getElementById("status-text");

let pollTimer = null;
let currentSessionId = null;
let polling = false;

const POLL_INTERVAL = 3000;
const MAX_POLL_TIME = 5 * 60 * 1000;

function resetResult() {
    stopPolling();
    currentSessionId = null;

    result.classList.add("hidden");
    codeDisplay.classList.add("hidden");
    spinner.classList.remove("hidden");

    codeDisplay.textContent = "";
    statusText.textContent = "";
}

function formatCode(raw) {
    const cleaned = String(raw || "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase();

    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join("-") : cleaned;
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    });

    let data = {};
    try {
        data = await res.json();
    } catch {}

    return { res, data };
}

async function startPairing(number) {
    resetResult();
    result.classList.remove("hidden");
    statusText.textContent = "Starting pairing session...";

    const body = { number };

    try {
        const { res, data } = await apiFetch(
            `${API_BASE_URL}/api/pair/start`,
            {
                method: "POST",
                body: JSON.stringify(body)
            }
        );

        if (!res.ok || !data.sessionId) {
            spinner.classList.add("hidden");
            statusText.textContent =
                `❌ ${data.error || "Could not start pairing session."}`;
            return;
        }

        currentSessionId = data.sessionId;
        startPolling(currentSessionId);
    } catch (err) {
        console.error("Pairing start error:", err);
        spinner.classList.add("hidden");
        statusText.textContent =
            "❌ Could not reach the pairing server.";
    }
}

function startPolling(sessionId) {
    stopPolling();
    polling = true;
    pollSession(sessionId, Date.now());
}

function stopPolling() {
    polling = false;

    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
}

async function pollSession(sessionId, startedAt) {
    if (!polling || currentSessionId !== sessionId) return;

    if (Date.now() - startedAt > MAX_POLL_TIME) {
        stopPolling();
        spinner.classList.add("hidden");
        statusText.textContent =
            "❌ Pairing session timed out. Please start again.";
        return;
    }

    try {
        const { res, data } = await apiFetch(
            `${API_BASE_URL}/api/pair/status/${encodeURIComponent(sessionId)}`
        );

        if (!res.ok) {
            stopPolling();
            spinner.classList.add("hidden");
            statusText.textContent =
                `❌ ${data.error || "Session not found."}`;
            return;
        }

        handleStatus(data);

        if (
            ["online", "failed", "expired", "logged_out"].includes(data.status)
        ) {
            stopPolling();
            return;
        }

        pollTimer = setTimeout(
            () => pollSession(sessionId, startedAt),
            POLL_INTERVAL
        );
    } catch (err) {
        console.error("Status polling error:", err);
        stopPolling();
        spinner.classList.add("hidden");
        statusText.textContent =
            "❌ Lost connection to the pairing server.";
    }
}

function handleStatus(data) {
    switch (data.status) {
        case "code":
            if (data.code) {
                spinner.classList.add("hidden");
                codeDisplay.textContent = formatCode(data.code);
                codeDisplay.classList.remove("hidden");
                statusText.textContent =
                    "Open WhatsApp → Linked Devices → Link with phone number and enter this code.";
            }
            break;

        case "connecting":
        case "connected":
            spinner.classList.remove("hidden");
            codeDisplay.classList.add("hidden");
            statusText.innerHTML =
                "✅ <strong>WhatsApp linked successfully.</strong><br><br>" +
                "🤖 Bot connecting...<br>" +
                "⏳ Please wait about 3 minutes.<br><br>" +
                "You do not need to copy or send any Session ID.";
            break;

        case "online":
            spinner.classList.add("hidden");
            codeDisplay.classList.add("hidden");
            statusText.innerHTML =
                "🤖 <strong>Bot is online!</strong><br><br>" +
                "✅ Connection completed successfully.";
            break;

        case "failed":
            spinner.classList.add("hidden");
            codeDisplay.classList.add("hidden");
            statusText.textContent =
                `❌ ${data.error || "Pairing failed. Please try again."}`;
            break;

        case "expired":
            spinner.classList.add("hidden");
            statusText.textContent =
                "❌ This pairing session expired. Please start again.";
            break;

        case "logged_out":
            spinner.classList.add("hidden");
            statusText.textContent =
                "❌ This WhatsApp account was logged out. Please pair again.";
            break;

        default:
            spinner.classList.remove("hidden");
            statusText.textContent = "Starting pairing session...";
    }
}

btnCode.addEventListener("click", () => {
    const number = phoneInput.value.trim().replace(/[^0-9]/g, "");

    if (!number || number.length < 9) {
        alert(
            "Please enter a valid WhatsApp number with country code.\n\n" +
            "Example: 94771234567"
        );
        return;
    }

    btnCode.disabled = true;

    startPairing(number)
        .finally(() => {
            btnCode.disabled = false;
        });
});

window.addEventListener("beforeunload", stopPolling);

resetResult();
