import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Film, Users, Sparkles } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, user, navigate]);

  return (
    <main className="min-h-screen relative overflow-hidden bg-background text-foreground">
      <div
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at top, color-mix(in oklab, var(--primary) 30%, transparent), transparent 60%), radial-gradient(ellipse at bottom right, color-mix(in oklab, var(--primary-glow) 25%, transparent), transparent 60%)",
        }}
      />
      <header className="px-6 py-5 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Film className="size-6 text-primary" />
          <span className="font-bold text-lg tracking-tight">Birga Tomosha</span>
        </div>
        <Link to="/auth">
          <Button variant="outline">Kirish</Button>
        </Link>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
          <Sparkles className="size-3.5" />
          Sinxron tomosha + ovozli chat
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
          Do'stlaringiz bilan
          <br />
          birga kino ko'ring
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Bitta xona, bitta video, bitta vaqt. Kamera, mikrofon va jonli reaktsiyalar bilan
          masofadan turib birga tomosha qiling.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
          <Link to="/auth">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Boshlash
            </Button>
          </Link>
          <a href="#features">
            <Button size="lg" variant="outline">Batafsil</Button>
          </a>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-4">
        {[
          { icon: Film, title: "Mukammal sinxronlash", body: "Hamma bir xil daqiqada ko'radi. Kimdir buferlanayotganda hamma uchun avtomatik pauza." },
          { icon: Users, title: "Kamera va ovoz", body: "P2P video aloqasi orqali do'stlaringizning yuzini ko'ring va ovozini eshiting." },
          { icon: Sparkles, title: "Jonli reaktsiyalar", body: "Emoji bilan his-tuyg'ularingizni darhol ulashing. Chat ham mavjud." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border bg-surface p-6">
            <f.icon className="size-6 text-primary mb-3" />
            <h3 className="font-semibold mb-1">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
