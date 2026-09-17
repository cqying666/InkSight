import { z } from 'zod';
import { NextResponse } from 'next/server';
import { CreationError } from './store';
export const CreationFilesSchema = z.array(z.object({name:z.string().trim().min(1).max(240),text:z.string().min(1).max(30000)})).max(5).default([]);
export function creationApiError(e:unknown) {
  if (e instanceof z.ZodError) return NextResponse.json({error:e.issues.map(i=>i.message).join('；')},{status:400});
  if (e instanceof SyntaxError) return NextResponse.json({error:'请求格式无效'},{status:400});
  if (e instanceof CreationError) return NextResponse.json({error:e.message},{status:e.status});
  console.error('[creation]', e instanceof Error ? e.name : 'unknown');
  return NextResponse.json({error:'创作服务暂时不可用，请重试。'},{status:500});
}
