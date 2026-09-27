// Production Supabase config.
// Only use the public anon key in browser code.
const SUPABASE_URL = "https://mkizsdepvbrevyojmbjq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1raXpzZGVwdmJyZXV5b2ptYmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NjA5ODIsImV4cCI6MjEwNDAzNjk4Mn0.pKpq9evw3YvmKeJ0dQBUxIYLkhPNAKcxMGQByAmNcRg";

function decodeJwtPayload(jwt) {
  if (!jwt || typeof jwt !== "string" || !jwt.includes(".")) {
    return null;
  }

  try {
    const payload = jwt.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const json = decodeURIComponent(
      Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
    );
    return JSON.parse(json);
  } catch (err) {
    console.warn("Could not decode Supabase JWT payload:", err);
    return null;
  }
}

function getSupabaseProjectRefFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/\.supabase\.co$/i, "");
  } catch (err) {
    return null;
  }
}

function validateSupabaseConfig(url, key) {
  const urlRef = getSupabaseProjectRefFromUrl(url);
  const keyPayload = decodeJwtPayload(key);
  const keyRef = keyPayload && keyPayload.ref ? String(keyPayload.ref) : null;

  if (urlRef && keyRef && urlRef !== keyRef) {
    console.error(
      "Supabase URL/key mismatch. URL project ref is " + urlRef + " but the anon key belongs to " + keyRef + ". Update the project URL or replace the key with the exact value from Supabase Dashboard > Project Settings > API."
    );
    return false;
  }

  return true;
}

