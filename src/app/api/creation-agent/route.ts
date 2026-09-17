import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { creationApiError, CreationFilesSchema } from '@/lib/creation/validation';
import { beginCreationRun } from '@/lib/creation/runs';
import { runCreationTurn } from '@/lib/creation/agent';
export const runtime='nodejs';
export const maxDuration=200;
const Input=z.object({sessionId:z.string().min(1).max(160),message:z.string().max(12000).optional(),files:CreationFilesSchema,modelId:z.string().max(160).optional(),retry:z.boolean().optional()});
export async function POST(request:NextRequest) {
  try {
    const user=await getSession();if(!user) return NextResponse.json({error:'未登录'},{status:401});
    const input=Input.parse(await request.json());
    const run=beginCreationRun(user.sub,input.sessionId,input);
    const encoder=new TextEncoder();
    const stream=new ReadableStream<Uint8Array>({
      start(controller) {
        const send=(event:string,data:Record<string,unknown>)=>{
          try{controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));}catch{/* disconnected clients recover persisted state */}
        };
        send('session',{session:run.session});
        void runCreationTurn(user.sub,input.sessionId,run.session.run!.id,run.controller.signal,send)
          .finally(()=>{run.release();try{controller.close();}catch{/* disconnected */}});
      },
      // A reload does not abandon work. Explicit stop endpoint aborts it.
      cancel() {},
    });
    return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
  }catch(e){return creationApiError(e);}
}
