import dayjs from "dayjs";

export function EventSection({
  eventSearch,
  setEventSearch,
  eventFilter,
  setEventFilter,
  calendarShowArchived,
  setCalendarShowArchived,
  eventSummary,
  filteredEvents,
  eventViewId,
  setEventViewId,
  setEditingEventId,
  setNewEvent,
  setModalType,
  deleteData,
  patchData,
  loadAll,
  setBackendOffline,
}) {
  const todayYmd = dayjs().format("YYYY-MM-DD");

  const openEventView = (ev) => {
    setEventViewId(ev.id);
    setModalType("eventView");
  };

  const openEventEditor = (ev) => {
    setEditingEventId(ev.id);
    setNewEvent({
      title: ev.title,
      date: ev.date,
      time: ev.time || "09:00",
      description: ev.description || "",
    });
    setModalType("event");
  };

  const openAddEvent = () => {
    setEditingEventId(null);
    setNewEvent({ title: "", date: todayYmd, time: "09:00", description: "" });
    setModalType("event");
  };

  return (
    <div className="task-tracker-page task-tracker-page--stacked cal-app">
      <header className="task-tracker-intro">
        <span className="task-tracker-eyebrow">Scheduling</span>
        <h2 className="task-tracker-title">Event</h2>
        <p className="task-tracker-lede">
          Plan dates and upcoming activities. Click a row for details, use Edit on the row to change an event, or + Add
          Event for a new entry.
        </p>
      </header>

      <div className="tracker-summary tracker-summary--row">
        <article className="tracker-kpi">
          <small>Active events</small>
          <strong>{eventSummary.total}</strong>
        </article>
        <article className="tracker-kpi">
          <small>Today</small>
          <strong>{eventSummary.today}</strong>
        </article>
        <article className="tracker-kpi">
          <small>Upcoming</small>
          <strong>{eventSummary.upcoming}</strong>
        </article>
        <article className="tracker-kpi">
          <small>Archived</small>
          <strong>{eventSummary.archived}</strong>
        </article>
      </div>

      <div className="task-tracker-filters-card">
        <div className="task-tracker-filters-label">Filter &amp; list</div>
        <div className="task-tracker-toolbar cal-app-toolbar">
          <div className="inline-form task-tracker-filters">
            <input placeholder="Search events…" value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} />
            <select className="mp-select" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
              <option value="all">All active</option>
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
              <option value="archived">Archived only</option>
            </select>
            <label className="cal-checkbox-label">
              <input
                type="checkbox"
                checked={calendarShowArchived}
                onChange={(e) => setCalendarShowArchived(e.target.checked)}
              />
              Show archived on calendar
            </label>
          </div>
          <button type="button" className="task-tracker-add" onClick={openAddEvent}>
            + Add Event
          </button>
        </div>
      </div>

      <article className="task-tracker-list-card">
        <div className="task-tracker-list-heading">
          <div>
            <h3 className="task-tracker-list-title">Event queue</h3>
            <p className="task-tracker-list-sub">
              {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}{" "}
              {filteredEvents.length === 1 ? "matches" : "match"} your filters
            </p>
          </div>
        </div>
        <div className="task-list task-list-scroll task-list-scroll--roomy">
          {filteredEvents.map((ev) => (
            <div
              key={ev.id}
              className={`task-item list-item task-list-item event-queue-row${ev.archived ? " event-queue-row--archived" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => openEventView(ev)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEventView(ev);
                }
              }}
            >
              <div className="list-main">
                <strong>{ev.title}</strong>
                <small>{`${ev.date} · ${ev.time || "—"}`}</small>
              </div>
              <div className="list-meta list-meta--crud event-queue-row-meta" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="btn-crud"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEventEditor(ev);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-crud btn-crud--danger"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm("Delete this event permanently?")) return;
                    try {
                      await deleteData(`/events/${ev.id}`);
                      if (eventViewId === ev.id) {
                        setEventViewId(null);
                        setModalType("");
                      }
                      await loadAll();
                    } catch {
                      setBackendOffline(true);
                    }
                  }}
                >
                  Delete
                </button>
                {!ev.archived ? (
                  <button
                    type="button"
                    className="btn-crud"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await patchData(`/events/${ev.id}`, { archived: true });
                        await loadAll();
                      } catch {
                        setBackendOffline(true);
                      }
                    }}
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-crud"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await patchData(`/events/${ev.id}`, { archived: false });
                        await loadAll();
                      } catch {
                        setBackendOffline(true);
                      }
                    }}
                  >
                    Unarchive
                  </button>
                )}
                <span className={`status-pill${ev.archived ? " status-pill--muted" : ""}`}>
                  {ev.archived ? "Archived" : "Scheduled"}
                </span>
                <span className="list-arrow" aria-hidden="true">
                  ›
                </span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
