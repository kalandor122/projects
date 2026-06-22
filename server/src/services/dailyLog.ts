import pool from '../db';

/**
 * Record a snapshot of today's daily todo stats into daily_logs.
 * Called after task status changes (completions, rollover).
 * Idempotent — upserts on date conflict.
 */
export async function recordDailyLog(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const stats = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'rolled_over') as rolled
    FROM tasks
    WHERE project_id IS NULL
  `);

  const { completed, pending, rolled } = stats.rows[0];

  await pool.query(
    `INSERT INTO daily_logs (date, tasks_completed, tasks_pending, tasks_rolled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (date) DO UPDATE SET
       tasks_completed = $2,
       tasks_pending = $3,
       tasks_rolled = $4`,
    [today, Number(completed), Number(pending), Number(rolled)]
  );
}
