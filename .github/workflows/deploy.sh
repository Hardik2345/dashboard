#!/bin/bash

set -e  # stop on error

echo "---- DEPLOY STARTED ----"

cd /home/ubuntu/datum-deploy/dashboard

echo "Pulling latest main branch..."
git fetch origin
git reset --hard origin/main

echo "Stopping containers..."
docker compose -p "dashboard-prod" down

echo "Rebuilding containers..."
docker compose -p "dashboard-prod" build --no-cache

echo "Starting containers..."
docker compose -p "dashboard-prod" up -d

echo "Cleaning unused images..."
docker image prune -f

echo "---- DEPLOY COMPLETE ----"
