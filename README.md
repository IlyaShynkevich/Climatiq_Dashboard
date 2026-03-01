# Climatiq Dashboard

Climatiq Dashboard is a small static web app for tracking a business's monthly operational emissions. It lets a user enter electricity, gas, and travel activity, then shows the resulting emissions with simple summary cards, charts, and reduction scenarios.

## Features

- Monthly data entry for electricity, gas, and travel
- Automatic emissions calculation for each month
- Summary KPI cards for total emissions, average emissions, and top category
- Trend chart showing emissions over time
- Category chart showing emissions split by source
- "What-if" scenario cards for simple reduction ideas

## Project Structure

- `index.html` - page structure and dashboard layout
- `styles.css` - dashboard styling and responsive layout
- `app.js` - emissions logic, chart drawing, and interaction handling

## How To Run

This project has no build step and no dependencies.

### Option 1: Open directly

Open `index.html` in your browser.

### Option 2: Run a local server

From the project folder:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## How It Works

1. Enter monthly activity data in the table.
2. Emissions are calculated with simple fixed factors in `app.js`:
   - Electricity: `0.4 kg CO2e` per `kWh`
   - Gas: `5.3 kg CO2e` per `therm`
   - Travel: `0.28 kg CO2e` per `mile`
3. The dashboard updates summary cards, charts, and scenarios immediately.

## Demo Scenario

Try this sample set of values:

- January 2026: Electricity `2200`, Gas `130`, Travel `500`
- February 2026: Electricity `1800`, Gas `110`, Travel `450`
- March 2026: Electricity `2400`, Gas `100`, Travel `900`
- April 2026: Electricity `1500`, Gas `70`, Travel `200`
- May 2026: Electricity `300`, Gas `10`, Travel `25`

Expected behavior:

- March should appear as one of the highest-emission months
- May should become the lowest-emission month
- KPI cards should update automatically
- Scenario cards should show different potential savings
