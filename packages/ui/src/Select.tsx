import { useId, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import * as Primitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = Omit<
  ComponentPropsWithoutRef<typeof Primitive.Trigger>,
  'asChild' | 'children' | 'value'
> & {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly Option[];
  placeholder?: string;
  menuClassName?: string;
};

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className = '',
  menuClassName = '',
  disabled,
  id,
  onClick,
  onPointerDown,
  onKeyDown,
  ...triggerProps
}: SelectProps) {
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;
  const trigger = useRef<HTMLButtonElement>(null);
  const openedByPointer = useRef(false);
  const [menu, setMenu] = useState<{ container: HTMLElement | null; animate: boolean }>();
  // Radix reserves the empty string for its placeholder. Prefix every option to allow a clear choice.
  const selected = options.some((option) => option.value === value) ? `:${value}` : '';
  return (
    <Primitive.Root
      value={selected}
      onValueChange={(next) => onValueChange(next.slice(1))}
      disabled={disabled || options.length === 0}
      onOpenChange={(open) => {
        if (open) {
          setMenu({
            container: trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
            animate: openedByPointer.current,
          });
        }
      }}
    >
      <Primitive.Trigger
        {...triggerProps}
        id={triggerId}
        ref={trigger}
        className={`ui-select ${className}`}
        onPointerDown={(event) => {
          openedByPointer.current = true;
          onPointerDown?.(event);
        }}
        onKeyDown={(event) => {
          openedByPointer.current = false;
          onKeyDown?.(event);
        }}
        onClick={(event) => {
          openedByPointer.current = event.detail > 0;
          onClick?.(event);
        }}
      >
        <span className="ui-select-value">
          <Primitive.Value placeholder={placeholder} />
        </span>
        <Primitive.Icon asChild>
          <ChevronDown className="ui-select-chevron" size={14} aria-hidden="true" />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal container={menu?.container}>
        <Primitive.Content
          className={`ui-select-menu ${menuClassName}`}
          data-animate={menu?.animate ? '' : undefined}
          aria-label={triggerProps['aria-label']}
          aria-labelledby={
            triggerProps['aria-labelledby'] ?? (triggerProps['aria-label'] ? undefined : triggerId)
          }
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={8}
        >
          <Primitive.Viewport className="ui-select-options">
            {options.map((option) => (
              <Primitive.Item
                key={option.value}
                value={`:${option.value}`}
                disabled={option.disabled}
                className="ui-select-option"
              >
                <Primitive.ItemText>{option.label}</Primitive.ItemText>
                <Primitive.ItemIndicator className="ui-select-check">
                  <Check size={14} aria-hidden="true" />
                </Primitive.ItemIndicator>
              </Primitive.Item>
            ))}
          </Primitive.Viewport>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
