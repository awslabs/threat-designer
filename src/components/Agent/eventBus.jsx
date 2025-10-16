class EventBus {
  constructor() {
    this.eventQueue = [];
    this.listeners = new Set();
  }

  emit(eventType, payload, targetId, id = null) {
    const event = {
      id: id || `${eventType}_${Date.now()}_${Math.random()}`,
      type: eventType,
      payload,
      targetId,
      timestamp: Date.now(),
    };

    this.eventQueue.push(event);
    this.notifyListeners();
    return event.id;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  consume(eventId) {
    this.eventQueue = this.eventQueue.filter((event) => event.id !== eventId);
    this.notifyListeners();
  }

  consumeByType(eventType, targetId = null) {
    this.eventQueue = this.eventQueue.filter((event) => {
      if (targetId) {
        return !(event.type === eventType && event.targetId === targetId);
      }
      return event.type !== eventType;
    });
    this.notifyListeners();
  }

  getQueue() {
    return [...this.eventQueue];
  }

  notifyListeners() {
    this.listeners.forEach((callback) => callback([...this.eventQueue]));
  }
}

export const eventBus = new EventBus();
