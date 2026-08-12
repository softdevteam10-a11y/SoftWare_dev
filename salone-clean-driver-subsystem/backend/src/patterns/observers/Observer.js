// ============================================================================
// Observer.js — The abstract Observer interface (Observer Pattern).
//
// Interface Segregation: this contract is deliberately minimal — one
// method, `update(event)`. Any observer that wants to react to driver
// events (dispatch, escalation, future ones like SMS/push notifications)
// only needs to implement this one method, nothing else.
//
// Liskov Substitution: DispatchEventPublisher (the Subject) only ever calls
// `observer.update(event)`. Every concrete observer must be safely
// substitutable here — none of them may assume anything about *which*
// other observers are also subscribed, or about delivery order.
// ============================================================================

class Observer {
  /**
   * @param {object} event - see patterns/observers/DispatchEventPublisher.js
   *   for the event shape. Concrete observers implement this.
   */
  // eslint-disable-next-line no-unused-vars
  async update(event) {
    throw new Error('Observer subclasses must implement update(event)');
  }
}

module.exports = Observer;
