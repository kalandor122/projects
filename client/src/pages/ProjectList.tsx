import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Calendar, ArrowRight, Folder, Filter, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string;
  status: string;
  tags: Tag[];
}

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    deadline: ''
  });

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => showCompleted || p.status !== 'Completed');
  }, [projects, showCompleted]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject)
      });
      if (res.ok) {
        setShowModal(false);
        setNewProject({ name: '', description: '', deadline: '' });
        fetchProjects();
      }
    } catch (err) {
      console.error('Failed to create project', err);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <>
      <div className="space-y-8 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-500 mt-1">Manage and track your active projects.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowCompleted(!showCompleted)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-medium transition-all ${
                showCompleted 
                  ? 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 shadow-sm'
              }`}
            >
              {showCompleted ? <CheckCircle size={18} /> : <Filter size={18} />}
              <span>{showCompleted ? 'Showing All' : 'Active Only'}</span>
            </button>
            <button 
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition-all font-medium"
              onClick={() => setShowModal(true)}
            >
              <Plus size={20} />
              <span>New Project</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Link to={`/project/${project.id}`} key={project.id} className="group">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-full flex flex-col hover:shadow-lg transition-all border-l-4 border-l-blue-500 transform">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <Folder size={20} />
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    project.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {project.status}
                  </span>
                </div>
                
                <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {project.name}
                </h3>
                
                <p className="text-gray-600 text-sm mb-6 line-clamp-3 flex-grow">
                  {project.description || 'No description provided.'}
                </p>
                
                <div className="flex flex-wrap gap-2 mb-6">
                  {project.tags.map(tag => (
                    <span 
                      key={tag.id} 
                      className="text-xs font-semibold px-2 py-1 rounded-md border"
                      style={{ backgroundColor: tag.color + '10', color: tag.color, borderColor: tag.color + '40' }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-gray-500 mt-auto">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Calendar size={16} className="text-gray-400" />
                    <span>{project.deadline ? format(new Date(project.deadline), 'MMM d, yyyy') : 'No deadline'}</span>
                  </div>
                  <ArrowRight size={18} className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </Link>
          ))}
          
          {projects.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-300 text-gray-500">
               <Folder size={48} className="mb-4 opacity-20" />
               <p className="text-lg font-medium">No projects yet</p>
               <button 
                 className="text-blue-600 hover:underline mt-2"
                 onClick={() => setShowModal(true)}
               >
                 Create your first project
               </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Create New Project</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                 <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Project Name</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="e.g., Website Redesign"
                  value={newProject.name} 
                  onChange={e => setNewProject({...newProject, name: e.target.value})}
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Description</label>
                <textarea 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all min-h-[100px]"
                  placeholder="What is this project about?"
                  value={newProject.description} 
                  onChange={e => setNewProject({...newProject, description: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Deadline</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  <input 
                    type="date" 
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    value={newProject.deadline} 
                    onChange={e => setNewProject({...newProject, deadline: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
