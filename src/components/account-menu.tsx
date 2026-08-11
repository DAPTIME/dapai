import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { adminAmIAdmin } from "@/lib/admin.functions";
import { useMyProfile } from "@/lib/use-my-profile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  Settings as SettingsIcon,
  User as UserIcon,
  ShieldCheck,
} from "lucide-react";

export function AccountMenu() {
  const { user, signOut, ready } = useAuth();
  const amIAdmin = useServerFn(adminAmIAdmin);
  const adminQuery = useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => amIAdmin(),
    enabled: !!user,
  });
  const isAdmin = adminQuery.data?.isAdmin === true;
  const profile = useMyProfile();
  const navigate = useNavigate();

  if (!ready) {
    return (
      <div className="flex h-8 w-8 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">Sign in</Link>
        </Button>
        <Button asChild size="sm" style={{ background: "var(--gradient-brand)" }}>
          <Link to="/signup">Sign up</Link>
        </Button>
      </div>
    );
  }

  const displayName = profile.data?.name || user.name || user.email;
  const initials = displayName.slice(0, 1).toUpperCase();
  const avatarUrl = profile.data?.avatarUrl;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account"
          title="Account"
          className="flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-primary-foreground ring-offset-2 ring-offset-background transition-all duration-200 hover:scale-105 hover:ring-2 hover:ring-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={
            avatarUrl ? undefined : { background: "var(--gradient-brand)" }
          }
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account">
            <UserIcon className="mr-2 h-4 w-4" /> Account details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/security">
            <ShieldCheck className="mr-2 h-4 w-4" /> Security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon className="mr-2 h-4 w-4" /> Settings
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <SettingsIcon className="mr-2 h-4 w-4" /> Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            signOut();
            navigate({ to: "/login" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
