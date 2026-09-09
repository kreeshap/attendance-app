// Base project config
const SUPABASE_URL = "https://mkizsdepvbrevyojmbjq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1raXpzZGVwdmJyZXZ5b2ptYmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NjA5ODIsImV4cCI6MjEwNDAzNjk4Mn0.pKpq9evw3YvmKeJ0dQBUxIYLkhPNAKcxMGQByAmNcRg";

// Initialize using the global window.supabase object from the CDN script
// Named dbClient so it won't collide with window.supabase
const dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

// Maintain focus on scanner input
document.addEventListener("click", focusScannerInput);
window.addEventListener("load", focusScannerInput);

function focusScannerInput() {
  if (scannerInput) {
    scannerInput.focus();
  }
}

// Capture Barcode Input
if (scannerInput) {
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
}

// Handle Scanned Member ID
async function handleScan(decodedText) {
  const currentTime = Date.now();

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
      .eq("member_id", decodedText)
      .maybeSingle();

    if (memberError || !member) {
      showStatus("UNKNOWN PASS", "#f44336", "INVALID ID", decodedText);
      return;
    }

    // 2. Check for active check-in
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

    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (activeLog) {
      // CHECK OUT
      const { error: updateError } = await dbClient
        .from("attendance")
        .update({ check_out: new Date().toISOString() })
        .eq("id", activeLog.id);

      if (updateError) throw updateError;

      showStatus("✓ CHECKED OUT", "#ff9800", member.full_name.toUpperCase(), `AT ${timeString}`);
    } else {
      // CHECK IN
      const { error: insertError } = await dbClient
        .from("attendance")
        .insert([{ member_id: decodedText, check_in: new Date().toISOString() }]);

      if (insertError) throw insertError;

      showStatus("CHECKED IN", "#4caf50", member.full_name.toUpperCase(), `AT ${timeString}`);
    }

  } catch (err) {
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

  if (hideCardTimeout) clearTimeout(hideCardTimeout);
  hideCardTimeout = setTimeout(() => {
    card.style.display = "none";
    focusScannerInput();
  }, 4000);
}