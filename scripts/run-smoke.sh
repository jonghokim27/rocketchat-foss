#!/usr/bin/env bash
# Starts MongoDB (replica set, the image this project ships alongside) and the given Rocket.Chat
# image, then runs the REST/DDP and browser smoke tests against it.
#
#   scripts/run-smoke.sh <rocket.chat image> <expected version> <mongodb image> <output dir>
set -euo pipefail

IMAGE="${1:?image}"
VERSION="${2:?version}"
MONGO_IMAGE="${3:?mongodb image}"
OUT="${4:?output dir}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ADMIN_USER=smoke.admin
ADMIN_PASS="Smoke-$(openssl rand -hex 8)-1!"

mkdir -p "$OUT"
cleanup() {
	docker logs rc >"$OUT/rocketchat.log" 2>&1 || true
	docker logs mongo >"$OUT/mongodb.log" 2>&1 || true
	docker rm -f rc mongo >/dev/null 2>&1 || true
	docker network rm foss-smoke >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create foss-smoke >/dev/null
docker run -d --name mongo --network foss-smoke "$MONGO_IMAGE" mongod --replSet rs0 --bind_ip_all >/dev/null
for i in $(seq 1 60); do
	docker exec mongo mongosh --quiet --eval 'db.adminCommand("ping").ok' 2>/dev/null | grep -q 1 && break
	sleep 2
done
docker exec mongo mongosh --quiet --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "mongo:27017"}]})'
for i in $(seq 1 30); do
	docker exec mongo mongosh --quiet --eval 'rs.status().myState' 2>/dev/null | grep -q '^1$' && break
	sleep 2
done

docker run -d --name rc --network foss-smoke -p 3000:3000 \
	-e MONGO_URL='mongodb://mongo:27017/rocketchat?replicaSet=rs0' \
	-e ROOT_URL=http://localhost:3000 \
	-e PORT=3000 \
	-e ADMIN_USERNAME="$ADMIN_USER" -e ADMIN_PASS="$ADMIN_PASS" -e ADMIN_EMAIL=smoke.admin@example.invalid \
	-e OVERWRITE_SETTING_Show_Setup_Wizard=completed \
	-e OVERWRITE_SETTING_Accounts_TwoFactorAuthentication_Enabled=false \
	-e OVERWRITE_SETTING_Accounts_TwoFactorAuthentication_By_Email_Auto_Opt_In=false \
	-e OVERWRITE_SETTING_API_Enable_Rate_Limiter=false \
	-e OVERWRITE_SETTING_DDP_Rate_Limit_IP_Enabled=false \
	-e OVERWRITE_SETTING_DDP_Rate_Limit_User_Enabled=false \
	-e OVERWRITE_SETTING_DDP_Rate_Limit_Connection_Enabled=false \
	-e OVERWRITE_SETTING_DDP_Rate_Limit_User_By_Method_Enabled=false \
	-e OVERWRITE_SETTING_DDP_Rate_Limit_Connection_By_Method_Enabled=false \
	"$IMAGE" >/dev/null

echo "waiting for SERVER RUNNING …"
for i in $(seq 1 180); do
	if ! docker ps --format '{{.Names}}' | grep -qx rc; then
		echo "rocket.chat container exited"; docker logs rc 2>&1 | tail -80; exit 1
	fi
	docker logs rc 2>&1 | grep -q 'SERVER RUNNING' && break
	sleep 2
done
docker logs rc 2>&1 | grep -q 'SERVER RUNNING' || { echo "server did not start"; docker logs rc 2>&1 | tail -120; exit 1; }
docker logs rc 2>&1 | grep -A14 'SERVER RUNNING' | head -16

node "$HERE/smoke.mjs" http://localhost:3000 "$ADMIN_USER" "$ADMIN_PASS" "$VERSION"
node "$HERE/smoke-browser.mjs" http://localhost:3000 "$ADMIN_USER" "$ADMIN_PASS" "$OUT"

# Licensed code that is still reached at runtime shows up as a missing module.
if docker logs rc 2>&1 | grep -E 'Cannot find module|MODULE_NOT_FOUND'; then
	echo "runtime reached a module that is not in the FOSS build"; exit 1
fi
echo "server log lines mentioning errors (informational):"
docker logs rc 2>&1 | grep -iE '"level":(50|60)|\berror\b' | head -40 || true
