// Base project config
const SUPABASE_URL = "https://mkizsdepvbrevyojmbjq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1raXpzZGVwdmJyZXV5b2ptYmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NjA5ODIsImV4cCI6MjEwNDAzNjk4Mn0.pKpq9evw3YvmKeJ0dQBUxIYLkhPNAKcxMGQByAmNcRg";
const MODE_STORAGE_KEY = "robostangs_mode";
const EVENT_STORAGE_KEY = "robostangs_event_name";

const dbClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let lastScanId = null;
let lastScanTime = 0;
let hideCardTimeout = null;
let currentMode = "meeting";
let outreachEventName = "";
let outreachActive = false;

const card = document.getElementById("status-card");
const actionEl = document.getElementById("status-action");
const nameEl = document.getElementById("status-name");
const timeEl = document.getElementById("status-time");
const scannerInput = document.getElementById("scanner-input");
const modeToggle = document.getElementById("mode-toggle");
const eventNameLabel = document.getElementById("event-name-label");
const appTitle = document.getElementById("app-title");
const scannerPrompt = document.getElementById("scanner-prompt");
const eventPromptModal = document.getElementById("event-prompt-modal");
const eventNameInput = document.getElementById("event-name-input");
const eventPromptCancel = document.querySelector(".event-prompt-cancel");
const eventPromptSubmit = document.querySelector(".event-prompt-submit");

function persistSessionState() {
  try {
    sessionStorage.setItem(MODE_STORAGE_KEY, currentMode);
    if (outreachEventName) {
      sessionStorage.setItem(EVENT_STORAGE_KEY, outreachEventName);
    } else {
      sessionStorage.removeItem(EVENT_STORAGE_KEY);
    }
  } catch (err) {
    console.warn("Could not persist mode state:", err);
  }
}

function restoreSessionState() {
  try {
    const savedMode = sessionStorage.getItem(MODE_STORAGE_KEY);
    const savedEvent = sessionStorage.getItem(EVENT_STORAGE_KEY);

    if (savedMode === "outreach") currentMode = "outreach";
    if (savedEvent) outreachEventName = savedEvent;
  } catch (err) {
    console.warn("Could not restore session state:", err);
  }
}

function focusScannerInput() {
  if (!scannerInput) return;
  scannerInput.focus();
  scannerInput.setSelectionRange(0, 0);
}

function updateModeUI() {
  const isOutreach = currentMode === "outreach";

  if (modeToggle) {
    modeToggle.classList.toggle("outreach", isOutreach);
    modeToggle.textContent = isOutreach ? "OUTREACH" : "MEETING";
  }

  if (appTitle) appTitle.textContent = isOutreach ? "OUTREACH" : "ROBOSTANGS";

  if (scannerPrompt) {
    scannerPrompt.textContent = isOutreach ? "SCAN TO CHECK IN / OUT" : "SCAN YOUR MEMBER PASS";
  }

  if (eventNameLabel) {
    const showEventName = isOutreach && outreachEventName;
    eventNameLabel.textContent = showEventName ? outreachEventName.toUpperCase() : "";
    eventNameLabel.style.display = showEventName ? "block" : "none";
  }

  persistSessionState();
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
    showStatus("NO EVENT NAME", "#f44336", "ENTER EVENT NAME", "");
    closeEventNamePrompt();
    return;
  }

  outreachEventName = enteredName;
  currentMode = "outreach";
  outreachActive = false;
  closeEventNamePrompt();
  updateModeUI();
  showStatus("OUTREACH MODE", "#2196f3", outreachEventName.toUpperCase(), "ACTIVE");
}

function enableOutreachMode() {
  if (currentMode === "outreach" && outreachActive) {
    showStatus("OUTREACH ACTIVE", "#ff9800", "CHECK OUT FIRST", "");
    return;
  }

  openEventNamePrompt();
}

