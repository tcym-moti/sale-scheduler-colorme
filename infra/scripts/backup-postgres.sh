#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

: "${BACKUP_PROJECT_DIR:=/opt/sale-scheduler-colorme}"
: "${BACKUP_COMPOSE_FILE:=$BACKUP_PROJECT_DIR/docker-compose.production.yml}"
: "${BACKUP_APP_ENV_FILE:=/opt/sale-scheduler-colorme/.env.production}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"
: "${R2_PREFIX:=sale-scheduler/postgres}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required}"

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 1; }
command -v gpg >/dev/null || { echo "gpg is required" >&2; exit 1; }
test -r "$BACKUP_PASSPHRASE_FILE" || { echo "backup passphrase file is not readable" >&2; exit 1; }
test "$(stat -c '%a' "$BACKUP_PASSPHRASE_FILE")" = "600" || { echo "backup passphrase file must be mode 600" >&2; exit 1; }

work_dir="$(mktemp -d /var/tmp/sale-scheduler-backup.XXXXXX)"
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT
export GNUPGHOME="$work_dir/gnupg"
mkdir -m 700 -- "$GNUPGHOME"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="$work_dir/sale-scheduler-${timestamp}.sql.gz"
encrypted_file="$dump_file.gpg"
object_key="${R2_PREFIX%/}/$(basename "$encrypted_file")"

docker compose --env-file "$BACKUP_APP_ENV_FILE" -f "$BACKUP_COMPOSE_FILE" exec -T db \
  pg_dump --no-owner --no-privileges --username=sale_scheduler --dbname=sale_scheduler \
  | gzip -c > "$dump_file"

gpg --batch --yes --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
  --symmetric --cipher-algo AES256 --output "$encrypted_file" "$dump_file"
rm -f -- "$dump_file"

AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto \
  aws s3 cp "$encrypted_file" "s3://$R2_BUCKET/$object_key" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors

old_objects_file="$work_dir/old-objects"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto \
  aws s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "${R2_PREFIX%/}/" \
  --endpoint-url "$R2_ENDPOINT" --query 'sort_by(Contents, &LastModified)[:-7].Key' --output text \
  | tr '\t' '\n' > "$old_objects_file"
while IFS= read -r old_key; do
  [[ -z "$old_key" || "$old_key" == "None" ]] && continue
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto \
    aws s3 rm "s3://$R2_BUCKET/$old_key" --endpoint-url "$R2_ENDPOINT" --only-show-errors
done < "$old_objects_file"

echo "PostgreSQL backup uploaded and retention applied: $object_key"
