import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("edit", "routes/edit.tsx"),
  route("login", "routes/login.tsx"),
  route("post/new", "routes/post-new.tsx"),
  route("posts/:id", "routes/post.tsx"),
  route("tags/:name", "routes/tag.tsx"),
  route("u/:handle", "routes/user.tsx"),
  route("me", "routes/me.tsx"),
  route("admin", "routes/admin.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("welcome", "routes/welcome.tsx"),
] satisfies RouteConfig;
