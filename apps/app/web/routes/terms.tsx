import { legalPage } from "../lib/legal.ts";
import { LegalPageView } from "./legal-page.tsx";
import type { Route } from "./+types/terms";

export function meta(_: Route.MetaArgs) {
  return [{ title: "利用規約 - Scenote" }];
}

/** 利用規約 (ADR-0023)。本文は docs/legal/terms.md */
export function loader() {
  return legalPage("terms");
}

export default function Page({ loaderData }: Route.ComponentProps) {
  return <LegalPageView {...loaderData} />;
}
