// hooks/useEventReceiver.js
import { useState, useEffect } from "react";
import { eventBus } from "./eventBus";

export const useEventReceiver = (eventTypes, targetId, onEventReceived) => {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const unsubscribe = eventBus.subscribe((eventQueue) => {
      setEvents(eventQueue);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const targetTypes = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    events
      .filter((event) => targetTypes.includes(event.type) && event.targetId === targetId)
      .forEach((event) => {
        try {
          onEventReceived(event);
          eventBus.consume(event.id);
        } catch (error) {
          console.error("Error processing event:", error);
          eventBus.consume(event.id);
        }
      });
  }, [events, eventTypes, targetId, onEventReceived]);

  return { events };
};
