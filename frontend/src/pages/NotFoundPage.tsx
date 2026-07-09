import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
      <span className="text-sm uppercase tracking-widest text-accent">404</span>
      <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-text-dim">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  );
}
