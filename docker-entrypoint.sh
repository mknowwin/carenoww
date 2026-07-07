#!/bin/bash
set -e

MONGO_DBPATH="${MONGO_DBPATH:-/data/db}"
MONGO_LOGPATH="${MONGO_LOGPATH:-/var/log/mongod.log}"
MONGO_PORT="${MONGO_PORT:-27017}"

mkdir -p "$MONGO_DBPATH"

echo "🚀 Starting mongod (replica set rs0)..."
mongod \
  --replSet rs0 \
  --bind_ip_all \
  --port "$MONGO_PORT" \
  --dbpath "$MONGO_DBPATH" \
  --logpath "$MONGO_LOGPATH" \
  --fork

echo "⏳ Waiting for mongod to accept connections..."
until mongosh --port "$MONGO_PORT" --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; do
  sleep 1
done

echo "🔧 Ensuring replica set is initiated..."
mongosh --port "$MONGO_PORT" --quiet --eval "
try {
  rs.status();
  print('Replica set already initiated.');
} catch (e) {
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:${MONGO_PORT}' }] });
  print('Replica set initiated.');
}
"

echo "⏳ Waiting for a PRIMARY to be elected..."
until mongosh --port "$MONGO_PORT" --quiet --eval "db.hello().isWritablePrimary" 2>/dev/null | grep -q true; do
  sleep 1
done

echo "✅ MongoDB replica set ready."
echo "🚀 Starting Carenoww app..."
exec node dist/index.js
