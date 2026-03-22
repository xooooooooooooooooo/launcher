import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Coins, User, Calendar, TrendingUp, ExternalLink, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ProfileBadges from "@/components/launcher/ProfileBadges";

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL as string | undefined;

interface ProfileData {
    username?: string;
    hades_coins?: number;
    created_at?: string;
    subscription_end_date?: string | null;
    avatar_url?: string | null;
    [key: string]: unknown;
}

interface ProfilePageProps {
    profile?: ProfileData | null;
    user?: { email?: string; id?: string } | null;
    licenseStatus?: { active: boolean; unlimited: boolean; expires_at?: string | null } | null;
}

const ProfilePage = ({ profile: profileProp = null, user = null, licenseStatus = null }: ProfilePageProps) => {
    const [profile, setProfile] = useState<ProfileData | null>(profileProp ?? null);
    const [roles, setRoles] = useState<string[]>([]);
    const [loading, setLoading] = useState(!profileProp && !user);
    const [refreshing, setRefreshing] = useState(false);

    const userEmail = user?.email ?? "";
    const userId = user?.id;

    useEffect(() => {
        setProfile(profileProp ?? null);
        if (profileProp) setLoading(false);
    }, [profileProp]);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }
        const fetchProfile = async () => {
            setRefreshing(true);
            const [profileRes, rolesRes] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("username, hades_coins, created_at, subscription_end_date, avatar_url")
                    .eq("user_id", userId)
                    .single(),
                supabase
                    .from("user_roles")
                    .select("role")
                    .eq("user_id", userId)
            ]);
            
            setRefreshing(false);
            if (profileRes.data) setProfile(profileRes.data);
            if (rolesRes.data) setRoles(rolesRes.data.map((r: any) => r.role));
        };
        fetchProfile();
    }, [userId]);

    if (loading && !profile && !user) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    // Animation variants
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-6 h-full overflow-y-auto p-2"
        >
            <motion.div variants={item}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-2xl font-bold font-display tracking-tight text-white">Profile</h2>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Connected to website account
                        </span>
                        {WEBSITE_URL && (
                            <a
                                href={WEBSITE_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Open website
                            </a>
                        )}
                    </div>
                </div>

                {/* Header Card */}
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <User className="w-32 h-32" />
                    </div>

                    <div className="relative z-10 flex items-center gap-6">
                        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-orange-600 p-[2px] overflow-hidden">
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                            ) : (
                                <div className="h-full w-full rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                                    <span className="text-2xl font-bold text-primary">
                                        {profile?.username?.charAt(0).toUpperCase() ?? userEmail?.charAt(0).toUpperCase() ?? "U"}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-3xl font-display font-bold text-white mb-1">
                                {profile?.username ?? "User"}
                            </h3>
                            <div className="flex items-center gap-4 mt-3 mb-4">
                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-muted-foreground">
                                    <Calendar className="w-3 h-3 text-primary" />
                                    <span>Joined {new Date(profile?.created_at || Date.now()).toLocaleDateString()}</span>
                                </div>
                            </div>

                            {/* Badges Display */}
                            <ProfileBadges 
                                roles={roles}
                                createdAt={profile?.created_at || new Date().toISOString()}
                                hasSubscription={!!(licenseStatus?.active || licenseStatus?.unlimited)}
                                userId={userId}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Coins className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">Hades Coins</span>
                    </div>
                    <div className="text-3xl font-display font-bold text-white group-hover:scale-105 transition-transform origin-left">
                        {(profile?.hades_coins ?? 0).toLocaleString()}
                    </div>
                </div>

                <div className="p-5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">Subscription</span>
                    </div>
                    {(() => {
                        if (licenseStatus?.unlimited) {
                            return (
                                <div>
                                    <div className="text-3xl font-display font-bold text-primary drop-shadow-[0_0_12px_hsl(var(--primary)/0.4)]">
                                        Unlimited
                                    </div>
                                    <div className="text-xs text-primary/80 mt-1 flex items-center gap-1.5 font-medium tracking-wide">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Lifetime Access
                                    </div>
                                </div>
                            );
                        }

                        const expirationString = licenseStatus?.expires_at || profile?.subscription_end_date;
                        
                        if (!expirationString) {
                            return <div className="text-3xl font-display font-bold text-muted-foreground">Inactive</div>;
                        }
                        const end = new Date(expirationString);
                        const now = new Date();
                        const diffTime = end.getTime() - now.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays <= 0) {
                            return <div className="text-3xl font-display font-bold text-red-500">Expired</div>;
                        }

                        return (
                            <div>
                                <div className="text-3xl font-display font-bold text-green-500">
                                    {diffDays} Days
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    Ends {end.toLocaleDateString()}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </motion.div>

        </motion.div>
    );
};

export default ProfilePage;

