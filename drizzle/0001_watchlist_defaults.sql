INSERT INTO `watchlists` (
	`id`,
	`user_id`,
	`name`,
	`sort_order`,
	`is_default`,
	`created_at`,
	`updated_at`
)
SELECT
	lower(
		substr(hex(randomblob(16)), 1, 8) || '-' ||
		substr(hex(randomblob(16)), 1, 4) || '-' ||
		substr(hex(randomblob(16)), 1, 4) || '-' ||
		substr(hex(randomblob(16)), 1, 4) || '-' ||
		substr(hex(randomblob(16)), 1, 12)
	),
	`users`.`id`,
	'기본 관심종목',
	0,
	1,
	`users`.`created_at`,
	`users`.`created_at`
FROM `users`
WHERE NOT EXISTS (
	SELECT 1
	FROM `watchlists`
	WHERE
		`watchlists`.`user_id` = `users`.`id`
		AND `watchlists`.`is_default` = 1
);
