ALTER TABLE public.equipe_areas ALTER COLUMN area DROP NOT NULL;
ALTER TABLE public.equipe_areas ADD COLUMN gerada boolean NOT NULL DEFAULT false;