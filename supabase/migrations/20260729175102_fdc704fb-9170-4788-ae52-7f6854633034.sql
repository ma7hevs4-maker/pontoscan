
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS permite_outro boolean NOT NULL DEFAULT false;

-- Seed only if the table is empty for that tipo, to avoid duplicating chaves after user edits
DO $$
DECLARE
  ai_count int;
  o2_count int;
  im_count int;
BEGIN
  SELECT count(*) INTO ai_count FROM public.form_questions WHERE tipo='ATENDIMENTO_INDIVIDUAL';
  SELECT count(*) INTO o2_count FROM public.form_questions WHERE tipo='ORDEM_2';
  SELECT count(*) INTO im_count FROM public.form_questions WHERE tipo='IMPRODUTIVO';

  IF ai_count = 0 THEN
    INSERT INTO public.form_questions (tipo, chave, rotulo, campo_tipo, opcoes, obrigatoria, permite_outro, ordem, ativa) VALUES
      ('ATENDIMENTO_INDIVIDUAL','tipoRede','Tipo de Rede','choice','["Pré-reunida","Aberta"]'::jsonb,true,true,0,true),
      ('ATENDIMENTO_INDIVIDUAL','tipoConexao','Qual o tipo de conexão do cliente na rede','choice','["Conector perfurante","Charrua","Caixa Dae","Enel Chip"]'::jsonb,true,true,1,true),
      ('ATENDIMENTO_INDIVIDUAL','caixaDae','Em que condições está a caixa DAE','choice','["Não possui caixa DAE","Fechada Padrão","Aberta","Aberta sem tampa","Deteriorada aberta","Deteriorada fechada","Excesso de ligação na caixa"]'::jsonb,true,false,2,true),
      ('ATENDIMENTO_INDIVIDUAL','materialRamal','Qual o material do ramal?','choice','["Cobre","Alumínio"]'::jsonb,true,false,3,true),
      ('ATENDIMENTO_INDIVIDUAL','bitolaRamal','Bitola do Ramal','choice','["6 mm","10 mm","16 mm","25 mm","35 mm"]'::jsonb,true,true,4,true),
      ('ATENDIMENTO_INDIVIDUAL','tipoRamal','Qual o tipo de ramal do cliente?','choice','["Aberto","Pré-reunido","Concêntrico","Próprio"]'::jsonb,true,false,5,true),
      ('ATENDIMENTO_INDIVIDUAL','tipoDisjuntor','Qual o tipo de disjuntor do cliente','choice','["40A","50A","63A","70A","100A","200A"]'::jsonb,true,true,6,true),
      ('ATENDIMENTO_INDIVIDUAL','noKirchhoff','Nó de Kirchhoff','choice','["Sim","Não"]'::jsonb,true,false,7,true),
      ('ATENDIMENTO_INDIVIDUAL','medicao','Como está a medição do cliente','choice','["Dentro do Padrão","Aberta","Caixa Suja","Caixa de Ferro","Borne Queimado"]'::jsonb,true,false,8,true),
      ('ATENDIMENTO_INDIVIDUAL','correlacaoDefeito','A que você correlaciona o último defeito do cliente','choice','["Problemas na conexão da rede","Problemas no bornes do medidor","Problemas na conexão do disjuntor","Problemas na instalação do medidor","Caixa de passagem (Defeito interno do Cliente)","Ramal de entrada não compatível com o medidor"]'::jsonb,true,true,9,true);
  END IF;

  IF o2_count = 0 THEN
    INSERT INTO public.form_questions (tipo, chave, rotulo, campo_tipo, opcoes, obrigatoria, permite_outro, ordem, ativa) VALUES
      ('ORDEM_2','motivo','Motivo','choice','["Necessário Cesto Aéreo","Necessário poda","Gerar OSM"]'::jsonb,true,false,0,true),
      ('ORDEM_2','observacao','Observação','textarea','[]'::jsonb,false,false,1,true);
  END IF;

  IF im_count = 0 THEN
    INSERT INTO public.form_questions (tipo, chave, rotulo, campo_tipo, opcoes, obrigatoria, permite_outro, ordem, ativa) VALUES
      ('IMPRODUTIVO','motivo','Motivo','choice','["CASA FECHADA","DEFEITO INTERNO CLIENTE","ENDEREÇO NÃO LOCALIZADO","ESTAVA NORMAL","GRANDE CLIENTE DEFEITO INTERNO","INCIDENCIA SEM AFETAÇÃO","LUZ CORTADA","NIVEL DE TENSÃO NORMAL","OSCILAÇÃO","OSCILAÇÃO PROVOCADA POR TERCEIROS","OUTRAS CAUSAS DE TERCEIROS","REGISTRO INDEVIDO DA RECLAMAÇÃO"]'::jsonb,true,false,0,true),
      ('IMPRODUTIVO','observacao','Observação','textarea','[]'::jsonb,false,false,1,true);
  END IF;
END $$;
