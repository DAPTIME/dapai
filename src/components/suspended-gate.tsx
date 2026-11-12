/**
 * The screen a suspended account sees.
 *
 * The enforcement is server-side: the auth middleware refuses every
 * authenticated request from a banned account, so nothing here is what makes
 * the ban work — removing this component would not un-ban anyone. It exists
 * so a suspended user gets a straight answer instead of watching every part
 * of the site fail for no stated reason.
 *
 * It keys off the error from the profile query rather than a flag, because a
 * banned account cannot successfully call anything to be told it is banned.
 */
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useMyProfile } from "@/lib/use-my-profile";

export function SuspendedGate() {
  const { user, ready, signOut } = useAuth();
  const queryClient = useQueryClient();
  // Shares the query key the account menu already uses, so this costs no
  // extra request.
  const profile = useMyProfile();

  const suspended =
    ready &&
    !!user &&
    profile.isError &&
    profile.error instanceof Error &&
    profile.error.message.includes("suspended");

  if (!suspended) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Account suspended
            </h2>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          This account can no longer sign in or use DAP Games. If you think this is
          a mistake, reply to the address you signed up with and we'll take
          another look.
        </p>

        <Button
          className="mt-6 w-full"
          variant="outline"
          onClick={() => {
            queryClient.clear();
            signOut();
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
