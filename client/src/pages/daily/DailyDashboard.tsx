import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, CheckCircle, CheckSquare, Flame, AlertCircle } from 'lucide-react';
import { dailyApi } from '../../services/dailyApi';
import type { DailyTask, DailyStats } from '../../services/dailyApi';
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

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

export default function DailyDashboard() {
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [rolledTasks, setRolledTasks] = useState<DailyTask[]>([]);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [tags, setTags] = useState<DailyTag[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      try {
        const [pendingTasks, rolled, statsData, tagList] = await Promise.all([
          dailyApi.tasks.list({ status: 'pending' }).catch(() => [] as DailyTask[]),
          dailyApi.tasks.list({ status: 'rolled_over' }).catch(() => [] as DailyTask[]),
          dailyApi.analytics.stats().catch(() => null),
          fetch('/api/tags')
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [] as DailyTag[]),
        ]);

        if (cancelled) return;

        setTasks(pendingTasks);
        setRolledTasks(rolled);
        setStats(statsData);
        setTags(tagList);
      } catch (err) {
        console.error('Failed to load daily dashboard data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayTasks = tasks.filter(
    (t) => isToday(t.due_date) || t.due_date === null
  );

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
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
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
          due_date: data.due_date || todayStr(),
          status: 'pending',
        });
        setTasks((prev) => [...prev, created]);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Pending',
      value: stats?.pending ?? todayTasks.filter((t) => t.status === 'pending').length,
      icon: CheckSquare,
      color: 'bg-blue-50 text-blue-700',
      iconBg: 'bg-blue-600',
    },
    {
      label: 'Completed',
      value: stats?.completed ?? 0,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-700',
      iconBg: 'bg-green-500',
    },
    {
      label: 'Total',
      value: stats?.total ?? tasks.length,
      icon: Calendar,
      color: 'bg-purple-50 text-purple-700',
      iconBg: 'bg-purple-500',
    },
    {
      label: 'Streak',
      value: `${stats?.streak ?? 0} 🔥`,
      icon: Flame,
      color: 'bg-orange-50 text-orange-700',
      iconBg: 'bg-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <button
          onClick={() => setShowForm((prev) => !prev)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          Add Task
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-lg ${card.iconBg} text-white`}
              >
                <card.icon size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rolled-over Banner */}
      {rolledTasks.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="text-amber-600 shrink-0" size={20} />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {rolledTasks.length} task{rolledTasks.length !== 1 ? 's' : ''} rolled over
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              These tasks weren't completed yesterday and were carried forward.
            </p>
          </div>
        </div>
      )}

      {/* Inline Task Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <DailyTaskForm
            onSubmit={handleCreate}
            tags={tags}
            buttonLabel="Add Task"
          />
        </div>
      )}

      {/* Task List */}
      {todayTasks.length > 0 ? (
        <div className="space-y-3">
          {todayTasks.map((task) => (
            <DailyTaskCard
              key={task.id}
              task={task}
              onToggle={handleToggle}
              onClick={handleClick}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 py-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <Calendar className="text-gray-400" size={24} />
            </div>
            <p className="text-gray-500 font-medium">No tasks for today</p>
            <p className="text-sm text-gray-400">
              Click "Add Task" to create your first task.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
