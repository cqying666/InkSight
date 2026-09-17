import type { CreationStep } from '@/lib/creation/types';

// These actions produce candidates for the one bound material task in a run.
// Generic labels (read/search/analyze) can refer to different targets: never infer their recovery.
const materialActions = new Set(['提炼核心梗与匹配框架', '调整故事核并重新匹配框架']);
export function creationStepPresentation(steps: CreationStep[], index: number) {
  const step = steps[index];
  const recovered = step.status === 'failed' && materialActions.has(step.label)
    && steps.slice(index + 1).some(later => later.label === step.label && later.status === 'complete');
  const firstFailure = !steps.slice(0, index).some(earlier => earlier.label === step.label && earlier.status === 'failed');
  return {
    recovered,
    marker: recovered ? '↻' : step.status === 'complete' ? '✓' : step.status === 'failed' ? '!' : '·',
    outcome: recovered ? `${firstFailure ? '首次' : '此次'}失败，后续重试成功` : undefined,
  };
}
