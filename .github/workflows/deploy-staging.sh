#!/bin/bash
set -e

echo "---- DEPLOY STARTED ----"

cd /home/ubuntu/datum-deploy/dashboard

echo "Pulling latest main branch..."
GIT_SSH_COMMAND='ssh -i /home/ubuntu/.ssh/deploy_key -o IdentitiesOnly=yes' git fetch origin
GIT_SSH_COMMAND='ssh -i /home/ubuntu/.ssh/deploy_key -o IdentitiesOnly=yes' git reset --hard origin/staging

echo "Stopping containers..."
docker compose -p "dashboard-staging" down --remove-orphans

echo "Rebuilding containers..."
docker compose -p "dashboard-staging" build --no-cache

echo "Starting containers..."
docker compose -p "dashboard-staging" up -d

echo "Cleaning unused images..."
docker image prune -f

echo "---- DEPLOY COMPLETE ----"
