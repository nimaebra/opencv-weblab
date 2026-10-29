import { memo, useState } from 'react';
import { Search, Plus, ChevronDown, ImagePlus, ArrowUpRight, X } from 'lucide-react';
import { Button } from '@opencv-weblab/ui';
import { operations, categories } from '@opencv-weblab/pipeline';
import { useLab } from './store';
import { addColorChart } from './samples';
export const Library = memo(function Library({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const matches = operations.filter(
    (o) =>
      o.id !== 'source' &&
      `${o.label} ${o.fn} ${o.category} ${o.description}`.toLowerCase().includes(query),
  );
  const add = useLab((s) => s.add);
  return (
    <aside id="tools-panel" className="library panel" aria-label="Operation library">
      <div className="panel-heading">
        <h2>Tools</h2>
        <div className="row">
          <span className="count" aria-label={`${matches.length} tools`}>
            {matches.length}
          </span>
          <Button
            className="panel-close"
            aria-label="Close tools panel"
            icon={<X size={16} />}
            onClick={onClose}
          />
        </div>
      </div>
      <div className="search">
        <Search size={15} aria-hidden="true" />
        <input
          placeholder="Find an operation…"
          aria-label="Find an operation"
          type="search"
          aria-controls="tool-results"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search ? (
          <Button
            className="search-clear"
            aria-label="Clear tool search"
            icon={<X size={14} />}
            onClick={() => {
              setSearch('');
              document.querySelector<HTMLInputElement>('[aria-label="Find an operation"]')?.focus();
            }}
          />
        ) : (
          <kbd aria-hidden="true">/</kbd>
        )}
      </div>
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
      <p className="sr-only" role="status">
        {query ? `${matches.length} matching tools` : ''}
      </p>
      <div id="tool-results" className="tool-scroll">
        {categories.map((category) => {
          const items = matches.filter((o) => o.category === category);
          if (!items.length) return null;
          return (
            <details open key={`${category}:${query}`} className="tool-group">
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
                    e.dataTransfer.setData('application/opencv-weblab-operation', op.id);
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
        {!matches.length && (
          <p className="empty-small">
            No matching tools. Try “blur” or “threshold”, or clear your search.
          </p>
        )}
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
