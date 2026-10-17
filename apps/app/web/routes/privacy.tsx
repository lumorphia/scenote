import { legalPage } from "../lib/legal.ts";
import { LegalPageView } from "./legal-page.tsx";
import type { Route } from "./+types/privacy";

export function meta(_: Route.MetaArgs) {
  return [{ title: "プライバシーポリシー - Scenote" }];
}

/** プライバシーポリシー (ADR-0023)。本文は docs/legal/privacy.md */
export function loader() {
  return legalPage("privacy");
}

export default function Page({ loaderData }: Route.ComponentProps) {
  return <LegalPageView {...loaderData} />;
}
