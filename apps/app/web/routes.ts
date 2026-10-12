import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [index("routes/home.tsx"), route("edit", "routes/edit.tsx")] satisfies RouteConfig;
