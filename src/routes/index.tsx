import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Loader2, ScanLine } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "PontoScan · Controle de ponto" }, { name: "description", content: "Controle de ponto e acompanhamento de equipes de campo no PontoScan." }, { property: "og:title", content: "PontoScan · Controle de ponto" }, { property: "og:description", content: "Controle de ponto e acompanhamento de equipes de campo no PontoScan." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Index,
});

function Index() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (role === "ELETRICISTA") navigate({ to: "/eletricista" });
    else navigate({ to: "/admin" });
  }, [user, role, loading, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex items-center gap-2 text-primary">
        <ScanLine className="h-8 w-8" />
        <span className="text-2xl font-bold">PontoScan</span>
      </div>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
