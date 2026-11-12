import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Label } from './Label';

interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="text-accent3 ml-1">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-accent3" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-text-dim">{hint}</p>
      ) : null}
    </div>
  );
}
