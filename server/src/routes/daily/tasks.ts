import { Router, Request, Response } from 'express';
import pool from '../../db';
import { recordDailyLog } from '../../services/dailyLog';

const router = Router();

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return message
    .replace(/password:.*@/g, 'password:***@')
    .replace(/FATAL:\s*/gi, '')
    .replace(/ERROR:\s*/gi, '')
    .replace(/\n/g, ' ')
    .substring(0, 200);
}

// GET /api/daily/tasks — list daily todos with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, category_id, priority, due_date, search, unscheduled } = req.query;
    const conditions: string[] = ['t.project_id IS NULL'];
    const params: any[] = [];
    let paramIdx = 0;

    if (status) {
      paramIdx++;
      params.push(status);
      conditions.push(`t.status = $${paramIdx}`);
    }
    if (category_id) {
      paramIdx++;
      params.push(category_id);
      conditions.push(`t.category_id = $${paramIdx}`);
    }
    if (priority) {
      paramIdx++;
      params.push(Number(priority));
      conditions.push(`t.priority = $${paramIdx}`);
    }
    if (due_date) {
      paramIdx++;
      params.push(due_date);
      conditions.push(`t.due_date = $${paramIdx}`);
    }
    if (unscheduled === 'true') {
      conditions.push(`t.due_date IS NULL`);
    }
    if (search) {
      paramIdx++;
      params.push(`%${search}%`);
      conditions.push(`t.name ILIKE $${paramIdx}`);
    }

    const sql = `
      SELECT t.*, c.name as category_name, c.color as category_color,
        COALESCE(json_agg(tag.*) FILTER (WHERE tag.id IS NOT NULL), '[]') as tags,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', st.id, 'name', st.name, 'completed', st.completed, 'created_at', st.created_at
          ) ORDER BY st.created_at ASC)
          FROM subtasks st WHERE st.task_id = t.id), '[]'
        ) as subtasks
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tag ON tt.tag_id = tag.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY t.id, c.name, c.color
      ORDER BY t.due_date ASC NULLS LAST, t.priority ASC, t.created_at DESC
    `;

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching daily tasks:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/daily/tasks/:id — single daily todo with subtasks and tags
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT t.*, c.name as category_name, c.color as category_color
       FROM tasks t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = $1 AND t.project_id IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = result.rows[0];

    const tagsResult = await pool.query(
      `SELECT tg.id, tg.name, tg.color FROM tags tg
       JOIN task_tags tt ON tg.id = tt.tag_id
       WHERE tt.task_id = $1`,
      [id]
    );
    task.tags = tagsResult.rows;

    const subtasksResult = await pool.query(
      `SELECT * FROM subtasks WHERE task_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    task.subtasks = subtasksResult.rows;

    res.json(task);
  } catch (err) {
    console.error('Error fetching daily task:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/daily/tasks — create daily todo
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, priority, due_date, category_id, tags } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Task name is required' });
      return;
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      const result = await db.query(
        `INSERT INTO tasks (name, description, priority, due_date, category_id, project_id, status)
         VALUES ($1, $2, $3, $4, $5, NULL, 'pending')
         RETURNING *`,
        [name.trim(), description || '', priority || 3, due_date || null, category_id || null]
      );

      const task = result.rows[0];

      if (tags && Array.isArray(tags) && tags.length > 0) {
        for (const tagId of tags) {
          if (typeof tagId === 'string') {
            await db.query(
              'INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [task.id, tagId]
            );
          }
        }
      }

      await db.query('COMMIT');
      res.status(201).json(task);
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
  } catch (err) {
    console.error('Error creating daily task:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PUT /api/daily/tasks/:id — update daily todo (dynamic SET, no COALESCE bug)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, status, priority, due_date, category_id, tags } = req.body;

    // Build dynamic SET clause (allows setting fields to null)
    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${paramIdx++}`); values.push(description); }
    if (status !== undefined) { fields.push(`status = $${paramIdx++}`); values.push(status); }
    if (priority !== undefined) { fields.push(`priority = $${paramIdx++}`); values.push(priority); }
    if (due_date !== undefined) { fields.push(`due_date = $${paramIdx++}`); values.push(due_date || null); }
    if (category_id !== undefined) { fields.push(`category_id = $${paramIdx++}`); values.push(category_id || null); }

    if (status === 'completed') {
      fields.push(`completed_at = NOW()`);
    } else if (status === 'pending') {
      fields.push(`completed_at = NULL`);
    }

    fields.push(`updated_at = NOW()`);

    if (fields.length <= 1) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      const result = await db.query(
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIdx} AND project_id IS NULL RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        await db.query('ROLLBACK');
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const task = result.rows[0];

      // Update tags if provided
      if (tags !== undefined) {
        await db.query('DELETE FROM task_tags WHERE task_id = $1', [id]);
        if (Array.isArray(tags) && tags.length > 0) {
          for (const tagId of tags) {
            if (typeof tagId === 'string') {
              await db.query(
                'INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [id, tagId]
              );
            }
          }
        }
      }

      await db.query('COMMIT');

      // Record daily log asynchronously (don't block response)
      recordDailyLog().catch(e => console.error('DailyLog error:', e));

      res.json(task);
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
  } catch (err) {
    console.error('Error updating daily task:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// DELETE /api/daily/tasks/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND project_id IS NULL RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting daily task:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
