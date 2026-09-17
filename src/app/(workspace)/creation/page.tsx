import { Suspense } from 'react';
import { CreationWorkspace } from '@/components/creation/CreationWorkspace';

export default function CreationPage() {
  return <Suspense fallback={<p className="p-10 text-text-muted">正在打开创作会话…</p>}><CreationWorkspace /></Suspense>;
}
