import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { useAuth } from "@/lib/auth";

export function useMyProfile() {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getMyProfile);
  return useQuery({
    queryKey: ["my-profile", user?.id ?? "anon"],
    queryFn: () => fetchProfile(),
    enabled: !!user,
    staleTime: 60_000,
  });
}
