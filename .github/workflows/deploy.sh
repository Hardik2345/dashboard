#!/bin/bash
set -e

echo "---- DEPLOY STARTED ----"

cd /home/ubuntu/datum-deploy/dashboard

echo "Pulling latest main branch..."
GIT_SSH_COMMAND='ssh -i /home/ubuntu/.ssh/deploy_key -o IdentitiesOnly=yes' git fetch origin
GIT_SSH_COMMAND='ssh -i /home/ubuntu/.ssh/deploy_key -o IdentitiesOnly=yes' git reset --hard origin/main

echo "Stopping containers..."
docker compose -p "dashboard-prod" down

echo "Rebuilding containers..."
docker compose -p "dashboard-prod" build --no-cache

echo "Starting containers..."
docker compose -p "dashboard-prod" up -d

echo "Cleaning unused images..."
docker image prune -f

echo "---- DEPLOY COMPLETE ----"
