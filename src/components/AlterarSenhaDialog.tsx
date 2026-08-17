import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AlterarSenhaDialog() {
  const [open, setOpen] = useState(false);
  const [nova, setNova] = useState("");
  const [conf, setConf] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nova.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres");
    if (nova !== conf) return toast.error("As senhas não coincidem");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: nova });
    setSaving(false);
    if (error) return toast.error("Não foi possível alterar a senha");
    toast.success("Senha alterada com sucesso");
    setNova(""); setConf(""); setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Alterar senha" aria-label="Alterar senha">
          <KeyRound className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Alterar senha</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="nv">Nova senha</Label>
            <Input id="nv" type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" required />
          </div>
          <div>
            <Label htmlFor="cf">Confirmar nova senha</Label>
            <Input id="cf" type="password" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" required />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar nova senha"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
