"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getExample, type ExampleWork } from "@/lib/example";

type PageState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; example: ExampleWork };

export default function ExampleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getExample(params.id).then((example) => {
      if (cancelled) return;
      setState(example ? { status: "ready", example } : { status: "missing" });
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (state.status === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-bg text-sm text-text-muted">加载例文…</main>;
  }

  if (state.status === "missing") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-5 text-center">
        <h1 className="font-serif text-2xl font-semibold text-text">没有找到这篇例文</h1>
        <Link href="/material" className="text-sm text-accent underline underline-offset-2">返回例文库</Link>
      </main>
    );
  }

  const { example } = state;
  const startTeardown = () => {
    sessionStorage.setItem(
      "inksight:pending",
      JSON.stringify({
        text: example.text,
        paragraphs: example.paragraphs,
        fileName: example.title,
        exampleId: example.id,
      })
    );
    router.push("/analyzing");
  };

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-14">
        <header className="border-b border-border pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/material" className="text-xs text-accent underline underline-offset-2">← 返回例文库</Link>
            <button
              type="button"
              onClick={startTeardown}
              className="rounded-full bg-primary px-5 py-2 text-xs text-text-inverse"
            >
              拆解这篇例文
            </button>
          </div>
          <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">仅原文</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-text">《{example.title}》</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="rounded-full bg-accent/[0.07] px-2.5 py-1 text-accent">{example.genre || "待分类"}</span>
            {example.tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        </header>

        <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <div className="mb-5 text-xs uppercase tracking-[0.15em] text-text-muted">原文（{example.paragraphs.length} 段）</div>
          <div className="space-y-4">
            {example.paragraphs.map((paragraph, index) => (
              <p key={index} className="whitespace-pre-wrap font-serif text-[15px] leading-[1.85] text-text">
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
