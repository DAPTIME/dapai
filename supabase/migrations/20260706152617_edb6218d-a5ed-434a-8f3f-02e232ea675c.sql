
REVOKE EXECUTE ON FUNCTION public.slugify_chat_title(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_chat_slug(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chats_set_slug() FROM PUBLIC, anon, authenticated;
