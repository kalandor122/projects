import express from 'express';
import pool from '../db';
import { announceEntity, updateEntityState, deleteEntity } from '../services/mqtt';

const router = express.Router();

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
    res.status(500).json({ error: (err as Error).message });
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
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create project
router.post('/', async (req, res) => {
  try {
    const { name, description, deadline } = req.body;
    const result = await pool.query(
      'INSERT INTO projects (name, description, deadline) VALUES ($1, $2, $3) RETURNING *',
      [name, description, deadline]
    );
    const project = result.rows[0];
    
    announceEntity('project', project.id, project.name);
    updateEntityState('project', project.id, project.name, project.status, { deadline });
    
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update project
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, deadline, status } = req.body;
    
    const result = await pool.query(
      'UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description), deadline = COALESCE($3, deadline), status = COALESCE($4, status) WHERE id = $5 RETURNING *',
      [name, description, deadline, status, id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const project = result.rows[0];
    
    updateEntityState('project', project.id, project.name, project.status, { deadline });
    
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    res.status(500).json({ error: (err as Error).message });
  }
});

// Assign tag to project
router.post('/:id/tags', async (req, res) => {
  try {
    const { id } = req.params;
    const { tag_id } = req.body;
    await pool.query('INSERT INTO project_tags (project_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tag_id]);
    res.json({ message: 'Tag assigned' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Unassign tag
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    const { id, tagId } = req.params;
    await pool.query('DELETE FROM project_tags WHERE project_id = $1 AND tag_id = $2', [id, tagId]);
    res.json({ message: 'Tag unassigned' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
