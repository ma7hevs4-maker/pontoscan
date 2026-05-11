import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, KeyRound, Mail, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/contas")({ component: ContasPage });

interface AdminRow { user_id: string; email: string | null; nome: string; role: string; polo: string | null; }
interface UserRow { id: string; nome: string; prefixo: string; polo: string; email: string | null; }

async function callAdmin(body: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sessão expirada");
  const r = await fetch("/api/admin-users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function ContasPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!loading && role !== "ADMIN_DISPATCH") navigate({ to: "/admin" });
  }, [role, loading, navigate]);

  const refresh = async () => {
    setLoadingList(true);
    try {
      const r = await callAdmin({ action: "list" });
      setAdmins(r.admins ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar");
    } finally { setLoadingList(false); }
  };

  useEffect(() => { if (role === "ADMIN_DISPATCH") refresh(); /* eslint-disable-next-line */ }, [role]);

  const runSearch = async () => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await callAdmin({ action: "search-eletricistas", q });
      setResults(r.users ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally { setSearching(false); }
  };

  if (role !== "ADMIN_DISPATCH") return null;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <h3 className="font-semibold">Administradores</h3>
            <p className="text-xs text-muted-foreground">Contas com papel ADMIN_POLO ou ADMIN_DISPATCH</p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loadingList}>
            {loadingList ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail (login)</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Polo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingList && <TableRow><TableCell colSpan={5} className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>}
              {!loadingList && admins.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum admin encontrado</TableCell></TableRow>}
              {admins.map(a => (
                <TableRow key={`${a.user_id}-${a.role}`}>
                  <TableCell>{a.nome}</TableCell>
                  <TableCell className="font-mono text-xs">{a.email ?? "—"}</TableCell>
                  <TableCell><span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold">{a.role}</span></TableCell>
                  <TableCell>{a.polo ?? "—"}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <EditEmailDialog userId={a.user_id} currentEmail={a.email ?? ""} onDone={refresh} />
                    <ResetPasswordDialog userId={a.user_id} label={a.nome} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-3">
          <h3 className="font-semibold">Resetar senha de eletricista</h3>
          <p className="text-xs text-muted-foreground">Busque por nome ou prefixo</p>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="sr-only">Buscar</Label>
              <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder="Nome ou prefixo…" />
            </div>
            <Button onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {results.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead><TableHead>Prefixo</TableHead><TableHead>Polo</TableHead><TableHead>E-mail</TableHead><TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>{u.nome}</TableCell>
                    <TableCell className="font-mono">{u.prefixo}</TableCell>
                    <TableCell>{u.polo}</TableCell>
                    <TableCell className="font-mono text-xs">{u.email ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <ResetPasswordDialog userId={u.id} label={u.nome} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

function ResetPasswordDialog({ userId, label }: { userId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await callAdmin({ action: "update-password", userId, password: pw });
      toast.success("Senha atualizada");
      setOpen(false); setPw("");
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><KeyRound className="mr-1 h-3.5 w-3.5" />Senha</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Redefinir senha · {label}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Nova senha (mín. 6 caracteres)</Label>
          <Input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="Nova senha" autoComplete="off" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || pw.length < 6}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEmailDialog({ userId, currentEmail, onDone }: { userId: string; currentEmail: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setEmail(currentEmail); }, [open, currentEmail]);

  const submit = async () => {
    setBusy(true);
    try {
      await callAdmin({ action: "update-email", userId, email });
      toast.success("E-mail atualizado");
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Mail className="mr-1 h-3.5 w-3.5" />E-mail</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Alterar e-mail (login)</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Novo e-mail</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !email.includes("@")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}