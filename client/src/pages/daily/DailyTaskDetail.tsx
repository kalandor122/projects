import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dailyApi } from '../../services/dailyApi';
import type { DailyTask } from '../../services/dailyApi';
import DailyTaskForm from '../../components/daily/DailyTaskForm';

const PRIORITY_LABELS: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };
const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-red-50 text-red-700 border-red-100',
  2: 'bg-orange-50 text-orange-700 border-orange-100',
  3: 'bg-blue-50 text-blue-700 border-blue-100',
  4: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  completed: 'Completed',
  rolled_over: 'Rolled Over',
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  completed: 'bg-green-50 text-green-700 border-green-100',
  rolled_over: 'bg-gray-100 text-gray-600 border-gray-200',
};

interface Subtask {
  id: string;
  name: string;
  completed: boolean;
  created_at: string;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

export default function DailyTaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<DailyTask | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [taskData, tagsData] = await Promise.all([
          dailyApi.tasks.get(id!),
          fetch('/api/tags').then((r) => (r.ok ? r.json() : [])).catch(() => [] as Tag[]),
        ]);
        if (cancelled) return;
        setTask(taskData);
        setTags(tagsData);
        setSubtasks(taskData.subtasks || []);

        // Fetch available tags (graceful — endpoint may not exist yet)
        try {
          const tagRes = await fetch('/api/daily/tags');
          if (tagRes.ok) {
            const tagData = await tagRes.json();
            if (!cancelled) setTags(tagData);
          }
        } catch {
          // Tags endpoint not available — use tags from task if any
          if (taskData.tags && !cancelled) setTags(taskData.tags);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load task');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Handlers ──────────────────────────────────────────────

  const handleSaveEdit = async (data: {
    name: string;
    description?: string;
    priority: number;
    due_date?: string;
    tags?: string[];
  }) => {
    if (!id || !task) return;
    try {
      const updated = await dailyApi.tasks.update(id, data as any);
      setTask(updated);
      setSubtasks(updated.subtasks || []);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const confirmed = window.confirm('Are you sure you want to delete this task? This action cannot be undone.');
    if (!confirmed) return;
    try {
      await dailyApi.tasks.delete(id);
      navigate(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const handleAiBreakdown = async () => {
    if (!id) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await dailyApi.tasks.breakDown(id);
      setSubtasks(result.subtasks || []);
      // Also refresh the task to keep it in sync
      const refreshed = await dailyApi.tasks.get(id);
      setTask(refreshed);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI breakdown failed');
    } finally {
      setAiLoading(false);
    }
  };

  const toggleSubtask = async (subtaskId: string) => {
    const sub = subtasks.find(s => s.id === subtaskId);
    if (!sub) return;
    const newCompleted = !sub.completed;

    // Optimistic update
    setSubtasks(prev =>
      prev.map(s => (s.id === subtaskId ? { ...s, completed: newCompleted } : s))
    );

    try {
      const res = await fetch(`/api/daily/subtasks/${subtaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: newCompleted }),
      });
      if (!res.ok) {
        // Revert on failure
        setSubtasks(prev =>
          prev.map(s => (s.id === subtaskId ? { ...s, completed: !newCompleted } : s))
        );
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      setSubtasks(prev =>
        prev.map(s => (s.id === subtaskId ? { ...s, completed: !newCompleted } : s))
      );
      setError('Failed to toggle subtask');
    }
  };

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading task…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 font-medium"
        >
          ← Back
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 font-medium"
        >
          ← Back
        </button>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-4xl mb-3">🔍</p>
          <h2 className="text-lg font-bold text-gray-700">Task not found</h2>
          <p className="text-sm text-gray-400 mt-1">The task you're looking for doesn't exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  // ── Edit Mode ─────────────────────────────────────────────

  if (editing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 font-medium"
        >
          ← Back
        </button>
        <div className="rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-blue-50 bg-blue-50/50 px-6 py-4">
            <h2 className="text-lg font-bold text-blue-900">Edit Task</h2>
          </div>
          <div className="p-6">
            <DailyTaskForm
              onSubmit={handleSaveEdit}
              initial={{
                name: task.name,
                description: task.description,
                priority: task.priority,
                due_date: task.due_date || undefined,
              }}
              tags={tags}
              buttonLabel="Save Changes"
            />
            <button
              onClick={() => setEditing(false)}
              className="w-full mt-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail View ───────────────────────────────────────────

  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const isOverdue =
    task.due_date &&
    new Date(task.due_date) < new Date(new Date().toDateString()) &&
    task.status !== 'completed';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-blue-600 hover:text-blue-700 mb-4 font-medium"
      >
        ← Back
      </button>

      {/* Main card */}
      <div className="rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="border-b border-blue-50 bg-blue-50/30 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 break-words">
                {task.name}
              </h1>
              {task.is_ai_generated && (
                <span className="inline-block mt-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md">
                  ✨ AI Generated
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
              >
                ✏️ Edit
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                🗑 Delete
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Description */}
          {task.description && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Description
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Priority */}
            <span
              className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3]
              }`}
            >
              {PRIORITY_LABELS[task.priority] || 'Medium'}
            </span>

            {/* Status */}
            <span
              className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                STATUS_COLORS[task.status] || STATUS_COLORS.pending
              }`}
            >
              {STATUS_LABELS[task.status] || task.status}
            </span>

            {/* Due date */}
            {task.due_date && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  isOverdue
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                📅 {new Date(task.due_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}

          </div>

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Tags
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap">
                {task.tags.map(tag => (
                  <span
                    key={tag.id}
                    className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI Breakdown Section */}
          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Subtasks
                {subtasks.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    {completedSubtasks}/{subtasks.length} done
                  </span>
                )}
              </h3>
              <button
                onClick={handleAiBreakdown}
                disabled={aiLoading}
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {aiLoading ? '⏳ Breaking down…' : '🤖 AI Break Down'}
              </button>
            </div>

            {aiError && (
              <p className="text-sm text-red-600 mb-2">{aiError}</p>
            )}

            {/* Subtask list */}
            {subtasks.length > 0 ? (
              <div className="space-y-1.5">
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{
                      width: `${subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0}%`,
                    }}
                  />
                </div>

                {subtasks.map(sub => (
                  <div
                    key={sub.id}
                    className={`flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-gray-50 transition-colors ${
                      sub.completed ? 'opacity-60' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleSubtask(sub.id)}
                      className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        sub.completed
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 hover:border-blue-500'
                      }`}
                      aria-label={sub.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {sub.completed && (
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      )}
                    </button>
                    <span
                      className={`text-sm flex-1 ${
                        sub.completed ? 'line-through text-gray-400' : 'text-gray-700'
                      }`}
                    >
                      {sub.name}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              !aiLoading && (
                <p className="text-sm text-gray-400 py-2">
                  No subtasks yet. Use AI Break Down to generate them automatically.
                </p>
              )
            )}
          </div>

          {/* Metadata */}
          <div className="border-t border-gray-100 pt-4 flex items-center gap-4 text-xs text-gray-400">
            <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
            <span>Updated {new Date(task.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
