import { useEffect, useState, type PointerEvent, type RefObject } from 'react';

type Side = 'left' | 'right' | 'vertical';
const panels = {
  left: {
    selector: '.library',
    property: '--library-width',
    label: 'Resize tools panel',
    id: 'tools-panel',
    min: 190,
    max: 340,
  },
  right: {
    selector: '.inspector',
    property: '--inspector-width',
    label: 'Resize inspector panel',
    id: 'inspector-panel',
    min: 250,
    max: 430,
  },
  vertical: {
    selector: '.preview-section',
    property: '--preview-height',
    label: 'Resize image preview',
    id: 'image-comparison',
    min: 280,
    max: 1000,
  },
};

export function PanelResizeHandle({
  side,
  workspace,
  onResize,
}: {
  side: Side;
  workspace: RefObject<HTMLDivElement | null>;
  onResize: (event: PointerEvent<HTMLDivElement>, side: Side) => void;
}) {
  const config = panels[side];
  const [size, setSize] = useState(config.min);
  const [minimum, setMinimum] = useState(config.min);
  const [maximum, setMaximum] = useState(config.max);
  useEffect(() => {
    const root = workspace.current;
    const panel = root?.querySelector<HTMLElement>(config.selector);
    if (!root || !panel) return;
    const observer = new ResizeObserver(() => {
      const bounds = panel.getBoundingClientRect();
      const min = Math.max(config.min, Number.parseFloat(getComputedStyle(panel).minHeight) || 0);
      setSize(Math.round(side === 'vertical' ? bounds.height : bounds.width));
      setMinimum(side === 'vertical' ? min : config.min);
      setMaximum(side === 'vertical' ? Math.max(min, root.clientHeight - 260) : config.max);
    });
    observer.observe(panel);
    observer.observe(root);
    return () => observer.disconnect();
  }, [config, side, workspace]);
  return (
    <div
      className={`resize-handle ${side === 'left' ? 'library' : side === 'right' ? 'inspector' : 'preview'}-resize`}
      role="separator"
      aria-label={config.label}
      aria-controls={config.id}
      aria-orientation={side === 'vertical' ? 'horizontal' : 'vertical'}
      aria-valuemin={Math.min(minimum, size)}
      aria-valuemax={Math.max(maximum, size)}
      aria-valuenow={size}
      aria-valuetext={`${size} pixels`}
      title={`${config.label} · Arrow keys to resize, Shift for larger steps, Home / End for limits`}
      tabIndex={0}
      onPointerDown={(event) => onResize(event, side)}
      onKeyDown={(event) => {
        const decrease =
          side === 'vertical' ? 'ArrowUp' : side === 'right' ? 'ArrowRight' : 'ArrowLeft';
        const increase =
          side === 'vertical' ? 'ArrowDown' : side === 'right' ? 'ArrowLeft' : 'ArrowRight';
        if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 10;
        const next =
          event.key === 'Home'
            ? minimum
            : event.key === 'End'
              ? maximum
              : size + (event.key === increase ? step : -step);
        workspace.current?.style.setProperty(
          config.property,
          `${Math.max(minimum, Math.min(maximum, next))}px`,
        );
      }}
    />
  );
}