// Initialize using the global window.supabase object from the CDN script.
const dbClient = window.supabase && validateSupabaseConfig(SUPABASE_URL, SUPABASE_ANON_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const MODE_STORAGE_KEY = "robostangs_mode";
const EVENT_STORAGE_KEY = "robostangs_event_name";

// State trackers
let lastScanId = null;
let lastScanTime = 0;
let hideCardTimeout = null;
let currentMode = "meeting";
let outreachEventName = "";
let outreachActive = false;

// UI Elements
const card = document.getElementById("status-card");
const actionEl = document.getElementById("status-action");
const nameEl = document.getElementById("status-name");
const timeEl = document.getElementById("status-time");
const scannerInput = document.getElementById("scanner-input");
const modeToggle = document.getElementById("mode-toggle");
const scannerPrompt = document.getElementById("scanner-prompt");
const eventPromptModal = document.getElementById("event-prompt-modal");
const eventNameInput = document.getElementById("event-name-input");
const eventPromptCancel = document.querySelector(".event-prompt-cancel");
const eventPromptSubmit = document.querySelector(".event-prompt-submit");

function saveModeState() {
  try {
    sessionStorage.setItem(MODE_STORAGE_KEY, currentMode);
  } catch (err) {
    console.warn("Could not save mode state:", err);
  }
}

function saveEventState() {
  try {
    if (outreachEventName) {
      sessionStorage.setItem(EVENT_STORAGE_KEY, outreachEventName);
    } else {
      sessionStorage.removeItem(EVENT_STORAGE_KEY);
    }
  } catch (err) {
    console.warn("Could not save event state:", err);
  }
}

function restoreSessionState() {
  try {
    const savedMode = sessionStorage.getItem(MODE_STORAGE_KEY);
    const savedEvent = sessionStorage.getItem(EVENT_STORAGE_KEY);

    if (savedMode === "outreach") {
      currentMode = "outreach";
    }

    if (savedEvent) {
      outreachEventName = savedEvent;
    }
  } catch (err) {
    console.warn("Could not restore session state:", err);
  }
}

function focusScannerInput() {
  if (eventPromptModal && eventPromptModal.classList.contains("visible")) {
    return;
  }

  if (scannerInput) {
    scannerInput.focus();
    scannerInput.setSelectionRange(0, 0);
  }
}

document.addEventListener("pointerdown", (event) => {
  const clickedToggle = event.target && event.target.closest && event.target.closest("#mode-toggle");
  const clickedPromptField = event.target && event.target.closest && event.target.closest("#event-name-input, .event-prompt-card, .event-prompt-submit, .event-prompt-cancel");

  if (clickedToggle || clickedPromptField) {
    return;
  }

  if (eventPromptModal && eventPromptModal.classList.contains("visible")) {
    return;
  }

  focusScannerInput();
});
window.addEventListener("focus", () => {
  if (eventPromptModal && eventPromptModal.classList.contains("visible")) {
    return;
  }

  focusScannerInput();
});
window.addEventListener("load", focusScannerInput);

function updateModeUI() {
  const isOutreach = currentMode === "outreach";
  const trimmedEventName = outreachEventName ? outreachEventName.trim() : "";

  if (modeToggle) {
    modeToggle.classList.toggle("outreach", isOutreach);
    modeToggle.textContent = isOutreach
      ? (trimmedEventName ? trimmedEventName.toUpperCase() : "OUTREACH")
      : "MEETING";
  }

  if (scannerPrompt) {
    scannerPrompt.classList.remove("outreach-event", "outreach-instruction");

    if (isOutreach && trimmedEventName) {
      scannerPrompt.textContent = trimmedEventName.toUpperCase();
      scannerPrompt.classList.add("outreach-event");
    } else if (isOutreach) {
      scannerPrompt.textContent = "SCAN IN / SCAN OUT";
      scannerPrompt.classList.add("outreach-instruction");
    } else {
      scannerPrompt.textContent = "SCAN YOUR MEMBER PASS";
    }
  }

  saveModeState();
  saveEventState();
}

function openEventNamePrompt() {
  if (!eventPromptModal || !eventNameInput) return;

  eventPromptModal.classList.add("visible");
  eventPromptModal.setAttribute("aria-hidden", "false");
  eventNameInput.value = outreachEventName;
  setTimeout(() => eventNameInput.focus(), 50);
}

function closeEventNamePrompt() {
  if (!eventPromptModal) return;

  eventPromptModal.classList.remove("visible");
  eventPromptModal.setAttribute("aria-hidden", "true");
  focusScannerInput();
}

function submitEventName() {
  const enteredName = eventNameInput ? eventNameInput.value.trim() : "";

  if (!enteredName) {
    closeEventNamePrompt();
    return;
  }

  outreachEventName = enteredName;
  currentMode = "outreach";
  outreachActive = false;
  closeEventNamePrompt();
  updateModeUI();
}

function enableOutreachMode() {
  if (currentMode === "outreach" && outreachActive) {
    return;
  }

  openEventNamePrompt();
}

function disableOutreachMode() {
  if (currentMode !== "outreach") {
    return;
  }

  currentMode = "meeting";
  outreachActive = false;
  outreachEventName = "";
  updateModeUI();
}

if (modeToggle) {
  modeToggle.addEventListener("click", () => {
    if (currentMode === "meeting") {
      enableOutreachMode();
    } else if (!outreachActive) {
      disableOutreachMode();
    }
  });
}

if (eventPromptCancel) {
  eventPromptCancel.addEventListener("click", closeEventNamePrompt);
}

if (eventPromptSubmit) {
  eventPromptSubmit.addEventListener("click", submitEventName);
}

if (eventNameInput) {
  eventNameInput.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  eventNameInput.addEventListener("focus", () => {
    if (eventPromptModal) {
      eventPromptModal.classList.add("visible");
      eventPromptModal.setAttribute("aria-hidden", "false");
    }
  });

  eventNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitEventName();
    }
    if (event.key === "Escape") {
      closeEventNamePrompt();
    }
  });
}

if (eventPromptModal) {
  eventPromptModal.addEventListener("click", (event) => {
    if (event.target === eventPromptModal) {
      closeEventNamePrompt();
    }
  });
}

restoreSessionState();
updateModeUI();

