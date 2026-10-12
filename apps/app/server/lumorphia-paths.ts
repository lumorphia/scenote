/** accounts から back-channel logout が届く先。サーバー間の POST なので CSRF の対象外 (plugins/security.ts) */
export const LUMORPHIA_BACKCHANNEL_PATH = "/api/lumorphia/backchannel-logout";
/** accounts の end-session から戻ってくる先。accounts に post_logout_redirect_uri として登録する */
export const LUMORPHIA_SIGNED_OUT_PATH = "/api/lumorphia/signed-out";
/** accounts から退会・復旧・物理削除の知らせが届く先 (ADR-0010)。CSRF の対象外 */
export const LUMORPHIA_ACCOUNT_EVENTS_PATH = "/api/lumorphia/account-events";