function disableOutreachMode() {
  if (currentMode !== "outreach") return;

  currentMode = "meeting";
  outreachActive = false;
  outreachEventName = "";
  updateModeUI();
  showStatus("MEETING MODE", "#4caf50", "READY TO SCAN", "");
}

if (modeToggle) {
  modeToggle.addEventListener("click", () => {
    if (currentMode === "meeting") {
      enableOutreachMode();
      return;
    }

    if (outreachActive) {
      showStatus("CHECK OUT OF OUTREACH FIRST", "#ff9800", "SCAN MEMBER PASS TO END", "");
      return;
    }

    disableOutreachMode();
  });
}

if (eventPromptCancel) eventPromptCancel.addEventListener("click", closeEventNamePrompt);
if (eventPromptSubmit) eventPromptSubmit.addEventListener("click", submitEventName);

if (eventNameInput) {
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
    if (event.target === eventPromptModal) closeEventNamePrompt();
  });
}

if (scannerInput) {
  scannerInput.setAttribute("autocomplete", "off");
  scannerInput.setAttribute("autocorrect", "off");
  scannerInput.setAttribute("autocapitalize", "none");
  scannerInput.setAttribute("spellcheck", "false");
  scannerInput.setAttribute("inputmode", "none");

  scannerInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const decodedText = scannerInput.value.trim();
    scannerInput.value = "";

    if (decodedText) await handleScan(decodedText);
  });

  scannerInput.addEventListener("blur", () => setTimeout(focusScannerInput, 50));
}

document.addEventListener("click", (event) => {
  if (event.target && event.target.closest("#mode-toggle")) return;
  focusScannerInput();
});
window.addEventListener("focus", focusScannerInput);
window.addEventListener("load", focusScannerInput);

async function handleScan(decodedText) {
  const currentTime = Date.now();

  if (!dbClient) {
    showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
    return;
  }

  if (decodedText === lastScanId && currentTime - lastScanTime < 10000) {
    console.log("Duplicate scan ignored:", decodedText);
    return;
  }

  lastScanId = decodedText;
  lastScanTime = currentTime;

  try {
    const { data: member, error: memberError } = await dbClient
      .from("members")
      .select("member_id, full_name")
      .eq("member_id", decodedText)
      .maybeSingle();

    if (memberError || !member) {
      showStatus("UNKNOWN PASS", "#f44336", "INVALID ID", decodedText);
      return;
    }

    const { data: activeLog, error: logError } = await dbClient
      .from("attendance")
      .select("id")
      .eq("member_id", decodedText)
      .is("check_out", null)
      .maybeSingle();

    if (logError) {
      showStatus("SYSTEM ERROR", "#f44336", "PLEASE SIGN IN MANUALLY", "DATABASE ERROR");
      return;
    }

    const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (activeLog) {
      const { error: updateError } = await dbClient
        .from("attendance")
        .update({ check_out: new Date().toISOString() })
        .eq("id", activeLog.id);

      if (updateError) throw updateError;

      if (currentMode === "outreach") outreachActive = false;

      showStatus("CHECKED OUT", "#ff9800", member.full_name.toUpperCase(), `AT ${timeString}`);
      return;
    }

    const { error: insertError } = await dbClient
      .from("attendance")
      .insert([{ member_id: decodedText, check_in: new Date().toISOString() }]);

    if (insertError) throw insertError;

    if (currentMode === "outreach") outreachActive = true;

    showStatus("CHECKED IN", "#4caf50", member.full_name.toUpperCase(), `AT ${timeString}`);
  } catch (err) {
    console.error("Scan processing error:", err);
    showStatus("SYSTEM ERROR", "#f44336", "PLEASE SIGN IN MANUALLY", "TRY AGAIN");
  }
}

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

  clearTimeout(hideCardTimeout);
  hideCardTimeout = setTimeout(() => {
    card.style.display = "none";
    focusScannerInput();
  }, 3500);
}

restoreSessionState();
updateModeUI();
