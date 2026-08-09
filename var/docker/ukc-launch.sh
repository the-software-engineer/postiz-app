#!/bin/sh
cd /app
nginx
exec pnpm run pm2
