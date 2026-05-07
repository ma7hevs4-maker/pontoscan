import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ScanLine, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function slug(p: string) {
  return p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s/g, "");
}

function LoginPage() {
  const [identificador, setIdent] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let email = identificador.trim();

    // Se for prefixo (eletricista) busca email pelo prefixo
    if (!email.includes("@")) {
      const up = email.toUpperCase();
      // tenta como prefixo
      const { data } = await supabase.from("profiles").select("id").eq("prefixo", up).maybeSingle();
      if (data) {
        // We can't fetch email from auth — use prefixo as deterministic email
        email = `${up.toLowerCase().replace(/[^a-z0-9]/g, "")}@pontoscan.app`;
      } else {
        // Tentativa: admin shortcut "polo" → admin.<polo>@pontoscan.app
        const s = slug(email);
        email = `admin.${s}@pontoscan.app`;
      }
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error("Credenciais inválidas"); return; }
    toast.success("Bem-vindo!");
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-md p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
            <ScanLine className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">PontoScan</h1>
          <p className="text-sm text-muted-foreground">Controle de ponto operacional</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="ident">Prefixo ou e-mail</Label>
            <Input id="ident" value={identificador} onChange={(e) => setIdent(e.target.value)} placeholder="SG010SOE-A" required autoCapitalize="characters" />
          </div>
          <div>
            <Label htmlFor="pw">Senha</Label>
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Novo eletricista? <Link to="/cadastro" className="font-semibold text-primary">Cadastrar</Link>
        </p>
      </Card>
    </div>
  );
}