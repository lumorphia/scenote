/** accounts から back-channel logout が届く先。サーバー間の POST なので CSRF の対象外 (plugins/security.ts) */
export const LUMORPHIA_BACKCHANNEL_PATH = "/api/lumorphia/backchannel-logout";
/** accounts の end-session から戻ってくる先。accounts に post_logout_redirect_uri として登録する */
export const LUMORPHIA_SIGNED_OUT_PATH = "/api/lumorphia/signed-out";
