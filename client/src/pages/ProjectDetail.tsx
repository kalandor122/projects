import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Calendar as CalendarIcon, Clock, Filter, Tag as TagIcon, X, MoreVertical, Edit2, Trash2, CheckCircle, List, Layout as KanbanIcon, AlertCircle, FileText, Download, BookOpen, ChevronRight } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, setHours, setMinutes, parse } from 'date-fns';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Task {
  id: string;
  project_id: string;
  name: string;
  description: string;
  deadline: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  priority: number; // 1: Urgent, 2: High, 3: Medium, 4: Low
  tags: Tag[];
}

interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string;
  status: string;
  tags: Tag[];
}

interface Worklog {
  id: string;
  project_id: string;
  date: string;
  title: string;
  description: string;
  created_at: string;
}

const PRIORITY_MAP: Record<number, { label: string, color: string, bg: string }> = {
  1: { label: 'Urgent', color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
  2: { label: 'High', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
  3: { label: 'Medium', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
  4: { label: 'Low', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-100' }
};

function DateTimePicker({ value, onChange }: { value: Date, onChange: (date: Date) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(value));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const hours = format(value, 'hh');
  const minutes = format(value, 'mm');
  const ampm = format(value, 'a');

  const updateTime = (h: string, m: string, p: string) => {
    let hour = parseInt(h);
    if (p === 'PM' && hour < 12) hour += 12;
    if (p === 'AM' && hour === 12) hour = 0;
    const newDate = setMinutes(setHours(new Date(value), hour), parseInt(m));
    onChange(newDate);
  };

  const presets = [
    { label: 'Tomorrow', date: addDays(new Date(), 1) },
    { label: 'This week', date: endOfWeek(new Date()) },
    { label: 'Next week', date: addDays(endOfWeek(new Date()), 1) },
    { label: 'This month', date: endOfMonth(new Date()) },
    { label: 'Next month', date: addDays(endOfMonth(new Date()), 1) },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-[#d1e2df] rounded-lg cursor-pointer hover:border-[#000000] transition-colors shadow-sm"
      >
        <span className="text-[#000000] font-medium">
          {format(value, 'MMMM d, yyyy HH:mm')}
        </span>
        <CalendarIcon size={18} className="text-[#000000]" />
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[400px] bg-white rounded-xl shadow-2xl border border-[#d1e2df] z-[100] animate-fadeIn overflow-hidden">
          <div className="absolute top-0 right-6 -translate-y-full w-4 h-4 overflow-hidden">
            <div className="w-4 h-4 bg-white border-t border-l border-[#d1e2df] rotate-45 translate-y-2"></div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-bold text-gray-800">Date</span>
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => setViewDate(subMonths(viewDate, 1))} className="text-[#000000] hover:text-[#8ab1ab]"><ChevronLeft size={20}/></button>
                <span className="text-sm font-bold text-gray-800 min-w-[100px] text-center">{format(viewDate, 'MMMM yyyy')}</span>
                <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))} className="text-[#000000] hover:text-[#8ab1ab]"><ChevronRight size={20}/></button>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="w-32 flex flex-col gap-1 border-r border-gray-50 pr-4">
                <span className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-2">Presets</span>
                {presets.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      const newDate = new Date(p.date);
                      newDate.setHours(value.getHours(), value.getMinutes());
                      onChange(newDate);
                      setViewDate(newDate);
                    }}
                    className="text-left py-1.5 text-xs font-bold text-gray-600 hover:text-[#000000] transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex-1">
                <div className="grid grid-cols-7 mb-2">
                  {days.map(d => (
                    <span key={d} className="text-[10px] font-bold text-[#000000] text-center">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {calendarDays.map((day, i) => {
                    const isSelected = isSameDay(day, value);
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const newDate = new Date(day);
                          newDate.setHours(value.getHours(), value.getMinutes());
                          onChange(newDate);
                        }}
                        className={`
                          h-8 w-8 flex items-center justify-center rounded-full text-xs font-bold transition-all
                          ${isSelected ? 'bg-blue-700 text-white shadow-md' : 'hover:bg-gray-50'}
                          ${!isCurrentMonth ? 'text-gray-200' : isSelected ? 'text-white' : 'text-gray-600'}
                        `}
                      >
                        {format(day, 'd')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Time</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={hours}
                    onChange={(e) => updateTime(e.target.value.padStart(2, '0'), minutes, ampm)}
                    className="w-12 h-9 text-center border border-gray-100 rounded-lg text-sm font-bold text-gray-600 focus:outline-none focus:border-[#000000]"
                  />
                  <span className="text-gray-300 font-bold">:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={minutes}
                    onChange={(e) => updateTime(hours, e.target.value.padStart(2, '0'), ampm)}
                    className="w-12 h-9 text-center border border-gray-100 rounded-lg text-sm font-bold text-gray-600 focus:outline-none focus:border-[#000000]"
                  />
                </div>
                <div className="flex bg-gray-50 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => updateTime(hours, minutes, 'AM')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-all ${ampm === 'AM' ? 'bg-[#000000] text-white' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => updateTime(hours, minutes, 'PM')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-all ${ampm === 'PM' ? 'bg-[#000000] text-white' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({ 
  task, 
  isDragging = false, 
  isOverlay = false, 
  onEdit 
}: { 
  task: Task, 
  isDragging?: boolean, 
  isOverlay?: boolean,
  onEdit?: (task: Task) => void
}) {
  const [showMenu, setShowMenu] = useState(false);
  const p = PRIORITY_MAP[task.priority] || PRIORITY_MAP[3];

  return (
    <div className={`
      bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-3 group relative
      ${isDragging && !isOverlay ? 'opacity-30' : 'opacity-100'}
      ${isOverlay ? 'ring-2 ring-blue-500 shadow-2xl scale-105 rotate-1 cursor-grabbing' : 'hover:border-blue-300 hover:shadow-md cursor-grab active:cursor-grabbing'}
      transition-all duration-200
    `}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border mb-1.5 ${p.color} ${p.bg}`}>
            <AlertCircle size={10} />
            {p.label}
          </div>
          <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 pr-6">
            {task.name}
          </h4>
        </div>
        <div className="relative">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="text-gray-300 hover:text-gray-600 p-1 rounded-md hover:bg-gray-50 transition-colors"
          >
            <MoreVertical size={16} />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1 animate-fadeIn overflow-hidden">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onEdit?.(task);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <Edit2 size={14} />
                Edit Task
              </button>
            </div>
          )}
        </div>
      </div>
      
      {task.description && (
        <p className="text-sm text-gray-500 mb-4 line-clamp-2">
          {task.description}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {task.tags.map(tag => (
          <span 
            key={tag.id} 
            className="text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-tight"
            style={{ backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '30' }}
          >
            {tag.name}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
          task.deadline && new Date(task.deadline) < new Date() ? 'text-red-500' : 'text-gray-400'
        }`}>
          <Clock size={12} />
          <span>{task.deadline ? format(new Date(task.deadline), 'MMM d') : 'No date'}</span>
        </div>
      </div>
      
      {showMenu && <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />}
    </div>
  );
}

function SortableTaskCard({ task, onEdit }: { task: Task, onEdit: (task: Task) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} isDragging={isDragging} onEdit={onEdit} />
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'KANBAN' | 'LIST' | 'WORKLOG'>('KANBAN');
  
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showWorklogModal, setShowWorklogModal] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingWorklogId, setEditingWorklogId] = useState<string | null>(null);

  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  
  const [taskForm, setTaskForm] = useState({
    name: '',
    description: '',
    deadline: '',
    status: 'TODO' as 'TODO' | 'IN_PROGRESS' | 'DONE',
    priority: 3,
    tagIds: [] as string[]
  });

  const [worklogForm, setWorklogForm] = useState({
    date: new Date(),
    title: '',
    description: ''
  });

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchData = async () => {
    try {
      const [projRes, tasksRes, tagsRes, worklogRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/tasks/project/${id}`),
        fetch('/api/tags'),
        fetch(`/api/worklogs/project/${id}`)
      ]);
      setProject(await projRes.json());
      setTasks(await tasksRes.json());
      setAvailableTags(await tagsRes.json());
      setWorklogs(await worklogRes.json());
    } catch (err) {
      console.error('Failed to fetch project data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleOpenCreateModal = (status: 'TODO' | 'IN_PROGRESS' | 'DONE' = 'TODO') => {
    setIsEditing(false);
    setEditingTaskId(null);
    setTaskForm({
      name: '',
      description: '',
      deadline: '',
      status: status,
      priority: 3,
      tagIds: []
    });
    setShowTaskModal(true);
  };

  const handleOpenEditModal = (task: Task) => {
    setIsEditing(true);
    setEditingTaskId(task.id);
    setTaskForm({
      name: task.name,
      description: task.description || '',
      deadline: task.deadline ? task.deadline.split('T')[0] : '',
      status: task.status,
      priority: task.priority,
      tagIds: task.tags.map(t => t.id)
    });
    setShowTaskModal(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = isEditing ? `/api/tasks/${editingTaskId}` : '/api/tasks';
      const method = isEditing ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...taskForm, project_id: id })
      });

      if (res.ok) {
        const savedTask = await res.json();
        
        if (isEditing) {
          const currentTask = tasks.find(t => t.id === editingTaskId);
          if (currentTask) {
            for (const tag of currentTask.tags) {
              await fetch(`/api/tasks/${editingTaskId}/tags/${tag.id}`, { method: 'DELETE' });
            }
          }
        }

        for (const tagId of taskForm.tagIds) {
          await fetch(`/api/tasks/${savedTask.id}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_id: tagId })
          });
        }

        setShowTaskModal(false);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to save task', err);
    }
  };

  const handleDeleteTask = async () => {
    if (!editingTaskId || !confirm('Are you sure you want to delete this task?')) return;
    try {
      await fetch(`/api/tasks/${editingTaskId}`, { method: 'DELETE' });
      setShowTaskModal(false);
      fetchData();
    } catch (err) {
      console.error('Failed to delete task', err);
    }
  };

  const handleOpenWorklogModal = (log?: Worklog) => {
    if (log) {
      setIsEditing(true);
      setEditingWorklogId(log.id);
      setWorklogForm({
        date: new Date(log.date),
        title: log.title,
        description: log.description || ''
      });
    } else {
      setIsEditing(false);
      setEditingWorklogId(null);
      setWorklogForm({
        date: new Date(),
        title: '',
        description: ''
      });
    }
    setShowWorklogModal(true);
  };

  const handleSaveWorklog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = isEditing ? `/api/worklogs/${editingWorklogId}` : '/api/worklogs';
      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...worklogForm, 
          date: worklogForm.date.toISOString(),
          project_id: id 
        })
      });
      if (res.ok) {
        setShowWorklogModal(false);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to save worklog', err);
    }
  };

  const handleDeleteWorklog = async (logId: string) => {
    if (!confirm('Delete this worklog entry?')) return;
    try {
      await fetch(`/api/worklogs/${logId}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('Failed to delete worklog', err);
    }
  };

  const downloadWorklog = () => {
    if (!project) return;
    const sortedLogs = [...worklogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let content = `# Worklog: ${project.name}\n\n`;
    content += `**Status:** ${project.status}<br />\n`;
    content += `**Description:** ${project.description || 'N/A'}\n\n`;
    content += `---\n\n`;

    sortedLogs.forEach(log => {
      content += `## ${format(new Date(log.date), 'MMMM d, yyyy HH:mm')} - ${log.title}\n`;
      if (log.description) {
        content += `${log.description}\n\n`;
      }
      content += `---\n\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}_worklog.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeleteProject = async () => {
    if (!confirm('Are you sure you want to delete this entire project? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        navigate('/');
      }
    } catch (err) {
      console.error('Failed to delete project', err);
    }
  };

  const handleFinishProject = async () => {
    const newStatus = project?.status === 'Completed' ? 'Active' : 'Completed';
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to update project status', err);
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as any } : t));
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) fetchData();
    } catch (err) {
      console.error('Failed to update task status', err);
      fetchData();
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    const columnIds = ['TODO', 'IN_PROGRESS', 'DONE'];
    let newStatus: string | null = null;

    if (columnIds.includes(overId)) {
      newStatus = overId;
    } else {
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) newStatus = overTask.status;
    }

    if (newStatus) {
      const task = tasks.find(t => t.id === taskId);
      if (task && task.status !== newStatus) {
        updateTaskStatus(taskId, newStatus);
      }
    }
  };

  const toggleTagOnProject = async (tagId: string) => {
    if (!project) return;
    const hasTag = project.tags.some(t => t.id === tagId);
    try {
      if (hasTag) {
        await fetch(`/api/projects/${project.id}/tags/${tagId}`, { method: 'DELETE' });
      } else {
        await fetch(`/api/projects/${project.id}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_id: tagId })
        });
      }
      fetchData();
    } catch (err) {
      console.error('Failed to toggle tag on project', err);
    }
  };

  const filteredTasks = useMemo(() => {
    let result = selectedFilterTags.length === 0 
      ? tasks 
      : tasks.filter(task => selectedFilterTags.every(ft => task.tags.some(tt => tt.id === ft)));
    
    return [...result].sort((a, b) => {
      if (a.status === 'DONE' && b.status !== 'DONE') return 1;
      if (a.status !== 'DONE' && b.status === 'DONE') return -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(b.deadline || 0).getTime() - new Date(a.deadline || 0).getTime();
    });
  }, [tasks, selectedFilterTags]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
  if (!project) return <div className="text-center py-20 text-gray-500">Project not found</div>;

  const columns: { id: 'TODO' | 'IN_PROGRESS' | 'DONE', title: string }[] = [
    { id: 'TODO', title: 'To Do' },
    { id: 'IN_PROGRESS', title: 'In Progress' },
    { id: 'DONE', title: 'Done' }
  ];

  return (
    <>
      <div className="space-y-6 animate-fadeIn pb-10">
        <header className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors mb-4">
                  <ChevronLeft size={16} />
                  Back to Projects
                </Link>
                
                <div className="flex items-center gap-4">
                  <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{project.name}</h1>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setShowTagModal(true)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Manage Project Tags"
                    >
                      <TagIcon size={20} />
                    </button>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm border ${
                      project.status === 'Completed' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                    }`}>
                      {project.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="bg-gray-100 p-1 rounded-xl flex items-center shadow-inner border border-gray-200">
                  <button 
                    onClick={() => setViewMode('KANBAN')}
                    className={`p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold ${viewMode === 'KANBAN' ? 'bg-white shadow-md text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <KanbanIcon size={16} />
                    <span className="hidden lg:inline">Kanban</span>
                  </button>
                  <button 
                    onClick={() => setViewMode('LIST')}
                    className={`p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold ${viewMode === 'LIST' ? 'bg-white shadow-md text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <List size={16} />
                    <span className="hidden lg:inline">List</span>
                  </button>
                  <button 
                    onClick={() => setViewMode('WORKLOG')}
                    className={`p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold ${viewMode === 'WORKLOG' ? 'bg-white shadow-md text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <FileText size={16} />
                    <span className="hidden lg:inline">Worklog</span>
                  </button>
                </div>

                <button 
                  onClick={handleFinishProject}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-sm border ${
                    project.status === 'Completed' ? 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50' : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                  }`}
                >
                  <CheckCircle size={18} />
                  <span>{project.status === 'Completed' ? 'Re-activate' : 'Finish Project'}</span>
                </button>
                
                <button 
                  onClick={handleDeleteProject}
                  className="p-2 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 transition-all shadow-sm"
                  title="Delete Project"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 font-bold text-sm">
                <Filter size={16} />
                <span>Filter tasks:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => (
                  <button 
                    key={tag.id} 
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${selectedFilterTags.includes(tag.id) ? 'shadow-inner scale-95' : 'bg-white hover:bg-gray-50 text-gray-600 border-gray-200 shadow-sm'}`}
                    style={selectedFilterTags.includes(tag.id) ? { backgroundColor: tag.color, color: 'white', borderColor: tag.color } : {}}
                    onClick={() => setSelectedFilterTags(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                  >
                    {tag.name}
                  </button>
                ))}
                {selectedFilterTags.length > 0 && (
                  <button className="text-xs font-bold text-blue-600 hover:underline px-2" onClick={() => setSelectedFilterTags([])}>Clear all</button>
                )}
              </div>
            </div>
          </div>
        </header>

        {viewMode === 'KANBAN' && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex flex-col lg:flex-row gap-6 items-start overflow-x-auto pb-4 custom-scrollbar">
              {columns.map(col => (
                <KanbanColumn 
                  key={col.id} 
                  id={col.id} 
                  title={col.title} 
                  tasks={filteredTasks.filter(t => t.status === col.id)}
                  onAddTask={() => handleOpenCreateModal(col.id)}
                  onEditTask={handleOpenEditModal}
                />
              ))}
            </div>

            {createPortal(
              <DragOverlay zIndex={1000}>
                {activeTask ? (
                  <div className="w-[320px]">
                    <TaskCard task={activeTask} isDragging isOverlay />
                  </div>
                ) : null}
              </DragOverlay>,
              document.body
            )}
          </DndContext>
        )}

        {viewMode === 'LIST' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400">Priority</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400">Task Name</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400">Deadline</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400">Tags</th>
                  <th className="px-6 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTasks.map(task => {
                  const p = PRIORITY_MAP[task.priority] || PRIORITY_MAP[3];
                  return (
                    <tr key={task.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${p.color} ${p.bg}`}>
                          <AlertCircle size={12} />
                          {p.label}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{task.name}</div>
                        <div className="text-xs text-gray-500 truncate max-w-xs">{task.description}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${
                          task.status === 'DONE' ? 'bg-green-50 text-green-600 border-green-100' : 
                          task.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-gray-50 text-gray-600 border-gray-100'
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-600">
                        {task.deadline ? format(new Date(task.deadline), 'MMM d, yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {task.tags.map(t => (
                            <span key={t.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase" style={{ backgroundColor: t.color + '10', color: t.color, borderColor: t.color + '30' }}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleOpenEditModal(task)} className="p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                          <Edit2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-gray-400 font-bold">No tasks found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'WORKLOG' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <BookOpen className="text-blue-600" /> Project Worklog
              </h2>
              <div className="flex gap-3">
                <button 
                  onClick={downloadWorklog}
                  disabled={worklogs.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={18} />
                  Download Markdown
                </button>
                <button 
                  onClick={() => handleOpenWorklogModal()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg"
                >
                  <Plus size={18} />
                  Add Log Entry
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              {worklogs.map(log => (
                <div key={log.id} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm group hover:border-blue-200 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-3 text-sm font-bold text-blue-600 mb-1">
                        <CalendarIcon size={16} />
                        {format(new Date(log.date), 'MMMM d, yyyy HH:mm')}
                      </div>
                      <h3 className="text-lg font-black text-gray-900">{log.title}</h3>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleOpenWorklogModal(log)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => handleDeleteWorklog(log.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{log.description}</p>
                </div>
              ))}
              {worklogs.length === 0 && (
                <div className="py-20 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-bold">
                  No worklog entries yet.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Task Modal - Unchanged */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
             <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">{isEditing ? 'Edit Task' : 'Create New Task'}</h2>
                <div className="flex items-center gap-2">
                  {isEditing && <button type="button" onClick={handleDeleteTask} className="text-red-400 hover:text-red-600 p-1 mr-2"><Trash2 size={20} /></button>}
                  <button onClick={() => setShowTaskModal(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={24} /></button>
                </div>
              </div>
              <form onSubmit={handleSaveTask} className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Task Name</label>
                  <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={taskForm.name} onChange={e => setTaskForm({...taskForm, name: e.target.value})} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Priority</label>
                    <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={taskForm.priority} onChange={e => setTaskForm({...taskForm, priority: parseInt(e.target.value)})}>
                      <option value={1}>Urgent</option>
                      <option value={2}>High</option>
                      <option value={3}>Medium</option>
                      <option value={4}>Low</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Deadline</label>
                    <input type="date" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={taskForm.deadline} onChange={e => setTaskForm({...taskForm, deadline: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Status</label>
                    <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={taskForm.status} onChange={e => setTaskForm({...taskForm, status: e.target.value as any})}>
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="DONE">Done</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Description</label>
                  <textarea className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]" value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Assign Tags</label>
                  <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 max-h-40 overflow-y-auto">
                    {availableTags.map(tag => (
                      <label key={tag.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${taskForm.tagIds.includes(tag.id) ? 'bg-white shadow-sm' : 'opacity-60 grayscale-[0.5]'}`} style={taskForm.tagIds.includes(tag.id) ? { borderColor: tag.color, color: tag.color } : {}}>
                        <input type="checkbox" className="hidden" checked={taskForm.tagIds.includes(tag.id)} onChange={e => e.target.checked ? setTaskForm({...taskForm, tagIds: [...taskForm.tagIds, tag.id]}) : setTaskForm({...taskForm, tagIds: taskForm.tagIds.filter(id => id !== tag.id)})} />
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }}></div>
                        <span className="text-sm font-bold">{tag.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowTaskModal(false)} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-colors">{isEditing ? 'Save Changes' : 'Create Task'}</button>
                </div>
              </form>
          </div>
        </div>
      )}

      {/* Worklog Modal with Custom DateTimePicker */}
      {showWorklogModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
             <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">{isEditing ? 'Edit Log Entry' : 'New Log Entry'}</h2>
                <button onClick={() => setShowWorklogModal(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={24} /></button>
              </div>
              <form onSubmit={handleSaveWorklog} className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Date & Time</label>
                  <DateTimePicker 
                    value={worklogForm.date} 
                    onChange={date => setWorklogForm({...worklogForm, date})} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Title</label>
                  <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="What did you do?" value={worklogForm.title} onChange={e => setWorklogForm({...worklogForm, title: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Details</label>
                  <textarea className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[150px]" placeholder="Add technical details, obstacles, or notes..." value={worklogForm.description} onChange={e => setWorklogForm({...worklogForm, description: e.target.value})} />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowWorklogModal(false)} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all">{isEditing ? 'Update Entry' : 'Save Entry'}</button>
                </div>
              </form>
          </div>
        </div>
      )}

      {showTagModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
             <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Project Tags</h2>
                <button onClick={() => setShowTagModal(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
              </div>
              <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                {availableTags.map(tag => {
                  const isAssigned = project.tags.some(t => t.id === tag.id);
                  return (
                    <div key={tag.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: tag.color }}></div>
                        <span className="font-bold text-gray-700">{tag.name}</span>
                      </div>
                      <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isAssigned ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`} onClick={() => toggleTagOnProject(tag.id)}>{isAssigned ? 'Remove' : 'Add'}</button>
                    </div>
                  );
                })}
              </div>
          </div>
        </div>
      )}
    </>
  );
}

function KanbanColumn({ id, title, tasks, onAddTask, onEditTask }: { 
  id: string, 
  title: string, 
  tasks: Task[], 
  onAddTask: () => void,
  onEditTask: (task: Task) => void
}) {
  const { setNodeRef } = useSortable({ id });

  return (
    <div className="flex flex-col w-full min-w-[320px] max-w-[400px] bg-gray-100/80 rounded-2xl border border-gray-200 h-full max-h-[calc(100vh-350px)]">
      <div className="p-4 flex items-center justify-between text-gray-600 uppercase tracking-widest text-[10px] font-black">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${id === 'TODO' ? 'bg-gray-400' : id === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
          {title} <span className="ml-1 opacity-50">{tasks.length}</span>
        </div>
        <button onClick={onAddTask} className="p-1 hover:text-blue-600"><Plus size={16} /></button>
      </div>
      <div ref={setNodeRef} className="flex-1 overflow-y-auto p-3 space-y-1 min-h-[150px] custom-scrollbar">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => <SortableTaskCard key={task.id} task={task} onEdit={onEditTask} />)}
        </SortableContext>
      </div>
      <div className="p-3">
        <button onClick={onAddTask} className="w-full py-2 flex items-center justify-center gap-2 text-[10px] font-black text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all uppercase tracking-widest">
          <Plus size={14} /> Add task
        </button>
      </div>
    </div>
  );
}
