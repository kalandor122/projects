import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Inbox as InboxIcon, Calendar, Wand2, Loader2 } from 'lucide-react';
import { dailyApi } from '../../services/dailyApi';
import type { DailyTask } from '../../services/dailyApi';
import DailyTaskCard from '../../components/daily/DailyTaskCard';
import DailyTaskForm from '../../components/daily/DailyTaskForm';

interface DailyTag {
  id: string;
  name: string;
  color: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Inbox() {
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [tags, setTags] = useState<DailyTag[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [unscheduledTasks, tagList] = await Promise.all([
          dailyApi.tasks.list({ unscheduled: 'true', status: 'pending' }).catch(() => [] as DailyTask[]),
          fetch('/api/tags')
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [] as DailyTag[]),
        ]);

        if (cancelled) return;
        setTasks(unscheduledTasks);
        setTags(tagList);
      } catch (err) {
        console.error('Failed to load inbox:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(async (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: t.status === 'completed' ? 'pending' : 'completed',
              completed_at: t.status === 'completed' ? null : new Date().toISOString(),
            }
          : t
      )
    );

    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await dailyApi.tasks.update(id, {
        status: newStatus,
      });
    } catch (err) {
      console.error('Failed to toggle task:', err);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, status: task.status, completed_at: task.completed_at }
            : t
        )
      );
    }
  }, [tasks]);

  const handleCreate = useCallback(
    async (data: {
      name: string;
      description?: string;
      priority: number;
      due_date?: string;
      tags?: string[];
    }) => {
      try {
        const created = await dailyApi.tasks.create({
          name: data.name,
          description: data.description,
          priority: data.priority,
          due_date: undefined,
          status: 'pending',
        });
        setTasks((prev) => [created, ...prev]);
        setShowForm(false);
      } catch (err) {
        console.error('Failed to create task:', err);
      }
    },
    []
  );

  const handleClick = useCallback(
    (id: string) => {
      navigate(`/daily/tasks/${id}`);
    },
    [navigate]
  );

  const handleScheduleOne = useCallback(async (id: string, dateStr: string) => {
    setEditingDate(null);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await dailyApi.tasks.update(id, { due_date: dateStr });
    } catch (err) {
      console.error('Failed to schedule task:', err);
      const task = tasks.find((t) => t.id === id);
      if (task) setTasks((prev) => [...prev, task]);
    }
  }, [tasks]);

  const handleScheduleAll = useCallback(async () => {
    setScheduling(true);
    setScheduleMsg(null);
    try {
      const result = await dailyApi.tasks.schedule(7);
      setTasks((prev) =>
        prev.filter((t) => !result.results.some((r) => r.id === t.id))
      );
      const dates = [...new Set(result.results.map((r) => r.due_date))];
      setScheduleMsg(
        `Scheduled ${result.scheduled} task${result.scheduled !== 1 ? 's' : ''} across ${dates.length} day${dates.length !== 1 ? 's' : ''}.`
      );
    } catch (err) {
      console.error('Failed to schedule tasks:', err);
      setScheduleMsg('Failed to schedule tasks.');
    } finally {
      setScheduling(false);
    }
  }, [tasks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pendingTasks = tasks.filter((t) => t.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
            {pendingTasks.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                {pendingTasks.length}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Tasks without a date — brain-dump anything, then schedule it later.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingTasks.length > 0 && (
            <button
              onClick={handleScheduleAll}
              disabled={scheduling}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors shadow-sm"
            >
              {scheduling ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Wand2 size={16} />
              )}
              Schedule All
            </button>
          )}
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Add Task
          </button>
        </div>
      </div>

      {/* Schedule result message */}
      {scheduleMsg && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-800">{scheduleMsg}</p>
        </div>
      )}

      {/* Inline Task Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <DailyTaskForm
            onSubmit={handleCreate}
            tags={tags}
            buttonLabel="Add to Inbox"
            hideDate
          />
        </div>
      )}

      {/* Task List */}
      {tasks.length > 0 ? (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="relative group">
              <DailyTaskCard
                task={task}
                onToggle={handleToggle}
                onClick={handleClick}
              />
              {/* Per-task schedule button */}
              {editingDate === task.id ? (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
                  <input
                    type="date"
                    min={todayStr()}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500 shadow-sm"
                    onChange={(e) => {
                      if (e.target.value) {
                        handleScheduleOne(task.id, e.target.value);
                      }
                    }}
                    onBlur={() => setEditingDate(null)}
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingDate(task.id);
                  }}
                  className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                  title="Pick a date"
                >
                  <Calendar size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 py-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <InboxIcon className="text-gray-400" size={24} />
            </div>
            <p className="text-gray-500 font-medium">No unscheduled tasks</p>
            <p className="text-sm text-gray-400">
              Your inbox is empty. Brain-dump your ideas above.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
