DELETE FROM public.study_room_members m
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.user_id);