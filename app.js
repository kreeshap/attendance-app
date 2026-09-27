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

// State trackers
let lastScanId = null;
let lastScanTime = 0;
let hideCardTimeout = null;

// UI Elements
const card = document.getElementById("status-card");
const actionEl = document.getElementById("status-action");
const nameEl = document.getElementById("status-name");
const timeEl = document.getElementById("status-time");
const scannerInput = document.getElementById("scanner-input");

function focusScannerInput() {
  if (scannerInput) {
    scannerInput.focus();
    scannerInput.setSelectionRange(0, 0);
  }
}

document.addEventListener("pointerdown", () => {
  focusScannerInput();
});
window.addEventListener("focus", focusScannerInput);
window.addEventListener("load", focusScannerInput);

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

