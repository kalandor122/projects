import { useState, useEffect } from 'react';
import { Plus, Trash2, Tag as TagIcon, Palette } from 'lucide-react';

interface Tag {
  id: string;
  name: string;
  color: string;
}

export default function TagManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState({ name: '', color: '#0052cc' });
  const [loading, setLoading] = useState(true);

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      setTags(await res.json());
    } catch (err) {
      console.error('Failed to fetch tags', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTag)
      });
      if (res.ok) {
        setNewTag({ name: '', color: '#0052cc' });
        fetchTags();
      }
    } catch (err) {
      console.error('Failed to create tag', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tag? This will remove it from all projects and tasks.')) return;
    try {
      await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      fetchTags();
    } catch (err) {
      console.error('Failed to delete tag', err);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fadeIn">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tag Management</h1>
        <p className="text-gray-500 mt-1">Create and manage global tags for your projects and tasks.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Tag Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sticky top-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Plus className="text-blue-600" size={24} />
              Create New Tag
            </h3>
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Tag Name</label>
                <div className="relative">
                   <TagIcon className="absolute left-3 top-2.5 text-gray-400" size={18} />
                   <input 
                    type="text" 
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="e.g., Bug, Urgent, Frontend"
                    value={newTag.name} 
                    onChange={e => setNewTag({...newTag, name: e.target.value})}
                    required 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Tag Color</label>
                <div className="flex items-center gap-3 p-1 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                  <input 
                    type="color" 
                    className="w-12 h-10 bg-transparent border-none cursor-pointer"
                    value={newTag.color} 
                    onChange={e => setNewTag({...newTag, color: e.target.value})}
                  />
                  <div className="flex-1 px-2 font-mono text-sm text-gray-600 uppercase">
                    {newTag.color}
                  </div>
                  <Palette size={18} className="mr-3 text-gray-400" />
                </div>
              </div>
              
              <div className="pt-2">
                <div 
                  className="w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-all"
                  style={{ backgroundColor: newTag.color + '20', color: newTag.color, border: `1px solid ${newTag.color}40` }}
                >
                   <span className="px-3 py-1 bg-white rounded-md shadow-sm border border-gray-100">
                     Preview: {newTag.name || 'Tag Name'}
                   </span>
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                Create Tag
              </button>
            </form>
          </div>
        </div>

        {/* Tags List */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tags.map(tag => (
              <div key={tag.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between group hover:border-blue-200 hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-inner"
                    style={{ backgroundColor: tag.color + '20' }}
                  >
                    <TagIcon style={{ color: tag.color }} size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{tag.name}</h4>
                    <p className="text-xs font-mono text-gray-400 uppercase tracking-wider">{tag.color}</p>
                  </div>
                </div>
                
                <button 
                  className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  onClick={() => handleDelete(tag.id)}
                  title="Delete Tag"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}

            {tags.length === 0 && (
              <div className="col-span-full py-20 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400">
                <TagIcon size={48} className="mx-auto mb-4 opacity-10" />
                <p className="font-bold">No tags created yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
