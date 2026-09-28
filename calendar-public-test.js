const CALENDAR_ID = "cqul964gqsvk45mmlbfdkto2js@group.calendar.google.com";
const TIME_ZONE = "America/New_York";

function getDatePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const tzName = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]) || 0;
  const minutes = Number(match[3]) || 0;

  return sign * (hours * 60 + minutes);
}

function buildDateRangeForToday(timeZone) {
  const now = new Date();
  const localDate = getDatePartsInTimeZone(now, timeZone);
  const offsetMinutes = getTimeZoneOffsetMinutes(now, timeZone);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, "0");
  const offsetRemainder = String(absOffsetMinutes % 60).padStart(2, "0");
  const offsetString = `${sign}${offsetHours}:${offsetRemainder}`;

  const dateString = `${localDate.year}-${String(localDate.month).padStart(2, "0")}-${String(localDate.day).padStart(2, "0")}`;

  return {
    date: dateString,
    timeMin: new Date(`${dateString}T00:00:00${offsetString}`).toISOString(),
    timeMax: new Date(`${dateString}T23:59:59${offsetString}`).toISOString(),
  };
}

async function main() {
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_CALENDAR_KEY;

  if (!apiKey) {
    console.error("Missing Google Calendar API key.");
    console.error("Add GOOGLE_CALENDAR_API_KEY or GOOGLE_CALENDAR_KEY to your local .env file before running this test.");
    process.exit(1);
  }

  const { date, timeMin, timeMax } = buildDateRangeForToday(TIME_ZONE);

  const calendarUrl = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`
  );

  calendarUrl.searchParams.set("key", apiKey);
  calendarUrl.searchParams.set("timeMin", timeMin);
  calendarUrl.searchParams.set("timeMax", timeMax);
  calendarUrl.searchParams.set("singleEvents", "true");
  calendarUrl.searchParams.set("orderBy", "startTime");
  calendarUrl.searchParams.set("timeZone", TIME_ZONE);

  console.log(`Fetching public events for ${date} (${TIME_ZONE}) from Google Calendar...`);
  console.log(`Calendar ID: ${CALENDAR_ID}`);
  console.log("API key: [hidden in console output]");

  try {
    const response = await fetch(calendarUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const responseText = await response.text();
    let payload;

    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const errorMessage = payload?.error?.message || responseText || "Unknown Google Calendar API error.";

      console.error("Google Calendar API request failed.");
      console.error(`HTTP status: ${response.status} ${response.statusText}`);
      console.error(`Error message: ${errorMessage}`);
      process.exit(1);
    }

    const items = Array.isArray(payload?.items) ? payload.items : [];

    console.log(`SUCCESS: Google Calendar API request succeeded.`);
    console.log(`HTTP status: ${response.status} ${response.statusText}`);
    console.log(`Events found for ${date}: ${items.length}`);

    if (items.length === 0) {
      console.log("No events found for today in the requested timezone.");
      return;
    }

    for (const event of items) {
      console.log("-");
      console.log(`Event ID: ${event.id ?? "unknown"}`);
      console.log(`Summary: ${event.summary ?? "(no title)"}`);
      console.log(`Start: ${event.start?.dateTime ?? event.start?.date ?? "(no start)"}`);
      console.log(`End: ${event.end?.dateTime ?? event.end?.date ?? "(no end)"}`);
      console.log(`Location: ${event.location ?? "(none)"}`);
    }
  } catch (error) {
    console.error("Unexpected test error while calling the Google Calendar API.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
