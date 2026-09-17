import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { listModels } from '@/lib/ai/models';
/** Author-facing choices only; administrator configuration and endpoints remain private. */
export async function GET() {
  const user=await getSession();
  if(!user) return NextResponse.json({error:'未登录'},{status:401});
  return NextResponse.json(listModels().filter(m=>m.isActive).map(m=>({id:m.id,name:m.name,isActive:true})));
}
