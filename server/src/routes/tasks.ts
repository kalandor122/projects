import express from 'express';
import pool from '../db';
import { announceEntity, updateEntityState, deleteEntity } from '../services/mqtt';

const router = express.Router();

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
    res.status(500).json({ error: (err as Error).message });
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
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create task
router.post('/', async (req, res) => {
  try {
    const { project_id, name, description, deadline, status, ease_level, priority } = req.body;
    const result = await pool.query(
      'INSERT INTO tasks (project_id, name, description, deadline, status, ease_level, priority) VALUES ($1, $2, $3, $4, COALESCE($5, \'TODO\'), COALESCE($6, \'Medium\'), COALESCE($7, 3)) RETURNING *',
      [project_id, name, description, deadline, status, ease_level, priority]
    );
    const task = result.rows[0];
    
    announceEntity('task', task.id, task.name);
    updateEntityState('task', task.id, task.name, task.status, { deadline, project_id, ease_level, priority: task.priority });
    
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update task
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, deadline, status, ease_level, priority } = req.body;
    
    const result = await pool.query(
      'UPDATE tasks SET name = COALESCE($1, name), description = COALESCE($2, description), deadline = COALESCE($3, deadline), status = COALESCE($4, status), ease_level = COALESCE($5, ease_level), priority = COALESCE($6, priority) WHERE id = $7 RETURNING *',
      [name, description, deadline, status, ease_level, priority, id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = result.rows[0];
    
    updateEntityState('task', task.id, task.name, task.status, { deadline, project_id: task.project_id, ease_level: task.ease_level, priority: task.priority });
    
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    res.status(500).json({ error: (err as Error).message });
  }
});

// Assign tag to task
router.post('/:id/tags', async (req, res) => {
  try {
    const { id } = req.params;
    const { tag_id } = req.body;
    await pool.query('INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tag_id]);
    res.json({ message: 'Tag assigned' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Unassign tag from task
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    const { id, tagId } = req.params;
    await pool.query('DELETE FROM task_tags WHERE task_id = $1 AND tag_id = $2', [id, tagId]);
    res.json({ message: 'Tag unassigned' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get subtasks for a task
router.get('/:id/subtasks', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM subtasks WHERE task_id = $1 ORDER BY created_at ASC', [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create subtask
router.post('/:id/subtasks', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const result = await pool.query(
      'INSERT INTO subtasks (task_id, name) VALUES ($1, $2) RETURNING *',
      [id, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Toggle subtask
router.patch('/subtasks/:subtaskId', async (req, res) => {
  try {
    const { subtaskId } = req.params;
    const { completed } = req.body;
    const result = await pool.query(
      'UPDATE subtasks SET completed = $1 WHERE id = $2 RETURNING *',
      [completed, subtaskId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Subtask not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete subtask
router.delete('/subtasks/:subtaskId', async (req, res) => {
  try {
    const { subtaskId } = req.params;
    await pool.query('DELETE FROM subtasks WHERE id = $1', [subtaskId]);
    res.json({ message: 'Subtask deleted' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
