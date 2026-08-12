// ============================================================================
// DispatchEventPublisher.js — The Subject (Observer Pattern).
//
// Controllers publish a domain event here whenever something field-relevant
// happens (a task status changes, an alert is raised, a location ping comes
// in) — they don't know or care who's listening. Observers are wired up
// once at the composition root (see app.js) via Dependency Injection, which
// is what lets new reactions to these events (an SMS notifier, a push
// notification service, etc.) be added later WITHOUT touching this class
// or any controller — Open/Closed Principle.
//
// Event shape (all fields always present so observers don't need to guess):
//   {
//     type: 'task_status' | 'location_ping' | 'alert',
//     driverId: string,
//     occurredAt: Date,
//     payload: { ...event-specific fields... }
//   }
// ============================================================================

class DispatchEventPublisher {
  constructor() {
    /** @type {import('./Observer')[]} */
    this._observers = [];
  }

  /** @param {import('./Observer')} observer */
  subscribe(observer) {
    if (typeof observer.update !== 'function') {
      throw new Error('Observer must implement update(event)');
    }
    this._observers.push(observer);
  }

  /** @param {import('./Observer')} observer */
  unsubscribe(observer) {
    this._observers = this._observers.filter((o) => o !== observer);
  }

  /**
   * Notify all subscribed observers. Uses allSettled rather than awaiting
   * each in sequence so one slow/failing observer (e.g. a Gateway timeout)
   * never blocks or breaks another (e.g. local audit logging) — observers
   * are independent by design.
   * @param {object} event
   * @returns {Promise<Array<{observer: string, ok: boolean, error?: string}>>}
   */
  async notify(event) {
    const results = await Promise.allSettled(
      this._observers.map((observer) => observer.update(event))
    );

    return results.map((result, i) => ({
      observer: this._observers[i].constructor.name,
      ok: result.status === 'fulfilled',
      error: result.status === 'rejected' ? String(result.reason?.message || result.reason) : undefined,
    }));
  }
}

module.exports = DispatchEventPublisher;
