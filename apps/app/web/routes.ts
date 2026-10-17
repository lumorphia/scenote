import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("edit", "routes/edit.tsx"),
  route("login", "routes/login.tsx"),
  route("post/new", "routes/post-new.tsx"),
  route("posts/:id", "routes/post.tsx"),
  route("tags/:name", "routes/tag.tsx"),
  route("u/:handle", "routes/user.tsx"),
] satisfies RouteConfig;