// Capture Barcode Input
if (scannerInput) {
  scannerInput.setAttribute("autocomplete", "off");
  scannerInput.setAttribute("autocorrect", "off");
  scannerInput.setAttribute("autocapitalize", "none");
  scannerInput.setAttribute("spellcheck", "false");
  scannerInput.setAttribute("inputmode", "none");

  scannerInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const decodedText = scannerInput.value.trim();
      scannerInput.value = "";

      if (decodedText) {
        await handleScan(decodedText);
      }
    }
  });

  scannerInput.addEventListener("blur", () => {
    setTimeout(() => focusScannerInput(), 50);
  });
}

function isSupabaseAuthFailure(error) {
  if (!error) return false;

  const status = error.status || error.code;
  const message = String(error.message || error.details || error.hint || "").toLowerCase();

  return status === 401 || status === "401" || message.includes("unauthorized") || message.includes("row level security") || message.includes("jwt");
}

// Handle Scanned Member ID
async function handleScan(decodedText) {
  const currentTime = Date.now();
  const normalizedId = String(decodedText || "").trim();

  if (!normalizedId) return;

  if (!dbClient) {
    showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
    return;
  }

  // Prevent double scans within 10 seconds
  if (decodedText === lastScanId && (currentTime - lastScanTime) < 10000) {
    console.log("Duplicate scan ignored:", decodedText);
    return;
  }

  lastScanId = decodedText;
  lastScanTime = currentTime;

  try {
    // 1. Look up member
    const { data: member, error: memberError } = await dbClient
      .from("members")
      .select("member_id, full_name, group")
      .eq("member_id", normalizedId)
      .maybeSingle();

    if (memberError || !member) {
      if (isSupabaseAuthFailure(memberError)) {
        showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
        return;
      }

      showStatus("UNKNOWN PASS", "#f44336", "INVALID ID", normalizedId);
      return;
    }

    // 2. Check for active check-in
    const { data: activeLog, error: logError } = await dbClient
      .from("attendance")
      .select("id")
      .eq("member_id", normalizedId)
      .is("check_out", null)
      .maybeSingle();

    if (logError) {
      if (isSupabaseAuthFailure(logError)) {
        showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
        return;
      }

      showStatus("SYSTEM ERROR", "#f44336", "PLEASE SIGN IN MANUALLY", "DATABASE ERROR");
      return;
    }

    const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (activeLog) {
      // CHECK OUT
      const { error: updateError } = await dbClient
        .from("attendance")
        .update({ check_out: new Date().toISOString() })
        .eq("id", activeLog.id);

      if (updateError) {
        if (isSupabaseAuthFailure(updateError)) {
          showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
          return;
        }

        throw updateError;
      }

      showStatus("CHECKED OUT", "#ff9800", member.full_name.toUpperCase(), `AT ${timeString}`);
    } else {
      // CHECK IN
      const { error: insertError } = await dbClient
        .from("attendance")
        .insert([{ member_id: normalizedId, check_in: new Date().toISOString() }]);

      if (insertError) {
        if (isSupabaseAuthFailure(insertError)) {
          showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
          return;
        }

        throw insertError;
      }

      showStatus("CHECKED IN", "#4caf50", member.full_name.toUpperCase(), `AT ${timeString}`);
    }

  } catch (err) {
    if (isSupabaseAuthFailure(err)) {
      showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
      return;
    }

    console.error("Scan processing error:", err);
    showStatus("SYSTEM ERROR", "#f44336", "PLEASE SIGN IN MANUALLY", "TRY AGAIN");
  }
}

// Explicitly bind to window for DevTools access
window.handleScan = handleScan;

function showStatus(action, color, name, time) {
  if (!card || !actionEl || !nameEl || !timeEl) return;

  actionEl.textContent = action;
  actionEl.style.color = color;
  nameEl.textContent = name;
  timeEl.textContent = time;
  card.style.display = "block";
  card.style.borderColor = color;
  card.style.background = "rgba(20, 33, 40, 0.96)";

  if (hideCardTimeout) clearTimeout(hideCardTimeout);
  hideCardTimeout = setTimeout(() => {
    card.style.display = "none";
    focusScannerInput();
  }, 3500);
}

