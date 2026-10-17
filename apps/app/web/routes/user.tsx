import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { PostFeed } from "../features/post-list/PostFeed.tsx";
import type { Route } from "./+types/user";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `@${params.handle} - Scenote` }];
}

type Profile = { handle: string; name: string; image: string | null };

/** 利用者のページ (S6c、要件定義書 9.1)。出るのは公開の投稿だけ。退会中の人は見つからない */
export default function User() {
  const { handle = "" } = useParams();
  const [profile, setProfile] = useState<Profile | null | "missing">(null);

  useEffect(() => {
    let active = true;
    setProfile(null);
    const load = async (): Promise<Profile | "missing"> => {
      const res = await fetch(`/api/users/${encodeURIComponent(handle)}`, {
        credentials: "same-origin",
      });
      return res.ok ? ((await res.json()) as Profile) : "missing";
    };
    void load()
      .catch(() => "missing" as const)
      .then((data) => {
        if (active) setProfile(data);
      });
    return () => {
      active = false;
    };
  }, [handle]);

  if (profile === "missing")
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p>利用者が見つかりません。</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      {profile ? (
        <section className="flex items-center gap-3">
          {profile.image ? (
            <img src={profile.image} alt="" width={48} height={48} className="rounded-full" />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold">{profile.name}</h1>
            <p className="text-sm text-ink-muted">@{profile.handle}</p>
          </div>
        </section>
      ) : (
        <p className="text-sm text-ink-muted">読み込んでいます…</p>
      )}
      {profile ? (
        <PostFeed filter={{ author: profile.handle }} emptyMessage="公開の写真はまだありません。" />
      ) : null}
    </main>
  );
}
