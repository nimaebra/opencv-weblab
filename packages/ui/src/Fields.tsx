import type { ComponentPropsWithRef } from 'react';
import { Check } from 'lucide-react';

type InputProps = ComponentPropsWithRef<'input'> & { unstyled?: boolean };

export function TextInput({ className = '', unstyled, ...props }: InputProps) {
  return <input {...props} className={`${unstyled ? '' : 'ui-field'} ${className}`} />;
}

export function TextArea({ className = '', ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea {...props} className={`ui-field ${className}`} />;
}

type ToggleProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'role'>;

export function Checkbox({ className = '', ...props }: ToggleProps) {
  return (
    <span className={`ui-toggle ui-checkbox ${className}`}>
      <input {...props} type="checkbox" />
      <span className="ui-toggle-indicator" aria-hidden="true">
        <Check size={12} strokeWidth={2.5} />
      </span>
    </span>
  );
}

export function Switch({ className = '', ...props }: ToggleProps) {
  return (
    <span className={`ui-toggle ui-switch ${className}`}>
      <input {...props} type="checkbox" role="switch" />
      <span className="ui-toggle-indicator" aria-hidden="true" />
    </span>
  );
}
