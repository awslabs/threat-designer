import { useState, useEffect, useCallback } from "react";
import { eventBus } from "./eventBus";

export const useEventReceiver = (eventTypes, targetId, onEventReceived) => {
  const [events, setEvents] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Subscribe to event bus and get initial events
  useEffect(() => {
    // Get existing events from the queue immediately on mount
    const existingEvents = eventBus.getQueue();
    setEvents(existingEvents);
    setIsInitialized(true);

    // Subscribe to future updates
    const unsubscribe = eventBus.subscribe((eventQueue) => {
      setEvents(eventQueue);
    });

    return () => {
      unsubscribe();
      setIsInitialized(false);
    };
  }, [targetId]); // Re-run when targetId changes

  // Process events
  useEffect(() => {
    // Only process events after initialization
    if (!isInitialized) return;

    const targetTypes = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    const relevantEvents = events.filter(
      (event) => targetTypes.includes(event.type) && event.targetId === targetId
    );

    relevantEvents.forEach((event) => {
      try {
        console.log(`Processing event ${event.id} for target ${targetId}`);
        onEventReceived(event);
        eventBus.consume(event.id);
      } catch (error) {
        console.error("Error processing event:", error);
        // Still consume the event to prevent infinite retries
        eventBus.consume(event.id);
      }
    });
  }, [events, eventTypes, targetId, onEventReceived, isInitialized]);

  // Force re-check of queue when component becomes active
  useEffect(() => {
    if (isInitialized && targetId) {
      // Force a re-check of the current queue
      const currentQueue = eventBus.getQueue();
      if (currentQueue.length > 0) {
        setEvents([...currentQueue]);
      }
    }
  }, [isInitialized, targetId]);

  return { events };
};
