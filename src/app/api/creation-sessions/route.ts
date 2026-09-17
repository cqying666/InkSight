import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { createCreationSession, readCreationSession, listCreationSessions, mutateCreationSession, directionAction, handoffCreationDirection, idleOnly } from '@/lib/creation/store';
import { creationApiError, CreationFilesSchema } from '@/lib/creation/validation';
export const runtime = 'nodejs';
const Input = z.object({message:z.string().max(12000).default(''),files:CreationFilesSchema,modelId:z.string().max(160).optional(),task:z.string().max(100).optional()}).refine(v => v.message.trim() || v.files.length || v.task,'请输入需求或添加资料');
const Patch = z.discriminatedUnion('action',[
  z.object({id:z.string().max(160),action:z.enum(['focus','select','save','handoff']),directionId:z.string().max(160)}),
  z.object({id:z.string().max(160),action:z.literal('constraints'),constraints:z.array(z.string().trim().min(1).max(500)).max(20)}),
]);
export async function GET(request:NextRequest) {
  try {
    const user = await getSession(); if (!user) return NextResponse.json({error:'未登录'},{status:401});
    const id = request.nextUrl.searchParams.get('id');
    const result = id ? readCreationSession(user.sub,id) : listCreationSessions(user.sub);
    return result ? NextResponse.json(result) : NextResponse.json({error:'会话不存在'},{status:404});
  } catch (e) { return creationApiError(e); }
}
export async function POST(request:NextRequest) {
  try {
    const user = await getSession(); if (!user) return NextResponse.json({error:'未登录'},{status:401});
    return NextResponse.json(createCreationSession(user.sub,Input.parse(await request.json())),{status:201});
  } catch(e) { return creationApiError(e); }
}
export async function PATCH(request:NextRequest) {
  try {
    const user = await getSession(); if (!user) return NextResponse.json({error:'未登录'},{status:401});
    const input = Patch.parse(await request.json());
    if (input.action === 'constraints') return NextResponse.json(mutateCreationSession(user.sub,input.id,s => {idleOnly(s); s.constraints=input.constraints;}));
    if (input.action === 'handoff') return NextResponse.json(handoffCreationDirection(user.sub,input.id,input.directionId));
    return NextResponse.json(directionAction(user.sub,input.id,input.action,input.directionId));
  } catch(e) { return creationApiError(e); }
}
