import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScanLine, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

const PARCEIRAS = ["Engelmig", "PSE", "3C", "ELCA", "Ceneged"] as const;
const PARCEIRA_KEY = "pontoscan.parceira_session";

function slug(p: string) {
  return p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s/g, "");
}

function LoginPage() {
  const [modo, setModo] = useState<"insourcing" | "parceira">("insourcing");
  const [identificador, setIdent] = useState("");
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [parcPrefixo, setParcPrefixo] = useState("");
  const [parcNome, setParcNome] = useState("");
  const [parcEmpresa, setParcEmpresa] = useState<string>("");
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let email = identificador.trim();

    // Se for prefixo (eletricista) busca email pelo prefixo
    if (!email.includes("@")) {
      const up = email.toUpperCase();
      const nomeSlug = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const prefixoSlug = up.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (nomeSlug) {
        // eletricista: prefixo + nome
        email = `${prefixoSlug}.${nomeSlug}@pontoscan.app`;
      } else {
        // admin shortcut "polo" → admin.<polo>@pontoscan.app
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
            <Label htmlFor="nome">Nome (eletricistas)</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" />
            <p className="mt-1 text-xs text-muted-foreground">Obrigatório quando logar com prefixo. Deixe em branco se usar e-mail.</p>
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