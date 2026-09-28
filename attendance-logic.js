(function () {
  const DEFAULT_SUPABASE_URL = "https://mkizsdepvbrevyojmbjq.supabase.co";
  const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1raXpzZGVwdmJyZXZ5b2ptYmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NjA5ODIsImV4cCI6MjEwNDAzNjk4Mn0.pKpq9evw3YvmKeJ0dQBUxIYLkhPNAKcxMGQByAmNcRg";
  const DEFAULT_GOOGLE_CALENDAR_KEY = "AIzaSyDF4n3eKapYzg1ZMvAi9QjIsViD4OPwEZY";

  const SUPABASE_URL = (typeof window !== "undefined" && window.__ROBOSTANGS_SUPABASE_URL__)
    ? String(window.__ROBOSTANGS_SUPABASE_URL__).trim()
    : DEFAULT_SUPABASE_URL;
  const SUPABASE_ANON_KEY = (typeof window !== "undefined" && window.__ROBOSTANGS_SUPABASE_ANON_KEY__)
    ? String(window.__ROBOSTANGS_SUPABASE_ANON_KEY__).trim()
    : DEFAULT_SUPABASE_ANON_KEY;

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
    if (typeof window !== "undefined") {
      const key = window.__ROBOSTANGS_GOOGLE_CALENDAR_KEY__ || window.GOOGLE_CALENDAR_KEY;
      if (key) return String(key).trim();
    }
    return DEFAULT_GOOGLE_CALENDAR_KEY;
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
        if (eventPromptSubmit.style) {
          eventPromptSubmit.style.display = "inline-flex";
        }
        eventPromptSubmit.textContent = "Confirm";
      }
      pendingSelection = null;
      focusScannerInput();
    }

    async function chooseCalendarEvent(event) {
      if (!event) return;

      selectedEventId = event.id || `event-${Date.now()}`;
      outreachEventName = event.name || "Untitled event";
      currentMode = "outreach";
      closeEventSelectionModal();
      updateModeUI();

      if (dbClient) {
        try {
          // close other active events
          await dbClient
            .from("outreach_events")
            .update({ status: "completed" })
            .neq("id", selectedEventId)
            .eq("status", "active");

          // save this event
          const { error: upsertErr } = await dbClient
            .from("outreach_events")
            .upsert([
              {
                id: String(selectedEventId),
                name: String(outreachEventName).trim(),
                start_time: event.start || new Date().toISOString(),
                end_time: event.end || null,
                location: event.location || null,
                status: "active",
                created_at: new Date().toISOString()
              }
            ], { onConflict: "id" });

          if (upsertErr) {
            console.warn("Could not register outreach event in Supabase:", upsertErr);
          } else {
            console.log("Registered outreach event in Supabase:", outreachEventName, selectedEventId);
          }
        } catch (err) {
          console.warn("Error registering outreach event in Supabase:", err);
        }
      }
    }

    function renderEventSelectionList(events) {
      if (!eventSelectionList) {
        return;
      }

      eventSelectionList.innerHTML = "";
      pendingSelection = null;

      if (!Array.isArray(events) || events.length === 0) {
        if (eventSelectionTitle) {
          eventSelectionTitle.textContent = "Start Outreach Event";
        }
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "event-selection-empty";
        emptyMessage.textContent = "No outreach events found on Google Calendar for today. Enter an event name below to start:";
        eventSelectionList.appendChild(emptyMessage);

        const customContainer = document.createElement("div");
        customContainer.className = "custom-event-container";
        customContainer.style.marginTop = "14px";
        customContainer.style.display = "flex";
        customContainer.style.flexDirection = "column";
        customContainer.style.gap = "8px";

        const customInput = document.createElement("input");
        customInput.type = "text";
        customInput.placeholder = "e.g. STEM Expo Demo";
        customInput.className = "custom-event-input";
        customInput.maxLength = 100;
        customInput.style.padding = "14px 16px";
        customInput.style.borderRadius = "14px";
        customInput.style.border = "1px solid rgba(255, 122, 26, 0.5)";
        customInput.style.background = "#13212b";
        customInput.style.color = "#ffffff";
        customInput.style.fontSize = "16px";
        customInput.style.outline = "none";

        customInput.addEventListener("input", () => {
          const val = customInput.value.trim();
          if (val) {
            pendingSelection = {
              id: `custom-${Date.now()}`,
              name: val,
              start: new Date().toISOString(),
              end: null,
              location: "Manual Entry"
            };
            if (eventPromptSubmit) {
              eventPromptSubmit.disabled = false;
              eventPromptSubmit.textContent = "Start Event";
            }
          } else {
            pendingSelection = null;
            if (eventPromptSubmit) {
              eventPromptSubmit.disabled = true;
              eventPromptSubmit.textContent = "Confirm";
            }
          }
        });

        customInput.addEventListener("keydown", async (e) => {
          if (e.key === "Enter" && customInput.value.trim()) {
            e.preventDefault();
            await chooseCalendarEvent({
              id: `custom-${Date.now()}`,
              name: customInput.value.trim(),
              start: new Date().toISOString(),
              end: null,
              location: "Manual Entry"
            });
          }
        });

        customContainer.appendChild(customInput);
        eventSelectionList.appendChild(customContainer);

        if (eventPromptSubmit) {
          eventPromptSubmit.disabled = true;
          eventPromptSubmit.textContent = "Start Event";
          eventPromptSubmit.style.display = "inline-flex";
          eventPromptSubmit.onclick = async () => {
            if (pendingSelection) {
              await chooseCalendarEvent(pendingSelection);
            }
          };
        }
        setTimeout(() => customInput.focus(), 50);
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
        const eventName = document.createElement("span");
        eventName.className = "event-option-name";
        eventName.textContent = event.name || "Untitled event";
        const eventTime = document.createElement("span");
        eventTime.className = "event-option-meta";
        eventTime.textContent = `${formatCalendarEventTime(event.start)} - ${formatCalendarEventTime(event.end)}`;
        const eventLocation = document.createElement("span");
        eventLocation.className = "event-option-meta";
        eventLocation.textContent = event.location || "Location TBD";
        card.append(eventName, eventTime, eventLocation);
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
          eventPromptSubmit.onclick = async () => {
            if (!pendingSelection) {
              pendingSelection = event;
            }
            await chooseCalendarEvent(pendingSelection || event);
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
        eventPromptSubmit.onclick = async () => {
          if (!pendingSelection) {
            return;
          }
          await chooseCalendarEvent(pendingSelection);
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

        const isOutreach = currentMode === "outreach";
        const table = isOutreach ? "outreach_attendance" : "attendance";

        let logQuery = dbClient
          .from(table)
          .select("id")
          .eq("member_id", normalizedId)
          .is("check_out", null);

        if (isOutreach && selectedEventId) {
          logQuery = logQuery.eq("event_id", selectedEventId);
        }

        const { data: activeLog, error: logError } = await logQuery.maybeSingle();

        if (logError) {
          if (isSupabaseAuthFailure(logError)) {
            showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
            return;
          }

          if (logError.code === "PGRST204" || logError.code === "42P01" || String(logError.message).toLowerCase().includes("relation") || String(logError.message).toLowerCase().includes("schema cache")) {
            showStatus("TABLE MISSING", "#f44336", "RUN SQL SCHEMA", "CHECK SUPABASE DASHBOARD");
            console.error(`Missing table '${table}'. Please run supabase_outreach_schema.sql in Supabase SQL Editor.`, logError);
            return;
          }

          showStatus("SYSTEM ERROR", "#f44336", "PLEASE SIGN IN MANUALLY", "DATABASE ERROR");
          return;
        }

        const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        if (activeLog) {
          const { error: updateError } = await dbClient
            .from(table)
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
          const insertPayload = isOutreach
            ? {
                event_id: String(selectedEventId || `event-${Date.now()}`),
                event_name: String(outreachEventName || "Untitled event").trim(),
                member_id: normalizedId,
                check_in: new Date().toISOString()
              }
            : {
                member_id: normalizedId,
                check_in: new Date().toISOString()
              };

          const { error: insertError } = await dbClient
            .from(table)
            .insert([insertPayload]);

          if (insertError) {
            if (isSupabaseAuthFailure(insertError)) {
              showStatus("OFFLINE", "#f44336", "SUPABASE UNAVAILABLE", "CHECK CONNECTION");
              return;
            }

            if (insertError.code === "PGRST204" || insertError.code === "42P01" || String(insertError.message).toLowerCase().includes("relation") || String(insertError.message).toLowerCase().includes("schema cache")) {
              showStatus("TABLE MISSING", "#f44336", "RUN SQL SCHEMA", "CHECK SUPABASE DASHBOARD");
              console.error(`Missing table '${table}'. Please run supabase_outreach_schema.sql in Supabase SQL Editor.`, insertError);
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
            const closingEventId = selectedEventId;
            currentMode = "meeting";
            clearSelectedOutreachEvent();
            updateModeUI();

            if (dbClient && closingEventId) {
              try {
                await dbClient
                  .from("outreach_events")
                  .update({ status: "completed" })
                  .eq("id", closingEventId);
              } catch (e) {
                console.warn("Could not mark outreach event completed:", e);
              }
            }
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
