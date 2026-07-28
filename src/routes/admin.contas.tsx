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
import { Loader2, KeyRound, Mail, Search, Tag, ArrowUp, ArrowDown, ArrowUpDown, User, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-PontoScan-Auth": token,
    },
    body: JSON.stringify({ ...body, _authToken: token }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function ContasPage() {
  const { role, loading, adminPolo } = useAuth();
  const navigate = useNavigate();
  const isDispatch = role === "ADMIN_DISPATCH";
  const isPolo = role === "ADMIN_POLO";

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [sortKey, setSortKey] = useState<string>("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const SortBtn = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:text-foreground">
      {children}
      {sortKey === k ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );

  const getAdminVal = (a: AdminRow, k: string): string | number => {
    switch (k) {
      case "nome": return a.nome.toLowerCase();
      case "email": return (a.email ?? "").toLowerCase();
      case "role": return a.role.toLowerCase();
      case "polo": return (a.polo ?? "").toLowerCase();
      default: return 0;
    }
  };

  const sortedAdmins = [...admins].sort((a, b) => {
    const va = getAdminVal(a, sortKey); const vb = getAdminVal(b, sortKey);
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const getUserVal = (u: UserRow, k: string): string | number => {
    switch (k) {
      case "nome": return u.nome.toLowerCase();
      case "prefixo": return u.prefixo.toLowerCase();
      case "polo": return u.polo.toLowerCase();
      case "email": return (u.email ?? "").toLowerCase();
      default: return 0;
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    const va = getUserVal(a, sortKey); const vb = getUserVal(b, sortKey);
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  useEffect(() => {
    if (!loading && !isDispatch && !isPolo) navigate({ to: "/admin" });
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

  useEffect(() => { if (isDispatch) refresh(); /* eslint-disable-next-line */ }, [role]);

  const runSearch = async () => {
    setSearching(true);
    try {
      const r = await callAdmin({ action: "search-eletricistas", q });
      setResults(r.users ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally { setSearching(false); }
  };

  // Auto-load list for ADMIN_POLO (already scoped server-side)
  useEffect(() => { if (isPolo) runSearch(); /* eslint-disable-next-line */ }, [isPolo]);

  if (!isDispatch && !isPolo) return null;

  return (
    <div className="space-y-6">
      {isDispatch && <Card className="overflow-hidden">
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
                <TableHead><SortBtn k="nome">Nome</SortBtn></TableHead>
                <TableHead><SortBtn k="email">E-mail (login)</SortBtn></TableHead>
                <TableHead><SortBtn k="role">Papel</SortBtn></TableHead>
                <TableHead><SortBtn k="polo">Polo</SortBtn></TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingList && <TableRow><TableCell colSpan={5} className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>}
              {!loadingList && sortedAdmins.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum admin encontrado</TableCell></TableRow>}
              {sortedAdmins.map(a => (
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
      </Card>}

      <Card className="overflow-hidden">
        <div className="border-b p-3">
          <h3 className="font-semibold">Eletricistas{isPolo ? ` · ${adminPolo}` : ""}</h3>
          <p className="text-xs text-muted-foreground">
            {isPolo ? "Visualize, altere prefixo ou redefina a senha dos eletricistas do seu polo." : "Busque por nome ou prefixo para redefinir a senha."}
          </p>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="sr-only">Buscar</Label>
              <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder={isPolo ? "Filtrar por nome ou prefixo…" : "Nome ou prefixo…"} />
            </div>
            <Button onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {results.length === 0 && !searching && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum eletricista encontrado</p>
          )}
          {results.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortBtn k="nome">Nome</SortBtn></TableHead>
                  <TableHead><SortBtn k="prefixo">Prefixo</SortBtn></TableHead>
                  <TableHead><SortBtn k="polo">Polo</SortBtn></TableHead>
                  <TableHead><SortBtn k="email">E-mail</SortBtn></TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedResults.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>{u.nome}</TableCell>
                    <TableCell className="font-mono">{u.prefixo}</TableCell>
                    <TableCell>{u.polo}</TableCell>
                    <TableCell className="font-mono text-xs">{u.email ?? "—"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <EditPrefixoDialog userId={u.id} currentPrefixo={u.prefixo} label={u.nome} onDone={runSearch} />
                      <EditNomeDialog userId={u.id} currentNome={u.nome} onDone={runSearch} />
                      <ResetPasswordDialog userId={u.id} label={u.nome} />
                      <DeleteUserButton userId={u.id} label={u.nome} onDone={runSearch} />
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

function EditPrefixoDialog({ userId, currentPrefixo, label, onDone }: { userId: string; currentPrefixo: string; label: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [prefixo, setPrefixo] = useState(currentPrefixo);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setPrefixo(currentPrefixo); }, [open, currentPrefixo]);

  const submit = async () => {
    setBusy(true);
    try {
      await callAdmin({ action: "update-prefixo", userId, prefixo });
      toast.success("Prefixo atualizado");
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Tag className="mr-1 h-3.5 w-3.5" />Prefixo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Alterar prefixo · {label}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Novo prefixo</Label>
          <Input value={prefixo} onChange={e => setPrefixo(e.target.value.toUpperCase())} placeholder="Ex: NI200TST-A" autoComplete="off" />
          <p className="text-xs text-muted-foreground">O prefixo identifica polo, equipe, serviço e turno do eletricista.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || prefixo.trim().length < 3}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditNomeDialog({ userId, currentNome, onDone }: { userId: string; currentNome: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(currentNome);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setNome(currentNome); }, [open, currentNome]);

  const submit = async () => {
    setBusy(true);
    try {
      await callAdmin({ action: "update-nome", userId, nome });
      toast.success("Nome atualizado");
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><User className="mr-1 h-3.5 w-3.5" />Nome</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Alterar nome</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Novo nome</Label>
          <Input value={nome} onChange={e => setNome(e.target.value)} autoComplete="off" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || nome.trim().length < 2}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserButton({ userId, label, onDone }: { userId: string; label: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await callAdmin({ action: "delete-user", userId });
      toast.success("Perfil excluído");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally { setBusy(false); }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm"><Trash2 className="mr-1 h-3.5 w-3.5" />Excluir</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação remove permanentemente o perfil, a conta de acesso e todos os registros de ponto deste eletricista. Não é possível desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir definitivamente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}