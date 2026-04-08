# Weather Sync System Guide

## Overview
AgroGuardian automatically updates weather data for all active farms on a periodic schedule using BullMQ background jobs. This ensures farmers always have fresh climate risk assessments, planting windows, and weather forecasts.

## Configuration

### Sync Intervals
Set the `WEATHER_SYNC_INTERVAL` environment variable in your `.env` file:

```bash
# Options (choose one):
WEATHER_SYNC_INTERVAL=hourly        # Every hour at :00 minutes
WEATHER_SYNC_INTERVAL=3-hourly      # Every 3 hours (0:00, 3:00, 6:00...)
WEATHER_SYNC_INTERVAL=6-hourly      # Every 6 hours (0:00, 6:00, 12:00, 18:00) ⭐ RECOMMENDED
WEATHER_SYNC_INTERVAL=daily         # Once daily at 6:00 AM
WEATHER_SYNC_INTERVAL=twice-daily   # Twice daily at 6:00 AM and 6:00 PM
```

**Recommendation:** Use `6-hourly` for optimal balance between fresh data and API rate limits.

### Why 6-Hourly?
- Weather conditions don't change drastically hour-to-hour
- Reduces OpenWeather API calls (free tier: 1,000 calls/day)
- With 100 farms, 6-hourly sync = 400 calls/day (safe margin)
- Ensures data is never more than 6 hours old

## Features

### 1. Automatic Periodic Updates
- Background worker processes all active farms
- Rate-limited to 500ms between farms (prevents API throttling)
- Stores weather snapshots, climate risks, and alerts in MongoDB
- Triggers resilience score updates automatically

### 2. Retry Logic
- **3 automatic retries** with exponential backoff (1min, 2min, 4min)
- Continues processing other farms even if one fails
- Logs detailed error information for debugging

### 3. Manual Sync Trigger
Users can request immediate weather updates via the API:

```bash
# Sync weather for all user's farms
POST /api/weather/sync
Authorization: Bearer <token>

# Sync weather for specific farm
POST /api/weather/sync?farmId=<farm_id>
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Weather sync triggered. Updates will be available shortly.",
  "data": {
    "jobId": "manual-sync:12345",
    "status": "queued",
    "farmId": "abc123..."
  }
}
```

## How It Works

### Sync Process Flow
```
1. BullMQ triggers job at scheduled interval
   ↓
2. Worker queries all farms with status="active"
   ↓
3. For each farm:
   - Fetch current weather from OpenWeather API
   - Fetch 5-day forecast (40 data points)
   - Calculate climate risks (drought, flood, heat, pest, disease)
   - Determine planting windows & precision operation windows
   - Generate alerts for high-risk conditions
   - Store all data in MongoDB
   - Trigger resilience score update
   - Wait 500ms (rate limiting)
   ↓
4. Log results: success count, errors, duration
```

### Data Updated Per Sync
- **WeatherData**: Current conditions + 5-day forecast
- **ClimateRisk**: Risk levels for 5 climate factors
- **WeatherAlert**: Auto-generated alerts for critical conditions
- **ResilienceScore**: Triggered after weather update

## Monitoring

### Job Status
Check Redis for job status:
```bash
# List all weather sync jobs
redis-cli
> KEYS *weather-sync*

# View job details
> HGETALL bull:weather-sync-queue:<job_id>
```

### Logs
The system logs detailed information:
```
INFO: Periodic Weather Sync initialized: 6-hourly (0 */6 * * *)
INFO: Starting Periodic (6-hourly) Weather Sync... (jobId: ..., attempt: 1)
INFO: Processing weather for 45 active farms
DEBUG: Syncing weather for farm: Green Valley Farm (abc123...)
INFO: Periodic (6-hourly) Weather Sync completed (duration: 24.32s, successCount: 45, errorCount: 0)
```

### Error Handling
If a farm fails:
```
ERROR: Weather Sync failed for farm abc123: API rate limit exceeded
  farmId: "abc123"
  farmName: "Green Valley Farm"
  error: "API rate limit exceeded"
```

The worker continues processing other farms and retries failed farms automatically.

## API Rate Limits

### OpenWeather Free Tier
- **1,000 calls/day** (60 calls/hour average)
- Each farm sync = 2 API calls (current + forecast)

### Capacity by Interval
| Interval | Syncs/Day | Max Farms (Free) |
|----------|-----------|------------------|
| hourly | 24 | 20 farms |
| 3-hourly | 8 | 62 farms |
| 6-hourly ⭐ | 4 | 125 farms |
| twice-daily | 2 | 250 farms |
| daily | 1 | 500 farms |

**Note:** Manual syncs count toward this limit.

## Troubleshooting

### Weather Not Updating
1. Check if Redis is running: `redis-cli ping` (should return `PONG`)
2. Check if worker is initialized: Look for "Weather Sync Worker initialized" in logs
3. Check if repeatable job exists: 
   ```bash
   redis-cli
   > KEYS bull:weather-sync-queue:repeat:*
   ```
4. Verify `WEATHER_API_KEY` is set in `.env`

### API Rate Limit Errors
- Reduce sync frequency (use `daily` or `twice-daily`)
- Upgrade to OpenWeather paid plan
- Review manual sync usage

### Farms Not Syncing
Ensure farms have `status: "active"` in MongoDB:
```javascript
db.farms.updateMany(
  { status: { $ne: "active" } },
  { $set: { status: "active" } }
)
```

## Performance Tips

1. **Concurrency**: Worker processes 1 job at a time (prevents API throttling)
2. **Rate Limiting**: 500ms delay between farms (adjustable in worker)
3. **Job Cleanup**: Keeps last 50 successful jobs, 20 failed jobs
4. **Retry Strategy**: 3 attempts with exponential backoff

## Maintenance

### Changing Sync Interval
1. Update `WEATHER_SYNC_INTERVAL` in `.env`
2. Restart the server
3. Old repeatable jobs are automatically removed
4. New schedule takes effect immediately

### Pausing Sync
To temporarily stop automatic syncs:
```bash
redis-cli
> KEYS bull:weather-sync-queue:repeat:*
> DEL bull:weather-sync-queue:repeat:<key>
```

Restart server to resume with configured schedule.

### Database Cleanup
Old weather data accumulates over time. Consider adding TTL indexes:
```javascript
// In WeatherData model, add:
weatherDataSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
```

## Integration with Frontend

### Display Sync Status
```javascript
// Trigger manual sync
const syncWeather = async (farmId) => {
  const response = await fetch('/api/weather/sync?farmId=' + farmId, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  console.log('Sync triggered:', data.jobId);
};

// Show last update time
const { data } = await fetchWeather(farmId);
const lastUpdate = new Date(data.timestamp);
console.log(`Last updated: ${lastUpdate.toLocaleString()}`);
```

### Refresh Button
Add a "Refresh Weather" button to your Weather page that calls `POST /api/weather/sync`.

## Support
For issues or questions:
1. Check logs: `logs/error.log` and `logs/combined.log`
2. Verify environment variables are set correctly
3. Test manual sync first before troubleshooting periodic sync
