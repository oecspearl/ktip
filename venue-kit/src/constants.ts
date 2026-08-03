export const VENUE = {
  /** Mirror rows older than this render as offline. */
  STALE_AFTER_MS: 2 * 60 * 1000,
  /** Cold-path heartbeat floor. One write per member per 45s, not per tick. */
  HEARTBEAT_THROTTLE_MS: 45 * 1000,
  /** Hidden/idle tab flips to 'away' unless the member set a manual status. */
  IDLE_AFTER_MS: 5 * 60 * 1000,
  /** Roster (mirror) refetch cadence while the venue is open. */
  ROSTER_REFETCH_MS: 60 * 1000,
  /**
   * Walking map, if you draw one. Positions ride broadcast (fire-and-forget
   * datagrams), NOT presence tracking — tracking is rate-limited state
   * replication. ~8/s is smooth once the receiver interpolates.
   */
  POS_BROADCAST_MS: 120,
  /** A peer with no movement packet for this long stops being drawn walking. */
  POS_STALE_MS: 15 * 1000,
} as const
