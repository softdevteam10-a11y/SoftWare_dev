// ============================================================================
// Driver.js — Model layer (MVC). Encapsulates all SQL for the `drivers`
// table so controllers never write raw queries themselves.
// ============================================================================

const { query } = require('../db');

class Driver {
  /** @returns {Promise<object|null>} */
  static async findById(driverId) {
    const result = await query(
      `SELECT driver_id, full_name, phone_number, vehicle_label, status, created_at
       FROM drivers WHERE driver_id = $1`,
      [driverId]
    );
    return result.rows[0] || null;
  }

  /** @returns {Promise<object|null>} */
  static async findByPhone(phoneNumber) {
    const result = await query(
      `SELECT driver_id, full_name, phone_number, vehicle_label, status, created_at
       FROM drivers WHERE phone_number = $1`,
      [phoneNumber]
    );
    return result.rows[0] || null;
  }

  /** @returns {Promise<object[]>} */
  static async findAll() {
    const result = await query(
      `SELECT driver_id, full_name, phone_number, vehicle_label, status, created_at
       FROM drivers ORDER BY full_name ASC`
    );
    return result.rows;
  }

  /** @returns {Promise<object>} */
  static async create({ fullName, phoneNumber, vehicleLabel = null }) {
    const result = await query(
      `INSERT INTO drivers (full_name, phone_number, vehicle_label)
       VALUES ($1, $2, $3)
       RETURNING driver_id, full_name, phone_number, vehicle_label, status, created_at`,
      [fullName, phoneNumber, vehicleLabel]
    );
    return result.rows[0];
  }
}

module.exports = Driver;
