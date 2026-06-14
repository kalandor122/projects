import express from 'express';
import pool from '../db';
import { announceEntity, updateEntityState, deleteEntity } from '../services/mqtt';

const router = express.Router();

// Sanitize PostgreSQL error messages before sending to client
function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown error';
  // Remove connection details, SQL syntax hints, and stack traces
  return message
    .replace(/password:.*@/g, 'password:***@')
    .replace(/FATAL:\s*/gi, '')
    .replace(/ERROR:\s*/gi, '')
    .replace(/\n/g, ' ')
    .substring(0, 200);
}

// Get all projects
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, COALESCE(json_agg(t.*) FILTER (WHERE t.id IS NOT NULL), '[]') as tags
      FROM projects p
      LEFT JOIN project_tags pt ON p.id = pt.project_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Get single project
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT p.*, COALESCE(json_agg(t.*) FILTER (WHERE t.id IS NOT NULL), '[]') as tags
      FROM projects p
      LEFT JOIN project_tags pt ON p.id = pt.project_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.id = $1
      GROUP BY p.id
    `, [id]);
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Create project
router.post('/', async (req, res) => {
  try {
    const { name, description, deadline, icon } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const result = await pool.query(
      'INSERT INTO projects (name, description, deadline, icon) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), description || null, deadline || null, icon || 'folder']
    );
    const project = result.rows[0];
    
    announceEntity('project', project.id, project.name);
    updateEntityState('project', project.id, project.name, project.status, { deadline });
    
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Update project
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, deadline, status, icon } = req.body;

    // Build dynamic SET clause to allow setting fields to NULL
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) { fields.push(`name = $${paramIndex++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${paramIndex++}`); values.push(description); }
    if (deadline !== undefined) { fields.push(`deadline = $${paramIndex++}`); values.push(deadline); }
    if (status !== undefined) { fields.push(`status = $${paramIndex++}`); values.push(status); }
    if (icon !== undefined) { fields.push(`icon = $${paramIndex++}`); values.push(icon); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const project = result.rows[0];
    
    updateEntityState('project', project.id, project.name, project.status, { deadline: project.deadline });
    
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    
    deleteEntity('project', id);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Assign tag to project
router.post('/:id/tags', async (req, res) => {
  try {
    const { id } = req.params;
    const { tag_id } = req.body;

    if (!tag_id || typeof tag_id !== 'string') {
      return res.status(400).json({ error: 'tag_id is required' });
    }

    await pool.query('INSERT INTO project_tags (project_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tag_id]);
    res.json({ message: 'Tag assigned' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Unassign tag
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    const { id, tagId } = req.params;
    await pool.query('DELETE FROM project_tags WHERE project_id = $1 AND tag_id = $2', [id, tagId]);
    res.json({ message: 'Tag unassigned' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
