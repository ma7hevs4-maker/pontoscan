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
import { POLOS, type Polo } from "@/lib/auth-context";

export const Route = createFileRoute("/cadastro")({
  component: SignupPage,
  head: () => ({
    meta: [
      { title: "Criar conta · PontoScan" },
      { name: "description", content: "Cadastro de eletricistas no PontoScan: nome, polo, prefixo da equipe e senha." },
      { property: "og:title", content: "Criar conta · PontoScan" },
      { property: "og:description", content: "Cadastro de eletricistas no PontoScan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PREFIXO_RE = /^[A-Z]{2}[0-9]{3}[A-Z]{3}-[A-Z]$/;

function SignupPage() {
  const [nome, setNome] = useState("");
  const [polo, setPolo] = useState<Polo | "">("");
  const [prefixo, setPrefixo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onPrefixo = (v: string) => {
    let s = v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10);
    setPrefixo(s);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!PREFIXO_RE.test(prefixo)) { toast.error("Formato inválido. Ex: SG010SOE-A"); return; }
    if (!polo) { toast.error("Selecione um polo"); return; }
    if (password.length < 6) { toast.error("Senha mínima 6 caracteres"); return; }
    setLoading(true);
    const nomeSlug = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const prefixoSlug = prefixo.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!nomeSlug) { toast.error("Informe o nome completo"); setLoading(false); return; }
    const email = `${prefixoSlug}.${nomeSlug}@pontoscan.app`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { nome, prefixo, polo } },
    });
    setLoading(false);
    if (error) {
      if (error.message.includes("registered")) toast.error("Prefixo já cadastrado");
      else toast.error(error.message);
      return;
    }
    toast.success("Cadastro realizado!");
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-md p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
            <ScanLine className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Criar conta</h1>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Nome completo</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div>
            <Label>Polo</Label>
            <Select value={polo} onValueChange={(v) => setPolo(v as Polo)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {POLOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Prefixo (LLNNNLLL-L)</Label>
            <Input value={prefixo} onChange={(e) => onPrefixo(e.target.value)} placeholder="SG010SOE-A" required className="font-mono uppercase" />
            <p className="mt-1 text-xs text-muted-foreground">Ex: SG010SOE-A</p>
          </div>
          <div>
            <Label>Senha</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta? <Link to="/login" className="font-semibold text-primary">Entrar</Link>
        </p>
      </Card>
    </div>
  );
}