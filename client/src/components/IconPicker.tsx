import { useState, useRef, useEffect, useMemo } from 'react';
import { MATERIAL_ICON_NAMES } from './material-icons';

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  size?: number;
  className?: string;
  triggerClassName?: string;
}

export default function IconPicker({ value, onChange, size = 20, className = '', triggerClassName = '' }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return MATERIAL_ICON_NAMES;
    const q = search.toLowerCase();
    return MATERIAL_ICON_NAMES.filter(n => n.includes(q));
  }, [search]);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className={`flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-blue-600 ${triggerClassName}`}
        title="Choose icon"
      >
        <span className="material-symbols-outlined" style={{ fontSize: size }}>{value || 'folder'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-[340px] bg-white rounded-xl shadow-2xl border border-gray-200 z-[200] animate-fadeIn overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search icons..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <div className="grid grid-cols-7 gap-0.5 p-2">
              {filtered.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all ${
                    value === name
                      ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                  title={name}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-7 py-8 text-center text-sm text-gray-400">No icons found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectIcon({ icon, size = 20, className = '' }: { icon?: string; size?: number; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
      {icon || 'folder'}
    </span>
  );
}
