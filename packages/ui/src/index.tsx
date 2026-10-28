import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Slider from '@radix-ui/react-slider';
import { X } from 'lucide-react';
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'ghost' | 'danger';
    icon?: ReactNode;
  }
>(({ variant = 'ghost', icon, children, className = '', ...props }, ref) => (
  <button ref={ref} className={`button ${variant} ${className}`} {...props}>
    {icon}
    {children}
  </button>
));
Button.displayName = 'Button';
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button aria-label="Close dialog" icon={<X size={18} />} />
            </Dialog.Close>
          </div>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <Slider.Root
      aria-label={label}
      className="range"
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0]!)}
      disabled={disabled}
    >
      <Slider.Track className="range-track">
        <Slider.Range className="range-fill" />
      </Slider.Track>
      <Slider.Thumb aria-label={label} className="range-thumb" />
    </Slider.Root>
  );
}
