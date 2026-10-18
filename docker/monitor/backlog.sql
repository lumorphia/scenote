-- 処理の滞留と、運営の確認待ちを数える (docs/runbook/monitoring.md)。個人の ID・handle・本文・画像のキーは出さない
-- 派生画像を作っている途中のまま (worker の停止、判定器の失敗)
SELECT 'processing=' || count(*) FROM posts WHERE status = 'processing' AND created_at < now() - interval '15 minutes';
-- 走るはずの時刻を 15 分過ぎても走っていないジョブ (cron の予定は start_after が先なので数えない)
SELECT 'jobs_waiting=' || count(*) FROM pgboss.job WHERE state IN ('created', 'retry') AND start_after < now() - interval '15 minutes';
-- 直近 1 日に、やり直しを使い切って失敗したジョブ
SELECT 'jobs_failed=' || count(*) FROM pgboss.job WHERE state = 'failed' AND completed_on > now() - interval '1 day';
-- 期限を過ぎた受け取りの枠が掃除されていない (毎時の upload-cleanup)
SELECT 'uploads=' || count(*) FROM uploads WHERE expires_at < now() - interval '2 hours';
-- 退会から 30 日と 1 時間を過ぎても残っている (accounts からの purged が届いていない。ADR-0010)
SELECT 'purges=' || count(*) FROM users WHERE status = 'deleted' AND deleted_at < now() - interval '30 days 1 hour';
-- 運営の確認待ち (ADR-0020・ADR-0021)。24 時間を過ぎたら知らせる
SELECT 'held=' || count(*) FROM posts WHERE status = 'held' AND created_at < now() - interval '24 hours';
SELECT 'flagged=' || count(*) FROM posts WHERE status = 'published' AND moderation_state = 'flagged' AND reviewed_at IS NULL AND published_at < now() - interval '24 hours';
SELECT 'reports=' || count(*) FROM reports WHERE status = 'open' AND created_at < now() - interval '24 hours';
