INSERT INTO public.ai_settings (id, system_prompt, updated_at) VALUES
  ('site_status','on',now()),
  ('feature_ai_enabled','on',now()),
  ('feature_lite_model','on',now()),
  ('feature_pro_lite_model','on',now()),
  ('feature_pro_model','on',now()),
  ('feature_games','on',now()),
  ('feature_daps','on',now())
ON CONFLICT (id) DO UPDATE SET system_prompt = 'on', updated_at = now();
DELETE FROM public.ai_settings WHERE id = 'feature_game_spacewar';