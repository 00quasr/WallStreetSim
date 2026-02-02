# WallStreetSim Restore Runbook

This runbook provides step-by-step procedures for restoring WallStreetSim services from backups in various disaster scenarios.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Prerequisites](#prerequisites)
3. [PostgreSQL Restore](#postgresql-restore)
4. [Redis Restore](#redis-restore)
5. [ClickHouse Restore](#clickhouse-restore)
6. [Full System Recovery](#full-system-recovery)
7. [Verification Procedures](#verification-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Quick Reference

| Service    | Backup Location                              | Command                                           |
|------------|----------------------------------------------|---------------------------------------------------|
| PostgreSQL | `/WallStreetSim/backups/*.sql.gz`            | `./restore-postgres.sh <backup_file>`             |
| Redis      | Docker volume `redis_data` (`/data/dump.rdb`)| Restart container with existing volume            |
| ClickHouse | Docker volume `clickhouse_data`              | Restart container with existing volume            |

**Backup Retention:**
- Daily backups: 7 days
- Weekly backups: 4 weeks (Sundays promoted to `/backups/weekly/`)

---

## Prerequisites

Before starting any restore procedure:

1. **Stop all application services** to prevent data corruption:
   ```bash
   pm2 stop all
   ```

2. **Verify Docker is running**:
   ```bash
   docker ps
   ```

3. **Identify the backup to restore**:
   ```bash
   # List available PostgreSQL backups
   ls -lh /WallStreetSim/backups/*.sql.gz
   ls -lh /WallStreetSim/backups/weekly/*.sql.gz
   ```

4. **Ensure sufficient disk space**:
   ```bash
   df -h /WallStreetSim
   ```

---

## PostgreSQL Restore

### Scenario 1: Restore from Daily/Weekly Backup

Use this procedure to restore the PostgreSQL database from a `.sql.gz` backup file.

#### Step 1: Identify the backup file

```bash
# List daily backups (newest first)
ls -lt /WallStreetSim/backups/wallstreetsim_*.sql.gz | head -10

# List weekly backups
ls -lt /WallStreetSim/backups/weekly/wallstreetsim_weekly_*.sql.gz
```

Example output:
```
-rw-r--r-- 1 dev dev 2.1M Feb  2 02:00 wallstreetsim_20260202_020000.sql.gz
-rw-r--r-- 1 dev dev 2.0M Feb  1 02:00 wallstreetsim_20260201_020000.sql.gz
```

#### Step 2: Stop application services

```bash
pm2 stop all
```

#### Step 3: Verify PostgreSQL container is running

```bash
docker ps | grep wss_postgres
```

If not running:
```bash
cd /WallStreetSim
docker compose -f docker-compose.db.yml up -d postgres
```

#### Step 4: Create a backup of current state (optional but recommended)

```bash
docker exec wss_postgres pg_dump \
  -U wss_user \
  -d wallstreetsim \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip > /WallStreetSim/backups/pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz
```

#### Step 5: Drop and recreate the database

```bash
# Connect to PostgreSQL and drop/recreate database
docker exec -i wss_postgres psql -U wss_user -d postgres << 'EOF'
-- Terminate existing connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'wallstreetsim' AND pid <> pg_backend_pid();

-- Drop and recreate
DROP DATABASE IF EXISTS wallstreetsim;
CREATE DATABASE wallstreetsim OWNER wss_user;
EOF
```

#### Step 6: Restore the backup

```bash
# Replace with your chosen backup file
BACKUP_FILE="/WallStreetSim/backups/wallstreetsim_20260202_020000.sql.gz"

# Decompress and restore
gunzip -c "$BACKUP_FILE" | docker exec -i wss_postgres psql -U wss_user -d wallstreetsim
```

#### Step 7: Verify the restore

```bash
# Check table counts
docker exec wss_postgres psql -U wss_user -d wallstreetsim -c "
SELECT
  schemaname,
  relname as table_name,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
"
```

#### Step 8: Restart application services

```bash
pm2 start all
pm2 logs --lines 50
```

---

### Scenario 2: Point-in-Time Recovery

PostgreSQL does not have WAL archiving enabled by default. For point-in-time recovery:

1. Restore the most recent backup before the target time
2. Manually replay any necessary transactions from application logs

**Future Enhancement:** Enable WAL archiving for true point-in-time recovery.

---

### Scenario 3: PostgreSQL Container Corruption

If the PostgreSQL container or its data volume is corrupted:

#### Step 1: Stop and remove the corrupted container

```bash
docker compose -f docker-compose.db.yml stop postgres
docker rm wss_postgres
```

#### Step 2: Remove the corrupted volume (CAUTION: destroys all data)

```bash
docker volume rm wallstreetsim_postgres_data
```

#### Step 3: Recreate the container

```bash
docker compose -f docker-compose.db.yml up -d postgres

# Wait for container to be healthy
sleep 10
docker ps | grep wss_postgres
```

#### Step 4: Restore from backup

Follow [Scenario 1](#scenario-1-restore-from-dailyweekly-backup) steps 5-8.

---

## Redis Restore

Redis uses both RDB snapshots and AOF persistence. The data is stored in the `redis_data` Docker volume.

### Scenario 1: Redis Container Restart (Data Intact)

If Redis crashed but the volume is intact:

```bash
# Restart the container
docker compose -f docker-compose.db.yml restart redis

# Verify data loaded
docker exec wss_redis redis-cli -a "${REDIS_PASSWORD}" INFO persistence
```

Expected output should show:
- `loading:0` (not currently loading)
- `rdb_last_bgsave_status:ok`
- `aof_enabled:1`

### Scenario 2: Redis Volume Corruption

If the Redis volume is corrupted:

#### Step 1: Stop Redis

```bash
docker compose -f docker-compose.db.yml stop redis
```

#### Step 2: Remove corrupted volume

```bash
docker rm wss_redis
docker volume rm wallstreetsim_redis_data
```

#### Step 3: Recreate Redis

```bash
docker compose -f docker-compose.db.yml up -d redis
```

**Note:** Redis data (sessions, caches, real-time state) will be lost. This is acceptable as:
- Session data can be regenerated (users re-login)
- Cache data rebuilds automatically
- Real-time market state reconstructs from PostgreSQL

#### Step 4: Verify Redis is running

```bash
docker exec wss_redis redis-cli -a "${REDIS_PASSWORD}" PING
# Should return: PONG
```

---

### Scenario 3: Manual RDB Restore

If you have a manual Redis RDB backup:

```bash
# Stop Redis
docker compose -f docker-compose.db.yml stop redis

# Copy RDB file to volume
docker run --rm \
  -v wallstreetsim_redis_data:/data \
  -v /path/to/backup:/backup \
  alpine cp /backup/dump.rdb /data/dump.rdb

# Start Redis
docker compose -f docker-compose.db.yml start redis
```

---

## ClickHouse Restore

ClickHouse stores analytics and time-series data. The data is in the `clickhouse_data` Docker volume.

### Scenario 1: ClickHouse Container Restart

```bash
docker compose -f docker-compose.db.yml restart clickhouse

# Verify
curl "http://localhost:8123/?query=SELECT%201"
# Should return: 1
```

### Scenario 2: ClickHouse Volume Corruption

#### Step 1: Stop and remove

```bash
docker compose -f docker-compose.db.yml stop clickhouse
docker rm wss_clickhouse
docker volume rm wallstreetsim_clickhouse_data
```

#### Step 2: Recreate

```bash
docker compose -f docker-compose.db.yml up -d clickhouse
```

**Note:** Historical analytics data will be lost. The tick engine will begin collecting new data immediately.

### Scenario 3: Restore from Backup (if available)

If you have a ClickHouse backup:

```bash
# Stop ClickHouse
docker compose -f docker-compose.db.yml stop clickhouse

# Restore data directory
docker run --rm \
  -v wallstreetsim_clickhouse_data:/var/lib/clickhouse \
  -v /path/to/backup:/backup \
  alpine sh -c "rm -rf /var/lib/clickhouse/* && tar xzf /backup/clickhouse_backup.tar.gz -C /var/lib/clickhouse"

# Start ClickHouse
docker compose -f docker-compose.db.yml start clickhouse
```

---

## Full System Recovery

Use this procedure for complete system recovery (e.g., server migration, total failure).

### Step 1: Set up the new server

```bash
# Clone repository or copy files
cd /
git clone <repo_url> WallStreetSim
cd /WallStreetSim

# Install dependencies
pnpm install
```

### Step 2: Configure environment

```bash
# Copy environment file
cp .env.example .env

# Edit with correct values
nano .env
```

### Step 3: Start database containers

```bash
docker compose -f docker-compose.db.yml up -d

# Wait for all containers to be healthy
sleep 30
docker ps
```

### Step 4: Restore PostgreSQL

```bash
# Copy backup file to new server first, then:
BACKUP_FILE="/path/to/wallstreetsim_YYYYMMDD_HHMMSS.sql.gz"

gunzip -c "$BACKUP_FILE" | docker exec -i wss_postgres psql -U wss_user -d wallstreetsim
```

### Step 5: Run database migrations

```bash
pnpm db:migrate
```

### Step 6: Start application services

```bash
pm2 start ecosystem.config.js
pm2 save

# Verify all services
pm2 status
```

### Step 7: Verify the system

```bash
# Check API health
curl http://localhost:8080/health

# Check web frontend
curl http://localhost:3000

# Check WebSocket
curl http://localhost:8080/socket.io/
```

---

## Verification Procedures

After any restore, run these verification steps:

### Database Integrity

```bash
# PostgreSQL - Check table integrity
docker exec wss_postgres psql -U wss_user -d wallstreetsim -c "
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns
FROM information_schema.tables t
WHERE table_schema = 'public'
ORDER BY table_name;
"

# Check for common tables
docker exec wss_postgres psql -U wss_user -d wallstreetsim -c "
SELECT
  'agents' as table_name, COUNT(*) as rows FROM agents
UNION ALL
SELECT 'companies', COUNT(*) FROM companies
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'trades', COUNT(*) FROM trades;
"
```

### Application Verification

```bash
# Check PM2 services
pm2 status

# Check for errors in logs
pm2 logs --lines 100 | grep -i error

# API health check
curl -s http://localhost:8080/health | jq .

# Test database connection via API
curl -s http://localhost:8080/api/agents | head -c 500
```

### Redis Verification

```bash
# Check Redis connectivity
docker exec wss_redis redis-cli -a "${REDIS_PASSWORD}" PING

# Check key count
docker exec wss_redis redis-cli -a "${REDIS_PASSWORD}" DBSIZE
```

---

## Troubleshooting

### PostgreSQL Won't Start

**Symptom:** Container exits immediately or fails health check.

**Solutions:**

1. Check logs:
   ```bash
   docker logs wss_postgres
   ```

2. Check disk space:
   ```bash
   df -h
   docker system df
   ```

3. Check permissions:
   ```bash
   docker exec wss_postgres ls -la /var/lib/postgresql/data
   ```

### Restore Fails with "Database in use"

**Symptom:** Cannot drop database due to active connections.

**Solution:**
```bash
docker exec wss_postgres psql -U wss_user -d postgres -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'wallstreetsim' AND pid <> pg_backend_pid();
"
```

### Backup File Corrupted

**Symptom:** `gunzip: invalid compressed data` or SQL syntax errors during restore.

**Solutions:**

1. Try an older backup:
   ```bash
   ls -lt /WallStreetSim/backups/*.sql.gz
   ```

2. Check file integrity:
   ```bash
   gunzip -t /WallStreetSim/backups/wallstreetsim_*.sql.gz
   ```

3. Use weekly backup as fallback:
   ```bash
   ls -lt /WallStreetSim/backups/weekly/*.sql.gz
   ```

### Redis AOF Corruption

**Symptom:** Redis fails to start with AOF errors.

**Solution:**
```bash
# Stop Redis
docker compose -f docker-compose.db.yml stop redis

# Repair AOF file
docker run --rm \
  -v wallstreetsim_redis_data:/data \
  redis:7-alpine \
  redis-check-aof --fix /data/appendonlydir/appendonly.aof.1.incr.aof

# Start Redis
docker compose -f docker-compose.db.yml start redis
```

### Application Can't Connect After Restore

**Symptom:** API returns database connection errors.

**Solutions:**

1. Verify database is accepting connections:
   ```bash
   docker exec wss_postgres pg_isready -U wss_user -d wallstreetsim
   ```

2. Check environment variables:
   ```bash
   grep DATABASE_URL /WallStreetSim/.env
   ```

3. Restart application:
   ```bash
   pm2 restart all
   ```

---

## Emergency Contacts

- **Primary DBA:** [Add contact]
- **Infrastructure Lead:** [Add contact]
- **On-call Engineer:** [Add contact]

---

## Revision History

| Date       | Version | Changes                    | Author |
|------------|---------|----------------------------|--------|
| 2026-02-02 | 1.0     | Initial runbook creation   | Claude |
