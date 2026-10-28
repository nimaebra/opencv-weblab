import { memo, useState } from 'react';
import { Search, Plus, ChevronDown, ImagePlus, ArrowUpRight } from 'lucide-react';
import { operations, categories } from '@roveran/pipeline';
import { useLab } from './store';
import { addColorChart } from './samples';
export const Library = memo(function Library() {
  const [search, setSearch] = useState('');
  const add = useLab((s) => s.add);
  return (
    <aside className="library panel" aria-label="Operation library">
      <div className="panel-heading">
        <h2>Tools</h2>
        <span className="count">25</span>
      </div>
      <label className="search">
        <Search size={15} />
        <input
          placeholder="Find an operation…"
          aria-label="Find an operation"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>/</kbd>
      </label>
      <button
        className="source-tool"
        onClick={() => document.getElementById('image-input')?.click()}
      >
        <ImagePlus size={18} />
        <span>
          Add an image<small>PNG, JPG, or WebP</small>
        </span>
        <Plus size={15} />
      </button>
      <button className="sample-link" onClick={() => void addColorChart()}>
        Or try a color chart
        <ArrowUpRight size={12} />
      </button>
      <div className="tool-scroll">
        {categories.map((category) => {
          const items = operations.filter(
            (o) =>
              o.category === category &&
              `${o.label} ${o.description}`.toLowerCase().includes(search.toLowerCase()),
          );
          if (!items.length) return null;
          return (
            <details open key={category} className="tool-group">
              <summary>
                {category}
                <span>
                  {items.length}
                  <ChevronDown size={13} />
                </span>
              </summary>
              {items.map((op, index) => (
                <button
                  className="tool"
                  key={op.id}
                  onClick={() => add(op.id)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/roveran-operation', op.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title={op.description}
                >
                  <span className={`tool-symbol category-${category.toLowerCase()}`}>
                    {index + 1}
                  </span>
                  <span>{op.label}</span>
                  <Plus className="tool-add" size={14} />
                </button>
              ))}
            </details>
          );
        })}
        {!operations.some(
          (o) =>
            o.id !== 'source' &&
            `${o.label} ${o.description}`.toLowerCase().includes(search.toLowerCase()),
        ) && <p className="empty-small">No matching tools. Try “blur” or “threshold”.</p>}
      </div>
      <a
        className="library-footer"
        href="https://docs.opencv.org/4.13.0/d5/d10/tutorial_js_root.html"
        target="_blank"
        rel="noreferrer"
      >
        OpenCV documentation
        <ArrowUpRight size={14} />
      </a>
    </aside>
  );
});
