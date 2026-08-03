# Task 9 — Environment variables documentation

## Status
DONE

## Commit
`91e3193`
- Message: `chore(env): document Tier B B3 tracker alert env vars`
- Includes `Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>`
- Modified file: `.env.example` only

## Verification

### `apps/worker` / `apps/web` source references
Ran:
```powershell
Select-String -Path 'C:\bc-proje\Seovista\apps\worker\src\**\*.ts', 'C:\bc-proje\Seovista\apps\web\src\**\*.ts' -Pattern 'TRACKER_ALERT_MIN_DELTA|TRACKER_RETENTION_DAYS|TRACKER_ALERTS_FROM_EMAIL'
```

Found matches in `apps/worker/src/queue/tracker-scan-worker.ts`:
```
C:\bc-proje\Seovista\apps\worker\src\queue\tracker-scan-worker.ts:87  fromEmail: process.env.TRACKER_ALERTS_FROM_EMAIL ?? "noreply@seovista.com"
C:\bc-proje\Seovista\apps\worker\src\queue\tracker-scan-worker.ts:88  minDelta: Number(process.env.TRACKER_ALERT_MIN_DELTA) || 3
C:\bc-proje\Seovista\apps\worker\src\queue\tracker-scan-worker.ts:89  retentionDays: Number(process.env.TRACKER_RETENTION_DAYS) || 90
```

### `.env.example` references
Ran:
```powershell
Select-String -Path 'C:\bc-proje\Seovista\.env.example' -Pattern 'TRACKER_ALERT_MIN_DELTA|TRACKER_RETENTION_DAYS|TRACKER_ALERTS_FROM_EMAIL'
```

Found:
```
C:\bc-proje\Seovista\.env.example:87  TRACKER_ALERT_MIN_DELTA=
C:\bc-proje\Seovista\.env.example:89  TRACKER_RETENTION_DAYS=
C:\bc-proje\Seovista\.env.example:91  TRACKER_ALERTS_FROM_EMAIL=
```

## Notes
- Added the Tier B B3 block inside the existing Tier B B1 section immediately after `TRACKER_SCAN_CRON=`.
- No other files were modified or staged.
