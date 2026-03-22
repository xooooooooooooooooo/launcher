import { useEffect, useState } from "react";
import { Crown, Shield, Star, Clock, Flame, Bug, Award, Zap, Heart, Gem, Trophy, Target, Sword, ShieldCheck, Users, Sparkles, Medal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";

interface ProfileBadgesProps {
  roles: string[];
  createdAt: string;
  hasSubscription?: boolean;
  userId?: string;
}

interface CustomBadge {
  badge_name: string;
  badge_icon: string;
  badge_color: string;
}

const iconMap: Record<string, typeof Award> = {
  award: Award, star: Star, zap: Zap, flame: Flame,
  heart: Heart, gem: Gem, trophy: Trophy, target: Target,
  sword: Sword, shield: ShieldCheck, medal: Medal, sparkles: Sparkles,
};

const colorMap: Record<string, string> = {
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  red: "bg-red-500/20 text-red-400 border-red-500/30",
  green: "bg-green-500/20 text-green-400 border-green-500/30",
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  orange: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  pink: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  cyan: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  emerald: "bg-primary/20 text-primary border-primary/30",
};

const badgeConfig: Record<string, { label: string; icon: typeof Crown; className: string }> = {
  owner: { label: "Owner", icon: Crown, className: "bg-primary/20 text-primary border-primary/30" },
  admin: { label: "Admin", icon: Shield, className: "bg-red-500/20 text-red-400 border-red-500/30" },
  moderator: { label: "Moderator", icon: Star, className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

interface ConfigStats {
  totalConfigs: number;
  totalDownloads: number;
}

const ProfileBadges = ({ roles, createdAt, hasSubscription, userId }: ProfileBadgesProps) => {
  const [customBadges, setCustomBadges] = useState<CustomBadge[]>([]);
  const [configStats, setConfigStats] = useState<ConfigStats>({ totalConfigs: 0, totalDownloads: 0 });
  const joinDate = new Date(createdAt);
  const now = new Date();
  const daysSinceJoin = Math.floor((now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      supabase.from("user_badges").select("badge_name, badge_icon, badge_color").eq("user_id", userId),
      supabase.from("configs").select("downloads").eq("user_id", userId),
    ]).then(([badgesRes, configsRes]) => {
      setCustomBadges((badgesRes.data as CustomBadge[]) || []);
      const configs = configsRes.data || [];
      setConfigStats({
        totalConfigs: configs.length,
        totalDownloads: configs.reduce((sum, c) => sum + ((c as any).downloads || 0), 0),
      });
    });
  }, [userId]);

  // Only show owner OR admin, not both (owner is higher)
  const displayRoles = roles.includes("owner")
    ? roles.filter((r) => r !== "admin")
    : roles;

  return (
    <div className="flex flex-wrap gap-2">
      {/* Role badges */}
      {displayRoles.map((role) => {
        const config = badgeConfig[role];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <Badge key={role} variant="outline" className={config.className}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        );
      })}

      {/* Subscription badge */}
      {hasSubscription && (
        <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
          <Flame className="h-3 w-3 mr-1" />
          Premium
        </Badge>
      )}

      {/* Custom badges */}
      {customBadges.map((cb) => {
        const Icon = iconMap[cb.badge_icon] || Award;
        return (
          <Badge key={cb.badge_name} variant="outline" className={colorMap[cb.badge_color] || colorMap.purple}>
            <Icon className="h-3 w-3 mr-1" />
            {cb.badge_name}
          </Badge>
        );
      })}

      {/* Beta Tester */}
      {daysSinceJoin <= 90 && (
        <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
          <Bug className="h-3 w-3 mr-1" />
          Beta Tester
        </Badge>
      )}

      {/* Early Adopter — joined within first 180 days */}
      {daysSinceJoin <= 180 && daysSinceJoin > 90 && (
        <Badge variant="outline" className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
          <Sparkles className="h-3 w-3 mr-1" />
          Early Adopter
        </Badge>
      )}

      {/* Veteran — 1 year+ */}
      {daysSinceJoin >= 365 && (
        <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Veteran
        </Badge>
      )}

      {/* OG — 2 years+ */}
      {daysSinceJoin >= 730 && (
        <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30">
          <Crown className="h-3 w-3 mr-1" />
          OG
        </Badge>
      )}

      {/* Member — 30 days to 1 year */}
      {daysSinceJoin >= 30 && daysSinceJoin < 365 && (
        <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
          <Clock className="h-3 w-3 mr-1" />
          Member
        </Badge>
      )}

      {/* Newcomer — less than 7 days */}
      {daysSinceJoin < 7 && (
        <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
          <Users className="h-3 w-3 mr-1" />
          Newcomer
        </Badge>
      )}

      {/* Config Creator — uploaded at least 1 config */}
      {configStats.totalConfigs >= 1 && (
        <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
          <Target className="h-3 w-3 mr-1" />
          Config Creator
        </Badge>
      )}

      {/* Popular Creator — 50+ total downloads */}
      {configStats.totalDownloads >= 50 && (
        <Badge variant="outline" className="bg-pink-500/20 text-pink-400 border-pink-500/30">
          <Trophy className="h-3 w-3 mr-1" />
          Popular Creator
        </Badge>
      )}

      {/* Top Creator — 5+ configs */}
      {configStats.totalConfigs >= 5 && (
        <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Medal className="h-3 w-3 mr-1" />
          Top Creator
        </Badge>
      )}
    </div>
  );
};

export default ProfileBadges;

