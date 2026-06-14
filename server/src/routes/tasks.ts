import express from 'express';
import pool from '../db';
import { announceEntity, updateEntityState, deleteEntity } from '../services/mqtt';

const router = express.Router();

// Sanitize PostgreSQL error messages
function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return message
    .replace(/password:.*@/g, 'password:***@')
    .replace(/FATAL:\s*/gi, '')
    .replace(/ERROR:\s*/gi, '')
    .replace(/\n/g, ' ')
    .substring(0, 200);
}

// Get all tasks
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, COALESCE(json_agg(tag.*) FILTER (WHERE tag.id IS NOT NULL), '[]') as tags
      FROM tasks t
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tag ON tt.tag_id = tag.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Get tasks for a project
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await pool.query(`
      SELECT t.*, COALESCE(json_agg(tag.*) FILTER (WHERE tag.id IS NOT NULL), '[]') as tags
      FROM tasks t
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tag ON tt.tag_id = tag.id
      WHERE t.project_id = $1
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `, [projectId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Create task
router.post('/', async (req, res) => {
  try {
    const { project_id, name, description, deadline, status, ease_level, priority } = req.body;

    if (!project_id || typeof project_id !== 'string') {
      return res.status(400).json({ error: 'project_id is required' });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Task name is required' });
    }

    const result = await pool.query(
      'INSERT INTO tasks (project_id, name, description, deadline, status, ease_level, priority) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [
        project_id,
        name.trim(),
        description || null,
        deadline || null,
        status || 'TODO',
        ease_level || 'Medium',
        priority || 3,
      ]
    );
    const task = result.rows[0];
    
    announceEntity('task', task.id, task.name);
    updateEntityState('task', task.id, task.name, task.status, { deadline, project_id, ease_level, priority: task.priority });
    
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Update task
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, deadline, status, ease_level, priority } = req.body;

    // Build dynamic SET clause to allow setting fields to NULL
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) { fields.push(`name = $${paramIndex++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${paramIndex++}`); values.push(description); }
    if (deadline !== undefined) { fields.push(`deadline = $${paramIndex++}`); values.push(deadline); }
    if (status !== undefined) { fields.push(`status = $${paramIndex++}`); values.push(status); }
    if (ease_level !== undefined) { fields.push(`ease_level = $${paramIndex++}`); values.push(ease_level); }
    if (priority !== undefined) { fields.push(`priority = $${paramIndex++}`); values.push(priority); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = result.rows[0];
    
    updateEntityState('task', task.id, task.name, task.status, { deadline, project_id: task.project_id, ease_level: task.ease_level, priority: task.priority });
    
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    
    deleteEntity('task', id);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Assign tag to task
router.post('/:id/tags', async (req, res) => {
  try {
    const { id } = req.params;
    const { tag_id } = req.body;

    if (!tag_id || typeof tag_id !== 'string') {
      return res.status(400).json({ error: 'tag_id is required' });
    }

    await pool.query('INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tag_id]);
    res.json({ message: 'Tag assigned' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Unassign tag from task
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    const { id, tagId } = req.params;
    await pool.query('DELETE FROM task_tags WHERE task_id = $1 AND tag_id = $2', [id, tagId]);
    res.json({ message: 'Tag unassigned' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Get subtasks for a task
router.get('/:id/subtasks', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM subtasks WHERE task_id = $1 ORDER BY created_at ASC', [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Create subtask
router.post('/:id/subtasks', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Subtask name is required' });
    }

    const result = await pool.query(
      'INSERT INTO subtasks (task_id, name) VALUES ($1, $2) RETURNING *',
      [id, name.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Toggle subtask
router.patch('/subtasks/:subtaskId', async (req, res) => {
  try {
    const { subtaskId } = req.params;
    const { completed } = req.body;

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'completed must be a boolean' });
    }

    const result = await pool.query(
      'UPDATE subtasks SET completed = $1 WHERE id = $2 RETURNING *',
      [completed, subtaskId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Subtask not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Delete subtask
router.delete('/subtasks/:subtaskId', async (req, res) => {
  try {
    const { subtaskId } = req.params;
    await pool.query('DELETE FROM subtasks WHERE id = $1', [subtaskId]);
    res.json({ message: 'Subtask deleted' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
