import cron from 'node-cron';
import pool from '../db';
import { recordDailyLog } from '../services/dailyLog';

/**
 * Midnight rollover job for daily todos.
 *
 * FIXED LOGIC (vs buggy todo app):
 * - Marks pending daily todos as 'rolled_over' (does NOT duplicate them)
 * - Creates ONE new copy per rolled task for today
 * - Keeps subtasks and tags attached to the new task
 * - Records daily log snapshot before and after
 */
export function startRolloverJob() {
  cron.schedule('0 0 * * *', async () => {
    console.log('[Rollover] Starting midnight rollover...');
    try {
      // Snapshot before rollover
      await recordDailyLog().catch(e => console.error('[Rollover] pre-snapshot error:', e));

      // Get all pending daily todos (only parent tasks, not subtasks)
      const tasksToRoll = await pool.query(
        `SELECT * FROM tasks
         WHERE project_id IS NULL
           AND status = 'pending'`
      );

      let rolledCount = 0;
      const todayDate = new Date().toISOString().split('T')[0];

      for (const task of tasksToRoll.rows) {
        // 1. Mark old task as rolled_over
        await pool.query(
          `UPDATE tasks SET status = 'rolled_over', updated_at = NOW() WHERE id = $1`,
          [task.id]
        );

        // 2. Create ONE new copy for today
        const newTask = await pool.query(
          `INSERT INTO tasks (name, description, priority, due_date, category_id, is_ai_generated, project_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, 'pending')
           RETURNING id`,
          [task.name, task.description, task.priority, todayDate, task.category_id, task.is_ai_generated]
        );
        const newId = newTask.rows[0].id;

        // 3. Copy tags from old task to new task
        await pool.query(
          `INSERT INTO task_tags (task_id, tag_id)
           SELECT $1, tag_id FROM task_tags WHERE task_id = $2
           ON CONFLICT DO NOTHING`,
          [newId, task.id]
        );

        // 4. Copy subtasks from old task to new task
        await pool.query(
          `INSERT INTO subtasks (task_id, name, completed)
           SELECT $1, name, false FROM subtasks WHERE task_id = $2`,
          [newId, task.id]
        );

        rolledCount++;
      }

      // Snapshot after rollover
      await recordDailyLog().catch(e => console.error('[Rollover] post-snapshot error:', e));

      console.log(`[Rollover] Rolled ${rolledCount} daily tasks to today`);
    } catch (err) {
      console.error('[Rollover] Error during rollover:', err);
    }
  });

  console.log('[Rollover] Cron job scheduled for midnight');
}
