// calendar.js
const APP_BASE_URL = typeof location !== "undefined" ? location.origin : "https://example.com";

// Manejo centralizado de respuestas de Google APIs
async function parseGoogleResponse(response) {
  if (response.status === 401) {
    // Token inválido/expirado => la capa app.js intentará refrescar
    const err = new Error("El permiso de acceso a Google ha expirado.");
    err.name = "TokenError";
    throw err;
  }
  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data?.error?.message || response.statusText;
    } catch {
      // /* ignore */
    }
    throw new Error(`Google API error: ${detail}`);
  }
  return response.json();
}

export async function findOrCreateSprintifyCalendar(accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // 1) Buscar si ya existe
  const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers,
  });
  const list = await parseGoogleResponse(listRes);
  const existing = list.items?.find((c) => c.summary === "Sprintify");
  if (existing) return existing.id;

  // 2) Crear si no existe
  const createRes = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: "Sprintify",
      description: "Calendario para eventos creados desde SPW.",
      timeZone: "America/Monterrey",
    }),
  });
  const created = await parseGoogleResponse(createRes);
  return created.id;
}

export async function createTaskEvent(task, calendarId, accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const now = Date.now();

  const event = {
    summary: `[Sprintify] ${task.title ?? "Tarea"}`,
    description: `Tarea de SPW.\n\nPuntos: ${
      task.points ?? "N/A"
    }\n\nVer detalles:\n${APP_BASE_URL}/#task/${task.id}`,
    start: { dateTime: new Date(now).toISOString() },
    end: { dateTime: new Date(now + 60 * 60 * 1000).toISOString() }, // +1h
  };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(event),
    }
  );
  const created = await parseGoogleResponse(res);
  return created.id;
}

export async function getEventStatus(eventId, calendarId, accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(eventId)}`,
    { headers }
  );

  if (res.status === 404) return "not_found";
  const event = await parseGoogleResponse(res);
  if (event.status === "cancelled") return "not_found";
  return "exists";
}
