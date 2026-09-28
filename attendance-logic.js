(function () {
  const SUPABASE_URL = (typeof window !== "undefined" && window.__ROBOSTANGS_SUPABASE_URL__) ? String(window.__ROBOSTANGS_SUPABASE_URL__).trim() : "";
  const SUPABASE_ANON_KEY = (typeof window !== "undefined" && window.__ROBOSTANGS_SUPABASE_ANON_KEY__) ? String(window.__ROBOSTANGS_SUPABASE_ANON_KEY__).trim() : "";

  const MODE_STORAGE_KEY = "robostangs_mode";
  const EVENT_STORAGE_KEY = "robostangs_event_name";
  const EVENT_ID_STORAGE_KEY = "robostangs_event_id";
  const EVENT_NAME_STORAGE_KEY = "robostangs_event_name_v2";
  const GOOGLE_CALENDAR_ID = "cqul964gqsvk45mmlbfdkto2js@group.calendar.google.com";
  const GOOGLE_CALENDAR_TIMEZONE = "America/New_York";

  function formatCalendarEventTime(value) {
    if (!value) return "TBD";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function getGoogleCalendarApiKey() {
    if (typeof window === "undefined") {
      return "";
    }

    const key = window.__ROBOSTANGS_GOOGLE_CALENDAR_KEY__ || window.GOOGLE_CALENDAR_KEY || "";
    return String(key).trim();
  }

  function getGoogleCalendarId() {
    if (typeof window === "undefined") {
      return GOOGLE_CALENDAR_ID;
    }

    const override = window.__ROBOSTANGS_GOOGLE_CALENDAR_ID__ || "";
    return String(override || GOOGLE_CALENDAR_ID).trim() || GOOGLE_CALENDAR_ID;
  }

  function buildDateRangeForToday(timeZone) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const parts = formatter.formatToParts(now);
    const values = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        values[part.type] = part.value;
      }
    }

    const dateString = `${values.year}-${String(values.month).padStart(2, "0")}-${String(values.day).padStart(2, "0")}`;
    const timeZoneOffsetMin = (() => {
      const tzFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });

      const tzParts = tzFormatter.formatToParts(now);
      const tzName = tzParts.find((part) => part.type === "timeZoneName")?.value || "GMT";
      const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);

      if (!match) {
        return 0;
      }

      const sign = match[1] === "-" ? -1 : 1;
      const hours = Number(match[2]) || 0;
      const minutes = Number(match[3]) || 0;
      return sign * (hours * 60 + minutes);
    })();

    const sign = timeZoneOffsetMin >= 0 ? "+" : "-";
    const absOffset = Math.abs(timeZoneOffsetMin);
    const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
    const offsetMinutes = String(absOffset % 60).padStart(2, "0");
    const offsetString = `${sign}${offsetHours}:${offsetMinutes}`;

    return {
      date: dateString,
      timeMin: new Date(`${dateString}T00:00:00${offsetString}`).toISOString(),
      timeMax: new Date(`${dateString}T23:59:59${offsetString}`).toISOString()
    };
  }

  function normalizeGoogleCalendarEvent(rawEvent) {
    if (!rawEvent) {
      return null;
    }

    const startValue = rawEvent.start?.dateTime || rawEvent.start?.date;
    const endValue = rawEvent.end?.dateTime || rawEvent.end?.date || startValue;

    if (!startValue) {
      return null;
    }

    return {
      id: String(rawEvent.id || `event-${Math.random().toString(36).slice(2, 10)}`),
      name: rawEvent.summary || "Untitled event",
      start: startValue,
      end: endValue,
      location: rawEvent.location || null
    };
  }

  async function getTodaysCalendarEvents() {
    const customEvents = window.__ROBOSTANGS_CALENDAR_EVENTS__;
    if (Array.isArray(customEvents)) {
      return customEvents
        .filter(Boolean)
        .map((event) => ({
          id: String(event.id || `event-${Math.random().toString(36).slice(2, 10)}`),
          name: event.name || "Untitled event",
          start: event.start,
          end: event.end || event.start,
          location: event.location || null
        }))
        .filter((event) => event && event.start)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
    }

    const apiKey = getGoogleCalendarApiKey();
    if (!apiKey) {
      console.warn("Google Calendar API key not configured. Set window.__ROBOSTANGS_GOOGLE_CALENDAR_KEY__ before loading the app.");
      return [];
    }

    const calendarId = getGoogleCalendarId();
    const { timeMin, timeMax } = buildDateRangeForToday(GOOGLE_CALENDAR_TIMEZONE);
    const calendarUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);

    calendarUrl.searchParams.set("key", apiKey);
    calendarUrl.searchParams.set("timeMin", timeMin);
    calendarUrl.searchParams.set("timeMax", timeMax);
    calendarUrl.searchParams.set("singleEvents", "true");
    calendarUrl.searchParams.set("orderBy", "startTime");
    calendarUrl.searchParams.set("timeZone", GOOGLE_CALENDAR_TIMEZONE);

    try {
      const response = await fetch(calendarUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Google Calendar request failed:", response.status, errorText);
        return [];
      }

      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];

      return items
        .map(normalizeGoogleCalendarEvent)
        .filter(Boolean)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
    } catch (error) {
      console.error("Unable to load Google Calendar events:", error);
      return [];
    }
  }

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

  function createAttendanceApp(elements) {
    const {
      scannerInput,
      modeToggle,
      scannerPrompt,
      scannerSubtext,
      appTitle,
      eventPromptModal,
      eventPromptCancel,
      eventPromptSubmit,
      eventSelectionList,
      eventSelectionTitle
    } = elements;

    const dbClient = window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY && validateSupabaseConfig(SUPABASE_URL, SUPABASE_ANON_KEY)
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : null;

    let lastScanId = null;
    let lastScanTime = 0;
    let hideCardTimeout = null;
    let currentMode = "meeting";
    let outreachEventName = "";
    let selectedEventId = "";
    let pendingSelection = null;

    const card = document.getElementById("status-card");
    const actionEl = document.getElementById("status-action");
    const nameEl = document.getElementById("status-name");
    const timeEl = document.getElementById("status-time");

    function saveModeState() {
      try {
        sessionStorage.setItem(MODE_STORAGE_KEY, currentMode);
      } catch (err) {
        console.warn("Could not save mode state:", err);
      }
    }

    function clearSelectedOutreachEvent() {
      selectedEventId = "";
      outreachEventName = "";
      pendingSelection = null;
    }

    function saveEventState() {
      try {
        const selectedId = selectedEventId ? String(selectedEventId).trim() : "";
        const eventName = outreachEventName ? outreachEventName.trim() : "";

        if (selectedId) {
          sessionStorage.setItem(EVENT_ID_STORAGE_KEY, selectedId);
        } else {
          sessionStorage.removeItem(EVENT_ID_STORAGE_KEY);
        }

        if (eventName) {
          sessionStorage.setItem(EVENT_NAME_STORAGE_KEY, eventName);
          sessionStorage.setItem(EVENT_STORAGE_KEY, eventName);
        } else {
          sessionStorage.removeItem(EVENT_NAME_STORAGE_KEY);
          sessionStorage.removeItem(EVENT_STORAGE_KEY);
        }
      } catch (err) {
        console.warn("Could not save event state:", err);
      }
    }

    function restoreSessionState() {
      try {
        const savedMode = sessionStorage.getItem(MODE_STORAGE_KEY);
        const savedEventId = sessionStorage.getItem(EVENT_ID_STORAGE_KEY);
        const savedEventName = sessionStorage.getItem(EVENT_NAME_STORAGE_KEY) || sessionStorage.getItem(EVENT_STORAGE_KEY);

        if (savedEventId) {
          selectedEventId = savedEventId;
        } else {
          selectedEventId = "";
        }

        if (savedEventName) {
          outreachEventName = savedEventName;
        } else {
          outreachEventName = "";
        }

        const hasValidOutreachState = Boolean(selectedEventId && outreachEventName);

        if (savedMode === "outreach" && hasValidOutreachState) {
          currentMode = "outreach";
        } else {
          currentMode = "meeting";
          clearSelectedOutreachEvent();
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

    function updateModeUI() {
      const isOutreach = currentMode === "outreach";
      const trimmedEventName = outreachEventName ? outreachEventName.trim() : "";

      if (modeToggle) {
        modeToggle.classList.toggle("outreach", isOutreach);
        modeToggle.textContent = isOutreach ? "OUTREACH" : "MEETING";
      }

      if (appTitle) {
        appTitle.style.display = isOutreach ? "none" : "block";
      }

      if (scannerPrompt) {
        if (isOutreach) {
          scannerPrompt.textContent = trimmedEventName ? trimmedEventName.toUpperCase() : "SCAN IN / SCAN OUT";
          scannerPrompt.style.display = "block";
        } else {
          scannerPrompt.textContent = "";
          scannerPrompt.style.display = "none";
        }
      }

      if (scannerSubtext) {
        if (isOutreach) {
          scannerSubtext.textContent = "SCAN IN / SCAN OUT";
          scannerSubtext.style.display = "block";
        } else {
          scannerSubtext.textContent = "SCAN YOUR MEMBER PASS";
          scannerSubtext.style.display = "block";
        }
      }

      saveModeState();
      saveEventState();
    }

    function closeEventSelectionModal() {
      if (!eventPromptModal) return;

      eventPromptModal.classList.remove("visible");
      eventPromptModal.setAttribute("aria-hidden", "true");
      if (eventSelectionList) {
        eventSelectionList.innerHTML = "";
      }
      if (eventSelectionTitle) {
        eventSelectionTitle.textContent = "Select today's event";
      }
      if (eventPromptSubmit) {
        eventPromptSubmit.disabled = true;
        eventPromptSubmit.style.display = "inline-flex";
        eventPromptSubmit.textContent = "Confirm";
      }
      pendingSelection = null;
      focusScannerInput();
    }

    function chooseCalendarEvent(event) {
      if (!event) return;

      selectedEventId = event.id || "";
      outreachEventName = event.name || "";
      currentMode = "outreach";
      closeEventSelectionModal();
      updateModeUI();
    }

    function renderEventSelectionList(events) {
      if (!eventSelectionList) {
        return;
      }

      eventSelectionList.innerHTML = "";
      pendingSelection = null;

      if (!Array.isArray(events) || events.length === 0) {
        if (eventSelectionTitle) {
          eventSelectionTitle.textContent = "No outreach events scheduled for today.";
        }
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "event-selection-empty";
        emptyMessage.textContent = "No outreach events scheduled for today.";
        eventSelectionList.appendChild(emptyMessage);
        if (eventPromptSubmit) {
          eventPromptSubmit.disabled = true;
          eventPromptSubmit.textContent = "Close";
          eventPromptSubmit.style.display = "inline-flex";
        }
        return;
      }

      if (events.length === 1) {
        if (eventSelectionTitle) {
          eventSelectionTitle.textContent = "Confirm event";
        }

        const event = events[0];
        const card = document.createElement("button");
        card.type = "button";
        card.className = "event-option-card event-option-card-single";
        card.dataset.eventId = event.id || "";
        card.dataset.eventName = event.name || "";
        card.innerHTML = `
          <span class="event-option-name">${event.name || "Untitled event"}</span>
          <span class="event-option-meta">${formatCalendarEventTime(event.start)} - ${formatCalendarEventTime(event.end)}</span>
          <span class="event-option-meta">${event.location ? event.location : "Location TBD"}</span>
        `;
        card.addEventListener("click", () => {
          pendingSelection = event;
          const allCards = eventSelectionList.querySelectorAll(".event-option-card");
          allCards.forEach((item) => item.classList.toggle("selected", item === card));
          if (eventPromptSubmit) {
            eventPromptSubmit.disabled = false;
          }
        });
        eventSelectionList.appendChild(card);

        if (eventPromptSubmit) {
          eventPromptSubmit.disabled = false;
          eventPromptSubmit.textContent = "Confirm event";
          eventPromptSubmit.onclick = () => {
            if (!pendingSelection) {
              pendingSelection = event;
            }
            chooseCalendarEvent(pendingSelection || event);
          };
        }
        return;
      }

      if (eventSelectionTitle) {
        eventSelectionTitle.textContent = "Select today's event";
      }

      if (eventPromptSubmit) {
        eventPromptSubmit.disabled = true;
        eventPromptSubmit.textContent = "Confirm";
        eventPromptSubmit.onclick = () => {
          if (!pendingSelection) {
            return;
          }
          chooseCalendarEvent(pendingSelection);
        };
      }

      events.forEach((event) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "event-option-card";
        option.dataset.eventId = event.id || "";
        option.dataset.eventName = event.name || "";
        option.innerHTML = `
          <span class="event-option-name">${event.name || "Untitled event"}</span>
          <span class="event-option-meta">Starts: ${formatCalendarEventTime(event.start)}</span>
          <span class="event-option-meta">Ends: ${formatCalendarEventTime(event.end)}</span>
          <span class="event-option-meta">${event.location ? event.location : "Location TBD"}</span>
        `;
        option.addEventListener("click", () => {
          pendingSelection = event;
          const allOptions = eventSelectionList.querySelectorAll(".event-option-card");
          allOptions.forEach((item) => item.classList.toggle("selected", item === option));
          if (eventPromptSubmit) {
            eventPromptSubmit.disabled = false;
          }
        });
        eventSelectionList.appendChild(option);
      });
    }

    async function openEventSelectionModal() {
      if (!eventPromptModal) return;

      const events = await getTodaysCalendarEvents();
      renderEventSelectionList(events);
      if (eventPromptSubmit) {
        eventPromptSubmit.disabled = events.length === 0 || (events.length > 1 && !pendingSelection);
      }
      eventPromptModal.classList.add("visible");
      eventPromptModal.setAttribute("aria-hidden", "false");
    }

    function isSupabaseAuthFailure(error) {
      if (!error) return false;

      const status = error.status || error.code;
      const message = String(error.message || error.details || error.hint || "").toLowerCase();

      return status === 401 || status === "401" || message.includes("unauthorized") || message.includes("row level security") || message.includes("jwt");
    }

    async function handleScan(decodedText) {
      const currentTime = Date.now();
      const normalizedId = String(decodedText || "").trim();

      if (!normalizedId) return;

      if (!dbClient) {
        showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
        return;
      }

      if (decodedText === lastScanId && (currentTime - lastScanTime) < 10000) {
        console.log("Duplicate scan ignored:", decodedText);
        return;
      }

      lastScanId = decodedText;
      lastScanTime = currentTime;

      try {
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

    function bind() {
      if (modeToggle) {
        modeToggle.addEventListener("click", async () => {
          if (currentMode === "meeting") {
            await openEventSelectionModal();
          } else {
            currentMode = "meeting";
            clearSelectedOutreachEvent();
            updateModeUI();
          }
        });
      }

      if (eventPromptCancel) {
        eventPromptCancel.addEventListener("click", () => {
          closeEventSelectionModal();
          if (currentMode === "meeting") {
            clearSelectedOutreachEvent();
            updateModeUI();
          }
        });
      }

      if (eventPromptSubmit) {
        eventPromptSubmit.disabled = true;
      }

      if (eventPromptModal) {
        eventPromptModal.addEventListener("click", (event) => {
          if (event.target === eventPromptModal) {
            closeEventSelectionModal();
            if (currentMode === "meeting") {
              clearSelectedOutreachEvent();
              updateModeUI();
            }
          }
        });
      }

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

      document.addEventListener("pointerdown", (event) => {
        const clickedToggle = event.target && event.target.closest && event.target.closest("#mode-toggle");
        const clickedPromptField = event.target && event.target.closest && event.target.closest(".event-prompt-card, .event-prompt-submit, .event-prompt-cancel");

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
    }

    function init() {
      bind();
      restoreSessionState();
      updateModeUI();
    }

    return {
      init,
      handleScan,
      updateModeUI,
      openEventSelectionModal,
      closeEventSelectionModal,
      chooseCalendarEvent,
      focusScannerInput,
      get state() {
        return {
          currentMode,
          outreachEventName,
          selectedEventId
        };
      }
    };
  }

  window.AttendanceLogic = {
    createAttendanceApp,
    decodeJwtPayload,
    getSupabaseProjectRefFromUrl,
    validateSupabaseConfig,
    getTodaysCalendarEvents
  };
})();
