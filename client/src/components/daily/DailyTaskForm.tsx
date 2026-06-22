import { useState, useEffect } from 'react';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Props {
  onSubmit: (data: {
    name: string;
    description?: string;
    priority: number;
    due_date?: string;
    tags?: string[];
  }) => void;
  initial?: { name: string; description?: string; priority: number; due_date?: string };
  tags?: Tag[];
  buttonLabel?: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DailyTaskForm({ onSubmit, initial, tags, buttonLabel = 'Add Task' }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [priority, setPriority] = useState(initial?.priority || 3);
  const [dueDate, setDueDate] = useState(initial?.due_date || todayStr());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setDescription(initial.description || '');
      setPriority(initial.priority);
      setDueDate(initial.due_date || todayStr());
    }
  }, [initial]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      priority,
      due_date: dueDate || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
    });
    if (!initial) {
      setName('');
      setDescription('');
      setPriority(3);
      setDueDate(todayStr());
      setSelectedTags([]);
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        placeholder="What needs to be done?"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        autoFocus
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value={1}>🔥 Urgent</option>
          <option value={2}>⚡ High</option>
          <option value={3}>📋 Medium</option>
          <option value={4}>📎 Low</option>
        </select>
      </div>

      {/* Tag selector — uses project tags */}
      {tags && tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Tags:</span>
          {tags.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                selectedTags.includes(tag.id)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={!name.trim()}
        className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {initial ? 'Save Changes' : buttonLabel}
      </button>
    </form>
  );
}
