import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScanLine, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/cadastro")({
  component: SignupClosedPage,
  head: () => ({
    meta: [
      { title: "Cadastro indisponível · PontoScan" },
      { name: "description", content: "Contas do PontoScan são criadas apenas por administradores." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function SignupClosedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-md p-8 shadow-xl text-center">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
            <ScanLine className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Cadastro indisponível</h1>
        </div>
        <div className="flex items-start gap-3 rounded-lg border bg-amber-50 p-4 text-left text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            O auto-cadastro público está desativado. Solicite ao administrador do seu polo a
            criação da sua conta no PontoScan.
          </p>
        </div>
        <Button asChild className="mt-6 h-12 w-full text-base">
          <Link to="/">Voltar para o login</Link>
        </Button>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta? <Link to="/" className="font-medium text-primary hover:underline">Entrar</Link>
        </p>
      </Card>
    </div>
  );
}
