import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings as SettingsIcon, User as UserIcon } from "lucide-react";

export function AccountMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

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

  const initials = (user.name || user.email).slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account"
          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{user.name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings"><UserIcon className="mr-2 h-4 w-4" /> Account</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin"><SettingsIcon className="mr-2 h-4 w-4" /> Admin</Link>
        </DropdownMenuItem>
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
