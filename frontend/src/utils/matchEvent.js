export const createMatchEvent = (eventTrigger) => ({
  eventTrigger,
  eventTime: Date.now(),
  eventId: `${eventTrigger}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
});
