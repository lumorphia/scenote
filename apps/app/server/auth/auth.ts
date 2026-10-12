import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { createLumorphiaOAuthConfig, type VerifiedLogin } from "@lumorphia/auth-client";
import { schema, type Database } from "@lumorphia-scenote/db";
import {
  lumorphiaPlaceholderEmail,
  releaseHandle,
  syncLumorphiaProfile,
} from "@lumorphia-scenote/core/domain/lumorphia-login";
import { lumorphiaConfig, type Env } from "../env.ts";

const DAY = 60 * 60 * 24;

/**
 * 認証の要求 1 つの中で、auth-client が検証した Lumorphia のログインを、利用者とセッションを作る hook に
 * 受け渡す (auth-client の README。lumorphia/prismtone と同じ)
 */
const lumorphiaLogin = new AsyncLocalStorage<{ login?: VerifiedLogin }>();

/** 認証の要求 1 つを、Lumorphia の検証済みログインを受け渡す文脈の中で動かす */
export function runAuthRequest<T>(handler: () => Promise<T>): Promise<T> {
  return lumorphiaLogin.run({}, handler);
}

/** LUMORPHIA_* が揃っていれば「Lumorphia でログイン」の設定を返す (ADR-0009) */
function lumorphiaProvider(env: Env) {
  const config = lumorphiaConfig(env);
  if (!config) return null;
  const base = createLumorphiaOAuthConfig({
    ...config,
    onVerifiedLogin(login) {
      const store = lumorphiaLogin.getStore();
      if (!store) throw new Error("Missing Lumorphia login context");
      store.login = login;
    },
  });
  return {
    ...base,
    async getUserInfo(tokens: Parameters<NonNullable<typeof base.getUserInfo>>[0]) {
      const info = await base.getUserInfo!(tokens);
      const login = lumorphiaLogin.getStore()?.login;
      if (!info || !login) return null;
      // 本物のメールアドレスは保存しない (ADR-0009)
      return { ...info, email: lumorphiaPlaceholderEmail(login.claims.sub), emailVerified: false };
    },
  };
}

/** Better Auth のインスタンスを作る。ログインは Lumorphia アカウントだけ (ADR-0005、ADR-0009) */
export function createAuth({ db, env }: { db: Database; env: Env }) {
  const lumorphia = lumorphiaProvider(env);
  return betterAuth({
    appName: "Scenote",
    baseURL: env.AUTH_BASE_URL,
    basePath: "/api/auth",
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.AUTH_BASE_URL],
    // Better Auth の既定の英語のエラーページを出さず、/login?error=<code> に戻して日本語で出す
    onAPIError: { errorURL: `${env.AUTH_BASE_URL}/login` },
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
    advanced: {
      database: { generateId: false },
      cookiePrefix: "scenote",
      useSecureCookies: env.NODE_ENV === "production",
      ipAddress: {
        ipAddressHeaders: env.CLIENT_IP_HEADER
          ? [env.CLIENT_IP_HEADER, "x-forwarded-for"]
          : ["x-forwarded-for"],
      },
    },
    emailAndPassword: { enabled: false },
    // メールアドレスでほかの利用者に結び付けない (ログインは Lumorphia だけで、email は sub ごとの仮の値)
    account: { accountLinking: { enabled: false } },
    user: {
      additionalFields: {
        handle: { type: "string", required: false, input: false },
        lumorphiaSub: { type: "string", required: false, input: false },
      },
      deleteUser: { enabled: false },
    },
    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      cookieCache: { enabled: false },
      additionalFields: {
        lumorphiaSid: { type: "string", required: false, input: false, returned: false },
        lumorphiaIdToken: { type: "string", required: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const login = lumorphiaLogin.getStore()?.login;
            if (!login) throw new Error("Scenote users come from Lumorphia only");
            // handle の古い写しを持つ人がいれば外してから作る (ADR-0009)
            await releaseHandle(db, login.claims.handle);
            return {
              data: {
                ...user,
                handle: login.claims.handle,
                name: login.profile.name,
                image: login.profile.picture,
                lumorphiaSub: login.claims.sub,
              },
            };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const login = lumorphiaLogin.getStore()?.login;
            if (!login) return;
            // 写しを新しくし、back-channel logout と end-session のために Lumorphia の sid と ID トークンを持つ
            await syncLumorphiaProfile(db, session.userId, {
              handle: login.claims.handle,
              name: login.profile.name,
              picture: login.profile.picture,
            });
            return {
              data: { ...session, lumorphiaSid: login.sid, lumorphiaIdToken: login.idToken },
            };
          },
        },
      },
    },
    plugins: lumorphia ? [genericOAuth({ config: [lumorphia] })] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = Auth["$Infer"]["Session"]["user"];
export type Session = Auth["$Infer"]["Session"]["session"];
