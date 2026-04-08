# Task: Remove event row-click popup, replace with direct edit form modal

## Steps (Approved Plan)
- [ ] 1. Remove `selectedEvent` state + view popup JSX (`event-info-layer`).
- [ ] 2. Update event list row `onClick`: setEditingEventId + setNewEvent (prefill) + setIsEventModalOpen(true).
- [ ] 3. Confirm/add `{isEventModalOpen && <EventModal />}` JSX (form: title/date/time/desc + Save/Cancel using postData/patchData("/events")).
- [ ] 4. Test: npm run dev → Event tab → row click → edit modal opens prefilled (no popup).

## Current Progress
Ready for edits.

## Testing Commands
```
cd frontend
npm run dev
```
→ Navigate Event → click event row → form modal, no popup.

