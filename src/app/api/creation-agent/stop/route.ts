import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { creationApiError } from '@/lib/creation/validation';
import { stopCreationRun } from '@/lib/creation/runs';
export async function POST(request:NextRequest) {
  try {
    const user=await getSession();if(!user) return NextResponse.json({error:'未登录'},{status:401});
    const input=z.object({sessionId:z.string().min(1).max(160)}).parse(await request.json());
    return NextResponse.json(stopCreationRun(user.sub,input.sessionId));
  }catch(e){return creationApiError(e);}
}
